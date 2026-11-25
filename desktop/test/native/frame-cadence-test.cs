using System;
internal static class FrameCadenceTest {
  private static void Check(bool value,string label){if(!value)throw new Exception(label);}
  public static int Main(){
    try{
      FrameCadence cadence=new FrameCadence();int count=0;double previous=-1000,minGap=1000,maxGap=0;
      for(int now=0;now<4000;now+=16)if(cadence.Ready(now,30)){if(count>0){minGap=Math.Min(minGap,now-previous);maxGap=Math.Max(maxGap,now-previous);}cadence.Selected(now,30);previous=now;count++;}
      Check(count>=119&&count<=121,"30 FPS with 16 ms polling");Check(minGap>=32&&maxGap<=48,"bounded selection gaps");
      cadence=new FrameCadence();cadence.Selected(0,30);Check(cadence.Ready(1000,30),"late latest frame permitted");cadence.Selected(1000,30);Check(!cadence.Ready(1000,30)&&!cadence.Ready(1016,30)&&cadence.Ready(1034,30),"stall has no catchup debt");
      cadence=new FrameCadence();cadence.Selected(0,60);Check(cadence.Ready(1,60),"60 FPS path unchanged");cadence.Selected(1,60);
      cadence=new FrameCadence();cadence.Selected(0,30);cadence.Selected(10,60);Check(!cadence.Ready(20,30)&&cadence.Ready(44,30),"rate change uses last actual selection");
      cadence=new FrameCadence();Check(cadence.Ready(40,30)&&cadence.Ready(41,30),"empty source does not advance phase");cadence.Selected(41,30);Check(!cadence.Ready(60,30)&&cadence.Ready(75,30),"first selection anchors phase");
      cadence=new FrameCadence();cadence.Ready(100,30);int rejected=0;foreach(double now in new double[]{99,Double.NaN,Double.PositiveInfinity,-1})try{cadence.Ready(now,30);}catch(ArgumentException){rejected++;}try{cadence.Ready(101,0);}catch(ArgumentException){rejected++;}Check(rejected==5,"invalid clocks/rates rejected");
      cadence=new FrameCadence(true);int capped=0;for(int now=0;now<4000;now++)if(cadence.Ready(now,60)){cadence.Selected(now,60);capped++;}Check(capped==240,"event-driven capture caps 60 FPS");cadence=new FrameCadence(true);cadence.Selected(0,60);Check(cadence.UntilReady(1,60)>15&&cadence.UntilReady(1,60)<16,"cadence exposes a real deadline");cadence.Selected(1000,60);Check(!cadence.Ready(1001,60)&&cadence.Ready(1017,60),"event-driven stall never catches up");
      Console.WriteLine("{\"passed\":7,\"framesInFourSecondsAt16msPoll\":"+count+",\"eventSelectionsAt60\":"+capped+",\"minimumGapMs\":"+minGap+",\"maximumGapMs\":"+maxGap+"}");return 0;
    }catch(Exception error){Console.Error.WriteLine(error);return 1;}
  }
}
