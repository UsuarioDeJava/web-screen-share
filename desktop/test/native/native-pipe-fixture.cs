using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;

// Access units sintéticas para exercitar limites/framing; não são vídeo H.264.
internal static class NativePipeFixture {
  private static int Main(){
    NativeFramePipe pipe=new NativeFramePipe();Dictionary<string,object> report=new Dictionary<string,object>();int code=0;
    try {
      int[] sizes=new int[]{1,262144,4096};
      for(int i=0;i<sizes.Length;i++){
        byte[] payload=new byte[sizes[i]];for(int j=0;j<payload.Length;j++)payload[j]=(byte)(j+i);
        Dictionary<string,object> packet=new Dictionary<string,object>();packet["sampleTimeTicks"]=10000000+(long)i*166666;packet["sampleDurationTicks"]=166666L;
        pipe.Send(payload,packet);
      }
    }catch(Exception error){report["error"]=error.Message;code=1;
      try{Dictionary<string,object> extra=new Dictionary<string,object>();extra["sampleTimeTicks"]=20000000L;extra["sampleDurationTicks"]=166666L;pipe.Send(new byte[]{9},extra);report["rejectedAfterFault"]=false;}
      catch(InvalidOperationException later){report["rejectedAfterFault"]=later.Message=="native pipe already faulted";}
    }
    report["pipe"]=pipe.Snapshot();Console.Error.WriteLine(new JavaScriptSerializer().Serialize(report));return code;
  }
}
