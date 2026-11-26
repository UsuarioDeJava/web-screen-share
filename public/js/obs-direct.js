window.createObsRoutes=function({socket,desktop,streams,grants,allowed,getIce,iceDone,activate,fallback}) {
  const hosts=new Map();
  const emit=(type,g,to,attempt,sdp)=>socket.emit('obs:direct',{type,stream:g.stream,session:g.session,to,attempt,sdp});
  function sync(){
    for(const [id,row] of hosts){
      const grant=grants.get(id);
      if(grant?.session===row.session && grant.devices.gamepad)continue;
      hosts.delete(id);desktop?.obsDirect?.({type:'close',session:row.session}).catch(()=>{});
    }
  }
  function stop(s,notify=true){
    const r=s?.obsDirect;if(!r)return;
    s.obsDirect=null;clearTimeout(r.timer);clearInterval(r.poll);clearInterval(r.monitor);
    if(r.preview){r.preview.pause();r.preview.srcObject=null;}
    if(s.pc!==r.pc)r.pc?.close();
    if(notify && socket.connected)emit('stop',r,r.owner,r.attempt);
  }
  function watch(s){
    const grant=allowed.get(s.id);
    if(!s.watching || s.kind!=='obs' || !grant?.devices.gamepad || !grant.owner || s.obsDirect || Date.now()<(s.directCooldown||0))return;
    const row=s.obsDirect={...grant,stream:s.id,attempt:Date.now().toString(36)+Math.random().toString(36).slice(2)};
    row.timer=setTimeout(()=>{if(s.obsDirect===row)stop(s);},20000);
    emit('watch',row,grant.owner,row.attempt);
  }
  function lost(s){
    const active=s.obsDirect?.active;
    stop(s);
    if(active && s.watching){s.directCooldown=Date.now()+30000;fallback(s);}
  }
  async function receive(s,r,offer){
    const ice=(await getIce()).flatMap(server=>[].concat(server.urls).filter(url=>/^stun:/i.test(url)).map(url=>({urls:url})));
    if(s.obsDirect!==r)return;
    const pc=r.pc=new RTCPeerConnection({iceServers:ice});
    const media=new MediaStream(),preview=r.preview=document.createElement('video');
    preview.muted=true;preview.playsInline=true;preview.srcObject=media;
    pc.ontrack=e=>{media.addTrack(e.track);preview.play().catch(()=>{});};
    pc.onconnectionstatechange=()=>{
      if(s.obsDirect===r && ['failed','closed','disconnected'].includes(pc.connectionState))lost(s);
    };
    const current=()=>s.obsDirect===r && s.watching && allowed.get(s.id)?.session===r.session;
    await pc.setRemoteDescription({type:'offer',sdp:offer});
    if(!current())return;
    await pc.setLocalDescription(await pc.createAnswer());await iceDone(pc,2500);
    if(!current())return;
    emit('answer',r,r.owner,r.attempt,pc.localDescription.sdp);
    let checking=false;
    r.poll=setInterval(async()=>{
      if(checking || !current())return;
      checking=true;
      try {
        const stats=[...(await pc.getStats()).values()];
        const video=stats.find(x=>x.type==='inbound-rtp' && x.kind==='video');
        const audio=stats.find(x=>x.type==='inbound-rtp' && x.kind==='audio');
        if(!current() || !video?.framesDecoded || (media.getAudioTracks().length && !audio?.packetsReceived))return;
        clearInterval(r.poll);clearTimeout(r.timer);
        // The muted probe is the only extra player during negotiation.
        preview.pause();preview.srcObject=null;r.preview=null;
        activate(s,r,media);
        let lastFrames=video.framesDecoded,lastProgress=performance.now(),sampling=false;
        r.monitor=setInterval(async()=>{
          if(!current() || sampling)return;
          sampling=true;
          try{
            const report=await pc.getStats();
            if(!current())return;
            const inbound=[...report.values()].find(v=>v.type==='inbound-rtp' && v.kind==='video');
            if(inbound?.framesDecoded>lastFrames){lastFrames=inbound.framesDecoded;lastProgress=performance.now();}
            else if(performance.now()-lastProgress>5000)lost(s);
          }catch{if(current())lost(s);}finally{sampling=false;}
        },1000);
      }catch{if(current())lost(s);}finally{checking=false;}
    },100);
  }
  socket.on('obs:direct',async msg=>{
    if(msg.type==='offer'){
      const s=streams.get(msg.stream),r=s?.obsDirect;
      if(!r || r.owner!==msg.from || r.session!==msg.session || r.attempt!==msg.attempt || r.pc)return;
      try{await receive(s,r,msg.sdp);}catch{if(s.obsDirect===r)lost(s);}
      return;
    }
    const g=grants.get(msg.from);
    if(!desktop?.obsDirect || !g?.devices.gamepad || g.stream!==msg.stream || g.session!==msg.session)return;
    const previous=hosts.get(msg.from);
    if(msg.type==='watch'){
      const row={session:g.session,attempt:msg.attempt};hosts.set(msg.from,row);
      try{
        const iceServers=await getIce();
        if(hosts.get(msg.from)!==row)return;
        const offer=await desktop.obsDirect({type:'offer',session:g.session,iceServers});
        if(offer && hosts.get(msg.from)===row)emit('offer',g,msg.from,msg.attempt,offer);
      }catch{}
    }else if(previous?.session===g.session && previous.attempt===msg.attempt){
      if(msg.type==='stop')hosts.delete(msg.from);
      await desktop.obsDirect({type:msg.type==='stop'?'close':'answer',session:g.session,sdp:msg.sdp}).catch(()=>{});
    }
  });
  return {watch,stop,lost,sync};
};
