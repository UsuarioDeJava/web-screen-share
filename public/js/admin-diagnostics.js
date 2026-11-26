window.WssAdminDiagnostics = function ({panels, el, button, ask, when, refresh}) {
  const fmt = (v,unit='',scale=1) => Number.isFinite(v) ? (v/scale).toLocaleString('pt-BR',{maximumFractionDigits:1})+unit : '—';
  const mib = v => fmt(v,' MiB',1048576);
  const pct = v => fmt(v,'%');
  function card(panel,title) {
    const node=el('section','admin-card'); node.append(el('h2',null,title)); panel.append(node); return node;
  }
  function table(head,rows) {
    const table=el('table','diagnostic-table'), header=table.createTHead().insertRow(), body=table.createTBody();
    for (const label of head) header.append(el('th',null,label));
    for (const row of rows) {
      const tr=body.insertRow();
      for (const value of row) {
        const cell=tr.insertCell();
        if(value instanceof Node) cell.append(value); else cell.textContent=value ?? '—';
      }
    }
    const wrap=el('div','diagnostic-scroll'); wrap.append(table); return wrap;
  }
  const system=card(panels.server,'Uso de recursos'), values=el('div');
  system.append(el('p','admin-hint','CPU do processo e do contêiner: 100% corresponde a um núcleo. Sistema: percentual de todos os núcleos visíveis.'),values);
  const chart=el('canvas','diagnostic-chart');
  chart.width=900; chart.height=130;
  chart.setAttribute('role','img');
  system.append(chart);
  function drawCpu(samples) {
    const ctx=chart.getContext('2d');
    if (!ctx || !samples.length) return;
    const end=samples.at(-1).at, start=end-600000;
    const max=Math.max(100,...samples.flatMap(s=>[s.processCpu || 0,s.container?.cpu || 0]));
    ctx.clearRect(0,0,chart.width,chart.height);
    ctx.fillStyle='#aab4c8'; ctx.font='13px sans-serif';
    ctx.fillText(Math.ceil(max)+'%',2,15); ctx.fillText('0%',2,100);
    ctx.fillText('−10 min',48,125); ctx.fillText('agora',852,125);
    for(const [color,pick] of [['#70b9ff',s=>s.processCpu],['#e5ad63',s=>s.container?.cpu]]) {
      ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath();
      let connected=false;
      for (const s of samples) {
        const value=pick(s);
        if (!Number.isFinite(value)) {connected=false;continue;}
        const x=48+840*(s.at-start)/600000, y=100-90*value/max;
        if (connected) ctx.lineTo(x,y); else ctx.moveTo(x,y);
        connected=true;
      }
      ctx.stroke();
    }
    chart.setAttribute('aria-label','CPU nos últimos dez minutos. Dados disponíveis na tabela de histórico.');
  }
  system.append(el('p','admin-hint','CPU nos últimos 10 minutos · WSS em azul · contêiner em laranja, quando disponível.'));
  const history=el('details'), records=el('div'); history.append(el('summary',null,'Histórico dos últimos 10 minutos'),records); system.append(history);
  const live=card(panels.streams,'Conexões de vídeo'), links=el('div');
  live.append(el('p','admin-hint','Métricas enviadas pelos participantes que ativaram a análise. Atualização a cada 10 segundos.'),links);
  const errors=card(panels.errors,'Ocorrências por tipo e versão'), groups=el('div'), detail=el('div');
  const filter=el('input','admin-input'); filter.type='search'; filter.placeholder='Filtrar por erro, cliente ou versão'; filter.setAttribute('aria-label',filter.placeholder);
  errors.append(filter,groups,detail);
  const management=card(panels.errors,'Histórico de relatos'), retention=el('select','admin-input'), feedback=el('p','admin-hint');
  const label=el('label',null,'Guardar por '); label.append(retention);
  for (const n of [1,7,30]) {const opt=el('option',null,n===1?'1 dia':n+' dias'); opt.value=n; retention.append(opt);}
  management.append(label,button('Apagar relatos','btn btn-danger-soft',async()=>{
    if (!confirm('Apagar todos os relatos deste servidor?')) return;
    const res=await ask('report-clear'); feedback.textContent=res.error || 'Histórico apagado.'; detail.replaceChildren(); await refresh();
  }),feedback);
  retention.onchange=async()=>{
    const days=Number(retention.value);
    if (days<lastRetention && !confirm('Reduzir o prazo e excluir os relatos mais antigos?')) {retention.value=lastRetention;return;}
    const res=await ask('report-retention',{days}); feedback.textContent=res.error || 'Prazo atualizado.'; await refresh();
  };
  const review=window.WssAdminReview({panels,card,table,el,button,ask,when,refresh,fmt});
  let lastRetention=7,lastGroups=[],selection=null;
  function groupList() {
    const needle=filter.value.trim().toLocaleLowerCase('pt-BR');
    const rows=lastGroups.filter(g=>[WssDiagnosticFields.codes[g.code],g.client,g.version].join(' ').toLocaleLowerCase('pt-BR').includes(needle));
    groups.replaceChildren(rows.length ? table(['Tipo','Cliente / versão','Ocorrências','Sessões','Primeira','Última','Investigação'],rows.map(g=>[
      button(WssDiagnosticFields.codes[g.code],'link-btn',async()=>{
        selection=g.key; const result=await ask('report-details',{key:g.key});
        if(selection!==g.key) return;
        detail.replaceChildren(el('h3',null,WssDiagnosticFields.codes[g.code]));
        if(result.error) {detail.append(el('p',null,result.error));return;}
        detail.append(review.controls(g));
        for(const r of result.reports) {
          const item=el('details'), summary=el('summary',null,when(r.observedAt)+' · '+r.nick);
          const config=el('pre','diag-output',JSON.stringify({sistema:r.snapshot.platform,configurações:r.snapshot.settings,conexões:r.snapshot.streams,histórico:r.history},null,2));
          item.append(summary,el('p',null,r.description || (r.detail ? `Relato automático: ${r.detail}` : 'Relato automático')),review.incident(r),config); detail.append(item);
        }
      }),[g.client,g.version].filter(Boolean).join(' · '),g.count,g.sessions,when(g.first),when(g.last),review.status(g)
    ])) : el('p','admin-hint','Nenhum relato encontrado.'));
  }
  filter.oninput=groupList;
  return function render(state) {
    const data=state.diagnostics;
    if (!data) return;
    review.render(state);
    const s=data.system.at(-1);
    if (s) {
      drawCpu(data.system);
      const c=s.container;
      const rows=[
        ['Processo WSS',pct(s.processCpu),mib(s.processMemory),'—'],
        ['Sistema visível',pct(s.systemCpu),mib(s.systemMemory),mib(s.systemTotal)]
      ];
      if(c) rows.push(['Contêiner',pct(c.cpu),mib(c.memory),mib(c.memoryLimit)]);
      const notes=['Espaço livre no volume: '+fmt(s.diskFree,' GiB',1073741824),'Ocupação do loop do Node: '+pct(s.loopBusy),
        'Intervalo do monitor do loop (p95, base de 20 ms): '+fmt(s.loopDelayMs,' ms')];
      if(c) notes.push('Cota de CPU: '+fmt(c.cpuLimit,' núcleos'),'Rede do contêiner: ↓ '+fmt(c.rx,' KiB/s',1024)+' · ↑ '+fmt(c.tx,' KiB/s',1024));
      else notes.push('Métricas de contêiner indisponíveis nesta instalação.');
      values.replaceChildren(table(['Origem','CPU','Memória usada','Memória total ou limite'],rows),el('p','admin-hint',notes.join(' · ')));
      if(history.open || !records.childElementCount) records.replaceChildren(table(['Horário','CPU WSS','RAM WSS','CPU contêiner','RAM contêiner','Transmissões'],
        data.system.slice().reverse().map(p=>[new Date(p.at).toLocaleTimeString('pt-BR'),pct(p.processCpu),mib(p.processMemory),pct(p.container?.cpu),mib(p.container?.memory),p.sharing])));
    }
    const rows=data.live.flatMap(person=>person.snapshot.streams.map((s,i)=>[
      person.nick,s.direction,person.peers[i] || '—',s.state,s.route,fmt(s.fps),s.width && s.height?s.width+'×'+s.height:'—',
      fmt(s.bitrate,' Mbps',1e6),fmt(s.rttMs,' ms'),fmt(s.fractionLost,'%',0.01),s.codec
    ]));
    links.replaceChildren(rows.length ? table(['Participante','Direção','Outro lado','Estado','Rota','FPS','Resolução','Taxa','RTT','Perda','Codec'],rows)
      : el('p','admin-hint','Nenhuma conexão de vídeo com diagnóstico ativo.'));
    lastRetention=data.retention; retention.value=data.retention; lastGroups=data.groups;
    if (!lastGroups.some(g=>g.key===selection)) {selection=null;detail.replaceChildren();}
    groupList();
  };
};
