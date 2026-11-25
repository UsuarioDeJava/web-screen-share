using System;

// Keeps phase only while less than a whole period late. Never queues old frames.
internal sealed class FrameCadence {
  private readonly bool cap60;
  internal FrameCadence(bool cap60=false){this.cap60=cap60;}
  private double next=Double.NaN,lastSelected=Double.NaN,lastObserved=-1;
  private int activeFps;
  private void Observe(double now,int fps){
    if(Double.IsNaN(now)||Double.IsInfinity(now)||now<0||now<lastObserved||(fps!=30&&fps!=60))throw new ArgumentException("invalid frame cadence clock/rate");
    lastObserved=now;
    if(activeFps!=fps){activeFps=fps;next=Double.IsNaN(lastSelected)?Double.NaN:lastSelected+1000.0/fps;}
  }
  internal bool Ready(double now,int fps){Observe(now,fps);return fps==60&&!cap60||Double.IsNaN(next)||now>=next;}
  internal double UntilReady(double now,int fps){Observe(now,fps);return fps==60&&!cap60||Double.IsNaN(next)?0:Math.Max(0,next-now);}
  internal void Selected(double now,int fps){
    Observe(now,fps);lastSelected=now;
    if(fps==60&&!cap60){next=Double.NaN;return;}
    double period=1000.0/fps;
    next=Double.IsNaN(next)||next+period<=now?now+period:next+period;
  }
}
