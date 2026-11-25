// Encoder no adaptador explícito. Modos sintéticos/consumidor externo de teste;
// não tem fallback de software/outro adaptador.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

internal static class MftEncoderProbe {
  [StructLayout(LayoutKind.Sequential)] private struct MediaType { public Guid major, subtype; }
  [DllImport("mfplat.dll")] private static extern int MFStartup(uint version, uint flags);
  [DllImport("mfplat.dll")] private static extern int MFShutdown();
  [DllImport("mfplat.dll")] private static extern int MFCreateAttributes(out IntPtr attributes, uint count);
  [DllImport("mfplat.dll")] private static extern int MFCreateMediaType(out IntPtr mediaType);
  [DllImport("mfplat.dll")] private static extern int MFTEnum2(Guid category, uint flags, ref MediaType input, ref MediaType output,
    IntPtr attributes, out IntPtr array, out uint count);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Set64Fn(IntPtr self, ref Guid key, ulong value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Set32Fn(IntPtr self, ref Guid key, uint value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Get32Fn(IntPtr self, ref Guid key, out uint value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int Get64Fn(IntPtr self, ref Guid key, out ulong value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetGuidFn(IntPtr self, ref Guid key, ref Guid value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int StringFn(IntPtr self, ref Guid key, out IntPtr value, out uint length);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GuidFn(IntPtr self, ref Guid key, out Guid value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ActivateFn(IntPtr self, ref Guid iid, out IntPtr transform);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int AttributesFn(IntPtr self, out IntPtr attributes);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ShutdownFn(IntPtr self);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int MessageFn(IntPtr self, uint message, IntPtr value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetTypeFn(IntPtr self, uint stream, IntPtr mediaType, uint flags);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int CurrentTypeFn(IntPtr self, uint stream, out IntPtr mediaType);
  private static T Slot<T>(IntPtr obj, int slot) where T : class {
    return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T));
  }
  private static void Check(int result) { Marshal.ThrowExceptionForHR(result); }
  private static object UInt32Attribute(IntPtr attributes, string key) {
    Guid id = new Guid(key); uint value; int hr = Slot<Get32Fn>(attributes, 7)(attributes, ref id, out value);
    if (hr == unchecked((int)0xc00d36e6)) return null; // MF_E_ATTRIBUTENOTFOUND: inconclusivo, não false.
    Check(hr); return value;
  }
  private static string StringAttribute(IntPtr attributes, string key) {
    Guid id = new Guid(key); IntPtr value = IntPtr.Zero; uint length;
    try {
      Check(Slot<StringFn>(attributes, 13)(attributes, ref id, out value, out length));
      if (length > 4096) throw new InvalidOperationException("unexpected attribute length");
      return Marshal.PtrToStringUni(value, (int)length);
    } finally { if (value != IntPtr.Zero) Marshal.FreeCoTaskMem(value); }
  }
  private static void Set32(IntPtr a, string key, uint value) { Guid id = new Guid(key); Check(Slot<Set32Fn>(a, 21)(a, ref id, value)); }
  private static void Set64(IntPtr a, string key, ulong value) { Guid id = new Guid(key); Check(Slot<Set64Fn>(a, 22)(a, ref id, value)); }
  private static void SetGuid(IntPtr a, string key, Guid value) { Guid id = new Guid(key); Check(Slot<SetGuidFn>(a, 24)(a, ref id, ref value)); }
  private static IntPtr VideoType(bool encoded,uint width,uint height) {
    IntPtr type; Check(MFCreateMediaType(out type));
    try {
      SetGuid(type, "48eba18e-f8c9-4687-bf11-0a74c9f96a8f", new Guid("73646976-0000-0010-8000-00aa00389b71"));
      SetGuid(type, "f7e34c9a-42e8-4714-b74b-cb29d72c35e5", new Guid(encoded ? "34363248-0000-0010-8000-00aa00389b71" : "3231564e-0000-0010-8000-00aa00389b71"));
      Set64(type, "1652c33d-d6b2-4012-b834-72030849a37d", ((ulong)width << 32) | height);
      Set64(type, "c459a2e8-3d2c-4e44-b132-fee5156c7bb0", ((ulong)60 << 32) | 1);
      Set64(type, "c6376a1e-8d0a-4027-be45-6d9a0ad39bb6", ((ulong)1 << 32) | 1);
      Set32(type, "e2724bb8-e676-4806-b4b2-a8d6efb44ccd", 2);
      if (encoded) { Set32(type, "20332624-fb0d-4d9e-bd0d-cbf6786c102e", 4000000); Set32(type, "ad76a80b-2d5c-4e0b-b375-64e520137036", 66); }
      IntPtr result = type; type = IntPtr.Zero; return result;
    } finally { if (type != IntPtr.Zero) Marshal.Release(type); }
  }
  private static Dictionary<string, object> DescribeType(IntPtr type) {
    Guid key = new Guid("f7e34c9a-42e8-4714-b74b-cb29d72c35e5"), subtype;
    Check(Slot<GuidFn>(type, 10)(type, ref key, out subtype));
    ulong size, rate; key = new Guid("1652c33d-d6b2-4012-b834-72030849a37d"); Check(Slot<Get64Fn>(type, 8)(type, ref key, out size));
    key = new Guid("c459a2e8-3d2c-4e44-b132-fee5156c7bb0"); Check(Slot<Get64Fn>(type, 8)(type, ref key, out rate));
    Dictionary<string, object> result = new Dictionary<string, object>();
    result["subtype"] = subtype.ToString(); result["width"] = (uint)(size >> 32); result["height"] = (uint)size;
    result["rateNumerator"] = (uint)(rate >> 32); result["rateDenominator"] = (uint)rate;
    result["interlaceMode"] = UInt32Attribute(type, "e2724bb8-e676-4806-b4b2-a8d6efb44ccd");
    return result;
  }
  private static void Negotiate(IntPtr transform, Dictionary<string, object> entry,uint width,uint height) {
    IntPtr output = IntPtr.Zero, input = IntPtr.Zero, current = IntPtr.Zero;
    try {
      output = VideoType(true,width,height); input = VideoType(false,width,height);
      int hr = Slot<SetTypeFn>(transform, 16)(transform, 0, output, 0); entry["setOutputTypeHR"] = hr.ToString("x8"); Check(hr);
      hr = Slot<SetTypeFn>(transform, 15)(transform, 0, input, 0); entry["setInputTypeHR"] = hr.ToString("x8"); Check(hr);
      Check(Slot<CurrentTypeFn>(transform, 18)(transform, 0, out current));
      Dictionary<string, object> outDescription = DescribeType(current);
      outDescription["averageBitrate"] = UInt32Attribute(current, "20332624-fb0d-4d9e-bd0d-cbf6786c102e");
      outDescription["profile"] = UInt32Attribute(current, "ad76a80b-2d5c-4e0b-b375-64e520137036");
      entry["currentOutputType"] = outDescription; Marshal.Release(current); current = IntPtr.Zero;
      Check(Slot<CurrentTypeFn>(transform, 17)(transform, 0, out current)); entry["currentInputType"] = DescribeType(current);
    } finally { foreach (IntPtr p in new IntPtr[] { current, input, output }) if (p != IntPtr.Zero) Marshal.Release(p); }
  }
  internal static Dictionary<string,object> Execute(ulong luid,string mode,Action<D3D11ProbeDevice,IntPtr,Dictionary<string,object>,List<Action>> external=null,uint width=1280,uint height=720,D3D11ProbeDevice borrowedDevice=null,bool longGop=false) {
    bool started = false; IntPtr attributes = IntPtr.Zero, array = IntPtr.Zero; uint count = 0; D3D11ProbeDevice device = null;
    try {
      if(!((width==1280&&height==720)||(width==640&&height==360)))throw new ArgumentException("unsupported encoder size");
      bool probeControls = mode == "--controls", probeConversion = mode == "--conversion";
      bool probeEncode = mode == "--encode";
      if(borrowedDevice==null){Check(MFStartup(0x20070,1));started=true;}else if(borrowedDevice.AdapterLuid!=luid.ToString("x16"))throw new InvalidOperationException("borrowed device adapter differs");
      device = borrowedDevice??new D3D11ProbeDevice(luid);
      Check(MFCreateAttributes(out attributes, 1));
      Guid luidKey = new Guid("1d39518c-e220-4da8-a07f-ba172552d6b1");
      Check(Slot<Set64Fn>(attributes, 22)(attributes, ref luidKey, luid));
      Guid video = new Guid("73646976-0000-0010-8000-00aa00389b71");
      MediaType input = new MediaType { major = video, subtype = new Guid("3231564e-0000-0010-8000-00aa00389b71") };
      MediaType output = new MediaType { major = video, subtype = new Guid("34363248-0000-0010-8000-00aa00389b71") };
      Check(MFTEnum2(new Guid("f79eac7d-e545-4387-bdee-d647d7bde42a"), 4, ref input, ref output, attributes, out array, out count));
      if(borrowedDevice!=null&&count!=1)throw new InvalidOperationException("persistent probe requires one hardware candidate");
      if (count > 64) throw new InvalidOperationException("unexpected encoder count");
      List<object> encoders = new List<object>(); bool allActivated = true;
      for (uint i = 0; i < count; i++) {
        IntPtr activation = Marshal.ReadIntPtr(array, (int)i * IntPtr.Size), transform = IntPtr.Zero, transformAttributes = IntPtr.Zero;
        bool activated = false, managerAccepted = false;
        Dictionary<string, object> entry = new Dictionary<string, object>();
        List<Action> afterShutdown=new List<Action>();
        try {
          entry["name"] = StringAttribute(activation, "314ffbae-5b41-4c95-9c19-4e7d586face3");
          Guid clsidKey = new Guid("6821c42b-65a4-4e82-99bc-9a88205ecd0c"), clsid;
          Check(Slot<GuidFn>(activation, 10)(activation, ref clsidKey, out clsid)); entry["clsid"] = clsid.ToString();
          Guid iid = new Guid("bf94c121-5b05-4e6f-8000-ba598961414d");
          int hr = Slot<ActivateFn>(activation, 33)(activation, ref iid, out transform);
          entry["activationHR"] = hr.ToString("x8");
          if (hr < 0) { allActivated = false; }
          else {
            activated = true;
            Check(Slot<AttributesFn>(transform, 8)(transform, out transformAttributes));
            entry["d3d11Aware"] = UInt32Attribute(transformAttributes, "206b4fc8-fcf9-4c51-afe3-9764369e33a0");
            entry["async"] = UInt32Attribute(transformAttributes, "f81a699a-649a-497d-8c73-29f8fed6ad7a");
            if (Object.Equals(entry["d3d11Aware"], (uint)1) && Object.Equals(entry["async"], (uint)1)) {
              Guid unlock = new Guid("e5666d6b-3422-4eb6-a421-da7db1f8e207");
              Check(Slot<Set32Fn>(transformAttributes, 21)(transformAttributes, ref unlock, 1));
              entry["asyncUnlock"] = UInt32Attribute(transformAttributes, unlock.ToString());
              int managerHR = Slot<MessageFn>(transform, 23)(transform, 2, device.Manager);
              entry["setD3DManagerHR"] = managerHR.ToString("x8");
              managerAccepted = managerHR >= 0; if (!managerAccepted) allActivated = false;
              if (managerAccepted) {
                if (probeControls) {
                  Dictionary<string, object> controls = new Dictionary<string, object>(); entry["controlsBeforeTypes"] = controls;
                  CodecProbeControls.ApplyOrRead(transform, true, controls);
                }
                if(mode=="external-sequence"||mode=="external-sequence-hrd"){
                  Dictionary<string,object> controls=new Dictionary<string,object>();entry["lowLatencyBeforeTypes"]=controls;CodecProbeControls.ApplyOrRead(transform,true,controls,false);
                }
                if(mode=="external-sequence-hrd"){Dictionary<string,object> hrd=new Dictionary<string,object>();entry["hrdInitial"]=hrd;CodecProbeControls.SetHrdBuffer(transform,50000,hrd);}
                if(MftTextureEncodeProbe.ApplicationMode){
                  Dictionary<string,object> hrd=new Dictionary<string,object>();entry["applicationHrd"]=hrd;
                  try{CodecProbeControls.SetHrdBuffer(transform,50000,hrd);hrd["acceptedBeforeTypes"]=true;}
                  catch(InvalidOperationException error){hrd["acceptedBeforeTypes"]=false;hrd["error"]=error.Message;}
                }
                if(longGop){Dictionary<string,object> gop=new Dictionary<string,object>();entry["gopBeforeTypes"]=gop;CodecProbeControls.ConfigureGopSize(transform,120,gop,true);}
                Negotiate(transform, entry,width,height);
                if(longGop){Dictionary<string,object> gop=new Dictionary<string,object>();entry["gopControl"]=gop;CodecProbeControls.ConfigureGopSize(transform,120,gop,false);}
                if(mode=="external-sequence"||mode=="external-sequence-hrd"){
                  Dictionary<string,object> controls=new Dictionary<string,object>();entry["lowLatencyAfterTypes"]=controls;CodecProbeControls.ApplyOrRead(transform,false,controls,false);
                  Dictionary<string,object> rates=CodecProbeControls.ReadRateState(transform);entry["rateStateAfterTypes"]=rates;if(mode=="external-sequence-hrd"){Dictionary<string,object> hrd=(Dictionary<string,object>)rates["hrdBufferBytes"];if(!hrd.ContainsKey("value")||Convert.ToUInt32(hrd["value"])!=50000)throw new InvalidOperationException("HRD buffer changed during type negotiation");}
                  if(MftTextureEncodeProbe.ApplicationMode){Dictionary<string,object> hrd=(Dictionary<string,object>)rates["hrdBufferBytes"];entry["applicationHrdReadbackConfirmed"]=hrd.ContainsKey("value")&&Convert.ToUInt32(hrd["value"])==50000;}
                }
                if(external!=null) external(device,transform,entry,afterShutdown);
                if (probeConversion || probeEncode) {
                  Action<IntPtr> consumer = null;
                  Dictionary<string, object> encoding = new Dictionary<string, object>();
                  if(probeEncode) {
                    entry["encoding"] = encoding;
                    consumer = delegate(IntPtr texture) {
                      try { MftTextureEncodeProbe.Run(transform,texture,encoding,afterShutdown); }
                      catch(Exception error) { encoding["complete"]=false; encoding["error"]=error.GetType().Name+": "+error.Message; }
                    };
                  }
                  Dictionary<string, object> conversion = GpuConversionProbe.Run(device.Device, consumer); entry["conversion"] = conversion;
                  if (!Object.Equals(conversion["complete"], true)) allActivated = false;
                  if (probeEncode && (!encoding.ContainsKey("complete") || !Object.Equals(encoding["complete"],true))) allActivated=false;
                }
                if (probeControls) {
                  Dictionary<string, object> controls = new Dictionary<string, object>(); entry["controlsAfterTypes"] = controls;
                  CodecProbeControls.ApplyOrRead(transform, false, controls);
                }
              }
            } else { allActivated = false; }
          }
        } catch (Exception error) {
          entry["error"] = error.GetType().Name + ": " + error.Message; allActivated = false;
        } finally {
          if (transformAttributes != IntPtr.Zero) Marshal.Release(transformAttributes);
          if (managerAccepted) {
            int detach = Slot<MessageFn>(transform, 23)(transform, 2, IntPtr.Zero);
            entry["detachD3DManagerHR"] = detach.ToString("x8"); if (detach < 0) allActivated = false;
          }
          if (activated) { int shutdown = Slot<ShutdownFn>(activation, 34)(activation); entry["shutdownHR"] = shutdown.ToString("x8"); if (shutdown < 0) allActivated = false; }
          if (transform != IntPtr.Zero) Marshal.Release(transform);
          foreach(Action finish in afterShutdown){
            try{finish();}catch(Exception error){entry["releaseError"]=error.Message;allActivated=false;}
          }
          if(entry.ContainsKey("encoding")){
            object complete;Dictionary<string,object> encoding=(Dictionary<string,object>)entry["encoding"];
            if(!encoding.TryGetValue("complete",out complete) || !Object.Equals(complete,true))allActivated=false;
          }
        }
        encoders.Add(entry);
      }
      Dictionary<string, object> report = new Dictionary<string, object>();
      report["complete"] = true; report["adapterLuid"] = luid.ToString("x16"); report["hardwareOnly"] = true;
      report["inputFilter"] = "NV12"; report["outputFilter"] = "H264"; report["encoders"] = encoders;
      report["deviceAdapterLuid"] = device.AdapterLuid; report["d3d11VideoSupport"] = true; report["multithreadProtected"] = true;
      report["controlsRequested"] = probeControls;
      report["conversionRequested"] = probeConversion;
      report["encodeRequested"] = probeEncode;
      report["allChecksPassed"] = allActivated; report["usableCandidateFound"] = encoders.Count > 0 && allActivated;
      report["scope"] = "Adapter-filtered hardware MFT and D3D11 device. Optional strict controls, synthetic GPU conversion or single-frame DXGI encoding: inspect requested flags, allChecksPassed and each error. No WGC integration, continuous throughput, WebRTC, internal copy count, session capacity, quality or input-to-photon proof.";
      return report;
    }
    finally {
      if (array != IntPtr.Zero) {
        // MFTEnum2 owns one reference per activation, and a CoTaskMem array.
        for (uint i = 0; i < count; i++) { IntPtr p = Marshal.ReadIntPtr(array, checked((int)i * IntPtr.Size)); if (p != IntPtr.Zero) Marshal.Release(p); }
        Marshal.FreeCoTaskMem(array);
      }
      if (attributes != IntPtr.Zero) Marshal.Release(attributes);
      if (device != null && borrowedDevice==null) device.Dispose();
      if (started) MFShutdown();
    }
  }
  internal static Dictionary<string,object> WithDevice(ulong luid,Func<D3D11ProbeDevice,Dictionary<string,object>> work){
    D3D11ProbeDevice device=null;Dictionary<string,object> result=null;bool started=false;
    try{Check(MFStartup(0x20070,1));started=true;device=new D3D11ProbeDevice(luid);result=work(device);return result;}
    finally{if(device!=null){device.Dispose();if(result!=null)result["sharedDeviceDisposed"]=true;}if(started){int hr=MFShutdown();if(result!=null){result["mfShutdownHR"]=hr.ToString("x8");if(hr!=0)result["allChecksPassed"]=false;}}}
  }
  [MTAThread] private static int Main(string[] args) {
    try {
      ulong luid;
      if(args.Length<1 || args.Length>2 || args.Length==2 && args[1]!="--controls" && args[1]!="--conversion" && args[1]!="--encode"
        || args[0].Length!=16 || !UInt64.TryParse(args[0],NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out luid) || luid==0)
        throw new ArgumentException("expected explicit nonzero 16-hex adapter LUID");
      Dictionary<string,object> report=Execute(luid,args.Length==2?args[1]:"");
      Console.WriteLine(new JavaScriptSerializer().Serialize(report));return (bool)report["allChecksPassed"]?0:1;
    } catch(Exception error){Console.Error.WriteLine("MFT probe failed: "+error.GetType().Name+": "+error.Message);return 2;}
  }
}
