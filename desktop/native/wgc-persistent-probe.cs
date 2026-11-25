using System;
using System.Collections.Generic;
using System.Diagnostics;

internal static class WgcPersistentProbe {
  internal static Dictionary<string,object> Execute(ulong luid,IntPtr hwnd,uint pid,string title,bool roundTrip=false,bool recovery=false,bool cycles=false,bool longGop=false){
    Dictionary<string,object> report=new Dictionary<string,object>();List<object> segments=new List<object>();report["segments"]=segments;report["allChecksPassed"]=false;
    report["captureSessionCount"]=0;report["deviceCount"]=0;report["scope"]="One persistent synthetic WGC source/device, sequential MFT encoders and segmented binary IPC. No app integration, WAN or physical latency proof.";
    try{return MftEncoderProbe.WithDevice(luid,delegate(D3D11ProbeDevice device){
      report["deviceCount"]=1;WgcLiveCapture source=null;bool complete=true;
      try{
        source=new WgcLiveCapture(device.Device,hwnd,pid,title);report["captureSessionCount"]=1;
        int stages=cycles?5:roundTrip?3:2;uint nextRate=4000000;report["cycles"]=cycles;report["roundTrip"]=roundTrip;report["recovery"]=recovery;report["gopPictures"]=longGop?120:0;
        for(int index=0;index<stages;index++){
          int stage=index,captureFps=60,seconds=recovery&&index%2==1?75:4;bool requestedDrain=false,finalStage=stage==stages-1;uint width=stage%2==0?(uint)1280:640,height=stage%2==0?(uint)720:360;NativeFramePipe pipe=null;
          Dictionary<string,object> segment=new Dictionary<string,object>();segments.Add(segment);segment["width"]=width;segment["height"]=height;
          long started=Stopwatch.GetTimestamp();
          Dictionary<string,object> native=MftEncoderProbe.Execute(luid,"external-sequence",delegate(D3D11ProbeDevice active,IntPtr transform,Dictionary<string,object> entry,List<Action> afterShutdown){
            if(!Object.ReferenceEquals(active,device))throw new InvalidOperationException("persistent device was replaced");

            if(cycles){Dictionary<string,object> initial=CodecProbeControls.SetBitRate(transform,nextRate);captureFps=nextRate<500000?30:60;initial["captureFps"]=captureFps;entry["initialRateControl"]=initial;}
            pipe=new NativeFramePipe(true,delegate{return CodecProbeControls.RequestKeyFrame(transform);},delegate(uint rate){Dictionary<string,object> result=CodecProbeControls.SetBitRate(transform,rate);captureFps=rate<500000?30:60;result["captureFps"]=captureFps;return result;},delegate{requestedDrain=true;},stage,recovery?48:8,cycles);
            Dictionary<string,object> encoding=new Dictionary<string,object>();entry["encoding"]=encoding;
            MftTextureEncodeProbe.RunLive(transform,device.Device,source.TakeLatest,source.CheckSource,finalStage?source.Stop:(Action)delegate{},seconds,false,encoding,afterShutdown,pipe.Send,delegate{return captureFps;},width,height,delegate{return requestedDrain;},true,source.Ready);
          },width,height,device,longGop);
          segment["native"]=native;if(pipe!=null)segment["pipe"]=pipe.Snapshot();segment["encoderStageMs"]=(Stopwatch.GetTimestamp()-started)*1000.0/Stopwatch.Frequency;
          segment["captureAfterStage"]=source.Snapshot(device.AdapterLuid);
          if(!Object.Equals(native["allChecksPassed"],true))throw new InvalidOperationException("persistent encoder stage failed");
          if(!finalStage&&!requestedDrain)throw new InvalidOperationException("persistent stage ended without switch request");
          if(cycles&&!finalStage)nextRate=pipe.NextStageBitRate;
        }
      }catch(Exception error){complete=false;report["error"]=error.GetType().Name+": "+error.Message;}
      finally{
        if(source!=null){source.Stop();source.Dispose();Dictionary<string,object> capture=source.Snapshot(device.AdapterLuid);report["capture"]=capture;if(!Object.Equals(capture["complete"],true))complete=false;}
      }
      report["allChecksPassed"]=complete&&segments.Count==(cycles?5:roundTrip?3:2);return report;
    });}catch(Exception error){report["error"]=error.GetType().Name+": "+error.Message;return report;}
  }
}
