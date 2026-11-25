// RFC 3550 SR/RR blocks. No report is returned if any compound member is invalid.
function receiverReport(bytes,ssrc){
  if(!Buffer.isBuffer(bytes)||bytes.length<4||bytes.length>65536)return null;
  let at=0,result=null;
  while(at<bytes.length){
    if(at+4>bytes.length||(bytes[at]>>>6)!==2)return null;
    const size=(bytes.readUInt16BE(at+2)+1)*4,end=at+size;if(end>bytes.length)return null;
    let body=size;if(bytes[at]&32){const padding=bytes[end-1];if(end!==bytes.length||!padding||padding>size-4)return null;body-=padding;}
    const pt=bytes[at+1],count=bytes[at]&31;
    if(pt===200||pt===201){
      const offset=pt===200?28:8;if(body<offset+24*count)return null;
      for(let i=0;i<count;i++){
        const p=at+offset+24*i;if(bytes.readUInt32BE(p)!==ssrc)continue;
        let lost=bytes.readUIntBE(p+5,3);if(lost&0x800000)lost-=0x1000000;
        result={fractionLost:bytes[p+4]/256,cumulativeLost:lost,highestSequence:bytes.readUInt32BE(p+8),jitterTicks:bytes.readUInt32BE(p+12),lastSenderReport:bytes.readUInt32BE(p+16),delaySinceSenderReport:bytes.readUInt32BE(p+20)};
      }
    }
    at=end;
  }
  return result;
}
module.exports={receiverReport};
