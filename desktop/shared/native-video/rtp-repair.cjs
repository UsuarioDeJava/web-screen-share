const assert=require('node:assert/strict'),{units}=require('./h264-slices');
// RFC 6184 single-NAL/FU-A/STAP-A packetizer. Never aggregates across frames.
class H264Packetizer{
  constructor(ssrc,sequence=0,{aggregate=false}={}){assert.ok(Number.isInteger(ssrc)&&ssrc>0&&ssrc<=0xffffffff);assert.ok(Number.isInteger(sequence)&&sequence>=0&&sequence<=65535);assert.equal(typeof aggregate,'boolean');this.ssrc=ssrc;this.sequence=sequence;this.aggregate=aggregate;this.counts={frames:0,nals:0,packets:0,aggregationPackets:0,aggregationNals:0,rtpBytes:0,unaggregatedPackets:0,unaggregatedRtpBytes:0};}
  pack(bytes,timestamp){
    assert.ok(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=262144);assert.ok(Number.isInteger(timestamp)&&timestamp>=0&&timestamp<=0xffffffff);
    const{nals}=units(bytes);for(const nal of nals)assert.ok(nal.length>0&&!(nal[0]&128)&&(nal[0]&31)>0&&(nal[0]&31)<24);
    this.lastIsKey=nals.some(n=>(n[0]&31)===5);
    const payloads=[];let group=[],groupBytes=1,aggregationPackets=0,aggregationNals=0;
    const flush=()=>{
      if(!group.length)return;
      if(group.length===1)payloads.push(group[0]);
      else if(group.length>1){const p=Buffer.alloc(groupBytes);p[0]=24|group.reduce((nri,n)=>Math.max(nri,n[0]&0x60),0);let at=1;for(const nal of group){p.writeUInt16BE(nal.length,at);nal.copy(p,at+2);at+=2+nal.length;}payloads.push(p);aggregationPackets++;aggregationNals+=group.length;}
      group=[];groupBytes=1;
    };
    for(const nal of nals){
      if(this.aggregate&&nal.length<=1097){if(groupBytes+2+nal.length>1100)flush();group.push(nal);groupBytes+=2+nal.length;}
      else{flush();if(nal.length<=1100)payloads.push(nal);
        else for(let at=1;at<nal.length;at+=1098){const end=Math.min(at+1098,nal.length),p=Buffer.alloc(2+end-at);p[0]=(nal[0]&0xe0)|28;p[1]=(nal[0]&31)|(at===1?128:0)|(end===nal.length?64:0);nal.copy(p,2,at,end);payloads.push(p);}}
    }
    flush();
    assert.ok(payloads.length>0&&payloads.length<=512);
    this.counts.frames++;this.counts.nals+=nals.length;this.counts.packets+=payloads.length;this.counts.aggregationPackets+=aggregationPackets;this.counts.aggregationNals+=aggregationNals;this.counts.rtpBytes+=payloads.reduce((sum,p)=>sum+12+p.length,0);
    for(const nal of nals){const count=nal.length<=1100?1:Math.ceil((nal.length-1)/1098);this.counts.unaggregatedPackets+=count;this.counts.unaggregatedRtpBytes+=count*12+(count===1?nal.length:nal.length-1+count*2);}
    return payloads.map((p,i)=>{const b=Buffer.alloc(12+p.length);b[0]=128;b[1]=96|(i===payloads.length-1?128:0);b.writeUInt16BE(this.sequence,2);this.sequence=(this.sequence+1)&65535;b.writeUInt32BE(timestamp,4);b.writeUInt32BE(this.ssrc,8);p.copy(b,12);return b;});
  }
  snapshot(){return{aggregate:this.aggregate,...this.counts,savedPackets:this.counts.unaggregatedPackets-this.counts.packets,savedRtpBytes:this.counts.unaggregatedRtpBytes-this.counts.rtpBytes,maximumRtpPacketBytes:1112};}
}
// Validate an entire compound RTCP before exposing its Generic NACK requests.
function nackSequences(bytes,ssrc){
  if(!Buffer.isBuffer(bytes)||bytes.length<4||bytes.length>65536)return null;
  let at=0;const requested=new Set();
  while(at<bytes.length){
    if(at+4>bytes.length||(bytes[at]>>>6)!==2)return null;
    const size=(bytes.readUInt16BE(at+2)+1)*4,end=at+size;if(end>bytes.length)return null;
    let body=size;if(bytes[at]&32){const pad=bytes[end-1];if(end!==bytes.length||!pad||pad>size-4)return null;body-=pad;}
    if(bytes[at+1]===205&&(bytes[at]&31)===1){
      if(body<16||(body-12)%4)return null;
      if(bytes.readUInt32BE(at+8)===ssrc)for(let p=at+12;p<at+body;p+=4){const seq=bytes.readUInt16BE(p),mask=bytes.readUInt16BE(p+2);requested.add(seq);for(let i=0;i<16;i++)if(mask&(1<<i))requested.add((seq+i+1)&65535);if(requested.size>512)return null;}
    }
    at=end;
  }
  return[...requested];
}
class RtpRepairCache{
  constructor({adaptiveDeadline=false}={}){this.adaptiveDeadline=adaptiveDeadline;this.deadlineMs=100;this.maxDeadlineMs=100;this.packets=new Map();this.sentTimes=new Map();this.bytes=0;this.tokens=0;this.newest=null;this.keyBoundary=null;this.sent=0;this.counts={retransmitted:0,expired:0,evicted:0,keyframeRetired:0,unavailable:0,budgetRejected:0,repeatRejected:0,maxPackets:0,maxBytes:0,retransmittedBytes:0,originalBytes:0,maximumRetransmissionAgeMs:0,maximumNackAgeMs:0,knownNackQueries:0,nackAgeBuckets:[0,0,0,0]};}
  setDeadline(value){assert.ok(this.adaptiveDeadline&&Number.isInteger(value)&&value>=100&&value<=250);this.deadlineMs=value;this.maxDeadlineMs=Math.max(this.maxDeadlineMs,value);}
  beginKeyframe(sequence){this.counts.keyframeRetired+=this.packets.size;this.packets.clear();this.bytes=0;this.keyBoundary=sequence;}
  prune(now){for(const[seq,p]of this.packets){if(now-p.at<=this.deadlineMs)break;this.packets.delete(seq);this.bytes-=p.bytes.length;this.counts.expired++;}}
  put(bytes,now){this.prune(now);const seq=bytes.readUInt16BE(2);assert.ok(!this.packets.has(seq));const copy=Buffer.from(bytes);this.sentTimes.delete(seq);this.sentTimes.set(seq,now);if(this.sentTimes.size>512)this.sentTimes.delete(this.sentTimes.keys().next().value);this.packets.set(seq,{bytes:copy,at:now,retries:0,lastRetry:-Infinity});this.bytes+=copy.length;this.newest=seq;this.sent++;this.tokens=Math.min(8192,this.tokens+copy.length*.15);this.counts.originalBytes+=copy.length;
    while(this.packets.size>128||this.bytes>65536){const[old,p]=this.packets.entries().next().value;this.packets.delete(old);this.bytes-=p.bytes.length;this.counts.evicted++;}
    this.counts.maxPackets=Math.max(this.counts.maxPackets,this.packets.size);this.counts.maxBytes=Math.max(this.counts.maxBytes,this.bytes);
  }
  take(seq,now){const birth=this.sentTimes.get(seq);if(birth!==undefined&&this.wasRecentlySent(seq)){const age=now-birth;this.counts.maximumNackAgeMs=Math.max(this.counts.maximumNackAgeMs,age);this.counts.knownNackQueries++;this.counts.nackAgeBuckets[age<=100?0:age<=250?1:age<=500?2:3]++;}this.prune(now);const p=this.packets.get(seq);if(!p){this.counts.unavailable++;return null;}if(p.retries>=2||now-p.lastRetry<30){this.counts.repeatRejected++;return null;}if(p.bytes.length>this.tokens){this.counts.budgetRejected++;return null;}this.tokens-=p.bytes.length;p.retries++;p.lastRetry=now;this.counts.retransmitted++;this.counts.retransmittedBytes+=p.bytes.length;this.counts.maximumRetransmissionAgeMs=Math.max(this.counts.maximumRetransmissionAgeMs,now-p.at);return p.bytes;}
  peekSize(seq,now){const p=this.packets.get(seq);return p&&now>=p.at&&now-p.at<=this.deadlineMs&&p.retries<2&&now-p.lastRetry>=30&&p.bytes.length<=this.tokens?p.bytes.length:0;}
  wasRecentlySent(seq){if(this.newest===null)return false;const distance=(this.newest-seq)&65535,keyDistance=this.keyBoundary===null?65535:((this.newest-this.keyBoundary)&65535)+1;return distance<Math.min(this.sent,512,keyDistance);}
  snapshot(now){this.prune(now);return{...this.counts,nackAgeBuckets:[...this.counts.nackAgeBuckets],packets:this.packets.size,bytes:this.bytes,timestampEntries:this.sentTimes.size,maximumAgeMs:this.deadlineMs,maximumDeadlineMs:this.maxDeadlineMs,maximumAllowedAgeMs:this.adaptiveDeadline?250:100,byteBudget:65536,packetBudget:128,repairFraction:.15};}
  close(){this.packets.clear();this.sentTimes.clear();this.bytes=0;this.tokens=0;}
}
module.exports={H264Packetizer,nackSequences,RtpRepairCache};
