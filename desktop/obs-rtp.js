// The source and both destinations negotiate the same codec and payload type.
// Only transport headers are rebuilt. Timestamps, sequence numbers and payloads
// come from OBS, including H.264, AV1 and Opus packets.
const crypto=require('node:crypto');
function formats(sdp) {
  const rows=[];
  for(const section of sdp.split(/^m=/m).slice(1)){
    const kind=section.split(' ')[0];
    if(!['audio','video'].includes(kind) || rows.some(r=>r.kind===kind)) throw Error('Oferta OBS incompatível.');
    const mid=/^a=mid:([^\s]+)\s*$/m.exec(section)?.[1];
    const maps=[...section.matchAll(/^a=rtpmap:(\d+) (\S+)/gm)];
    const payloads=section.split(/\r?\n/,1)[0].trim().split(/\s+/).slice(3);
    const map=payloads.map(pt=>maps.find(m=>m[1]===pt)).find(m=>{
      if(!m)return false;
      if(kind==='audio')return /^opus\/48000\/2$/i.test(m[2]);
      return /^AV1\/90000$/i.test(m[2]) || (/^H264\/90000$/i.test(m[2]) && /packetization-mode=1/.test(profile(m[1])));
    });
    function profile(pt){return section.split(/\r?\n/).find(l=>l.startsWith('a=fmtp:'+pt+' '))?.split(' ').slice(1).join(' ') || '';}
    if(!mid || !map) throw Error('Configure o OBS para AV1 ou H.264 e áudio Opus.');
    rows.push({kind,mid,codec:map[2].split('/')[0].toUpperCase(),pt:Number(map[1]),profile:profile(map[1]),ssrc:crypto.randomInt(1,0xffffffff)});
  }
  if(!rows.some(r=>r.kind==='video')) throw Error('Oferta sem vídeo.');
  return rows;
}
function packet(bytes,f) {
  if(bytes.length<12 || bytes[0]>>6!==2 || bytes[1]>=192 && bytes[1]<=223 || (bytes[1]&127)!==f.pt) return;
  let start=12+4*(bytes[0]&15);
  if(bytes[0]&16){if(start+4>bytes.length)return; start+=4+4*bytes.readUInt16BE(start+2);}
  const end=bytes.length-(bytes[0]&32?bytes.at(-1):0);
  if(end<=start)return;
  const out=Buffer.allocUnsafe(12+end-start);
  bytes.copy(out,0,0,12);out[0]=128;out.writeUInt32BE(f.ssrc,8);bytes.copy(out,12,start,end);
  return out;
}
function media(rtc,pc,f,outgoing){
  const desc=new rtc[f.kind==='audio'?'Audio':'Video'](f.mid,outgoing?'SendOnly':'RecvOnly');
  if(f.kind==='audio') desc.addOpusCodec(f.pt,f.profile);
  else if(f.codec==='AV1') desc.addVideoCodec(f.pt,'AV1',f.profile);
  else desc.addH264Codec(f.pt,f.profile);
  if(outgoing) desc.addSSRC(f.ssrc,'obs','obs',f.kind);
  const track=pc.addTrack(desc);
  if(!outgoing) track.setMediaHandler(new rtc.RtcpReceivingSession());
  else {
    const clock=f.kind==='audio'?48000:90000;
    const config=new rtc.RtpPacketizationConfig(f.ssrc,'obs',f.pt,clock);
    const reporter=new rtc.RtcpSrReporter(config);
    reporter.addToChain(new rtc.RtcpNackResponder(256));track.setMediaHandler(reporter);
    return {track,config};
  }
  return {track};
}
function negotiate(pc,type,remote){
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);if(err) reject(err);else resolve(pc.localDescription().sdp);};
    const timer=setTimeout(()=>{if(pc.localDescription()?.sdp?.includes('a=candidate:')) finish();else finish(Error('ICE sem candidatos.'));},6500);
    pc.onGatheringStateChange(state=>{if(state==='complete')finish();});
    try {if(remote)pc.setRemoteDescription(remote,'offer');pc.setLocalDescription(type);}catch(e){finish(e);}
  });
}
// O pacote começa um quadro-chave? AV1: o cabeçalho de sequência vem antes de cada um (o
// primeiro OBU de um pacote com Z=0). H.264: IDR (5) ou SPS (7), sozinho, em STAP-A ou no
// primeiro fragmento FU-A. payload: a carga útil RTP (sem o cabeçalho de 12 bytes).
function keyframeStart(payload,codec){
  if(!payload || payload.length<2)return false;
  if(codec==='AV1'){
    if(payload[0]&0x80)return false;
    const count=(payload[0]>>4)&3;let i=1;
    if(count!==1){let n=0;while(i<payload.length && payload[i]&0x80 && n<8){i++;n++;}i++;}
    return i<payload.length && ((payload[i]>>3)&15)===1;
  }
  const type=payload[0]&0x1f;
  if(type===5 || type===7)return true;
  if(type===24)return payload.length>3 && [5,7].includes(payload[3]&0x1f);
  if(type===28)return (payload[1]&0x80)!==0 && [5,7].includes(payload[1]&0x1f);
  return false;
}
// RTCP (talvez composto) com pedido de quadro-chave: PLI (206/1) ou FIR (206/4).
function keyframeRequest(bytes){
  for(let i=0;i+4<=bytes.length;){
    if(bytes[i]>>6!==2)return false;
    if(bytes[i+1]===206 && ((bytes[i]&31)===1 || (bytes[i]&31)===4))return true;
    i+=4*(bytes.readUInt16BE(i+2)+1);
  }
  return false;
}
module.exports={formats,packet,media,negotiate,keyframeStart,keyframeRequest};
