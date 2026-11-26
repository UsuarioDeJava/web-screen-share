const {codes,snapshot}=require('../public/js/diagnostic-fields');

function createReview(saved={}) {
  let observations=saved.observations || [], investigations=saved.investigations || [];
  const traces=new Map();
  function variant(s) {
    return [s.client,s.version,s.settings.profile,s.settings.codec,s.settings.nativeCapture].map(v=>v??'—').join(' / ');
  }
  function observe(id,s,at) {
    const key=variant(s), row=observations.find(o=>o.id===id && o.key===key);
    if(row && at-row.at<60000) return false;
    if(row) row.at=at;
    else observations.push({id,key,at});
    observations=observations.slice(-10000);
    return true;
  }
  function remember(id,row) {
    traces.set(id,[...(traces.get(id)||[]).filter(r=>r.at>=row.at-60000),row].slice(-32));
  }
  function capture(id,at,samples) {
    const within=x=>x.at<=at && x.at>=at-60000;
    const peers=new Set((traces.get(id)||[]).filter(within).flatMap(r=>r.peers||[]));
    const result=samples.filter(within).map(s=>({at:s.at,role:'Servidor',cpu:s.processCpu}));
    for(const [who,trace] of traces) {
      if(who!==id && !peers.has(who)) continue;
      const role=who===id?'Autor':'Outro lado';
      for(const row of trace.filter(within)) {
        if(row.retry && (who===id || row.peer===id)) result.push({at:row.at,role,event:'Reconexão'});
        row.streams?.forEach((s,i)=>{
          if(who===id || row.peers[i]===id) result.push({at:row.at,role,...s});
        });
      }
    }
    return result;
  }
  function packet(r) {
    if(!r) return null;
    const timeline=[...(r.timeline||[])];
    if(!timeline.some(s=>s.role==='Autor' && s.direction))
      for(const h of r.history||[]) for(const s of snapshot(h.snapshot).streams) timeline.push({at:h.at,role:'Autor',...s});
    const data=snapshot(r.snapshot);
    for(const s of data.streams) timeline.push({at:r.observedAt,role:'Autor',...s});
    timeline.push({at:r.observedAt,role:'Autor',event:codes[r.code]});
    return {schema:1,at:r.observedAt,code:r.code,serverVersion:r.serverVersion||null,snapshot:data,timeline:timeline.sort((a,b)=>a.at-b.at)};
  }
  function state(reports) {
    const groups=new Map();
    for(const o of observations) {
      if(!groups.has(o.key)) groups.set(o.key,{total:new Set(),affected:new Set()});
      groups.get(o.key).total.add(o.id);
    }
    for(const r of reports) {
      const g=groups.get(variant(r.snapshot));
      if(g?.total.has(r.session)) g.affected.add(r.session);
    }
    return {comparisons:[...groups].map(([key,g])=>({key,total:g.total.size,affected:g.affected.size})),investigations};
  }
  function track(r,status,fixed) {
    if(!r || !['Novo','Em investigação','Corrigido'].includes(status)) return false;
    if(status==='Corrigido' && !(typeof fixed==='string' && /^\d{1,6}(?:\.\d{1,6}){1,3}$/.test(fixed))) return false;
    investigations=investigations.filter(i=>i.code!==r.code || i.client!==r.snapshot.client);
    investigations.push({at:Date.now(),code:r.code,client:r.snapshot.client,status,fixed:status==='Corrigido'?fixed:null});
    return true;
  }
  return {observe,remember,capture,packet,state,track,forget:id=>traces.delete(id),saved:()=>({observations,investigations}),
    prune(since){const n=observations.length+investigations.length; observations=observations.filter(o=>o.at>=since);
      investigations=investigations.filter(i=>i.at>=since);return n!==observations.length+investigations.length;},
    clear(){observations=[];investigations=[];traces.clear();}};
}
module.exports={createReview};
