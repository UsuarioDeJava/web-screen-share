const http=require('node:http');
const crypto=require('node:crypto');
const {formats,packet,media,negotiate,keyframeStart,keyframeRequest}=require('./obs-rtp');
const KEY_GAP_WARN=4000; // quadro-chave mais espaçado que isso: quem entra fica esse tempo no preto
const {cleanIce}=require('./native-video');
const {createSequenceHeaderRepeater}=require('./av1-info');

// onWarning: o vídeo que chega não vai aparecer pra quem assiste (ex.: AV1 de 10 bits).
function createObsLocal({fetch,renew,port=47981,rtc:injected,onWarning=()=>{}}) {
  let listener,opening,current,settings;
  const rtc=()=>injected || require('node-datachannel');
  function drop(row,key) {
    const dest=row.outputs.get(key);
    if(dest){row.outputs.delete(key);dest.pc.close();}
  }
  function end(row) {
    if(!row || current!==row)return;
    current=null;
    for(const key of row.outputs.keys())drop(row,key);
    row.pc.close();
    if(row.location) removeRemote(row);
  }
  function removeRemote(row) {
    Promise.resolve().then(()=>fetch(row.location,{method:'DELETE',headers:{Authorization:'Bearer '+row.info.token},redirect:'error',signal:AbortSignal.timeout(5000)})).catch(()=>{});
  }
  function destination(row,key,ice) {
    drop(row,key);
    const pc=new (rtc().PeerConnection)('obs-output',{iceServers:ice,disableAutoNegotiation:true,forceMediaTransport:true});
    const dest={pc,tracks:new Map()};row.outputs.set(key,dest);
    pc.onStateChange(state=>{
      if(row.outputs.get(key)!==dest)return;
      if(state==='connected' && row.videoSeen && row.video?.isOpen()) row.video.requestKeyframe();
      if(state==='failed' || state==='closed'){if(key==='server') end(row);else drop(row,key);}
    });
    for(const f of row.formats){
      const out=media(rtc(),pc,f,true);dest.tracks.set(f.mid,out);
      // Quem assiste pede quadro-chave (o MediaMTX repassa): leva até a origem. A câmera do
      // celular (WebRTC) só manda quadro-chave quando pedem; o OBS manda no intervalo dele.
      if(f.kind==='video')out.track.onMessage(bytes=>{
        if(current!==row || !Buffer.isBuffer(bytes) || !keyframeRequest(bytes))return;
        const now=Date.now();
        if(now-(row.keyAskedAt||0)<1000 || !row.video?.isOpen())return;
        row.keyAskedAt=now;row.keyPending=row.keyPending||now;
        row.video.requestKeyframe();
      });
    }
    return dest;
  }
  async function publish(row){
    const {url,token}=row.info;
    const iceResponse=await fetch(new URL('/ice-servers',url).href,{redirect:'error',signal:AbortSignal.timeout(6000)});
    if(!iceResponse.ok || current!==row)throw Error('Sem servidores ICE.');
    const ice=cleanIce(await iceResponse.json());
    if(current!==row)throw Error('Publicação encerrada.');
    const dest=destination(row,'server',ice);
    const sdp=await negotiate(dest.pc,'offer');
    if(current!==row)throw Error('Publicação encerrada.');
    const res=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/sdp'},body:sdp,redirect:'error',signal:AbortSignal.timeout(15000)});
    if(res.status!==201)throw Error('Servidor recusou a publicação OBS ('+res.status+').');
    const location=new URL(res.headers.get('location'),url);
    if(location.origin!==new URL(url).origin || !location.pathname.startsWith('/mtx/'+row.info.path+'/whip/'))throw Error('Sessão WHIP inválida.');
    row.location=location.href;
    if(current!==row){removeRemote(row);throw Error('Publicação encerrada.');}
    const answer=await res.text();
    if(current!==row)throw Error('Publicação encerrada.');
    dest.pc.setRemoteDescription(answer,'answer');
  }
  async function request(req,res){
    const reply=(code,text='')=>{if(!res.destroyed)res.writeHead(code).end(text);};
    if(!settings || req.headers.origin || req.headers.host!==listener?.address()?.address+':'+listener?.address()?.port)return reply(403);
    if(req.method==='OPTIONS' && req.url==='/whip')return reply(204);
    if(req.headers.authorization!=='Bearer '+settings.localToken)return reply(401);
    let row=current;
    if(req.url==='/whip' && req.method==='POST'){
      if(row)return reply(409);
      if(!/^application\/sdp\b/i.test(req.headers['content-type']||''))return reply(415);
    }else if(!row || req.url!=='/session/'+row.id)return reply(404);
    else if(req.method==='DELETE'){end(row);return reply(200);}
    else if(req.method!=='PATCH')return reply(405);
    const info=settings;
    let body='';
    for await(const chunk of req){body+=chunk;if(body.length>65536)return reply(413);}
    if(info!==settings)return reply(409);
    if(req.method==='PATCH'){
      if(current!==row)return reply(404);
      for(const section of body.split(/^m=/m).slice(1)){
        const mid=/^a=mid:(\S+)/m.exec(section)?.[1];
        if(mid)for(const c of section.matchAll(/^a=(candidate:[^\r\n]+)/gm))row.pc.addRemoteCandidate(c[1],mid);
      }
      return reply(204);
    }
    const started=await start(body,{bindAddress:'127.0.0.1'},info);
    if(!started)return reply(409);
    if(res.destroyed){end(started.row);return;}
    res.writeHead(201,{'Content-Type':'application/sdp',Location:'/session/'+started.row.id,ETag:'"'+started.row.id+'"','Accept-Patch':'application/trickle-ice-sdpfrag'}).end(started.answer);
  }
  // Recebe a oferta (do OBS ou da câmera do celular) e republica na sala. Uma publicação por
  // vez: com outra no ar, devolve null. input: opções da conexão de entrada (endereço/portas).
  async function start(body,input,info=settings,source='obs'){
    if(current || !info)return null;
    if(renew && Date.now()+30000>=info.expiresAt) {
      const fresh=await renew();
      if(info!==settings || current || !fresh)return null;
      Object.assign(info,fresh);
    }
    const tracks=formats(body);
    const pc=new (rtc().PeerConnection)(source+'-input',{iceServers:[],disableAutoNegotiation:true,forceMediaTransport:true,...input});
    const row=current={pc,info,id:crypto.randomUUID(),source,formats:tracks,inputs:[],outputs:new Map()};
    try {
      pc.onStateChange(state=>{if(state==='failed' || state==='closed')end(row);});
      for(const f of tracks){
        const {track}=media(rtc(),pc,f,false);
        row.inputs.push(track);if(f.kind==='video')row.video=track;

        track.onMessage(bytes=>{
          if(current!==row || !Buffer.isBuffer(bytes))return;
          let out=packet(bytes,f);
          if(!out)return;
          if(f.kind==='video')row.videoSeen=true;
          // AV1: o primeiro cabeçalho de sequência diz a profundidade de cor. O navegador só
          // decodifica 8 bits (perfil 0): 10 bits (NVENC com o OBS em P010/HDR) fica preto.
          if(f.codec==='AV1'){
            // Quadro-chave sem o cabeçalho de sequência (a NVENC do OBS manda só no começo):
            // o app coloca de volta, senão quem entra depois não decodifica nada.
            const fixer=row.av1Fix||(row.av1Fix=createSequenceHeaderRepeater());
            out=fixer.packet(out);
            const info=fixer.info();
            if(info && !row.av1){row.av1=info;if(info.bitDepth!==8 || info.profile!==0)onWarning({type:'av1',source:row.source,...info});}
            if(!row.av1Repeated && fixer.injected()){row.av1Repeated=true;onWarning({type:'av1-sequence',source:row.source});}
          }
          // O OBS não atende pedido de quadro-chave: quem entra espera o próximo. Intervalo
          // longo (ou o "0 = automático" de alguns codificadores) vira tela preta longa.
          if(f.kind==='video'){
            const now=Date.now();
            const key=keyframeStart(out.subarray(12),f.codec);
            // Pediu e veio logo: a origem atende pedido (a câmera atende; o OBS, em geral, não).
            if(key && row.keyPending){if(now-row.keyPending<2000)row.keyHonored=true;row.keyPending=0;}
            if(!row.keyWarned && !row.keyHonored && row.source==='obs'){
              if(key){
                if(row.keyAt && now-row.keyAt>300 && now-row.keyAt>KEY_GAP_WARN){row.keyWarned=true;onWarning({type:'keyframe',source:row.source,seconds:Math.round((now-row.keyAt)/1000)});}
              }else if(row.keyAt && now-row.keyAt>10000){row.keyWarned=true;onWarning({type:'keyframe',source:row.source,seconds:null});}
            }
            if(key && (!row.keyAt || now-row.keyAt>300))row.keyAt=now;
          }
          for(const dest of row.outputs.values()){
            const t=dest.tracks.get(f.mid);
            if(t?.track.isOpen()){t.config.timestamp=out.readUInt32BE(4);try{t.track.sendMessageBinary(out);}catch{/* A conexão pode fechar com um pacote em trânsito. */}}
          }
        });
      }
      const answer=await negotiate(pc,'answer',body);
      await publish(row);
      if(current!==row)throw Error('Publicação cancelada.');
      const timer=setTimeout(()=>{if(current===row && pc.state()!=='connected')end(row);},30000);timer.unref();
      return {row,answer};
    }catch(e){end(row);throw e;}
  }
  async function configure(info){
    if(settings && settings.path!==info.path)end(current);
    if(settings?.path===info.path && settings.localToken===info.localToken) Object.assign(settings,info);
    else settings=info;
    if(!listener){
      rtc();
      const server=listener=http.createServer({requestTimeout:15000},(req,res)=>request(req,res).catch(()=>{if(!res.headersSent && !res.destroyed)res.writeHead(400).end('Falha ao negociar o vídeo (AV1 ou H.264) e o áudio Opus com a sala.');}));
      opening=new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
      try{await opening;}catch(e){if(listener===server)listener=null;throw e;}
    }else await opening;
    if(!listener?.address())throw Error('Entrada OBS indisponível.');
    return {url:'http://127.0.0.1:'+listener.address().port+'/whip',token:info.localToken};
  }
  async function direct(msg){
    const row=current,key=msg.session;
    if(!row || !row.location || typeof key!=='string' || !/^[a-f0-9-]{36}$/i.test(key))return;
    if(msg.type==='close'){drop(row,key);return;}
    if(msg.type==='answer'){
      if(typeof msg.sdp==='string' && msg.sdp.length<=65536)row.outputs.get(key)?.pc.setRemoteDescription(msg.sdp,'answer');
      return;
    }
    if(msg.type!=='offer' || row.outputs.size>=6)return;
    const ice=cleanIce(msg.iceServers).filter(s=>typeof s==='string' && s.startsWith('stun:'));
    const dest=destination(row,key,ice);
    try{
      const offer=await negotiate(dest.pc,'offer');
      if(current===row && row.outputs.get(key)===dest)return offer;
    }catch(e){if(row.outputs.get(key)===dest)drop(row,key);throw e;}
  }
  function stop(){end(current);settings=null;listener?.close();listener?.closeAllConnections();listener=null;}
  return {configure,direct,stop,active:()=>Boolean(current?.location),
    // Câmera do celular (camera-local.js): a mesma publicação, entrando por outra porta.
    ready:()=>Boolean(settings),
    start:(body,input)=>start(body,input,settings,'camera'),
    session:()=>current?{id:current.id,source:current.source}:null,
    endSession:(id)=>{if(current && current.id===id){end(current);return true;}return false;}};
}
module.exports={createObsLocal};
