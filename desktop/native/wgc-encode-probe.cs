using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using System.Web.Script.Serialization;
using Windows.Foundation;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;

// Captura exclusivamente a janela sintética do pai. Um frame nesta etapa.
internal static class WgcEncodeProbe {
  [ComImport,Guid("3628e81b-3cac-4c60-b7f4-23ce0e0c3356"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface ItemInterop {
    [PreserveSig] int CreateForWindow(IntPtr hwnd,ref Guid iid,out IntPtr item);
    [PreserveSig] int CreateForMonitor(IntPtr monitor,ref Guid iid,out IntPtr item);
  }
  [ComImport,Guid("a9b3d012-3df2-4ee3-b8d1-8695f457d3c1"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  internal interface SurfaceAccess { [PreserveSig] int GetInterface(ref Guid iid,out IntPtr texture); }
  [DllImport("d3d11.dll")] private static extern int CreateDirect3D11DeviceFromDXGIDevice(IntPtr device,out IntPtr inspectable);
  private static void Check(int hr){Marshal.ThrowExceptionForHR(hr);}
  internal static IDirect3DDevice WrapDevice(IntPtr device) {
    IntPtr dxgi=IntPtr.Zero,inspectable=IntPtr.Zero;
    try {
      Guid iid=new Guid("54ec77fa-1377-44e6-8c32-88fd5f44c84c");Check(Marshal.QueryInterface(device,ref iid,out dxgi));
      Check(CreateDirect3D11DeviceFromDXGIDevice(dxgi,out inspectable));return (IDirect3DDevice)Marshal.GetObjectForIUnknown(inspectable);
    } finally {if(inspectable!=IntPtr.Zero)Marshal.Release(inspectable);if(dxgi!=IntPtr.Zero)Marshal.Release(dxgi);}
  }
  private static void Capture(D3D11ProbeDevice device,IntPtr transform,IntPtr hwnd,uint pid,string title,Dictionary<string,object> entry,List<Action> afterShutdown,bool sequence) {
    Direct3D11CaptureFramePool pool=null;GraphicsCaptureSession session=null;GraphicsCaptureItem item=null;IDirect3DDevice winrtDevice=null;
    Direct3D11CaptureFrame selected=null;IntPtr texture=IntPtr.Zero;
    TypedEventHandler<Direct3D11CaptureFramePool,object> onFrame=null;TypedEventHandler<GraphicsCaptureItem,object> onClosed=null;
    bool frameRegistered=false,closedRegistered=false,accepting=true,sourceClosed=false;
    int callbacks=0,discarded=0;Exception callbackError=null;object gate=new object();
    ManualResetEvent ready=new ManualResetEvent(false);
    Dictionary<string,object> capture=new Dictionary<string,object>();entry["capture"]=capture;
    try {
      WgcProbe.ValidateWindow(hwnd,pid,title);
      if(!GraphicsCaptureSession.IsSupported())throw new InvalidOperationException("WGC unavailable");
      object factory=WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
      Guid itemIid=new Guid("79c3f95b-31f7-4ec2-a464-632ef5d30760");IntPtr pointer;
      Check(((ItemInterop)factory).CreateForWindow(hwnd,ref itemIid,out pointer));
      try{item=(GraphicsCaptureItem)Marshal.GetObjectForIUnknown(pointer);}finally{Marshal.Release(pointer);}
      if(item.Size.Width!=1280 || item.Size.Height!=720)throw new InvalidOperationException("capture item size mismatch");
      winrtDevice=WrapDevice(device.Device);
      pool=Direct3D11CaptureFramePool.CreateFreeThreaded(winrtDevice,DirectXPixelFormat.B8G8R8A8UIntNormalized,2,item.Size);
      session=pool.CreateCaptureSession(item);session.MinUpdateInterval=TimeSpan.Zero;session.IsCursorCaptureEnabled=false;
      if(session.MinUpdateInterval.Ticks!=0 || session.IsCursorCaptureEnabled)throw new InvalidOperationException("capture options not applied");
      onClosed=delegate {lock(gate){sourceClosed=true;if(accepting)ready.Set();}};
      item.Closed+=onClosed;closedRegistered=true;
      onFrame=delegate(Direct3D11CaptureFramePool sender,object unused){
        Direct3D11CaptureFrame frame=null;
        try {
          lock(gate){
            if(!accepting)return;callbacks++;
            frame=sender.TryGetNextFrame();if(frame==null)return;
            if(selected==null){selected=frame;frame=null;ready.Set();}else discarded++;
          }
        }catch(Exception error){lock(gate){if(accepting){callbackError=error;ready.Set();}}}
        finally{if(frame!=null)frame.Dispose();}
      };
      pool.FrameArrived+=onFrame;frameRegistered=true;
      WgcProbe.ValidateWindow(hwnd,pid,title);session.StartCapture();
      if(!ready.WaitOne(5000))throw new TimeoutException("first WGC frame deadline");
      lock(gate){accepting=false;}
      session.Dispose();session=null;
      if(callbackError!=null)throw callbackError;if(sourceClosed)throw new InvalidOperationException("synthetic window closed");
      if(selected==null)throw new InvalidOperationException("WGC did not deliver a frame");
      WgcProbe.ValidateWindow(hwnd,pid,title);
      if(selected.ContentSize.Width!=1280 || selected.ContentSize.Height!=720)throw new InvalidOperationException("WGC frame size mismatch");
      Guid textureIid=new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c");
      Check(((SurfaceAccess)selected.Surface).GetInterface(ref textureIid,out texture));
      // Guard real: mesmo adaptador não significa o mesmo dispositivo D3D11.
      using(D3D11ProbeDevice other=new D3D11ProbeDevice(UInt64.Parse(device.AdapterLuid,NumberStyles.AllowHexSpecifier))) {
        bool refused=false;
        try{GpuConversionProbe.Run(other.Device,null,texture);}
        catch(InvalidOperationException error){if(error.Message!="capture texture belongs to another device")throw;refused=true;}
        if(!refused)throw new InvalidOperationException("foreign D3D11 device was accepted");
        capture["differentDeviceRejectedBeforeConversion"]=true;
      }
      Dictionary<string,object> encoding=new Dictionary<string,object>();entry["encoding"]=encoding;
      Action<IntPtr> consumer=delegate(IntPtr nv12){
        try{MftTextureEncodeProbe.Run(transform,nv12,encoding,afterShutdown);}
        catch(Exception error){encoding["complete"]=false;encoding["error"]=error.GetType().Name+": "+error.Message;}
      };
      Dictionary<string,object> conversion=GpuConversionProbe.Run(device.Device,sequence?null:consumer,texture);
      if(sequence){
        try{MftTextureEncodeProbe.RunSequence(transform,device.Device,texture,encoding,afterShutdown);}
        catch(Exception error){encoding["complete"]=false;encoding["error"]=error.GetType().Name+": "+error.Message;}
      }
      entry["conversion"]=conversion;
      capture["width"]=selected.ContentSize.Width;capture["height"]=selected.ContentSize.Height;
      capture["sourceTimeTicks"]=selected.SystemRelativeTime.Ticks;capture["callbacks"]=callbacks;capture["discarded"]=discarded;
      capture["poolSize"]=2;capture["selectedFrameLimit"]=1;capture["selectedFrames"]=1;
      capture["parentOwnedSyntheticOnly"]=true;capture["captureSessionStoppedBeforeEncoding"]=true;capture["cursorCaptured"]=false;
      capture["adapterLuid"]=device.AdapterLuid;
      capture["complete"]=Object.Equals(conversion["complete"],true) && encoding.ContainsKey("complete") && Object.Equals(encoding["complete"],true);
      if(!Object.Equals(capture["complete"],true))throw new InvalidOperationException("WGC conversion or encode failed");
    } finally {
      lock(gate){accepting=false;}
      if(session!=null)session.Dispose();
      if(texture!=IntPtr.Zero)Marshal.Release(texture);
      if(selected!=null)selected.Dispose();
      if(pool!=null){if(frameRegistered)pool.FrameArrived-=onFrame;pool.Dispose();}
      if(item!=null && closedRegistered)item.Closed-=onClosed;
      if(winrtDevice!=null)winrtDevice.Dispose();ready.Dispose();
    }
  }
  [MTAThread] private static int Main(string[] args) {
    try {
      long handle;uint pid;ulong luid;
      if(args.Length!=4 && args.Length!=5 || args.Length==5 && args[4]!="--reuse-sequence" && args[4]!="--live" && args[4]!="--live-pressure" && args[4]!="--live-incremental" && args[4]!="--live-feedback" && args[4]!="--live-rate" && args[4]!="--live-rate-hrd" && args[4]!="--live-rate-lowres" && args[4]!="--live-switch-high" && args[4]!="--live-switch-low" && args[4]!="--live-persistent" && args[4]!="--live-persistent-roundtrip" && args[4]!="--live-persistent-recovery" && args[4]!="--live-persistent-cycles" && args[4]!="--live-persistent-cycles-gop120" || !Int64.TryParse(args[0],out handle) || handle<=0 || !UInt32.TryParse(args[1],out pid)
        || args[3].Length!=16 || !UInt64.TryParse(args[3],NumberStyles.AllowHexSpecifier,CultureInfo.InvariantCulture,out luid) || luid==0)
        throw new ArgumentException("expected HWND, parent PID, synthetic title and explicit adapter LUID");
      IntPtr hwnd=new IntPtr(handle);WgcProbe.ValidateWindow(hwnd,pid,args[2]);
      if(args.Length==5&&(args[4]=="--live-persistent"||args[4]=="--live-persistent-roundtrip"||args[4]=="--live-persistent-recovery"||args[4]=="--live-persistent-cycles"||args[4]=="--live-persistent-cycles-gop120")){
        bool longGop=args[4]=="--live-persistent-cycles-gop120",cycles=args[4]=="--live-persistent-cycles"||longGop;
        Dictionary<string,object> persistent=WgcPersistentProbe.Execute(luid,hwnd,pid,args[2],args[4]!="--live-persistent",args[4]=="--live-persistent-recovery"||cycles,cycles,longGop);
        JavaScriptSerializer output=new JavaScriptSerializer();output.MaxJsonLength=8388608;Console.Error.WriteLine(output.Serialize(persistent));return Object.Equals(persistent["allChecksPassed"],true)?0:1;
      }
      bool sequence=args.Length==5 && args[4]=="--reuse-sequence",live=args.Length==5 && args[4].StartsWith("--live",StringComparison.Ordinal);
      bool switchMode=live&&(args[4]=="--live-switch-high"||args[4]=="--live-switch-low");bool requestedDrain=false;bool lowResolution=live&&(args[4]=="--live-rate-lowres"||args[4]=="--live-switch-low");uint outputWidth=lowResolution?(uint)640:1280,outputHeight=lowResolution?(uint)360:720;
      bool binaryOutput=live&&(switchMode||args[4]=="--live-incremental"||args[4]=="--live-feedback"||args[4].StartsWith("--live-rate",StringComparison.Ordinal));
      NativeFramePipe pipe=live&&args[4]=="--live-incremental"?new NativeFramePipe():null;
      Dictionary<string,object> report=MftEncoderProbe.Execute(luid,live&&args[4]=="--live-rate-hrd"?"external-sequence-hrd":sequence||live?"external-sequence":"external",delegate(D3D11ProbeDevice device,IntPtr transform,Dictionary<string,object> entry,List<Action> afterShutdown){
        if(live&&args[4]=="--live-feedback")pipe=new NativeFramePipe(true,delegate{return CodecProbeControls.RequestKeyFrame(transform);});
        int captureFps=60;bool hrdMode=live&&args[4]=="--live-rate-hrd";bool rateMode=live&&(args[4]=="--live-rate"||hrdMode||lowResolution||switchMode);
        if(rateMode)pipe=new NativeFramePipe(true,delegate{return CodecProbeControls.RequestKeyFrame(transform);},delegate(uint rate){Dictionary<string,object> update=CodecProbeControls.SetBitRate(transform,rate);if(hrdMode){Dictionary<string,object> hrd=new Dictionary<string,object>();update["hrd"]=hrd;entry["hrdLastRateAttempt"]=hrd;CodecProbeControls.SetHrdBuffer(transform,rate/80,hrd);}captureFps=rate<500000?30:60;update["captureFps"]=captureFps;return update;},switchMode?(Action)delegate{requestedDrain=true;}:null);
        if(live)WgcLiveCapture.Run(device,transform,hwnd,pid,args[2],entry,afterShutdown,4,args[4]=="--live-pressure",pipe==null?(Action<byte[],Dictionary<string,object>>)null:pipe.Send,rateMode?(Func<int>)delegate{return captureFps;}:null,outputWidth,outputHeight,switchMode?(Func<bool>)delegate{return requestedDrain;}:null,switchMode);
        else Capture(device,transform,hwnd,pid,args[2],entry,afterShutdown,sequence);
      },outputWidth,outputHeight);
      report["wgcEncodeRequested"]=true;
      report["wgcSequenceRequested"]=sequence;
      report["wgcLiveRequested"]=live;
      report["incrementalOutput"]=pipe!=null;if(pipe!=null)report["nativePipe"]=pipe.Snapshot();
      report["scope"]="One parent-owned synthetic window WGC frame, same D3D11 device, GPU conversion with validation readback, DXGI hardware encoder input. No continuous capture/queues, WebRTC, copy reduction or latency proof.";
      if(live)report["scope"]="Active parent-owned synthetic WGC window, latest pending frame, two release-tracked GPU conversion slots and MFT encoding. Offline decode fixture, no WebRTC, internal copy reduction or input-to-photon proof.";
      if(pipe!=null)report["scope"]="Active parent-owned synthetic WGC window, GPU conversion and MFT encoding with private incremental binary IPC. No WebRTC, internal copy reduction or input-to-photon proof.";
      JavaScriptSerializer serializer=new JavaScriptSerializer();serializer.MaxJsonLength=8388608;
      if(binaryOutput)Console.Error.WriteLine(serializer.Serialize(report));else Console.WriteLine(serializer.Serialize(report));return (bool)report["allChecksPassed"]?0:1;
    }catch(Exception error){Console.Error.WriteLine("WGC encode failed: "+error.GetType().Name+": "+error.Message);return 2;}
  }
}
