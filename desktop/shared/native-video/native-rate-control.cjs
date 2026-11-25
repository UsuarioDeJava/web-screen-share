// Experimental feedback policy. No simulator state or receiver readback is an input.
class NativeRateControl {
  constructor() {
    this.target=4000000;this.lastSequence=null;this.lastChange=-Infinity;this.lastLoss=-Infinity;
    this.lastReportAt=null;this.lastFractionLost=null;this.totalChanges=0;this.good=0;
    this.pending=0;this.pendingIncrease=false;this.increaseBase=null;this.cancelledIncreases=0;this.deferred=null;
    this.deferredQueued=0;this.deferredApplied=0;this.deferredExpired=0;
    this.changes=[];this.reports=0;this.nackWindow=-Infinity;this.nacks=new Set();
  }
  record(change) {
    this.totalChanges++;this.changes.push(change);if(this.changes.length>32)this.changes.shift();
  }
  expire(now) {
    if(this.deferred&&now-this.deferred.observedAt>600){this.deferred=null;this.deferredExpired++;}
  }
  markLoss(now) {
    this.lastLoss=now;this.good=0;
    if(this.pendingIncrease){
      this.target=this.increaseBase.target;this.pending=this.increaseBase.pending;
      this.pendingIncrease=false;this.increaseBase=null;this.cancelledIncreases++;
      const index=this.changes.length-1;this.changes[index]={...this.changes[index],cancelledBeforeSend:true};
    }
  }
  applyReduction(request,now) {
    if(request.target>=this.target)return;
    this.target=request.target;this.pending=request.target;this.pendingIncrease=false;this.increaseBase=null;this.lastChange=now;
    this.record({...request.evidence,now,target:request.target,...(request.observedAt!==now?{observedAt:request.observedAt,deferredMs:now-request.observedAt}:{})});
  }
  reduce(measuredBitRate,now,evidence) {
    if(!Number.isFinite(measuredBitRate)||measuredBitRate<=0)return;
    this.expire(now);
    let request={target:Math.max(64000,Math.floor(Math.min(this.target*.7,measuredBitRate*.7))),observedAt:now,evidence};
    if(this.deferred&&this.deferred.target<request.target)request=this.deferred;
    if(request.target>=this.target){this.deferred=null;return;}
    if(now-this.lastChange<300) {
      if(!this.deferred)this.deferredQueued++;
      this.deferred=request;
      return;
    }
    if(this.deferred)this.deferredApplied++;
    this.deferred=null;this.applyReduction(request,now);
  }
  poll(now) {
    if(!Number.isFinite(now))return;
    this.expire(now);
    if(!this.deferred||now<this.deferred.observedAt||now-this.lastChange<300)return;
    const request=this.deferred;this.deferred=null;
    if(request.target<this.target){this.deferredApplied++;this.applyReduction(request,now);}
  }
  observeNack(sequences,measuredBitRate,now) {
    if(!sequences.length)return;
    if(now-this.nackWindow>=200){this.nacks.clear();this.nackWindow=now;}
    for(const seq of sequences)if(this.nacks.size<512)this.nacks.add(seq);
    this.markLoss(now);
    if(this.nacks.size<3)return;
    this.reduce(measuredBitRate,now,{source:'nack-burst',missingSequences:this.nacks.size,measuredBitRate});
  }
  observe(report,measuredBitRate,now) {
    if(this.lastSequence!==null){const delta=(report.highestSequence-this.lastSequence)>>>0;if(!delta||delta>=0x80000000)return;}
    this.lastSequence=report.highestSequence;this.reports++;this.lastReportAt=now;this.lastFractionLost=report.fractionLost;
    if(report.fractionLost>0)this.markLoss(now);
    if(report.fractionLost>=.02){this.reduce(measuredBitRate,now,{fractionLost:report.fractionLost,measuredBitRate,highestSequence:report.highestSequence});return;}
    this.poll(now);
    if(now-this.lastChange<600)return;
    if(report.fractionLost===0&&now-this.lastLoss>=2000) {
      if(++this.good>=2) {
        this.good=0;const next=Math.min(4000000,Math.ceil(this.target*1.1));
        if(next===this.target)return;
        if(!this.pendingIncrease)this.increaseBase={target:this.target,pending:this.pending};
        this.target=next;this.lastChange=now;this.pending=next;this.pendingIncrease=true;
        this.record({now,fractionLost:report.fractionLost,measuredBitRate,target:next,highestSequence:report.highestSequence});
      }
    } else this.good=0;
  }
  take(now) {this.poll(now);const value=this.pending;this.pending=0;this.pendingIncrease=false;this.increaseBase=null;return value;}
  snapshot() {
    return{target:this.target,reports:this.reports,totalChanges:this.totalChanges,lastReportAt:this.lastReportAt,lastFractionLost:this.lastFractionLost,lastLossAt:Number.isFinite(this.lastLoss)?this.lastLoss:null,
      deferred:this.deferred?{target:this.deferred.target,observedAt:this.deferred.observedAt}:null,deferredQueued:this.deferredQueued,deferredApplied:this.deferredApplied,deferredExpired:this.deferredExpired,cancelledIncreases:this.cancelledIncreases,changes:[...this.changes]};
  }
}
module.exports={NativeRateControl};
