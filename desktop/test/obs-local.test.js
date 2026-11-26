const {test}=require('node:test');
const assert=require('node:assert/strict');
const rtc=require('node-datachannel');
const {createObsLocal}=require('../obs-local');
const {formats,media,negotiate}=require('../obs-rtp');
const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw Error('Tempo esgotado: '+fn);};
test('WHIP local replica os mesmos pacotes de áudio e vídeo para sala e jogador e revoga só o jogador',async t=>{
  const peers=[];
  const peer=()=>{const pc=new rtc.PeerConnection('test',{iceServers:[],disableAutoNegotiation:true,forceMediaTransport:true});peers.push(pc);return pc;};
  const server=[],player=[];
  async function receiver(offer,list){
    const pc=peer();
    for(const f of formats(offer)){
      const {track}=media(rtc,pc,f,false);
      track.onMessage(bytes=>{if(Buffer.isBuffer(bytes) && (bytes[1]&127)===f.pt)list.push([f.kind,bytes.subarray(12).toString('hex')]);});
    }
    return negotiate(pc,'answer',offer);
  }
  const info={path:'pub_'+'a'.repeat(32),token:'b'.repeat(64),localToken:'c'.repeat(64),url:'https://room.invalid/obs-publish/'+'a'.repeat(32)};
  const bridge=createObsLocal({port:0,rtc,fetch:async(url,opts)=>{
    if(url.endsWith('/ice-servers'))return Response.json([]);
    if(opts.method==='DELETE')return new Response();
    const answer=await receiver(opts.body,server);
    return new Response(answer,{status:201,headers:{Location:'/mtx/'+info.path+'/whip/session'}});
  }});
  t.after(async()=>{bridge.stop();peers.forEach(pc=>pc.close());await new Promise(r=>setTimeout(r,300));rtc.cleanup();});
  const entry=await bridge.configure(info);
  assert.equal((await fetch(entry.url,{method:'POST'})).status,401);
  const pc=peer();
  const tracks=['video','audio'].map((kind,i)=>{
    const f={kind,mid:kind,pt:96+i,profile:i?'':'packetization-mode=1;profile-level-id=42e01f',ssrc:100+i};
    return {...media(rtc,pc,f,true),f};
  });
  const offer=await negotiate(pc,'offer');
  const res=await fetch(entry.url,{method:'POST',headers:{Authorization:'Bearer '+entry.token,'Content-Type':'application/sdp'},body:offer});
  const answer=await res.text();assert.equal(res.status,201,answer);
  pc.setRemoteDescription(answer,'answer');await wait(()=>pc.state()==='connected');
  const key=require('node:crypto').randomUUID();
  const direct=await bridge.direct({type:'offer',session:key,iceServers:[]});
  await bridge.direct({type:'answer',session:key,sdp:await receiver(direct,player)});
  await wait(()=>peers.every(p=>p.state()==='connected'));
  let seq=0;
  function send(){seq++;for(const {track,f} of tracks){
    const out=Buffer.alloc(16);out[0]=128;out[1]=128+f.pt;out.writeUInt16BE(seq,2);out.writeUInt32BE(1000*seq,4);out.writeUInt32BE(f.ssrc,8);
    out.writeUInt32BE(f.pt*65536+seq,12);track.sendMessageBinary(out);
  }}
  await wait(()=>{send();return player.length>=4 && server.length>=4;});
  assert.ok(player.some(([kind])=>kind==='audio'));assert.ok(player.some(([kind])=>kind==='video'));
  assert.ok(player.slice(0,2).every(p=>server.some(q=>q.join()===p.join())));
  await bridge.direct({type:'close',session:key});await new Promise(r=>setTimeout(r,100));const playerCount=player.length;
  const before=server.length;await wait(()=>{send();return server.length>before+4;});assert.equal(player.length,playerCount);
});
