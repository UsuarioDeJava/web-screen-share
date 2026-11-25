using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

internal static class CodecProbeControls {
  // VARIANT x64 inclui a união de dois ponteiros de VT_RECORD (24 bytes).
  [StructLayout(LayoutKind.Explicit, Size=24)] private struct Variant {
    [FieldOffset(0)] public ushort type;
    [FieldOffset(8)] public uint number;
    [FieldOffset(8)] public short boolean;
  }
  [DllImport("oleaut32.dll")] private static extern int VariantClear(ref Variant value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int PropertyFn(IntPtr self, ref Guid key);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ValueFn(IntPtr self, ref Guid key, ref Variant value);
  private static T Slot<T>(IntPtr obj, int slot) where T : class {
    return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot * IntPtr.Size), typeof(T));
  }
  private static void ExactSuccess(int hr, string stage) { if (hr != 0) throw new InvalidOperationException("codec control " + stage + " returned " + hr.ToString("x8")); }
  internal static Dictionary<string,object> ReadRateState(IntPtr transform){
    IntPtr api=IntPtr.Zero;Dictionary<string,object> result=new Dictionary<string,object>();
    try{
      Guid iid=new Guid("901db4c7-31ce-41a2-85dc-8fa0bf41b8da");Marshal.ThrowExceptionForHR(Marshal.QueryInterface(transform,ref iid,out api));
      string[] names={"rateControlMode","hrdBufferBytes","meanBitRate","bPictureCount","gopPictures"};string[] keys={"1c0608e9-370c-4710-8a58-cb6181c42423","0db96574-b6a4-4c8b-8106-3773de0310cd","f7222374-2144-4815-b550-a37f8e12ee52","8d390aac-dc5c-4200-b57f-814d04babab2","95f31b26-95a4-41aa-9303-246a7fc6eef1"};
      for(int i=0;i<names.Length;i++){
        Guid key=new Guid(keys[i]);Variant current=new Variant();Dictionary<string,object> item=new Dictionary<string,object>();result[names[i]]=item;
        try{int hr=Slot<ValueFn>(api,8)(api,ref key,ref current);item["getValueHR"]=hr.ToString("x8");item["variantType"]=current.type;if(hr==0&&current.type==19)item["value"]=current.number;}
        finally{VariantClear(ref current);}
      }return result; // Unsupported reads are recorded, never replaced by defaults.
    }finally{if(api!=IntPtr.Zero)Marshal.Release(api);}
  }
  internal static Dictionary<string,object> SetBitRate(IntPtr transform,uint bitsPerSecond){
    if(bitsPerSecond<64000 || bitsPerSecond>4000000)throw new ArgumentOutOfRangeException("bitsPerSecond");
    IntPtr api=IntPtr.Zero;Variant value=new Variant(),current=new Variant();
    try{
      Guid iid=new Guid("901db4c7-31ce-41a2-85dc-8fa0bf41b8da");Marshal.ThrowExceptionForHR(Marshal.QueryInterface(transform,ref iid,out api));
      Guid key=new Guid("f7222374-2144-4815-b550-a37f8e12ee52");Dictionary<string,object> result=new Dictionary<string,object>();
      result["requestedBitRate"]=bitsPerSecond;result["isModifiableHR"]=Slot<PropertyFn>(api,4)(api,ref key).ToString("x8");
      value.type=19;value.number=bitsPerSecond;int hr=Slot<ValueFn>(api,9)(api,ref key,ref value);result["setValueHR"]=hr.ToString("x8");ExactSuccess(hr,"meanBitRate.SetValue");
      hr=Slot<ValueFn>(api,8)(api,ref key,ref current);result["getValueHR"]=hr.ToString("x8");ExactSuccess(hr,"meanBitRate.GetValue");
      if(current.type!=19 || current.number!=bitsPerSecond)throw new InvalidOperationException("mean bitrate readback differs from request");
      result["readBitRate"]=current.number;return result;
    }finally{VariantClear(ref value);VariantClear(ref current);if(api!=IntPtr.Zero)Marshal.Release(api);}
  }
  internal static void ConfigureGopSize(IntPtr transform,uint pictures,Dictionary<string,object> result,bool apply){
    if(pictures!=120)throw new ArgumentOutOfRangeException("pictures");
    IntPtr api=IntPtr.Zero;Variant value=new Variant(),current=new Variant();result["requestedPictures"]=pictures;
    try{
      Guid iid=new Guid("901db4c7-31ce-41a2-85dc-8fa0bf41b8da");Marshal.ThrowExceptionForHR(Marshal.QueryInterface(transform,ref iid,out api));
      // CODECAPI_AVEncMPVGOPSize, Windows SDK codecapi.h. Set before streaming.
      Guid key=new Guid("95f31b26-95a4-41aa-9303-246a7fc6eef1");
      result["isSupportedHR"]=Slot<PropertyFn>(api,3)(api,ref key).ToString("x8");
      if(apply){value.type=19;value.number=pictures;int set=Slot<ValueFn>(api,9)(api,ref key,ref value);result["setValueHR"]=set.ToString("x8");ExactSuccess(set,"gopSize.SetValue");}
      int hr=Slot<ValueFn>(api,8)(api,ref key,ref current);result["getValueHR"]=hr.ToString("x8");ExactSuccess(hr,"gopSize.GetValue");
      result["variantType"]=current.type;if(current.type==19)result["readPictures"]=current.number;
      if(current.type!=19||current.number!=pictures)throw new InvalidOperationException("GOP size readback differs from request");
    }finally{VariantClear(ref value);VariantClear(ref current);if(api!=IntPtr.Zero)Marshal.Release(api);}
  }
  internal static Dictionary<string,object> SetHrdBuffer(IntPtr transform,uint bytes,Dictionary<string,object> diagnostic=null){
    if(bytes<800 || bytes>50000)throw new ArgumentOutOfRangeException("bytes");
    IntPtr api=IntPtr.Zero;Variant value=new Variant(),current=new Variant();
    try{
      Guid iid=new Guid("901db4c7-31ce-41a2-85dc-8fa0bf41b8da");Marshal.ThrowExceptionForHR(Marshal.QueryInterface(transform,ref iid,out api));
      Guid key=new Guid("0db96574-b6a4-4c8b-8106-3773de0310cd");Dictionary<string,object> result=diagnostic??new Dictionary<string,object>();result["requestedBufferBytes"]=bytes;
      value.type=19;value.number=bytes;int hr=Slot<ValueFn>(api,9)(api,ref key,ref value);result["setValueHR"]=hr.ToString("x8");ExactSuccess(hr,"hrdBuffer.SetValue");
      hr=Slot<ValueFn>(api,8)(api,ref key,ref current);result["getValueHR"]=hr.ToString("x8");ExactSuccess(hr,"hrdBuffer.GetValue");
      result["readVariantType"]=current.type;if(current.type==19)result["readBufferBytes"]=current.number;if(current.type!=19 || current.number!=bytes)throw new InvalidOperationException("HRD buffer readback differs from request: requested="+bytes+", type="+current.type+", value="+current.number);return result;
    }finally{VariantClear(ref value);VariantClear(ref current);if(api!=IntPtr.Zero)Marshal.Release(api);}
  }
  internal static Dictionary<string,object> RequestKeyFrame(IntPtr transform){
    IntPtr api=IntPtr.Zero;Variant value=new Variant();
    try{
      Guid iid=new Guid("901db4c7-31ce-41a2-85dc-8fa0bf41b8da");Marshal.ThrowExceptionForHR(Marshal.QueryInterface(transform,ref iid,out api));
      Guid key=new Guid("398c1b98-8353-475a-9ef2-8f265d260345");Dictionary<string,object> result=new Dictionary<string,object>();
      result["isSupportedHR"]=Slot<PropertyFn>(api,3)(api,ref key).ToString("x8");value.type=19;value.number=1;
      int hr=Slot<ValueFn>(api,9)(api,ref key,ref value);result["setValueHR"]=hr.ToString("x8");ExactSuccess(hr,"forceKeyFrame.SetValue");
      return result; // A prova de efeito é o próximo IDR, não somente este HRESULT.
    }finally{VariantClear(ref value);if(api!=IntPtr.Zero)Marshal.Release(api);}
  }
  public static void ApplyOrRead(IntPtr transform, bool apply, Dictionary<string, object> result, bool includeB = true) {
    IntPtr api = IntPtr.Zero;
    try {
      Guid iid = new Guid("901db4c7-31ce-41a2-85dc-8fa0bf41b8da"); Marshal.ThrowExceptionForHR(Marshal.QueryInterface(transform, ref iid, out api));
      foreach (bool lowLatency in includeB ? new bool[] { true, false } : new bool[] { true }) {
        Guid key = new Guid(lowLatency ? "9c27891a-ed7a-40e1-88e8-b22727a024ee" : "8d390aac-dc5c-4200-b57f-814d04babab2");
        string name = lowLatency ? "lowLatency" : "bPictureCount";
        Dictionary<string, object> diagnostic = new Dictionary<string, object>();
        diagnostic["isSupportedHR"] = Slot<PropertyFn>(api, 3)(api, ref key).ToString("x8");
        diagnostic["isModifiableHR"] = Slot<PropertyFn>(api, 4)(api, ref key).ToString("x8");
        result[name + "Diagnostic"] = diagnostic;
        if (apply) {
          Variant requested = new Variant(); requested.type = lowLatency ? (ushort)11 : (ushort)19;
          if (lowLatency) requested.boolean = -1; else requested.number = 0;
          try {
            int hr = Slot<ValueFn>(api, 9)(api, ref key, ref requested); diagnostic["setValueHR"] = hr.ToString("x8");
            ExactSuccess(hr, name + ".SetValue");
          } finally { VariantClear(ref requested); }
        }
        Variant current = new Variant();
        try {
          int hr = Slot<ValueFn>(api, 8)(api, ref key, ref current); diagnostic["getValueHR"] = hr.ToString("x8");
          ExactSuccess(hr, name + ".GetValue");
          if (current.type != (lowLatency ? 11 : 19) || (lowLatency ? current.boolean == 0 : current.number != 0))
            throw new InvalidOperationException("codec control readback differs from request");
          result[name] = lowLatency ? (object)true : (object)current.number;
        } finally { VariantClear(ref current); }
      }
    } finally { if (api != IntPtr.Zero) Marshal.Release(api); }
  }
}
