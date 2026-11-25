using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

// One pending BeginGetEvent or one delivered event. Never mixes asynchronous and
// synchronous GetEvent. The generator/callback stay alive through MFT shutdown.
[ComVisible(true),ClassInterface(ClassInterfaceType.None)]
public sealed class ProbeEncoderEvents : IProbeSampleReleased {
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int BeginFn(IntPtr self,IntPtr callback,IntPtr state);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int EndFn(IntPtr self,IntPtr result,out IntPtr mediaEvent);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int QueueFn(IntPtr self,uint type,ref Guid extended,int status,IntPtr value);
  private static T Slot<T>(IntPtr obj,int slot) where T:class{return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj),slot*IntPtr.Size),typeof(T));}
  private readonly object gate=new object();
  private readonly AutoResetEvent ready=new AutoResetEvent(false);
  private readonly ManualResetEvent idle=new ManualResetEvent(true);
  private IntPtr generator,callback,delivered;private bool pending,stopped,finished;
  private Exception failure;private int begins,callbacks,taken,maximumBuffered;
  internal readonly Dictionary<string,object> Diagnostics=new Dictionary<string,object>();
  internal WaitHandle Ready{get{return ready;}}
  internal ProbeEncoderEvents(IntPtr source){
    try{Marshal.AddRef(source);generator=source;callback=Marshal.GetComInterfaceForObject(this,typeof(IProbeSampleReleased));}
    catch{if(generator!=IntPtr.Zero)Marshal.Release(generator);ready.Dispose();idle.Dispose();throw;}
  }
  internal void Request(){
    lock(gate){if(failure!=null)throw new InvalidOperationException("encoder event callback failed",failure);if(stopped||pending||delivered!=IntPtr.Zero)return;pending=true;idle.Reset();begins++;}
    int hr;
    try{hr=Slot<BeginFn>(generator,4)(generator,callback,IntPtr.Zero);}
    catch(Exception error){lock(gate){pending=false;failure=error;idle.Set();}throw;}
    if(hr<0){lock(gate){pending=false;failure=new InvalidOperationException("BeginGetEvent returned "+hr.ToString("x8"));idle.Set();}throw failure;}
  }
  internal bool TryTake(out IntPtr mediaEvent){
    lock(gate){if(failure!=null)throw new InvalidOperationException("encoder event callback failed",failure);mediaEvent=delivered;delivered=IntPtr.Zero;if(mediaEvent!=IntPtr.Zero)taken++;return mediaEvent!=IntPtr.Zero;}
  }
  public int GetParameters(out uint flags,out uint queue){flags=0;queue=0;return unchecked((int)0x80004001);}
  public int Invoke(IntPtr result){
    IntPtr mediaEvent=IntPtr.Zero;Exception error=null;
    try{int hr=Slot<EndFn>(generator,5)(generator,result,out mediaEvent);if(hr!=0)error=new InvalidOperationException("EndGetEvent returned "+hr.ToString("x8"));}
    catch(Exception caught){error=caught;}
    lock(gate){
      callbacks++;pending=false;
      if(!stopped){
        if(error!=null)failure=error;
        else if(delivered!=IntPtr.Zero)failure=new InvalidOperationException("encoder event slot overflow");
        else{delivered=mediaEvent;mediaEvent=IntPtr.Zero;maximumBuffered=1;}
      }
      if(mediaEvent!=IntPtr.Zero)Marshal.Release(mediaEvent);
      ready.Set();idle.Set();
    }
    return 0;
  }
  internal void Stop(){
    bool wake;
    lock(gate){if(finished||stopped)return;stopped=true;if(delivered!=IntPtr.Zero){Marshal.Release(delivered);delivered=IntPtr.Zero;}wake=pending;ready.Set();Update();}
    if(wake){
      // A shutdown may cancel a queued request without invoking it. Wake our
      // pending request while the generator is live, with a private extended
      // event discarded by Invoke because stopped is already true.
      try{Guid end=new Guid("63ef1633-c087-4e78-ae18-77c26e755eb2");int hr=Slot<QueueFn>(generator,6)(generator,2,ref end,0,IntPtr.Zero);Diagnostics["stopWakeHR"]=hr.ToString("x8");if(hr>=0)Diagnostics["settledBeforeShutdown"]=idle.WaitOne(500);}
      catch(Exception error){Diagnostics["stopWakeError"]=error.Message;}
    }
  }
  private void Update(){Diagnostics["enabled"]=true;Diagnostics["beginCalls"]=begins;Diagnostics["callbacks"]=callbacks;Diagnostics["takenEvents"]=taken;Diagnostics["maximumBufferedEvents"]=maximumBuffered;Diagnostics["pendingRequest"]=pending;Diagnostics["bufferedEvents"]=delivered==IntPtr.Zero?0:1;Diagnostics["stopped"]=stopped;Diagnostics["finished"]=finished;Diagnostics["failed"]=failure!=null;Diagnostics["error"]=failure==null?null:failure.Message;}
  internal void FinishAfterShutdown(){
    lock(gate){if(finished)return;}
    Stop();
    // If shutdown fails to return a pending callback, retain the COM references
    // and handles until this test worker exits rather than freeing live objects.
    if(!idle.WaitOne(2000)){lock(gate){Update();Diagnostics["callbackSettled"]=false;}throw new TimeoutException("encoder event callback did not settle after shutdown");}
    lock(gate){if(finished)return;finished=true;Update();Diagnostics["callbackSettled"]=true;if(callback!=IntPtr.Zero){Marshal.Release(callback);callback=IntPtr.Zero;}if(generator!=IntPtr.Zero){Marshal.Release(generator);generator=IntPtr.Zero;}ready.Dispose();idle.Dispose();}
    GC.KeepAlive(this);
  }
}
