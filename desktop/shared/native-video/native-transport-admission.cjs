// End-to-end AU admission. Receiver confirms an encoded RTP timestamp.
// This bounds unconfirmed video admission, not an unobservable binding/SO queue.
const MAGIC=0x41535357;
function encodeReceipt(sequence,rtp){if(!Number.isInteger(sequence)||sequence<1||sequence>0xffffffff||!Number.isInteger(rtp)||rtp<0||rtp>0xffffffff)throw Error('invalid video receipt');const b=Buffer.alloc(12);b.writeUInt32LE(MAGIC);b.writeUInt32LE(sequence,4);b.writeUInt32LE(rtp,8);return b;}
class NativeTransportAdmission{
  constructor({now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout,onFault=()=>{},confirmationDeadlineMs=180}={}){if(![180,300].includes(confirmationDeadlineMs))throw Error('invalid confirmation budget');this.deadlineMs=confirmationDeadlineMs;this.now=now;this.schedule=schedule;this.cancel=cancel;this.onFault=onFault;this.pending=new Map();this.bytes=0;this.timer=null;this.waiter=null;this.closed=false;this.fault=null;this.lastClock=-1;this.lastReceipt=0;this.lastRtp=null;this.counts={admitted:0,confirmed:0,superseded:0,supersededBytes:0,invalid:0,stale:0,unknown:0,maxFrames:0,maxBytes:0,maxConfirmationMs:0,rejected:0,creditWaits:0,maxCreditWaitMs:0};}
  clock(){const at=this.now();if(!Number.isFinite(at)||at<0||at<this.lastClock)throw Error('invalid admission clock');this.lastClock=at;return at;}
  checkAge(at){const first=this.pending.values().next().value;if(first&&at>=first.at+this.deadlineMs)throw Error('native video confirmation deadline');}
  assertFresh(){if(this.closed||this.fault)throw this.fault||Error('native admission closed');try{this.checkAge(this.clock());}catch(error){this.abort(error);throw error;}}
  arm(){if(this.timer!==null){this.cancel(this.timer);this.timer=null;}if(!this.pending.size||this.closed||this.fault)return;const first=this.pending.values().next().value;this.timer=this.schedule(()=>{this.timer=null;try{this.checkAge(this.clock());this.arm();}catch(error){this.abort(error);}},Math.max(1,Math.ceil(first.at+this.deadlineMs-this.lastClock)));}
  acquire(rtp,bytes,deadline){
    this.assertFresh();const at=this.lastClock;
    if(!Number.isFinite(deadline)||deadline<=at||deadline>at+120||!Number.isInteger(rtp)||rtp<0||rtp>0xffffffff||!Number.isInteger(bytes)||bytes<1||bytes>65536||this.waiter)throw Error('invalid native credit request');
    if(this.pending.size<8&&this.bytes+bytes<=65536){this.reserve(rtp,bytes);return Promise.resolve();}
    this.counts.creditWaits++;
    return new Promise((resolve,reject)=>{const timer=this.schedule(()=>this.abort(Error('native video credit deadline')),Math.max(1,Math.ceil(deadline-at)));this.waiter={rtp,bytes,at,deadline,timer,resolve,reject};});
  }
  wake(){const w=this.waiter;if(!w||this.pending.size>=8||this.bytes+w.bytes>65536)return;
    this.waiter=null;this.cancel(w.timer);try{const at=this.clock();if(at>=w.deadline)throw Error('native video credit deadline');this.reserve(w.rtp,w.bytes);this.counts.maxCreditWaitMs=Math.max(this.counts.maxCreditWaitMs,at-w.at);w.resolve();}catch(error){w.reject(error);this.abort(error);}}
  cancelWaiter(error){const w=this.waiter;this.waiter=null;if(w){this.cancel(w.timer);w.reject(error);}}
  reserve(rtp,bytes){
    if(this.closed||this.fault)throw Error('native admission closed or faulted');
    try{const at=this.clock();this.checkAge(at);if(!Number.isInteger(rtp)||rtp<0||rtp>0xffffffff||!Number.isInteger(bytes)||bytes<1||bytes>65536||this.pending.has(rtp)||this.lastRtp!==null&&(((rtp-this.lastRtp)>>>0)===0||((rtp-this.lastRtp)>>>0)>0x7fffffff))throw Error('invalid native video admission');
      if(this.pending.size>=8||this.bytes+bytes>65536)throw Error('native video admission budget');
      this.pending.set(rtp,{at,bytes});this.lastRtp=rtp;this.bytes+=bytes;this.counts.admitted++;this.counts.maxFrames=Math.max(this.counts.maxFrames,this.pending.size);this.counts.maxBytes=Math.max(this.counts.maxBytes,this.bytes);this.arm();
    }catch(error){this.counts.rejected++;this.abort(error);throw error;}
  }
  receive(bytes,{cumulative=false}={}){
    if(this.closed||this.fault)return false;
    if(!Buffer.isBuffer(bytes)||bytes.length!==12||bytes.readUInt32LE(0)!==MAGIC||bytes.readUInt32LE(4)===0){this.counts.invalid++;return false;}
    const sequence=bytes.readUInt32LE(4),rtp=bytes.readUInt32LE(8);if(sequence<=this.lastReceipt){this.counts.stale++;return false;}
    const frame=this.pending.get(rtp);if(!frame){this.counts.unknown++;return false;}
    try{const at=this.clock();this.checkAge(at);
      // V2 receiver drops older encoded timestamps before the decoder. Progress
      // retires older unconfirmed frames as superseded, never as confirmed delivery.
      if(cumulative)for(const [timestamp,older] of this.pending){if(timestamp===rtp)break;this.pending.delete(timestamp);this.bytes-=older.bytes;this.counts.superseded=(this.counts.superseded||0)+1;this.counts.supersededBytes=(this.counts.supersededBytes||0)+older.bytes;}
      this.pending.delete(rtp);this.bytes-=frame.bytes;this.lastReceipt=sequence;this.counts.confirmed++;this.counts.maxConfirmationMs=Math.max(this.counts.maxConfirmationMs,at-frame.at);this.arm();this.wake();return true;
    }catch(error){this.abort(error);return false;}
  }
  abort(error){if(this.closed||this.fault)return;this.fault=error;if(this.timer!==null){this.cancel(this.timer);this.timer=null;}this.pending.clear();this.bytes=0;this.cancelWaiter(error);try{this.onFault(error);}catch(observerError){this.observerError=observerError.message;}}
  close(){if(this.closed)return;this.closed=true;if(this.timer!==null){this.cancel(this.timer);this.timer=null;}this.pending.clear();this.bytes=0;this.cancelWaiter(Error('native admission closed'));}
  snapshot(){return{...this.counts,pendingFrames:this.pending.size,pendingBytes:this.bytes,timerPending:this.timer!==null,waitingFrames:this.waiter?1:0,waitingBytes:this.waiter?.bytes||0,closed:this.closed,faulted:!!this.fault,error:this.fault?.message??null,observerError:this.observerError??null,frameLimit:8,byteLimit:65536,confirmationDeadlineMs:this.deadlineMs,bindingQueueObservable:false};}
}
module.exports={NativeTransportAdmission,encodeReceipt};
