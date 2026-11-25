using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using System.Diagnostics;
using System.Threading;

// IPC privado do worker: um access unit por vez, ACK por sequência.
// Nunca descarta P-frames silenciosamente; consumidor parado encerra a sessão.
internal sealed class NativeFramePipe {
  private readonly Stream output=Console.OpenStandardOutput(),input=Console.OpenStandardInput();
  internal bool Continuous;private readonly Queue<long> keyTimes=new Queue<long>();
  private uint sequence;private bool faulted;private int acknowledged;private Task pending;
  private readonly bool scatterWrite=Environment.GetEnvironmentVariable("WSS_TEST_NATIVE_SCATTER_WRITE")=="1";
  private long framingArrayBytes,payloadBytesCopied;private int framingPackets,writeCalls;
  private readonly bool feedback;private readonly Func<Dictionary<string,object>> requestKeyFrame;
  private readonly Func<uint,Dictionary<string,object>> changeBitRate;private readonly List<object> rateChanges=new List<object>();private long lastRateChange=-1000;
  private readonly int rateChangeBudget;private readonly int segment;private readonly Action requestDrain;private bool drainRequested;private uint drainAfterSequence;
  private readonly bool prepareNext;private uint? nextStageBitRate;
  internal uint NextStageBitRate{get{if(!nextStageBitRate.HasValue)throw new InvalidOperationException("next encoder rate was not prepared");return nextStageBitRate.Value;}}
  private readonly List<object> requests=new List<object>();private readonly Stopwatch clock=Stopwatch.StartNew();private long lastRequest=-1000;
  internal NativeFramePipe(bool feedbackEnabled=false,Func<Dictionary<string,object>> requester=null,Func<uint,Dictionary<string,object>> rateChanger=null,Action drainer=null,int segmentId=-1,int maximumRateChanges=8,bool prepareNextEncoder=false){if(maximumRateChanges!=8&&maximumRateChanges!=48)throw new ArgumentException("invalid rate budget");rateChangeBudget=maximumRateChanges;if(segmentId< -1||segmentId>15||segmentId>=0&&drainer==null||prepareNextEncoder&&segmentId<0)throw new ArgumentException("invalid native segment");prepareNext=prepareNextEncoder;segment=segmentId;feedback=feedbackEnabled;requestKeyFrame=requester;changeBitRate=rateChanger;requestDrain=drainer;if(rateChanger!=null&&!feedbackEnabled||drainer!=null&&rateChanger==null)throw new ArgumentException("invalid native feedback configuration");}
  internal void Send(byte[] payload,Dictionary<string,object> packet){
    if(faulted)throw new InvalidOperationException("native pipe already faulted");
    if(!BitConverter.IsLittleEndian || payload.Length<1 || payload.Length>262144)throw new InvalidOperationException("invalid native frame payload");
    // Stream de bytes com um único produtor/ACK: o parser já admite fragmentação.
    // A closure mantém payload vivo inclusive se a escrita ficar bloqueada após timeout.
    byte[] frame=new byte[scatterWrite?32:32+payload.Length];
    frame[0]=87;frame[1]=83;frame[2]=83;frame[3]=86;frame[4]=prepareNext?(byte)6:segment>=0?(byte)5:requestDrain!=null?(byte)4:changeBitRate!=null?(byte)3:feedback?(byte)2:(byte)1;
    if(segment>=0)frame[6]=(byte)segment;
    Buffer.BlockCopy(BitConverter.GetBytes((uint)payload.Length),0,frame,8,4);Buffer.BlockCopy(BitConverter.GetBytes(sequence),0,frame,12,4);
    Buffer.BlockCopy(BitConverter.GetBytes(Convert.ToInt64(packet["sampleTimeTicks"])),0,frame,16,8);
    Buffer.BlockCopy(BitConverter.GetBytes(Convert.ToInt64(packet["sampleDurationTicks"])),0,frame,24,8);
    if(!scatterWrite){Buffer.BlockCopy(payload,0,frame,32,payload.Length);payloadBytesCopied+=payload.Length;}
    framingArrayBytes+=frame.Length;framingPackets++;
    uint expected=sequence;
    uint flags=0,bitRate=0;
    try {
      pending=Task.Factory.StartNew(delegate{
        Interlocked.Increment(ref writeCalls);output.Write(frame,0,frame.Length);
        if(scatterWrite){Interlocked.Increment(ref writeCalls);output.Write(payload,0,payload.Length);}
        output.Flush();byte[] ack=new byte[changeBitRate!=null?12:feedback?8:4];int at=0;
        while(at<ack.Length){int read=input.Read(ack,at,ack.Length-at);if(read==0)throw new EndOfStreamException("native frame ACK pipe ended");at+=read;}
        if(BitConverter.ToUInt32(ack,0)!=expected)throw new InvalidDataException("native frame ACK sequence differs");
        if(feedback){flags=BitConverter.ToUInt32(ack,4);uint allowed=requestDrain!=null?7u:changeBitRate!=null?3u:1u;if((flags&~allowed)!=0)throw new InvalidDataException("unsupported native feedback flags");}
        if(changeBitRate!=null){bitRate=BitConverter.ToUInt32(ack,8);bool needsRate=(flags&2u)!=0||prepareNext&&(flags&4u)!=0;if(needsRate?bitRate<64000||bitRate>4000000:bitRate!=0)throw new InvalidDataException("invalid native feedback bitrate");if(prepareNext&&(flags&6u)==6u)throw new InvalidDataException("ambiguous native drain rate");}
      });
      if(!pending.Wait(sequence==0?1000:250))throw new TimeoutException("native frame pipe ACK deadline");
      if((flags&2u)!=0){
        if(!Continuous&&rateChanges.Count>=rateChangeBudget || clock.ElapsedMilliseconds-lastRateChange<250)throw new InvalidOperationException("bitrate feedback budget exceeded");
        Dictionary<string,object> rate=changeBitRate(bitRate);rate["afterSequence"]=sequence;rateChanges.Add(rate);if(Continuous&&rateChanges.Count>32)rateChanges.RemoveAt(0);lastRateChange=clock.ElapsedMilliseconds;
      }
      if((flags&1u)!=0){
        while(keyTimes.Count>0&&clock.ElapsedMilliseconds-keyTimes.Peek()>=10000)keyTimes.Dequeue();
        if(requestKeyFrame==null || (Continuous?keyTimes.Count>=4:requests.Count>=4) || clock.ElapsedMilliseconds-lastRequest<500)throw new InvalidOperationException("keyframe feedback budget exceeded");
        Dictionary<string,object> result=requestKeyFrame();result["afterSequence"]=sequence;requests.Add(result);keyTimes.Enqueue(clock.ElapsedMilliseconds);if(Continuous&&requests.Count>32)requests.RemoveAt(0);lastRequest=clock.ElapsedMilliseconds;
      }
      if((flags&4u)!=0){if(drainRequested)throw new InvalidOperationException("duplicate native drain request");if(prepareNext)nextStageBitRate=bitRate;requestDrain();drainRequested=true;drainAfterSequence=sequence;}
      acknowledged++;sequence++;
    }catch(AggregateException error){faulted=true;Exception cause=error.Flatten().InnerException;throw new IOException("native frame pipe: "+cause.Message,cause);}
    catch{faulted=true;throw;}
  }
  internal Dictionary<string,object> Snapshot(){
    Dictionary<string,object> r=new Dictionary<string,object>();r["version"]=prepareNext?6:segment>=0?5:requestDrain!=null?4:changeBitRate!=null?3:feedback?2:1;r["acknowledgedFrames"]=acknowledged;r["faulted"]=faulted;r["keyframeRequests"]=requests;r["rateChanges"]=rateChanges;r["drainRequested"]=drainRequested;if(segment>=0)r["segment"]=segment;if(drainRequested)r["drainAfterSequence"]=drainAfterSequence;if(nextStageBitRate.HasValue)r["nextStageBitRate"]=nextStageBitRate.Value;
    r["rateChangeBudget"]=rateChangeBudget;r["maximumOutstandingPackets"]=1;r["ackDeadlineMs"]=250;r["firstAckDeadlineMs"]=1000;
    r["continuous"]=Continuous;r["historyLimit"]=Continuous?32:rateChangeBudget;r["keyframeRequestsPerTenSeconds"]=4;
    r["writePendingAtExit"]=pending!=null&&!pending.IsCompleted;
    r["scatterWrite"]=scatterWrite;r["framingPackets"]=framingPackets;r["framingArrayBytes"]=framingArrayBytes;r["framingPayloadBytesCopied"]=payloadBytesCopied;r["streamWriteCalls"]=Interlocked.CompareExchange(ref writeCalls,0,0);
    r["copyScope"]="Only the extra native IPC framing array/payload BlockCopy; excludes encoded sample readback, hashing, header helper arrays, CLR/OS pipe and renderer/decoder copies.";return r;
  }
}
