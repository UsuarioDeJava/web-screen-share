using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading;
using System.Web.Script.Serialization;

internal static class NativeVideoWorker {
  [MTAThread] private static int Main(string[] args){
    try{
      if(!(args.Length==3&&args[0]=="--describe")&&!(args.Length==5&&args[0]=="--run"))throw new ArgumentException("invalid native worker invocation");
      long hwnd;uint parent;if(!long.TryParse(args[1],out hwnd)||hwnd<=0||!uint.TryParse(args[2],out parent))throw new ArgumentException("invalid window identity");
      bool describe=args[0]=="--describe";if(!describe&&args[0]!="--run")throw new ArgumentException("invalid native worker mode");
      uint owner=describe?0:uint.Parse(args[3]);long start=describe?0:long.Parse(args[4]);
      Dictionary<string,object> source=NativeCapturePolicy.Initialize(new IntPtr(hwnd),parent,owner,start);JavaScriptSerializer json=new JavaScriptSerializer();json.MaxJsonLength=1048576;
      if(describe){Console.WriteLine(json.Serialize(source));return 0;}
      Environment.SetEnvironmentVariable("WSS_TEST_NATIVE_EVENTS","1");Environment.SetEnvironmentVariable("WSS_TEST_NATIVE_SCATTER_WRITE","1");Environment.SetEnvironmentVariable("WSS_TEST_NATIVE_EVENT_STOP_PENDING","0");
      Environment.SetEnvironmentVariable("WSS_TEST_NATIVE_POLL_STATS","0");Environment.SetEnvironmentVariable("WSS_TEST_NATIVE_STAGE_TIMING","0");
      ulong luid=ulong.Parse((string)((Dictionary<string,object>)source["adapter"])["luid"],NumberStyles.AllowHexSpecifier);bool drain=false;int fps=60;NativeFramePipe pipe=null;
      string stopName=Environment.GetEnvironmentVariable("WSS_NATIVE_STOP_EVENT");if(String.IsNullOrEmpty(stopName)||!stopName.StartsWith("Local\\WSS-Native-Stop-"))throw new InvalidOperationException("native stop event missing");
      using(EventWaitHandle stop=EventWaitHandle.OpenExisting(stopName)){
      Dictionary<string,object> report=MftEncoderProbe.Execute(luid,"external-sequence",delegate(D3D11ProbeDevice device,IntPtr transform,Dictionary<string,object> entry,List<Action> afterShutdown){
        pipe=new NativeFramePipe(true,delegate{return CodecProbeControls.RequestKeyFrame(transform);},delegate(uint rate){fps=rate<500000?30:60;return CodecProbeControls.SetBitRate(transform,rate);},delegate{drain=true;});pipe.Continuous=true;
        WgcLiveCapture.Run(device,transform,new IntPtr(hwnd),owner,"",entry,afterShutdown,28800,false,pipe.Send,delegate{return fps;},1280,720,delegate{return drain||stop.WaitOne(0);},false,stop);
      });
      report["scope"]="Experimental application window capture selected by the trusted main process; native GPU conversion and H264 encoder. Transport admission/pacing/recovery counters are reported separately by the host; no WAN or physical-latency claim.";
      report["pipe"]=pipe==null?null:pipe.Snapshot();Console.Error.WriteLine(json.Serialize(report));return Object.Equals(report["allChecksPassed"],true)?0:1;
      }
    }catch(Exception error){Console.Error.WriteLine(new JavaScriptSerializer().Serialize(new{error=error.Message}));return 1;}
  }
}
