(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.WssDecoderHealth=factory();})(globalThis,function(){
  function encode(sequence,decoded,ageMs){
    if(![sequence,decoded,ageMs].every(Number.isInteger)||sequence<1||sequence>1e9||decoded<0||decoded>1e8||ageMs<0||ageMs>10000)throw RangeError('Invalid decoder health fields');
    const bytes=new Uint8Array(16),v=new DataView(bytes.buffer);v.setUint32(0,0x48535357,true);v.setUint32(4,sequence,true);v.setUint32(8,decoded,true);v.setUint32(12,ageMs,true);return bytes;
  }
  function decode(bytes){
    if(!(bytes instanceof Uint8Array)||bytes.byteLength!==16)throw Error('Invalid decoder health size');const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(v.getUint32(0,true)!==0x48535357)throw Error('Invalid decoder health magic');
    const result={sequence:v.getUint32(4,true),decoded:v.getUint32(8,true),ageMs:v.getUint32(12,true)};encode(result.sequence,result.decoded,result.ageMs);return result;
  }
  class RecoveryBudget{
    constructor(interval=600){if(![500,600].includes(interval))throw Error('invalid recovery interval');this.interval=interval;this.times=[];this.last=-Infinity;}
    allowed(now){while(this.times.length&&now-this.times[0]>=10000)this.times.shift();return now-this.last>=this.interval&&this.times.length<4;}
    mark(now){if(!this.allowed(now))throw Error('keyframe recovery budget exceeded');this.times.push(now);this.last=now;}
  }
  class Monitor{
    constructor(){this.latest=null;this.receivedAt=null;this.firstSend=null;this.lastSend=null;this.lastProgress=null;this.sent=0;this.reports=0;this.invalid=0;this.stale=0;this.requests=0;this.lastRequest=-Infinity;this.requestBudget=new RecoveryBudget();}
    noteSent(now){if(this.firstSend===null){this.firstSend=now;this.lastProgress=now;}this.lastSend=now;this.sent++;}
    receive(bytes,now){let r;try{r=decode(bytes)}catch{this.invalid++;return false}if(this.latest&&r.sequence<=this.latest.sequence){this.stale++;return false}if(this.latest&&r.decoded<this.latest.decoded){this.invalid++;return false}if(r.decoded>(this.latest?.decoded??0))this.lastProgress=now;this.latest=r;this.receivedAt=now;this.reports++;return true;}
    needsRecovery(now){return!!(this.latest&&this.sent>=10&&now-this.firstSend>=300&&now-this.lastSend<=150&&now-this.receivedAt<=250&&this.latest.ageMs>=300&&now-this.lastProgress>=200&&this.requestBudget.allowed(now));}
    markRequest(now){this.requestBudget.mark(now);this.requests++;this.lastRequest=now;}
    snapshot(){return{reports:this.reports,invalid:this.invalid,stale:this.stale,requests:this.requests,sent:this.sent,receivedAt:this.receivedAt,lastProgress:this.lastProgress,latest:this.latest?{...this.latest}:null};}
  }
  return{encode,decode,Monitor,RecoveryBudget};
});
