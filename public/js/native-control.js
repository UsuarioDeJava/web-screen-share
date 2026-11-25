// Sem interface/mídia: conexão de comandos em processo isolado da janela da sala.
(() => {
  const bridge=window.wssReceiver;
  if(!bridge)return;
  const socket=io({reconnection:false}),active=new Map(),pulses=new Map();
  let revision=-1,desired={grants:[]},connectFailed=false;
  let transport=null;
  const makeTransport=options=>WssControlTransport.create({socket,...options,iceServers:createIceServers({fetch:window.fetch.bind(window)}),
    onInput:bridge.input,onReset:bridge.reset,
    onChange:bridge.report,
    onActivity:value=>{
      const at=performance.now(),last=pulses.get(value.from)||{native:-Infinity,server:-Infinity};
      if(at-last.native>=100){last.native=at;bridge.pulse(value);}
      if(value.gamepad&&at-last.server>=400){last.server=at;socket.emit('control:activity',value);}
      pulses.set(value.from,last);
    },
  });
  function sync(next) {
    if(!next||next.revision<revision)return;
    revision=next.revision;desired=next;
    if(connectFailed){for(const grant of next.grants)bridge.fault({from:grant.peer,session:grant.session});return;}
    if(!transport&&next.grants.length)transport=makeTransport(next.grants[0].options);
    for(const [peer,grant]of active)if(!next.grants.some(g=>g.peer===peer&&g.session===grant.session)){
      transport?.revoke(peer);socket.emit('control:receiver-release',{session:grant.session});active.delete(peer);pulses.delete(peer);
    }
    if(!socket.connected)return;
    for(const grant of next.grants){
      if(active.get(grant.peer)?.session===grant.session)continue;
      active.set(grant.peer,grant);
      socket.timeout(5000).emit('control:receiver-bind',grant,(error,result)=>{
        if(active.get(grant.peer)!==grant)return;
        if(error||!result?.ok){active.delete(grant.peer);bridge.fault({from:grant.peer,session:grant.session});return;}
        transport.host(result);
      });
    }
  }
  bridge.onState(sync);
  bridge.onEvent(({type,value})=>{
    const grant=active.get(value?.from||value?.id);if(!grant)return;
    if(type==='feedback')transport?.feedback(grant.peer,value);
    if(type==='gamepad-state')socket.emit('control:receiver',{...value,from:grant.peer,stream:grant.stream,session:grant.session});
    if(type==='blocked'){transport?.revoke(grant.peer);socket.emit('control:receiver-release',{session:grant.session});active.delete(grant.peer);}
  });
  socket.on('connect',()=>{connectFailed=false;sync(desired);});
  socket.on('connect_error',()=>{connectFailed=true;for(const grant of desired.grants)bridge.fault({from:grant.peer,session:grant.session});active.clear();});
  socket.on('disconnect',()=>{for(const grant of active.values())bridge.fault({from:grant.peer,session:grant.session});active.clear();});
  socket.on('control:revoked',msg=>{for(const [peer,grant]of active)if(grant.stream===msg.stream&&(!msg.to||peer===msg.to)){
    bridge.fault({from:peer,session:grant.session});active.delete(peer);
  }});
  socket.on('control:input',msg=>{const grant=active.get(msg?.from);if(grant&&transport?.legacyAllowed(msg.from))bridge.input({...msg,session:grant.session});});
  bridge.ready().then(sync).catch(()=>socket.disconnect());
})();
