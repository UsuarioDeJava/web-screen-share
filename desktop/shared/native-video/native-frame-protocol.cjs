const assert=require('node:assert/strict');
// Input chunks remain immutable while returned payload views are in use.
// Complete payloads are borrowed; fragmented payloads get one bounded allocation.
class NativeFrameParser{
  constructor({version=1,maxSegments=2}={}){
    assert.ok([1,2,3,4,5,6].includes(version));assert.ok(Number.isInteger(maxSegments)&&maxSegments>=1&&maxSegments<=16);
    this.maxSegments=maxSegments;this.version=version;this.segment=0;this.sequence=0;this.lastTime=-1;this.failed=false;this.ended=false;
    this.header=Buffer.alloc(32);this.headerBytes=0;this.current=null;this.payload=null;this.payloadBytes=0;
    this.counts={frames:0,borrowedPayloads:0,allocatedPayloads:0,payloadBytesCopied:0,headerBytesCopied:0,maxOwnedPayloadBytes:0};
  }
  readHeader(){
    const b=this.header;assert.equal(b.toString('ascii',0,4),'WSSV');assert.equal(b.readUInt16LE(4),this.version);
    if(this.version>=5){const segment=b.readUInt16LE(6);assert.ok(segment<this.maxSegments&&(segment===this.segment||(segment===this.segment+1&&this.sequence>0)),'invalid native segment');if(segment!==this.segment){assert.equal(b.readUInt32LE(12),0);this.segment=segment;this.sequence=0;}}
    else assert.equal(b.readUInt16LE(6),0);
    const length=b.readUInt32LE(8);assert.ok(length>0&&length<=262144);assert.equal(b.readUInt32LE(12),this.sequence);
    const ticks=b.readBigInt64LE(16),duration=b.readBigInt64LE(24);assert.ok(ticks>=0n&&ticks<=BigInt(Number.MAX_SAFE_INTEGER));assert.ok(duration>0n&&duration<=10000000n);
    assert.ok(Number(ticks)>this.lastTime,'native timestamp did not advance');
    this.current={...(this.version>=5?{segment:this.segment}:{}),sequence:this.sequence,sampleTimeTicks:Number(ticks),sampleDurationTicks:Number(duration),length};
  }
  push(chunk){
    assert.equal(this.failed||this.ended,false,'parser already ended or failed');
    try{
      assert.ok(Buffer.isBuffer(chunk));assert.ok(this.headerBytes+this.payloadBytes+chunk.length<=524352,'native frame buffer budget');
      const frames=[];let offset=0;
      while(offset<chunk.length){
        if(this.headerBytes<32){
          const count=Math.min(32-this.headerBytes,chunk.length-offset);
          chunk.copy(this.header,this.headerBytes,offset,offset+count);this.counts.headerBytesCopied+=count;this.headerBytes+=count;offset+=count;
          if(this.headerBytes<32)break;this.readHeader();
        }
        if(offset===chunk.length)break;
        const needed=this.current.length-this.payloadBytes,available=chunk.length-offset;let complete;
        if(this.payloadBytes===0&&available>=needed){complete=chunk.subarray(offset,offset+needed);offset+=needed;this.counts.borrowedPayloads++;}
        else{
          if(!this.payload){this.payload=Buffer.allocUnsafe(this.current.length);this.counts.allocatedPayloads++;this.counts.maxOwnedPayloadBytes=Math.max(this.counts.maxOwnedPayloadBytes,this.current.length);}
          const count=Math.min(needed,available);chunk.copy(this.payload,this.payloadBytes,offset,offset+count);
          this.counts.payloadBytesCopied+=count;this.payloadBytes+=count;offset+=count;
          if(this.payloadBytes!==this.current.length)break;complete=this.payload;
        }
        const {length,...frame}=this.current;frames.push({...frame,payload:complete});this.lastTime=frame.sampleTimeTicks;this.sequence++;this.counts.frames++;
        this.headerBytes=0;this.current=null;this.payload=null;this.payloadBytes=0;
      }
      return frames;
    }catch(error){this.failed=true;this.headerBytes=0;this.current=null;this.payload=null;this.payloadBytes=0;throw error;}
  }
  snapshot(){return{...this.counts,pendingHeaderBytes:this.headerBytes,pendingPayloadBytes:this.payloadBytes,
    ownedPayloadBytes:this.payload?.length||0,payloadBudget:262144,internalQueuesObserved:false};}
  finish(){try{assert.equal(this.failed||this.ended,false);assert.equal(this.headerBytes,0,'truncated native frame');this.ended=true;}catch(error){this.failed=true;this.headerBytes=0;this.payloadBytes=0;this.current=null;this.payload=null;throw error;}}
}
module.exports={NativeFrameParser};
