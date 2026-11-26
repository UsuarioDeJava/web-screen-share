window.WssAdminReview=function({panels,card,table,el,button,ask,when,refresh,fmt}) {
  const comp=card(panels.errors,'Comparação de sessões'), totals=el('div');
  comp.append(el('p','admin-hint','Sessões observadas por cliente, versão, perfil, codec e captura nativa. Uma sessão pode aparecer em mais de uma configuração.'),totals);
  const changes=card(panels.room,'Histórico de configurações'), audit=el('div');
  changes.append(audit);
  const health=card(panels.server,'Estado dos serviços'), healthRows=el('div');
  const getIce=createIceServers({fetch:window.fetch.bind(window)});
  async function testRelay() {
    if(!window.RTCPeerConnection) return 'indisponível';
    const iceServers=(await getIce()).filter(s=>[].concat(s.urls).some(url=>/^turns?:/i.test(url)));
    if(!iceServers.length) return 'indisponível';
    const pc=new RTCPeerConnection({iceServers,iceTransportPolicy:'relay'});
    let timer;
    try {
      pc.createDataChannel('verificar');
      const result=new Promise(resolve=>{
        timer=setTimeout(()=>resolve('sem confirmação'),5000);
        pc.onicecandidate=e=>{
          if(e.candidate?.type==='relay') resolve('respondeu');
          else if(!e.candidate) resolve('sem confirmação');
        };
      });
      await pc.setLocalDescription(await pc.createOffer());
      return await result;
    } finally { clearTimeout(timer);pc.close(); }
  }
  health.append(button('Verificar agora','btn',async()=>{
    const relay=await testRelay().catch(()=>'indisponível');
    const res=await ask('services',{relay});if(res.error) alert(res.error);await refresh();
  }),healthRows);
  const guided=card(panels.streams,'Teste entre dois PCs'), sender=el('select','admin-input'), viewer=el('select','admin-input'), progress=el('div');
  const label=(name,node)=>{const l=el('label',null,name+' ');l.append(node);return l;};
  guided.append(label('Transmissor',sender),label('Espectador',viewer),button('Convidar para teste','btn',async()=>{
    const result=await ask('guided',{sender:sender.value,viewer:viewer.value});
    if(result.error) alert(result.error);await refresh();
  }),el('p','admin-hint','Disponível para participantes com análise ativada. Os dois precisam aceitar o convite.'),progress);
  let investigations=[];
  function status(g) {
    const i=investigations.find(x=>x.code===g.code && x.client===g.client);
    if(!i || i.status!=='Corrigido') return i?.status || 'Novo';
    const recurrence=g.last>i.at && /^\d+(\.\d+)+$/.test(g.version) && g.version.localeCompare(i.fixed,'en',{numeric:true})>=0;
    return (recurrence?'Recorrência após correção em ':'Corrigido em ')+i.fixed;
  }
  function controls(g) {
    const box=el('div'),select=el('select','admin-input'),version=el('input','admin-input');
    const current=investigations.find(x=>x.code===g.code && x.client===g.client);
    for(const name of ['Novo','Em investigação','Corrigido']) select.append(el('option',null,name));
    select.value=current?.status || 'Novo';version.value=current?.fixed || '';version.placeholder='Ex. 2.0.1';
    box.append(label('Estado do erro neste cliente',select),label('Versão corrigida',version),button('Salvar estado','btn',async()=>{
      const res=await ask('report-track',{key:g.key,status:select.value,fixed:version.value});
      if(res.error) alert(res.error);await refresh();
    }));return box;
  }
  function incident(r) {
    const box=el('div'), rows=r.timeline || [], steps=el('textarea','admin-input');
    box.append(el('h4',null,'Minuto anterior ao relato'));
    if(!rows.some(x=>x.role==='Outro lado')) box.append(el('p','admin-hint','Sem amostras do outro lado para este intervalo.'));
    const graph=el('canvas','diagnostic-chart');graph.width=900;graph.height=150;
    const ctx=graph.getContext('2d');
    if(ctx) {
      const metrics=[['fps','FPS'],['rttMs','RTT (ms)'],['fractionLost','Perda (%)'],['cpu','CPU (%)']];
      metrics.forEach(([field,title],i)=>{
        const values=rows.filter(s=>Number.isFinite(s[field]));
        const scale=field==='fractionLost'?100:1, max=Math.max(1,...values.map(s=>s[field]*scale));
        const base=i*36+30;
        ctx.fillStyle='#afb9cc';ctx.fillText(title+' 0–'+Math.ceil(max),2,base-8);
        for(const s of values){
          ctx.fillStyle=s.role==='Autor'?'#73baff':s.role==='Servidor'?'#edba68':'#84dbaa';
          ctx.fillRect(100+790*(1+(s.at-r.observedAt)/60000),base-24*s[field]*scale/max,4,4);
        }
      });
      box.append(graph,el('p','admin-hint','Da esquerda para a direita: −60 s até o relato. Azul: autor. Verde: outro lado. Amarelo: servidor.'));
    }
    box.append(table(['Horário','Origem','Direção / evento','FPS','RTT','Perda','CPU WSS'],rows.map(s=>[
      when(s.at),s.role,s.event || s.direction,fmt(s.fps),fmt(s.rttMs,' ms'),fmt(s.fractionLost,'%',.01),fmt(s.cpu,'%')
    ])));
    steps.maxLength=600;steps.rows=2;
    box.append(label('Passos para reproduzir (opcional, incluídos na exportação)',steps),button('Exportar diagnóstico JSON','btn',async()=>{
      const data=await ask('report-export',{id:r.id});
      if(data.error) return alert(data.error);
      if(steps.value.trim()) data.passosParaReproduzir=steps.value.trim();
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=el('a');a.href=url;a.download='wss-diagnostico-'+r.observedAt+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));return box;
  }
  const keys={roomName:'Nome da sala',notice:'Aviso',chatHistory:'Histórico do chat',control:'Controle remoto',obs:'OBS',maxUsers:'Limite de pessoas'};
  function render(state) {
    const d=state.diagnostics; investigations=d.investigations||[];
    totals.replaceChildren(table(['Cliente / versão / perfil / codec / nativa','Com relato','Observadas'],(d.comparisons||[]).map(c=>[c.key,c.affected,c.total])));
    const seen=new Set();
    audit.replaceChildren(table(['Horário','Configuração','Antes','Depois','Ação'],(state.changes||[]).map(c=>{
      const latest=!seen.has(c.key);seen.add(c.key);
      return [when(c.at),keys[c.key],String(c.before),String(c.after),latest?button('Reverter','btn',async()=>{
        if(!confirm('Restaurar o valor anterior de '+keys[c.key]+'?'))return;
        const res=await ask('settings-undo',{id:c.id});if(res.error) alert(res.error);await refresh();
      }):'—'];
    })));
    const h=state.services;healthRows.textContent=h?'Última verificação · '+when(h.at):'Aguardando a primeira verificação.';
    if(h) healthRows.append(table(['Serviço','Resultado'],[['Sala',h.room],['TURN',h.turn],['Alocação TURN a partir deste navegador',h.relay],['OBS',h.obs]]));
    const g=state.guided;
    if(!g)return;
    for(const sel of [sender,viewer]){
      const prev=sel.value, people=state.online.filter(p=>g.eligible.includes(p.id));
      sel.replaceChildren(...people.map(p=>{const o=el('option',null,p.name);o.value=p.id;return o;}));
      if(people.some(p=>p.id===prev)) sel.value=prev;else if(sel===viewer && people.length>1) sel.selectedIndex=1;
    }
    progress.textContent=g.status || (g.last?g.last.status+' · '+when(g.last.at):'Nenhum teste realizado.');
    if(g.last) progress.append(table(['Último teste','Rota','Primeiro quadro','Quadros','FPS','Travamentos','RTT do comando'],Object.entries(g.last.results).map(([role,m])=>[role,m.route,fmt(m.firstFrameMs,' ms'),fmt(m.frames),fmt(m.fps),fmt(m.freezes),fmt(m.rttMs,' ms')])));
  }
  return {render,status,controls,incident};
};
