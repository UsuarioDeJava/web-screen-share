using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using Windows.Foundation;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;

internal sealed class WgcLiveCapture : IDisposable {
  private Direct3D11CaptureFramePool pool;private GraphicsCaptureSession session;private GraphicsCaptureItem item;private IDirect3DDevice device;
  private Direct3D11CaptureFrame latest;private long latestArrival;
  private readonly object gate=new object();private bool active,closed,frameRegistered,closedRegistered,stopped;
  private readonly AutoResetEvent ready=new AutoResetEvent(false);private bool signalDisposed;
  internal WaitHandle Ready{get{return ready;}}
  private Exception failure;private int received,replaced,selected,disposed,maximumPending;
  private readonly IntPtr hwnd;private readonly uint ownerPid;private readonly string expectedTitle;
  private readonly Stopwatch liveness=Stopwatch.StartNew();private long nextIdentityCheck;
  private TypedEventHandler<Direct3D11CaptureFramePool,object> onFrame;private TypedEventHandler<GraphicsCaptureItem,object> onClosed;
  private void Drop(Direct3D11CaptureFrame frame){frame.Dispose();Interlocked.Increment(ref disposed);}
  internal WgcLiveCapture(IntPtr nativeDevice,IntPtr hwnd,uint pid,string title){
    this.hwnd=hwnd;ownerPid=pid;expectedTitle=title;
    try {
      WgcProbe.ValidateWindow(hwnd,pid,title);if(!GraphicsCaptureSession.IsSupported())throw new InvalidOperationException("WGC unavailable");
      object factory=WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));Guid iid=new Guid("79c3f95b-31f7-4ec2-a464-632ef5d30760");IntPtr pointer;
      Marshal.ThrowExceptionForHR(((WgcEncodeProbe.ItemInterop)factory).CreateForWindow(hwnd,ref iid,out pointer));
      try{item=(GraphicsCaptureItem)Marshal.GetObjectForIUnknown(pointer);}finally{Marshal.Release(pointer);}
      if(item.Size.Width!=NativeCapturePolicy.Width || item.Size.Height!=NativeCapturePolicy.Height)throw new InvalidOperationException("live capture size mismatch");
      device=WgcEncodeProbe.WrapDevice(nativeDevice);pool=Direct3D11CaptureFramePool.CreateFreeThreaded(device,DirectXPixelFormat.B8G8R8A8UIntNormalized,3,item.Size);
      session=pool.CreateCaptureSession(item);session.MinUpdateInterval=TimeSpan.Zero;session.IsCursorCaptureEnabled=false;
      if(session.MinUpdateInterval.Ticks!=0 || session.IsCursorCaptureEnabled)throw new InvalidOperationException("live capture options not applied");
      onClosed=delegate{lock(gate){closed=true;if(active)ready.Set();}};
      item.Closed+=onClosed;closedRegistered=true;
      onFrame=delegate(Direct3D11CaptureFramePool sender,object unused){
        try{lock(gate){
          if(!active)return;
          for(int i=0;i<3;i++){
            Direct3D11CaptureFrame frame=sender.TryGetNextFrame();if(frame==null)break;received++;
            if(latest!=null){Drop(latest);replaced++;}latest=frame;latestArrival=Stopwatch.GetTimestamp();maximumPending=1;
          }
          ready.Set();
        }}catch(Exception error){lock(gate){if(active){failure=error;ready.Set();}}}
      };
      pool.FrameArrived+=onFrame;frameRegistered=true;active=true;
      WgcProbe.ValidateWindow(hwnd,pid,title);session.StartCapture();
    }catch{Dispose();throw;}
  }
  internal MftTextureEncodeProbe.CapturedInput TakeLatest(){
    Direct3D11CaptureFrame frame;long arrival;
    lock(gate){if(failure!=null)throw failure;if(closed)throw new InvalidOperationException("synthetic window closed during live capture");frame=latest;arrival=latestArrival;latest=null;if(frame!=null)selected++;}
    if(frame==null)return null;
    IntPtr texture=IntPtr.Zero;
    try {
      if(frame.ContentSize.Width!=NativeCapturePolicy.Width || frame.ContentSize.Height!=NativeCapturePolicy.Height)throw new InvalidOperationException("capture window resized; select it again");
      Guid iid=new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c");Marshal.ThrowExceptionForHR(((WgcEncodeProbe.SurfaceAccess)frame.Surface).GetInterface(ref iid,out texture));
      long ticks=frame.SystemRelativeTime.Ticks;IntPtr owned=texture;
      MftTextureEncodeProbe.CapturedInput result=new MftTextureEncodeProbe.CapturedInput(owned,ticks,arrival,delegate{Marshal.Release(owned);Drop(frame);});texture=IntPtr.Zero;return result;
    }catch{if(texture!=IntPtr.Zero)Marshal.Release(texture);Drop(frame);throw;}
  }
  internal void CheckSource(){
    lock(gate){if(failure!=null)throw failure;if(closed)throw new InvalidOperationException("synthetic window closed during live capture");}
    if(liveness.ElapsedMilliseconds>=nextIdentityCheck){
      nextIdentityCheck=liveness.ElapsedMilliseconds+100;
      try{WgcProbe.ValidateWindow(hwnd,ownerPid,expectedTitle,false);}
      catch(InvalidOperationException error){lock(gate){closed=true;}throw new InvalidOperationException("synthetic window closed during live capture",error);}
    }
  }
  internal void Stop(){
    lock(gate){active=false;if(!signalDisposed)ready.Set();}
    if(session!=null){session.Dispose();session=null;}
    lock(gate){if(latest!=null){Drop(latest);latest=null;}stopped=true;}
  }
  public void Dispose(){
    Stop();if(pool!=null){if(frameRegistered){pool.FrameArrived-=onFrame;frameRegistered=false;}pool.Dispose();pool=null;}
    if(item!=null && closedRegistered){item.Closed-=onClosed;closedRegistered=false;}if(device!=null){device.Dispose();device=null;}
    lock(gate){if(!signalDisposed){signalDisposed=true;ready.Dispose();}}
  }
  internal Dictionary<string,object> Snapshot(string luid){
    lock(gate){
      Dictionary<string,object> r=new Dictionary<string,object>();r["width"]=NativeCapturePolicy.Width;r["height"]=NativeCapturePolicy.Height;r["poolSize"]=3;r["pendingFrameLimit"]=1;r["maximumPendingFrames"]=maximumPending;
      r["receivedFrames"]=received;r["replacedPendingFrames"]=replaced;r["selectedFrames"]=selected;r["disposedFrames"]=Interlocked.CompareExchange(ref disposed,0,0);
      r["parentOwnedSyntheticOnly"]=!NativeCapturePolicy.Enabled;r["applicationSelectedWindow"]=NativeCapturePolicy.Enabled;r["cursorCaptured"]=false;r["captureSessionStoppedBeforeEncoding"]=false;r["stopped"]=stopped;r["sourceClosed"]=closed;r["adapterLuid"]=luid;
      r["identityCheckIntervalMs"]=100;r["poolDisposed"]=pool==null;r["deviceWrapperDisposed"]=device==null;r["resourcesReleased"]=stopped && pool==null && device==null && received==disposed;
      r["complete"]=stopped && pool==null && device==null && !closed && failure==null && received==disposed && (NativeCapturePolicy.Enabled||selected>20);return r;
    }
  }
  internal static void Run(D3D11ProbeDevice device,IntPtr transform,IntPtr hwnd,uint pid,string title,Dictionary<string,object> entry,List<Action> afterShutdown,int seconds,bool pressure,Action<byte[],Dictionary<string,object>> emit=null,Func<int> captureFps=null,uint outputWidth=1280,uint outputHeight=720,Func<bool> shouldDrain=null,bool absoluteSourceClock=false,WaitHandle stopRequested=null){
    WgcLiveCapture source=null;Dictionary<string,object> encoding=new Dictionary<string,object>();entry["encoding"]=encoding;
    try {
      source=new WgcLiveCapture(device.Device,hwnd,pid,title);
      MftTextureEncodeProbe.RunLive(transform,device.Device,source.TakeLatest,source.CheckSource,source.Stop,seconds,pressure,encoding,afterShutdown,emit,captureFps,outputWidth,outputHeight,shouldDrain,absoluteSourceClock,source.Ready,stopRequested);
      if(!Object.Equals(encoding["complete"],true))throw new InvalidOperationException("live encode incomplete");
    }finally{
      if(source!=null){
        source.Stop();WgcLiveCapture held=source;
        afterShutdown.Add(delegate{held.Dispose();Dictionary<string,object> capture=held.Snapshot(device.AdapterLuid);entry["capture"]=capture;
          if(!Object.Equals(capture["complete"],true))throw new InvalidOperationException("live capture closed or failed");});
      }
    }
  }
}
