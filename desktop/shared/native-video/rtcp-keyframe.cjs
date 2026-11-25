// RFC 4585 PLI / RFC 5104 FIR. Input is decrypted RTCP from the media track.
// Validate the whole compound packet before accepting any feedback.
function keyframeFeedback(bytes,ssrc){
  if(!Buffer.isBuffer(bytes)||bytes.length<4||bytes.length>65536)return null;
  let at=0,found=null;
  while(at<bytes.length){
    if(at+4>bytes.length||(bytes[at]>>>6)!==2)return null;
    const size=(bytes.readUInt16BE(at+2)+1)*4,end=at+size;
    if(end>bytes.length)return null;
    let body=size;
    if(bytes[at]&32){const padding=bytes[end-1];if(end!==bytes.length||!padding||padding>size-4)return null;body-=padding;}
    const fmt=bytes[at]&31,pt=bytes[at+1];
    if(pt===206&&(fmt===1||fmt===4)){
      if(body<12)return null;
      if(fmt===1){if(body!==12)return null;if(bytes.readUInt32BE(at+8)===ssrc)found='pli';}
      else{
        if(body<20||(body-12)%8!==0||bytes.readUInt32BE(at+8)!==0)return null;
        for(let p=at+12;p<at+body;p+=8)if(bytes.readUInt32BE(p)===ssrc)found='fir';
      }
    }
    at=end;
  }
  return found;
}
module.exports={keyframeFeedback};
