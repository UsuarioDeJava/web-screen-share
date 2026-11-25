using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading;

// Probes de um frame ou sequência limitada; não gerencia captura contínua.
// Polling limitado só neste harness de teste.
internal static class MftTextureEncodeProbe {
  internal static bool ApplicationMode;
  [StructLayout(LayoutKind.Sequential)] private struct OutputInfo { public uint flags, size, alignment; }
  [StructLayout(LayoutKind.Sequential)] private struct OutputData { public uint stream; public IntPtr sample; public uint status; public IntPtr events; }
  [DllImport("mfplat.dll")] private static extern int MFCreateDXGISurfaceBuffer(ref Guid iid, IntPtr surface, uint subresource, [MarshalAs(UnmanagedType.Bool)] bool bottomUp, out IntPtr buffer);
  [DllImport("mfplat.dll")] private static extern int MFCreateTrackedSample(out IntPtr sample);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int AllocatorFn(IntPtr self,IntPtr callback,IntPtr state);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int UIntFn(IntPtr self, out uint value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int StatusFn(IntPtr self, out int value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetLengthFn(IntPtr self, uint length);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int ResourceFn(IntPtr self, ref Guid iid, out IntPtr resource);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int AddBufferFn(IntPtr self, IntPtr buffer);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int SetTimeFn(IntPtr self, long value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int GetTimeFn(IntPtr self, out long value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int MessageFn(IntPtr self, uint message, IntPtr value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int EventFn(IntPtr self, uint flags, out IntPtr mediaEvent);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int InputFn(IntPtr self, uint stream, IntPtr sample, uint flags);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int InfoFn(IntPtr self, uint stream, out OutputInfo info);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int OutputFn(IntPtr self, uint flags, uint count, ref OutputData data, out uint status);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int BufferFn(IntPtr self, out IntPtr buffer);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int BufferAtFn(IntPtr self, uint index, out IntPtr buffer);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int LockFn(IntPtr self, out IntPtr data, out uint maximum, out uint length);
  [UnmanagedFunctionPointer(CallingConvention.StdCall)] private delegate int UnlockFn(IntPtr self);
  private static T Slot<T>(IntPtr obj, int slot) where T : class {
    return (T)(object)Marshal.GetDelegateForFunctionPointer(Marshal.ReadIntPtr(Marshal.ReadIntPtr(obj), slot*IntPtr.Size), typeof(T));
  }
  private static void Check(int hr, string stage) { if(hr!=0) throw new InvalidOperationException(stage+" returned "+hr.ToString("x8")); }
  private static IntPtr Query(IntPtr source, string iid) { Guid id=new Guid(iid); IntPtr result; Check(Marshal.QueryInterface(source,ref id,out result),"QueryInterface"); return result; }
  internal sealed class TrackedInput : IDisposable {
    internal IntPtr Sample {get;private set;}
    private readonly ProbeSampleReleased callback=new ProbeSampleReleased();
    internal bool Released {get{return callback.Count==1;}}
    internal int ReleaseCount {get{return callback.Count;}}
    internal TrackedInput(IntPtr texture,long time,Dictionary<string,object> result,long duration=166666,uint width=1280,uint height=720) {
      IntPtr tracked=IntPtr.Zero,buffer=IntPtr.Zero,dxgi=IntPtr.Zero,resource=IntPtr.Zero,identity=IntPtr.Zero,original=IntPtr.Zero,callbackPointer=IntPtr.Zero;
      try {
        Check(MFCreateTrackedSample(out tracked),"MFCreateTrackedSample");
        Sample=Query(tracked,"c40a00f2-b93a-4d80-ae8c-5a1c634f58e4");
        Guid textureIid=new Guid("6f15aaf2-d208-4e89-9ab4-489535d34f9c");
        Check(MFCreateDXGISurfaceBuffer(ref textureIid,texture,0,false,out buffer),"MFCreateDXGISurfaceBuffer");
        dxgi=Query(buffer,"e7174cfa-1c9e-48b1-8866-626226bfc258");
        Check(Slot<ResourceFn>(dxgi,3)(dxgi,ref textureIid,out resource),"GetResource");
        identity=Query(resource,"00000000-0000-0000-c000-000000000046");original=Query(texture,"00000000-0000-0000-c000-000000000046");
        uint subresource,maximum,current;Check(Slot<UIntFn>(dxgi,4)(dxgi,out subresource),"GetSubresourceIndex");
        if(identity!=original || subresource!=0)throw new InvalidOperationException("surface buffer does not reference original texture");
        uint length=width*height*3/2;Check(Slot<UIntFn>(buffer,7)(buffer,out maximum),"GetMaxLength(raw)");
        if(maximum<length)throw new InvalidOperationException("surface buffer smaller than NV12 frame");
        Check(Slot<SetLengthFn>(buffer,6)(buffer,length),"SetCurrentLength(raw)");Check(Slot<UIntFn>(buffer,5)(buffer,out current),"GetCurrentLength(raw)");
        if(current!=length)throw new InvalidOperationException("surface length differs");
        Check(Slot<AddBufferFn>(Sample,42)(Sample,buffer),"AddBuffer");
        Check(Slot<SetTimeFn>(Sample,36)(Sample,time),"SetSampleTime");Check(Slot<SetTimeFn>(Sample,38)(Sample,duration),"SetSampleDuration");result["sampleDurationTicks"]=duration;
        callbackPointer=Marshal.GetComInterfaceForObject(callback,typeof(IProbeSampleReleased));
        Check(Slot<AllocatorFn>(tracked,3)(tracked,callbackPointer,IntPtr.Zero),"SetAllocator");
        result["originalTextureIdentityConfirmed"]=true;result["subresource"]=subresource;result["inputBufferLength"]=current;
      } catch {ReleaseCaller();callback.Dispose();throw;}
      finally {foreach(IntPtr p in new IntPtr[]{callbackPointer,original,identity,resource,dxgi,buffer,tracked})if(p!=IntPtr.Zero)Marshal.Release(p);}
    }
    internal void ReleaseCaller(){if(Sample!=IntPtr.Zero){Marshal.Release(Sample);Sample=IntPtr.Zero;}}
    internal bool WaitReleased(int milliseconds){return callback.Wait(milliseconds) && callback.Count==1;}
    internal WaitHandle ReleaseSignal{get{return callback.Ready;}}
    public void Dispose(){ReleaseCaller();callback.Dispose();GC.KeepAlive(callback);}
  }
  private static Dictionary<string,object> ReadOutput(IntPtr sample) {
    byte[] ignored;return ReadOutput(sample,out ignored,false);
  }
  private static Dictionary<string,object> ReadOutput(IntPtr sample,out byte[] encoded,bool binary) {
    encoded=null;
    IntPtr buffer=IntPtr.Zero; bool locked=false;
    try {
      long time,duration; Check(Slot<GetTimeFn>(sample,35)(sample,out time),"GetSampleTime"); Check(Slot<GetTimeFn>(sample,37)(sample,out duration),"GetSampleDuration");
      uint count;Check(Slot<UIntFn>(sample,39)(sample,out count),"GetBufferCount(encoded)");
      if(count<1||count>64)throw new InvalidOperationException("invalid encoded buffer count");
      if(count==1)Check(Slot<BufferAtFn>(sample,40)(sample,0,out buffer),"GetBufferByIndex(encoded)");
      else Check(Slot<BufferFn>(sample,41)(sample,out buffer),"ConvertToContiguousBuffer(encoded)");
      IntPtr bytes; uint capacity,length; Check(Slot<LockFn>(buffer,3)(buffer,out bytes,out capacity,out length),"Lock(encoded)"); locked=true;
      if(bytes==IntPtr.Zero || length==0 || length>262144 || length>capacity) throw new InvalidOperationException("invalid encoded output size");
      byte[] copy=new byte[(int)length]; Marshal.Copy(bytes,copy,0,copy.Length);
      encoded=copy;
      Dictionary<string,object> packet=new Dictionary<string,object>();
      packet["bytes"]=length; packet["sampleTimeTicks"]=time; packet["sampleDurationTicks"]=duration;
      packet["encodedBufferCount"]=count;packet["contiguousConversionRequested"]=count>1;packet["managedPayloadBytesCopied"]=length;
      if(!ApplicationMode)using(SHA256 hash=SHA256.Create()) packet["sha256"]=BitConverter.ToString(hash.ComputeHash(copy)).Replace("-","").ToLowerInvariant();
      if(!binary)packet["bitstreamBase64"]=Convert.ToBase64String(copy); // Runner valida e remove antes de salvar.
      return packet;
    } finally { if(locked) Slot<UnlockFn>(buffer,4)(buffer); if(buffer!=IntPtr.Zero) Marshal.Release(buffer); }
  }
  internal sealed class CapturedInput : IDisposable {
    internal readonly IntPtr Texture;internal readonly long SourceTicks,ArrivalTimestamp;
    private Action release;
    internal CapturedInput(IntPtr texture,long sourceTicks,long arrivalTimestamp,Action releaseOwner){Texture=texture;SourceTicks=sourceTicks;ArrivalTimestamp=arrivalTimestamp;release=releaseOwner;}
    public void Dispose(){Action owner=Interlocked.Exchange(ref release,null);if(owner!=null)owner();}
  }
  private static double ProcessCpuMs(){using(Process process=Process.GetCurrentProcess())return process.TotalProcessorTime.TotalMilliseconds;}
  internal static void RunLive(IntPtr transform,IntPtr device,Func<CapturedInput> takeLatest,Action checkSource,Action stopSource,int seconds,bool pressure,Dictionary<string,object> result,List<Action> afterShutdown,Action<byte[],Dictionary<string,object>> emit=null,Func<int> captureFps=null,uint outputWidth=1280,uint outputHeight=720,Func<bool> shouldDrain=null,bool absoluteSourceClock=false,WaitHandle captureReady=null,WaitHandle stopRequested=null) {
    if(seconds<1||seconds>(ApplicationMode?28800:90))throw new ArgumentException("invalid live duration");int frameBudget=Math.Max(600,seconds*60),eventBudget=Math.Max(2000,frameBudget*3+32);
    TrackedInput[] leases=new TrackedInput[2];CapturedInput[] heldFrames=new CapturedInput[2];int[] uses=new int[2];
    List<object> inputs=new List<object>(),packets=new List<object>();List<int> buckets=new List<int>();
    result["complete"]=false;result["outputFrames"]=0;result["inputs"]=inputs;result["packets"]=packets;result["absoluteSourceClock"]=absoluteSourceClock;result["parentRequestedDrain"]=false;
    IntPtr generator=IntPtr.Zero;bool begun=false,draining=false,drained=false,stalled=false;
    int sent=0,outputs=0,credits=0,reuses=0,maxInFlight=0,released=0,stale=0,events=0,mergedOutputs=0,readbackCalls=0;long totalBytes=0;int lastBucket=-1;
    long firstSource=-1,lastSource=-1;double ageAfterStall=-1,lastSelectedMs=-1000;
    Stopwatch clock=Stopwatch.StartNew();
    bool pollStats=Environment.GetEnvironmentVariable("WSS_TEST_NATIVE_POLL_STATS")=="1";
    bool eventDriven=Environment.GetEnvironmentVariable("WSS_TEST_NATIVE_EVENTS")=="1";ProbeEncoderEvents eventSource=null;int eventWaits=0,eventTimeouts=0,synchronousEventCalls=0;double eventWaitMs=0;
    bool stopPendingProbe=Environment.GetEnvironmentVariable("WSS_TEST_NATIVE_EVENT_STOP_PENDING")=="1";
    result["eventDriven"]=eventDriven;
    bool stageTiming=Environment.GetEnvironmentVariable("WSS_TEST_NATIVE_STAGE_TIMING")=="1";
    Dictionary<long,long[]> pendingTimes=stageTiming?new Dictionary<long,long[]>():null;int maximumTimedInputs=0;
    int iterations=0,emptyPolls=0,emitCalls=0;double sleepMs=0,maxSleepMs=0,emitMs=0,maxEmitMs=0,cpuStart=pollStats?ProcessCpuMs():0;
    int[] sleepBuckets=pollStats?new int[8]:null;
    bool phaseCadence=Environment.GetEnvironmentVariable("WSS_TEST_NATIVE_PHASE_CADENCE")=="1";FrameCadence cadence=phaseCadence||eventDriven?new FrameCadence(eventDriven):null;
    result["phaseCadence"]=phaseCadence;
    result["effectivePhaseCadence"]=phaseCadence||eventDriven;result["sixtyFpsSelectionCap"]=eventDriven;
    try {
      generator=Query(transform,"2cd0bd52-bcd5-4b89-b62c-eadc0c031e7d");
      if(eventDriven){if(captureReady==null)throw new InvalidOperationException("event mode needs capture notification");eventSource=new ProbeEncoderEvents(generator);result["eventReceiver"]=eventSource.Diagnostics;}
      OutputInfo info;Check(Slot<InfoFn>(transform,7)(transform,0,out info),"GetOutputStreamInfo(live)");
      if((info.flags&0x300)==0)throw new InvalidOperationException("transform must provide compressed samples");
      Check(Slot<MessageFn>(transform,23)(transform,0x10000000,IntPtr.Zero),"BEGIN_STREAMING");begun=true;
      Check(Slot<MessageFn>(transform,23)(transform,0x10000003,IntPtr.Zero),"START_OF_STREAM");
      using(GpuConversionProbe.Reusable converter=new GpuConversionProbe.Reusable(device,outputWidth,outputHeight)) {
        while(!drained) {
          if(pollStats)iterations++;
          checkSource();
          if(eventDriven&&stopPendingProbe&&sent>=40&&sent==outputs&&credits>0){eventSource.Request();eventSource.Stop();throw new InvalidOperationException("event stop pending probe");}
          if(clock.ElapsedMilliseconds>seconds*1000+5000)throw new TimeoutException("live encoder deadline");
          for(int i=0;i<2;i++)if(leases[i]!=null && leases[i].Released){
            if(leases[i].ReleaseCount!=1)throw new InvalidOperationException("invalid sample release count");
            released++;leases[i].Dispose();leases[i]=null;if(heldFrames[i]!=null){heldFrames[i].Dispose();heldFrames[i]=null;}
          }
          if(pressure && !stalled && clock.ElapsedMilliseconds>=1000){Thread.Sleep(250);stalled=true;}
          if((clock.ElapsedMilliseconds>=seconds*1000||(shouldDrain!=null&&shouldDrain())) && !draining){result["parentRequestedDrain"]=shouldDrain!=null&&shouldDrain();result["drainStartedMs"]=clock.Elapsed.TotalMilliseconds;
            stopSource();Check(Slot<MessageFn>(transform,23)(transform,0x10000002,IntPtr.Zero),"END_OF_STREAM");
            Check(Slot<MessageFn>(transform,23)(transform,1,IntPtr.Zero),"DRAIN");draining=true;
          }
          int fps=captureFps==null?60:captureFps();if(fps!=30&&fps!=60)throw new InvalidOperationException("invalid live capture cadence");
          if(!draining && credits>0 && sent-outputs<2 && (phaseCadence||eventDriven?cadence.Ready(clock.Elapsed.TotalMilliseconds,fps):captureFps==null||fps==60||clock.Elapsed.TotalMilliseconds-lastSelectedMs>=1000.0/fps)){
            for(int n=0;n<2;n++){
              int i=(sent+n)%2;if(leases[i]!=null)continue;
              CapturedInput frame=takeLatest();if(frame==null)break;
              if(frame.SourceTicks<=lastSource){stale++;frame.Dispose();break;}
              if(sent>=frameBudget){frame.Dispose();throw new InvalidOperationException("live frame budget exceeded");}
              heldFrames[i]=frame;
              double age=(Stopwatch.GetTimestamp()-frame.ArrivalTimestamp)*1000.0/Stopwatch.Frequency;
              if(stalled && ageAfterStall<0)ageAfterStall=age;
              if(firstSource<0)firstSource=frame.SourceTicks;lastSource=frame.SourceTicks;
              long time=absoluteSourceClock?frame.SourceTicks:10000000+frame.SourceTicks-firstSource;
              long conversionAt=stageTiming?Stopwatch.GetTimestamp():0;
              IntPtr nv12=converter.ConvertTexture(frame.Texture,i);
              Dictionary<string,object> input=new Dictionary<string,object>();inputs.Add(input);if(ApplicationMode&&inputs.Count>32)inputs.RemoveAt(0);
              input["timeTicks"]=time;input["sourceTicks"]=frame.SourceTicks;input["arrivalToSelectionMs"]=age;input["slot"]=i;
              if(stageTiming)input["gpuConversionSubmitMs"]=(Stopwatch.GetTimestamp()-conversionAt)*1000.0/Stopwatch.Frequency;
              if(pollStats)input["selectionAtMs"]=clock.Elapsed.TotalMilliseconds;
              input["reusedAfterReleaseNotification"]=uses[i]>0;if(uses[i]>0)reuses++;
              TrackedInput lease=new TrackedInput(nv12,time,input,10000000/fps,outputWidth,outputHeight);leases[i]=lease;lastSelectedMs=clock.Elapsed.TotalMilliseconds;
              if(phaseCadence||eventDriven)cadence.Selected(lastSelectedMs,fps);
              long inputAt=stageTiming?Stopwatch.GetTimestamp():0;
              try{Check(Slot<InputFn>(transform,24)(transform,0,lease.Sample,0),"ProcessInput(live)");
                if(stageTiming){input["processInputCallMs"]=(Stopwatch.GetTimestamp()-inputAt)*1000.0/Stopwatch.Frequency;pendingTimes.Add(time,new long[]{inputAt,frame.ArrivalTimestamp});maximumTimedInputs=Math.Max(maximumTimedInputs,pendingTimes.Count);if(maximumTimedInputs>2)throw new InvalidOperationException("timed encoder queue exceeded two inputs");}
              }finally{lease.ReleaseCaller();}
              uses[i]++;sent++;credits--;maxInFlight=Math.Max(maxInFlight,sent-outputs);result["inputFrames"]=sent;break;
            }
          }
          IntPtr mediaEvent=IntPtr.Zero;int hr;
          if(eventDriven){if(draining||credits==0||sent>outputs)eventSource.Request();hr=eventSource.TryTake(out mediaEvent)?0:unchecked((int)0xc00d3e80);}
          else{synchronousEventCalls++;hr=Slot<EventFn>(generator,3)(generator,1,out mediaEvent);}
          if(hr==unchecked((int)0xc00d3e80)){
            if(eventDriven){
              List<WaitHandle> signals=new List<WaitHandle>();signals.Add(eventSource.Ready);if(!draining)signals.Add(captureReady);for(int i=0;i<2;i++)if(leases[i]!=null)signals.Add(leases[i].ReleaseSignal);
              if(!draining&&stopRequested!=null)signals.Add(stopRequested);
              int timeout=100;if(!draining&&credits>0&&sent-outputs<2){double remaining=cadence.UntilReady(clock.Elapsed.TotalMilliseconds,fps);if(remaining>0)timeout=Math.Min(timeout,Math.Max(1,(int)Math.Ceiling(remaining)));}
              long before=Stopwatch.GetTimestamp();int wake=WaitHandle.WaitAny(signals.ToArray(),timeout);eventWaits++;if(wake==WaitHandle.WaitTimeout)eventTimeouts++;eventWaitMs+=(Stopwatch.GetTimestamp()-before)*1000.0/Stopwatch.Frequency;continue;
            }
            if(!pollStats)Thread.Sleep(1);
            else{long before=Stopwatch.GetTimestamp();Thread.Sleep(1);double elapsed=(Stopwatch.GetTimestamp()-before)*1000.0/Stopwatch.Frequency;
              emptyPolls++;sleepMs+=elapsed;maxSleepMs=Math.Max(maxSleepMs,elapsed);int bucket=elapsed<2?0:elapsed<5?1:elapsed<10?2:elapsed<20?3:elapsed<40?4:elapsed<100?5:elapsed<250?6:7;sleepBuckets[bucket]++;}
            continue;
          }
          try {
            Check(hr,"GetEvent(live)");uint type;int status;
            Check(Slot<UIntFn>(mediaEvent,33)(mediaEvent,out type),"GetType");Check(Slot<StatusFn>(mediaEvent,35)(mediaEvent,out status),"GetStatus");Check(status,"event status");
            if(++events>eventBudget)throw new InvalidOperationException("live event budget exceeded");
            if(type==601){if(++credits>16)throw new InvalidOperationException("input credit budget exceeded");}
            else if(type==602){
              OutputData data=new OutputData();uint outputStatus;
              try {
                Check(Slot<OutputFn>(transform,25)(transform,0,1,ref data,out outputStatus),"ProcessOutput(live)");
                if(data.sample==IntPtr.Zero || data.status!=0 || outputStatus!=0 || ++outputs>sent)throw new InvalidOperationException("unexpected live output");
                byte[] payload;Dictionary<string,object> packet=ReadOutput(data.sample,out payload,emit!=null);totalBytes+=Convert.ToInt32(packet["bytes"]);readbackCalls++;
                if(Object.Equals(packet["contiguousConversionRequested"],true))mergedOutputs++;
                if(stageTiming){long[] times;long sampleTime=Convert.ToInt64(packet["sampleTimeTicks"]);if(!pendingTimes.TryGetValue(sampleTime,out times))throw new InvalidOperationException("encoder output has no timed input");long observed=Stopwatch.GetTimestamp();packet["inputToOutputObservedMs"]=(observed-times[0])*1000.0/Stopwatch.Frequency;packet["callbackToOutputObservedMs"]=(observed-times[1])*1000.0/Stopwatch.Frequency;pendingTimes.Remove(sampleTime);}
                if(!ApplicationMode&&totalBytes>2097152)throw new InvalidOperationException("live encoded byte budget exceeded");packets.Add(packet);if(ApplicationMode&&packets.Count>32)packets.RemoveAt(0);result["outputFrames"]=outputs;
                if(emit!=null){if(!pollStats)emit(payload,packet);else{long before=Stopwatch.GetTimestamp();try{emit(payload,packet);}finally{double elapsed=(Stopwatch.GetTimestamp()-before)*1000.0/Stopwatch.Frequency;emitCalls++;emitMs+=elapsed;maxEmitMs=Math.Max(maxEmitMs,elapsed);}}}
                int second=(int)(clock.ElapsedMilliseconds/1000);if(ApplicationMode){if(second!=lastBucket){buckets.Add(0);if(buckets.Count>32)buckets.RemoveAt(0);lastBucket=second;}buckets[buckets.Count-1]++;}else{while(buckets.Count<=second)buckets.Add(0);buckets[second]++;}
              }finally{if(data.events!=IntPtr.Zero)Marshal.Release(data.events);if(data.sample!=IntPtr.Zero)Marshal.Release(data.sample);}
            }else if(type==603)drained=true;else throw new InvalidOperationException("unexpected live event "+type);
          }finally{if(mediaEvent!=IntPtr.Zero)Marshal.Release(mediaEvent);}
        }
        result["conversionCalls"]=converter.Conversions;result["outputWidth"]=outputWidth;result["outputHeight"]=outputHeight;result["gpuRectanglesConfirmed"]=converter.RectanglesConfirmed;
      }
      result["liveSource"]=true;result["repeatedCapturedFrame"]=false;result["seconds"]=seconds;result["buckets"]=buckets;
      result["outputTextureCount"]=2;result["outputViewCount"]=2;result["processorCount"]=1;result["slotUses"]=uses;
      result["slotReusesAfterNotification"]=reuses;result["inFlightLimit"]=2;result["maximumInFlight"]=maxInFlight;
      result["rawReadbackCalls"]=0;result["rawUploadCalls"]=0;result["staleSourceFramesDiscarded"]=stale;
      result["pressureStallMs"]=pressure?250:0;result["firstSelectionAgeAfterStallMs"]=ageAfterStall;
      result["drainComplete"]=drained;result["complete"]=(ApplicationMode||sent>20) && outputs==sent && drained;
      result["scope"]="Active synthetic WGC source, latest pending frame and two release-tracked conversion slots. Polling/instrumentation in test helper, encoded output retained for offline decode. No WAN, internal copy count or input-to-photon proof.";
      result["incrementalOutput"]=emit!=null;
      if(ApplicationMode){result["diagnosticHistoryLimit"]=32;result["totalEncodedBytes"]=totalBytes;}
      if(emit!=null)result["scope"]="Active synthetic WGC source and two release-tracked conversion slots; compressed bytes emitted incrementally with one private IPC packet awaiting ACK. Metadata retained for verification. No WebRTC, internal copy count or input-to-photon proof.";
      if(ApplicationMode)result["scope"]="Selected application window; same-device GPU conversion, two release-tracked inputs and one AU awaiting IPC ACK. Metadata history bounded to 32 entries; no raw readback, bitstream hashing or retained payload history. Not an internal-copy or physical-latency measurement.";
    }finally {
      result["compressedOutputCopies"]=new Dictionary<string,object>{{"managedCopyCalls",readbackCalls},{"managedBytesCopied",totalBytes},{"contiguousMergeRequests",mergedOutputs},{"singleBufferOutputs",readbackCalls-mergedOutputs},{"internalCopiesObserved",false}};
      if(eventSource!=null){eventSource.Stop();afterShutdown.Add(eventSource.FinishAfterShutdown);}
      Dictionary<string,object> waits=new Dictionary<string,object>();result["eventWait"]=waits;waits["enabled"]=eventDriven;waits["waits"]=eventWaits;waits["timeoutWakes"]=eventTimeouts;waits["waitMs"]=eventWaitMs;waits["synchronousGetEventCalls"]=synchronousEventCalls;waits["safetyWakeMaximumMs"]=100;
      if(stageTiming){Dictionary<string,object> timing=new Dictionary<string,object>();result["stageTiming"]=timing;timing["enabled"]=true;timing["maximumPendingInputs"]=maximumTimedInputs;timing["pendingAtExit"]=pendingTimes.Count;
        timing["scope"]="ProcessInput call start to observed output after compressed buffer read/hash, including harness event polling/scheduling. Callback age begins at WGC callback, not physical capture; conversion time is CPU submission, not GPU execution. Bounded two-entry timestamp map.";}
      if(pollStats){Dictionary<string,object> stats=new Dictionary<string,object>();result["polling"]=stats;stats["enabled"]=true;stats["iterations"]=iterations;stats["emptyPolls"]=emptyPolls;stats["events"]=events;
        stats["requestedSleepMs"]=eventDriven?0:1;stats["sleepTotalMs"]=sleepMs;stats["maximumSleepMs"]=maxSleepMs;stats["sleepBuckets"]=sleepBuckets;stats["sleepBucketUpperExclusiveMs"]=new object[]{2,5,10,20,40,100,250,null};
        stats["emitCalls"]=emitCalls;stats["emitTotalMs"]=emitMs;stats["maximumEmitMs"]=maxEmitMs;stats["elapsedBeforeCleanupMs"]=clock.Elapsed.TotalMilliseconds;stats["processCpuMs"]=ProcessCpuMs()-cpuStart;
        stats["scope"]="Instrumented native RunLive before cleanup; process CPU includes worker threads. Sleep and IPC emit waits are disjoint wall durations, not CPU time. Excludes parent/renderer CPU, GPU execution and physical latency.";}
      stopSource();
      if(begun){int flush=Slot<MessageFn>(transform,23)(transform,0,IntPtr.Zero),end=Slot<MessageFn>(transform,23)(transform,0x10000001,IntPtr.Zero);
        result["flushHR"]=flush.ToString("x8");result["endStreamingHR"]=end.ToString("x8");if(flush!=0 || end!=0)result["complete"]=false;}
      for(int i=0;i<2;i++)if(heldFrames[i]!=null && leases[i]==null){heldFrames[i].Dispose();heldFrames[i]=null;}
      int releasedAtStop=released;result["releasedBeforeShutdown"]=releasedAtStop;
      afterShutdown.Add(delegate {
        Stopwatch deadline=Stopwatch.StartNew();int count=releasedAtStop;
        for(int i=0;i<2;i++)if(leases[i]!=null){if(leases[i].WaitReleased(Math.Max(0,2000-(int)deadline.ElapsedMilliseconds)))count++;leases[i].Dispose();leases[i]=null;}
        for(int i=0;i<2;i++)if(heldFrames[i]!=null){heldFrames[i].Dispose();heldFrames[i]=null;}
        result["trackedSampleReleases"]=count;result["allInputSamplesReleased"]=count==sent;if(count!=sent)result["complete"]=false;
      });
      if(generator!=IntPtr.Zero)Marshal.Release(generator);
    }
  }
  internal static void RunSequence(IntPtr transform,IntPtr device,IntPtr capturedTexture,Dictionary<string,object> result,List<Action> afterShutdown) {
    const int target=12;
    List<TrackedInput> leases=new List<TrackedInput>();List<object> inputs=new List<object>(),packets=new List<object>();
    TrackedInput[] slots=new TrackedInput[2];int[] uses=new int[2];IntPtr generator=IntPtr.Zero;bool begun=false,draining=false,drained=false;
    int sent=0,outputs=0,credits=0,maxInFlight=0,reuses=0,totalBytes=0;
    result["complete"]=false;result["packets"]=packets;result["inputs"]=inputs;result["targetFrames"]=target;
    try {
      generator=Query(transform,"2cd0bd52-bcd5-4b89-b62c-eadc0c031e7d");
      OutputInfo info;Check(Slot<InfoFn>(transform,7)(transform,0,out info),"GetOutputStreamInfo");
      if((info.flags&0x300)==0)throw new InvalidOperationException("transform must provide compressed samples");
      Check(Slot<MessageFn>(transform,23)(transform,0x10000000,IntPtr.Zero),"BEGIN_STREAMING");begun=true;
      Check(Slot<MessageFn>(transform,23)(transform,0x10000003,IntPtr.Zero),"START_OF_STREAM");
      using(GpuConversionProbe.Reusable converter=new GpuConversionProbe.Reusable(device,1280,720)) {
        Stopwatch deadline=Stopwatch.StartNew();int events=0;
        while(!drained) {
          if(deadline.ElapsedMilliseconds>5000)throw new TimeoutException("bounded sequence deadline");
          if(credits>0 && sent<target && sent-outputs<2) {
            for(int i=0;i<2;i++)if(slots[i]==null || slots[i].Released) {
              bool reused=slots[i]!=null;
              if(reused){if(slots[i].ReleaseCount!=1)throw new InvalidOperationException("invalid release notification count");reuses++;}
              IntPtr nv12=converter.ConvertTexture(capturedTexture,i);
              Dictionary<string,object> input=new Dictionary<string,object>();inputs.Add(input);if(ApplicationMode&&inputs.Count>32)inputs.RemoveAt(0);
              long time=10000000+(long)sent*166666;
              TrackedInput lease=new TrackedInput(nv12,time,input);leases.Add(lease);slots[i]=lease;
              input["slot"]=i;input["timeTicks"]=time;input["reusedAfterReleaseNotification"]=reused;
              try{Check(Slot<InputFn>(transform,24)(transform,0,lease.Sample,0),"ProcessInput(sequence)");}finally{lease.ReleaseCaller();}
              uses[i]++;sent++;credits--;maxInFlight=Math.Max(maxInFlight,sent-outputs);result["inputFrames"]=sent;break;
            }
          }
          if(sent==target && !draining){
            Check(Slot<MessageFn>(transform,23)(transform,0x10000002,IntPtr.Zero),"END_OF_STREAM");Check(Slot<MessageFn>(transform,23)(transform,1,IntPtr.Zero),"DRAIN");draining=true;
          }
          IntPtr mediaEvent=IntPtr.Zero;int hr=Slot<EventFn>(generator,3)(generator,1,out mediaEvent);
          if(hr==unchecked((int)0xc00d3e80)){Thread.Sleep(1);continue;}
          try {
            Check(hr,"GetEvent(sequence)");uint type;int status;
            Check(Slot<UIntFn>(mediaEvent,33)(mediaEvent,out type),"GetType");Check(Slot<StatusFn>(mediaEvent,35)(mediaEvent,out status),"GetStatus");Check(status,"event status");
            if(++events>128)throw new InvalidOperationException("sequence event budget exceeded");
            if(type==601){if(++credits>16)throw new InvalidOperationException("input credit budget exceeded");}
            else if(type==602){
              OutputData data=new OutputData();uint outputStatus;
              try {
                Check(Slot<OutputFn>(transform,25)(transform,0,1,ref data,out outputStatus),"ProcessOutput(sequence)");
                if(data.sample==IntPtr.Zero || data.status!=0 || outputStatus!=0 || ++outputs>sent)throw new InvalidOperationException("unexpected sequence output");
                Dictionary<string,object> packet=ReadOutput(data.sample);totalBytes+=Convert.ToInt32(packet["bytes"]);
                if(totalBytes>262144)throw new InvalidOperationException("sequence output budget exceeded");packets.Add(packet);if(ApplicationMode&&packets.Count>32)packets.RemoveAt(0);result["outputFrames"]=outputs;
              }finally{if(data.events!=IntPtr.Zero)Marshal.Release(data.events);if(data.sample!=IntPtr.Zero)Marshal.Release(data.sample);}
            }else if(type==603)drained=true;else throw new InvalidOperationException("unexpected sequence event "+type);
          }finally{if(mediaEvent!=IntPtr.Zero)Marshal.Release(mediaEvent);}
        }
        result["conversionCalls"]=converter.Conversions;result["outputWidth"]=1280;result["outputHeight"]=720;result["gpuRectanglesConfirmed"]=converter.RectanglesConfirmed;
      }
      result["outputTextureCount"]=2;result["outputViewCount"]=2;result["processorCount"]=1;result["slotUses"]=uses;
      result["slotReusesAfterNotification"]=reuses;result["maximumInFlight"]=maxInFlight;result["inFlightLimit"]=2;
      result["rawReadbackCalls"]=0;result["rawUploadCalls"]=0;result["repeatedCapturedFrame"]=true;
      result["drainComplete"]=drained;result["complete"]=sent==target && outputs==target && drained;
      result["scope"]="Twelve inputs from one retained captured BGRA frame, one MFT session, two reusable NV12 textures. Not continuous WGC, throughput or latency proof.";
    }finally {
      if(begun){
        int flush=Slot<MessageFn>(transform,23)(transform,0,IntPtr.Zero),end=Slot<MessageFn>(transform,23)(transform,0x10000001,IntPtr.Zero);
        result["flushHR"]=flush.ToString("x8");result["endStreamingHR"]=end.ToString("x8");if(flush!=0 || end!=0)result["complete"]=false;
      }
      result["releasedBeforeShutdown"]=leases.FindAll(delegate(TrackedInput x){return x.Released;}).Count;
      afterShutdown.Add(delegate {
        Stopwatch deadline=Stopwatch.StartNew();
        foreach(TrackedInput lease in leases)lease.WaitReleased(Math.Max(0,2000-(int)deadline.ElapsedMilliseconds));
        int count=0;foreach(TrackedInput lease in leases){if(lease.ReleaseCount==1)count++;lease.Dispose();}
        result["trackedSampleReleases"]=count;result["allInputSamplesReleased"]=count==leases.Count;
        if(count!=leases.Count)result["complete"]=false;
      });
      if(generator!=IntPtr.Zero)Marshal.Release(generator);
    }
  }
  public static void Run(IntPtr transform,IntPtr texture,Dictionary<string,object> result,List<Action> afterShutdown) {
    IntPtr sample=IntPtr.Zero,generator=IntPtr.Zero;
    bool begun=false; int sent=0,outputs=0;
    TrackedInput trackedInput=null;
    List<object> packets=new List<object>(); List<uint> eventTypes=new List<uint>();
    result["complete"]=false; result["packets"]=packets; result["eventTypes"]=eventTypes;
    try {
      if(Marshal.SizeOf(typeof(OutputData))!=32) throw new InvalidOperationException("unexpected x64 output layout");
      trackedInput=new TrackedInput(texture,10000000,result);sample=trackedInput.Sample;
      generator=Query(transform,"2cd0bd52-bcd5-4b89-b62c-eadc0c031e7d");
      OutputInfo info; Check(Slot<InfoFn>(transform,7)(transform,0,out info),"GetOutputStreamInfo"); result["outputStreamFlags"]=info.flags;
      if((info.flags&0x300)==0) throw new InvalidOperationException("probe requires transform-provided compressed samples");
      Check(Slot<MessageFn>(transform,23)(transform,0x10000000,IntPtr.Zero),"BEGIN_STREAMING"); begun=true;
      Check(Slot<MessageFn>(transform,23)(transform,0x10000003,IntPtr.Zero),"START_OF_STREAM");
      Stopwatch deadline=Stopwatch.StartNew(); bool drained=false;
      while(!drained) {
        if(deadline.ElapsedMilliseconds>5000) throw new TimeoutException("single-frame encoder drain deadline");
        IntPtr mediaEvent=IntPtr.Zero;
        int hr=Slot<EventFn>(generator,3)(generator,1,out mediaEvent);
        if(hr==unchecked((int)0xc00d3e80)) {Thread.Sleep(1);continue;}
        try {
          Check(hr,"GetEvent"); uint type; int status;
          Check(Slot<UIntFn>(mediaEvent,33)(mediaEvent,out type),"GetEventType"); Check(Slot<StatusFn>(mediaEvent,35)(mediaEvent,out status),"GetEventStatus"); Check(status,"event status");
          if(eventTypes.Count>=128) throw new InvalidOperationException("event budget exceeded"); eventTypes.Add(type);
          if(type==601 && sent==0) {
            Check(Slot<InputFn>(transform,24)(transform,0,sample,0),"ProcessInput(DXGI)"); sent++; result["inputFrames"]=sent;
            trackedInput.ReleaseCaller();sample=IntPtr.Zero;
            Check(Slot<MessageFn>(transform,23)(transform,0x10000002,IntPtr.Zero),"END_OF_STREAM");
            Check(Slot<MessageFn>(transform,23)(transform,1,IntPtr.Zero),"DRAIN");
          } else if(type==602) {
            OutputData data=new OutputData(); uint outputStatus;
            try {
              Check(Slot<OutputFn>(transform,25)(transform,0,1,ref data,out outputStatus),"ProcessOutput");
              if(data.sample==IntPtr.Zero || data.status!=0 || outputStatus!=0) throw new InvalidOperationException("unexpected output status/sample");
              if(++outputs>1) throw new InvalidOperationException("more than one sample from one input");
              packets.Add(ReadOutput(data.sample)); result["outputFrames"]=outputs;
            } finally {if(data.events!=IntPtr.Zero) Marshal.Release(data.events); if(data.sample!=IntPtr.Zero) Marshal.Release(data.sample);}
          } else if(type==603) drained=true;
          else if(type!=601) throw new InvalidOperationException("unexpected encoder event "+type);
        } finally {if(mediaEvent!=IntPtr.Zero) Marshal.Release(mediaEvent);}
      }
      result["drainComplete"]=drained; result["complete"]=sent==1 && outputs==1 && drained;
      result["rawBufferLockCalls"]=0;
      result["scope"]="One synthetic NV12 GPU texture wrapped as DXGI input, one compressed output, drain; no WGC, decoder, continuous throughput, internal copies, WebRTC, quality or input-to-photon proof.";
    } finally {
      if(begun) {
        int flush=Slot<MessageFn>(transform,23)(transform,0,IntPtr.Zero),end=Slot<MessageFn>(transform,23)(transform,0x10000001,IntPtr.Zero);
        result["flushHR"]=flush.ToString("x8"); result["endStreamingHR"]=end.ToString("x8");
        if(flush!=0 || end!=0) result["complete"]=false;
      }
      if(trackedInput!=null){
        trackedInput.ReleaseCaller();result["inputReleasedBeforeShutdown"]=trackedInput.Released;
        TrackedInput held=trackedInput;
        afterShutdown.Add(delegate {
          bool released=held.WaitReleased(2000);
          result["trackedSampleReleases"]=held.ReleaseCount;result["inputSampleReleased"]=released;
          if(!released)result["complete"]=false;held.Dispose();
        });
      }
      if(generator!=IntPtr.Zero)Marshal.Release(generator);
    }
  }
}

[ComVisible(true),Guid("a27003cf-2354-4f2a-8d6a-ab7cff15437e"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IProbeSampleReleased {
  [PreserveSig] int GetParameters(out uint flags,out uint queue);
  [PreserveSig] int Invoke(IntPtr result);
}
[ComVisible(true),ClassInterface(ClassInterfaceType.None)]
public sealed class ProbeSampleReleased : IProbeSampleReleased,IDisposable {
  private readonly ManualResetEvent ready=new ManualResetEvent(false);private int count;
  public int Count {get{return Interlocked.CompareExchange(ref count,0,0);}}
  internal WaitHandle Ready{get{return ready;}}
  public int GetParameters(out uint flags,out uint queue){flags=0;queue=0;return unchecked((int)0x80004001);}
  public int Invoke(IntPtr result){Interlocked.Increment(ref count);try{ready.Set();}catch(ObjectDisposedException){}return 0;}
  internal bool Wait(int milliseconds){return ready.WaitOne(milliseconds);}
  public void Dispose(){ready.Dispose();}
}
