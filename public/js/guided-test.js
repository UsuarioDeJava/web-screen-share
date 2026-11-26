window.WssGuidedTest=function(socket,allowed) {
  let run;
  const ice=createIceServers({fetch:window.fetch.bind(window)});
  function stop() {
    if(!run) return;
    clearInterval(run.firstFramePoll); clearInterval(run.paint); clearInterval(run.ping); clearTimeout(run.timer);
    run.track?.stop(); run.pc?.close(); run.video?.pause(); run=null;
  }
  function fail(r) {if(r===run){socket.emit('guided:fail',r.key);stop();}}
  socket.on('guided:end',key=>{if(run?.key===key) stop();});
  socket.on('disconnect',stop);
  socket.on('guided:invite',({key,sender})=>{
    if(!allowed()) return;
    const yes=confirm('Participar de um teste de conexão de 10 segundos com vídeo sintético? O administrador receberá rota, quadros e latência.');
    socket.emit('guided:accept',{key,yes});
    if(yes){stop(); run={key,sender};}
  });
  async function signal(r,description) {
    const pc=r.pc;
    await pc.setLocalDescription(description);
    if(pc.iceGatheringState!=='complete') await new Promise(resolve=>{
      const timer=setTimeout(done,8000);
      function done(){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();}
      function check(){if(pc.iceGatheringState==='complete') done();}
      pc.addEventListener('icegatheringstatechange',check);check();
    });
    if(run===r && allowed()) socket.emit('guided:sdp',{key:r.key,sdp:pc.localDescription.sdp});
  }
  function channel(r,dc) {
    const readings=[];
    dc.onmessage=e=>{
      if(!r.sender && dc.readyState==='open') dc.send(e.data);
      else if(r.sender && Number.isFinite(Number(e.data))) readings.push(performance.now()-Number(e.data));
    };
    dc.onopen=()=>{

      if(r.sender) r.ping=setInterval(()=>{if(dc.readyState==='open') dc.send(String(performance.now()));},400);
      r.timer=setTimeout(async()=>{
        try {
          const stats=await r.pc.getStats();
          if(r!==run || !allowed()) return;
          const rows=[...stats.values()], video=rows.find(s=>s.kind==='video' && s.type===(r.sender?'outbound-rtp':'inbound-rtp'));
          const pair=stats.get(rows.find(s=>s.type==='transport')?.selectedCandidatePairId) || rows.find(s=>s.type==='candidate-pair' && s.nominated && s.state==='succeeded');
          const types=[stats.get(pair?.localCandidateId)?.candidateType,stats.get(pair?.remoteCandidateId)?.candidateType];
          socket.emit('guided:result',{key:r.key,route:types.includes('relay')?'turn':types.every(Boolean)?'p2p':null,
            frames:r.sender?video?.framesEncoded:video?.framesDecoded,fps:video?.framesPerSecond,freezes:video?.freezeCount,
            firstFrameMs:r.firstFrameMs,rttMs:readings.length?readings.reduce((a,b)=>a+b,0)/readings.length:null});
        } catch {fail(r);}
      },10000);
    };
  }
  socket.on('guided:start',key=>{
    const r=run;
    if(!r || r.key!==key || !allowed()) return;
    r.started=performance.now();
    r.ready=(async()=>{
      const iceServers=await ice();
      if(r!==run) return;
      const pc=r.pc=new RTCPeerConnection({iceServers});
      pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed') fail(r);};
      if(r.sender) {
        const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
        const ctx=canvas.getContext('2d');let frame=0;
        r.paint=setInterval(()=>{ctx.fillStyle='#172030';ctx.fillRect(0,0,320,180);ctx.fillStyle='#60aaff';ctx.fillRect(frame++%280,60,40,40);},66);
        r.track=canvas.captureStream(15).getVideoTracks()[0];pc.addTrack(r.track);
        channel(r,pc.createDataChannel('teste'));
        await signal(r,await pc.createOffer());
      } else {
        pc.ondatachannel=e=>channel(r,e.channel);
        pc.ontrack=e=>{
          const first=()=>{if(r.firstFrameMs==null) r.firstFrameMs=performance.now()-r.started; clearInterval(r.firstFramePoll);};
          r.firstFramePoll=setInterval(async()=>{
            try {const stats=await e.receiver.getStats();
              if([...stats.values()].some(s=>s.type==='inbound-rtp' && s.framesDecoded>0)) first();
            } catch {}
          },100);
          const video=r.video=document.createElement('video'); video.muted=true;video.playsInline=true;
          video.srcObject=new MediaStream([e.track]);
          video.onloadeddata=first;video.requestVideoFrameCallback?.(first);
          video.play().catch(()=>{});
        };
      }
    })().catch(()=>fail(r));
  });
  socket.on('guided:sdp',async msg=>{
    const r=run;
    if(!r || msg.key!==r.key || !allowed()) return;
    try {
      await r.ready;
      if(r!==run) return;
      await r.pc.setRemoteDescription({type:r.sender?'answer':'offer',sdp:msg.sdp});
      if(!r.sender) await signal(r,await r.pc.createAnswer());
    } catch {fail(r);}
  });
  return stop;
};
