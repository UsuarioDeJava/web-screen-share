const assert=require('node:assert/strict');
// Experimental pacing before the native binding. Not a transport queue bound.
class RtpPacer {
  constructor({send,rate,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onError=()=>{},keyframeBurst=false}) {
    this.send=send;this.rate=rate;this.now=now;this.schedule=schedule;this.cancel=cancel;this.onError=onError;
    assert.equal(typeof keyframeBurst,'boolean');this.keyframeBurst=keyframeBurst;
    this.frame=null;this.repairs=new Map();this.timer=null;this.nextAt=0;this.closed=false;this.fault=null;this.admissionFailure=null;this.lastKind=null;this.lastPacketBytes=0;
    this.counts={frames:0,originalPackets:0,originalBytes:0,repairPackets:0,repairBytes:0,repairUnavailable:0,repairOverflow:0,repairRetired:0,repairTooSlow:0,maxFramePackets:0,maxFrameBytes:0,maxRepairQueue:0,maxFrameWaitMs:0,lastRate:0};
  }
  checkedRate(){const value=this.rate();assert.ok(Number.isInteger(value)&&value>=64000&&value<=10000000,'invalid pacing rate');this.counts.lastRate=value;return value;}
  sendFrame(packets,{keyframe=false,beforeFirst=()=>{},deadline=null}={}) {
    assert.ok(!this.closed&&!this.fault,'pacer closed or faulted');assert.equal(this.frame,null,'pacer already has a frame');
    try{
      assert.ok(Array.isArray(packets)&&packets.length>0&&packets.length<=128,'pacer packet budget');
      let bytes=0;for(const p of packets){assert.ok(Buffer.isBuffer(p)&&p.length>=12&&p.length<=1112,'invalid paced RTP packet');bytes+=p.length;}
      assert.ok(bytes<=65536,'pacer byte budget');
      const baseRate=this.checkedRate(),rate=keyframe&&this.keyframeBurst?Math.max(baseRate,1000000):baseRate;
      const at=this.now(),cost=packets.slice(0,-1).reduce((sum,p)=>sum+p.length+52,0)*8000/rate;
      deadline=deadline===null?at+180:deadline;
      assert.ok(Number.isFinite(deadline)&&deadline>at&&deadline<=at+180,'invalid shared frame deadline');
      if(Math.max(at,this.nextAt)+cost>at+180)this.admissionFailure={rate,packets:packets.length,bytes,alreadyReservedMs:Math.max(0,this.nextAt-at),frameSendMs:cost,lastKind:this.lastKind,lastPacketBytes:this.lastPacketBytes};
      assert.ok(Math.max(at,this.nextAt)+cost<=deadline,'pacer frame deadline budget');
      this.counts.maxFramePackets=Math.max(this.counts.maxFramePackets,packets.length);this.counts.maxFrameBytes=Math.max(this.counts.maxFrameBytes,bytes);
      this.counts.lastFrameRate=rate;if(rate>baseRate)this.counts.keyframeBurstFrames=(this.counts.keyframeBurstFrames||0)+1;
      // Packet buffers are exclusively owned by the sender until this promise settles.
      return new Promise((resolve,reject)=>{this.frame={packets:packets.slice(),index:0,at,deadline,rate,bytes,beforeFirst,begun:false,repairUsed:keyframe,resolve,reject};this.kick();});
    }catch(error){this.abort(error);throw error;}
  }
  offerRepair(sequence,provider,estimate=()=>1112) {
    if(this.closed||this.fault||this.repairs.has(sequence))return false;
    assert.ok(Number.isInteger(sequence)&&sequence>=0&&sequence<=65535&&typeof provider==='function'&&typeof estimate==='function');
    if(this.repairs.size>=8){this.counts.repairOverflow++;return false;}
    this.repairs.set(sequence,{provider,estimate});this.counts.maxRepairQueue=Math.max(this.counts.maxRepairQueue,this.repairs.size);this.kick();return true;
  }
  clearRepairs(){this.counts.repairRetired+=this.repairs.size;this.repairs.clear();}
  kick(){if(this.timer===null&&!this.closed&&!this.fault)this.pump();}
  pump() {
    try{
      if(this.closed||this.fault)return;
      const now=this.now(),frame=this.frame;if(!frame&&!this.repairs.size)return;
      if(frame&&now>frame.deadline)throw Error('pacer frame deadline elapsed');
      if(frame&&this.nextAt>frame.deadline)throw Error('pacer frame deadline budget');
      if(this.nextAt>now){this.timer=this.schedule(()=>{this.timer=null;this.pump();},Math.ceil(this.nextAt-now));return;}
      const rate=frame?frame.rate:this.checkedRate();let packet=null,kind='original';
      const allowRepair=!frame||!frame.repairUsed;
      if(allowRepair)while(this.repairs.size){
        const [sequence,job]=this.repairs.entries().next().value,size=job.estimate(now);assert.ok(Number.isInteger(size)&&size>=0&&size<=1112,'invalid repair size estimate');
        if(size&&(size+52)*8000/rate>50){this.repairs.delete(sequence);this.counts.repairTooSlow++;continue;}
        if(frame){const remaining=frame.packets.slice(frame.index,-1).reduce((sum,p)=>sum+p.length+52,0);if(now+(remaining+size+52)*8000/rate>frame.deadline)break;}
        this.repairs.delete(sequence);packet=job.provider(now);
        if(packet){assert.ok(packet.length<=size,'repair exceeded size estimate');kind='repair';if(frame)frame.repairUsed=true;break;}this.counts.repairUnavailable++;
      }
      if(!packet&&frame){
        if(!frame.begun){frame.begun=true;frame.beforeFirst();}
        packet=frame.packets[frame.index];
      }
      if(!packet)return;
      assert.ok(Buffer.isBuffer(packet)&&packet.length>=12&&packet.length<=1112,'invalid paced RTP packet');
      this.send(packet,kind,now);const completedAt=this.now();this.lastKind=kind;this.lastPacketBytes=packet.length;this.nextAt=completedAt+(packet.length+52)*8000/rate;
      if(kind==='repair'){this.counts.repairPackets++;this.counts.repairBytes+=packet.length;}
      else{
        this.counts.originalPackets++;this.counts.originalBytes+=packet.length;frame.index++;
        if(completedAt>frame.deadline)throw Error('pacer send exceeded frame deadline');
        if(frame.index===frame.packets.length){this.frame=null;this.counts.frames++;this.counts.maxFrameWaitMs=Math.max(this.counts.maxFrameWaitMs,completedAt-frame.at);frame.resolve();}
      }
      if(frame&&kind==='repair'&&completedAt>frame.deadline)throw Error('pacer send exceeded frame deadline');
      this.kick();
    }catch(error){this.abort(error);}
  }
  abort(error) {
    if(this.fault||this.closed)return;this.fault=error;
    if(this.timer!==null){this.cancel(this.timer);this.timer=null;}
    const frame=this.frame;this.frame=null;this.repairs.clear();if(frame){this.counts.maxFrameWaitMs=Math.max(this.counts.maxFrameWaitMs,this.now()-frame.at);frame.reject(error);}this.onError(error);
  }
  close(){if(this.closed)return;this.closed=true;if(this.timer!==null){this.cancel(this.timer);this.timer=null;}const frame=this.frame;this.frame=null;this.repairs.clear();if(frame)frame.reject(Error('pacer closed'));}
  snapshot(){const frame=this.frame;return{...this.counts,closed:this.closed,faulted:!!this.fault,error:this.fault?.message??null,admissionFailure:this.admissionFailure?{...this.admissionFailure}:null,timerPending:this.timer!==null,pendingFrames:frame?1:0,pendingPackets:frame?frame.packets.length-frame.index:0,pendingBytes:frame?frame.packets.slice(frame.index).reduce((sum,p)=>sum+p.length,0):0,pendingRepairs:this.repairs.size,frameDeadlineMs:180,packetBudget:128,byteBudget:65536,repairQueueBudget:8,repairReservationMs:50,keyframeBurstFloor:this.keyframeBurst?1000000:null,wireOverheadEstimate:52};}
}
module.exports={RtpPacer};
