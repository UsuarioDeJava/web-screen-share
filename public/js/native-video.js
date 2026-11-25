(function(root){
  function supported(){return typeof RTCRtpScriptTransform==='function'&&typeof Worker==='function';}
  function attach(pc){
    if(!supported())throw Error('Este navegador não suporta vídeo nativo.');
    let closed=false,channel,worker,timer,repeatTimer,health,busy=false,sequence=0,healthSequence=0,decoded=0,progress=performance.now(),lastRtp=null,lastSent=-Infinity,cumulative=false;const queue=[],receipts=[];
    const fail=()=>{close();pc.close();};
    function flush(){if(closed||!channel||channel.readyState!=='open'||channel.bufferedAmount||!queue.length)return;
      const b=new ArrayBuffer(12),v=new DataView(b);v.setUint32(0,0x41535357,true);v.setUint32(4,++sequence,true);v.setUint32(8,queue.shift(),true);try{channel.send(b);lastSent=performance.now()}catch{fail();}}
    function track(event){if(worker){fail();return;}root.WssVideoPolicy?.applyReceiverBuffer(event.receiver,0);worker=new Worker('/js/native-admission-worker.js');worker.onmessage=({data})=>{if(closed||data.type==='late')return;if(data.type!=='receipt'||queue.length>=8){fail();return;}lastRtp=data.rtp;if(cumulative)queue.length=0;queue.push(data.rtp);flush();};worker.onerror=fail;event.receiver.transform=new RTCRtpScriptTransform(worker);}
    function data(event){const c=event.channel;
      const v2=c.label==='native-admission-v2'&&c.protocol==='wss-admission-v2';
      const v1=c.label==='native-admission'&&c.protocol==='wss-admission-v1';
      if(v1||v2){if(receipts.some(other=>other.label===c.label)){c.close();return;}receipts.push(c);if(v2||!channel){channel=c;cumulative=v2;if(v2){queue.length=0;if(lastRtp!==null)queue.push(lastRtp);clearInterval(repeatTimer);repeatTimer=setInterval(()=>{if(lastRtp!==null&&performance.now()-lastSent>=50){queue.length=0;queue.push(lastRtp);flush()}},50);}}
        c.bufferedAmountLowThreshold=0;c.onopen=flush;c.onbufferedamountlow=flush;c.onerror=()=>{if(c===channel)fail()};flush();return;}
      if(c.label!=='decoder-health'||c.protocol!=='wss-health-v1'||health){c.close();return;}health=c;
      timer=setInterval(async()=>{if(closed||busy||c.readyState!=='open'||c.bufferedAmount)return;busy=true;try{
        const stats=await pc.getStats();if(closed)return;const row=[...stats.values()].find(r=>r.type==='inbound-rtp'&&r.kind==='video');if(!Number.isInteger(row?.framesDecoded))return;
        const at=performance.now();if(decoded!==row.framesDecoded){decoded=row.framesDecoded;progress=at;}
        c.send(root.WssDecoderHealth.encode(++healthSequence,decoded,Math.min(10000,Math.floor(at-progress))));
      }catch{fail()}finally{busy=false}},100);
    }
    function close(){if(closed)return;closed=true;clearInterval(timer);clearInterval(repeatTimer);pc.removeEventListener('track',track);pc.removeEventListener('datachannel',data);worker?.terminate();queue.length=0;for(const c of receipts)c.close();health?.close();}
    pc.addEventListener('track',track);pc.addEventListener('datachannel',data);return{close};
  }
  root.WssNativeVideo={supported,attach};
})(globalThis);
