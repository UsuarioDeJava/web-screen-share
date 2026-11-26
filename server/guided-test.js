const {randomUUID}=require('node:crypto');
function createGuided(io,users) {
  let run, last, timer;
  const socket=id=>io.sockets.sockets.get(id);
  const eligible=id=>users.has(id) && socket(id)?.data.diagnosticsEnabled;
  function finish(status) {
    if(!run) return;
    clearTimeout(timer);
    last={at:Date.now(),status,results:run.results};
    for(const id of run.ids) socket(id)?.emit('guided:end',run.key);
    run=null;
  }
  function cancel(id) {if(run?.ids.includes(id)) finish('Interrompido');}
  function start(sender,viewer) {
    if(run) return {error:'Já existe um teste em andamento.'};
    if(sender===viewer || !eligible(sender) || !eligible(viewer)) return {error:'Selecione duas pessoas com análise ativada.'};
    run={ids:[sender,viewer],key:randomUUID(),accepted:new Set(),sent:new Set(),results:{},status:'Aguardando os dois aceites'};
    timer=setTimeout(()=>finish('Tempo de espera esgotado'),90000); timer.unref();
    for(const id of run.ids) socket(id).emit('guided:invite',{key:run.key,sender:id===sender});
    return {ok:true};
  }
  function attach(s) {
    const valid=key=>run && run.key===key && run.ids.includes(s.id) && eligible(s.id);
    s.on('diagnostics:consent',yes=>{if(yes!==true) cancel(s.id);});
    s.on('guided:accept',msg=>{
      if(!valid(msg?.key) || run.accepted.has(s.id)) return;
      if(msg.yes!==true) return finish('Convite recusado');
      run.accepted.add(s.id);
      if(run.accepted.size===2) {
        run.status='Medindo a conexão';
        for(const id of run.ids) socket(id).emit('guided:start',run.key);
      }
    });
    s.on('guided:sdp',msg=>{
      if(!valid(msg?.key) || run.accepted.size!==2 || run.sent.has(s.id) ||
        typeof msg.sdp!=='string' || msg.sdp.length>64000) return;
      run.sent.add(s.id);
      socket(run.ids.find(id=>id!==s.id))?.emit('guided:sdp',{key:run.key,sdp:msg.sdp});
    });
    s.on('guided:fail',key=>{if(valid(key)) finish('Falha na conexão de teste');});
    s.on('guided:result',msg=>{
      if(!valid(msg?.key) || run.accepted.size!==2) return;
      const role=s.id===run.ids[0]?'Transmissor':'Espectador';
      const metrics={route:['p2p','turn'].includes(msg.route)?msg.route:null};
      for(const key of ['firstFrameMs','frames','fps','freezes','rttMs']) metrics[key]=Number.isFinite(msg[key]) && msg[key]>=0 && msg[key]<1e7?msg[key]:null;
      run.results[role]=metrics;
      if(Object.keys(run.results).length===2) finish('Concluído');
    });
  }
  return {start,attach,cancel,state:()=>({eligible:[...users.keys()].filter(eligible),status:run?.status,last})};
}
module.exports={createGuided};
