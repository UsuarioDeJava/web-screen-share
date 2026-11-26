window.WssDiagnosticClient = function ({ socket, member, desktop, capture, streams, version }) {
  const preference = 'wss-diagnostic-consent-v1', lastSample = 'wss-diagnostic-last-v1';
  let enabled = false, online = false, history = [], draft, queue = [], draining = false, generation = 0;
  const stopTest=window.WssGuidedTest?.(socket,()=>enabled && online && Boolean(member()));
  const recent = new Map();
  try { enabled = localStorage.getItem(preference) === 'yes'; } catch {}
  function id() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(bytes, b=>b.toString(16).padStart(2,'0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  function collect() {
    const links = streams().slice(0,12);
    const snapshot = window.WssDiagnosticFields.snapshot({ client:desktop?'App':'Navegador', version:version(),
      settings:capture(), streams:links.map(s=>({...s.metrics, direction:s.direction, route:s.route, state:s.state})) });
    return { snapshot, peers:links.map(s=>s.peer) };
  }
  function request(report) {
    return new Promise(resolve => {
      if (!online || !socket.connected) return resolve({error:'Entre na sala para enviar.'});
      socket.timeout(5000).emit('diagnostics:report',report,(err,res)=>resolve(err || !res ? {error:'Envio não confirmado. Tente novamente.'} : res));
    });
  }
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      while (enabled && online && queue.length) {
        const next = queue[0];
        if (!(await request(next)).ok) break;
        if (queue[0] === next) queue.shift();
      }
    } finally { draining = false; }
  }
  function fault(code, at = Date.now(), snapshot) {
    if (!enabled || !online || !member() || Date.now()-(recent.get(code)||0)<60000) return;
    recent.set(code,Date.now());
    queue.push({ id:id(), code, at, snapshot:snapshot || collect().snapshot, history:history.slice() });
    if (queue.length>8) queue.shift();
    void drain();
  }
  async function sample() {
    if (!enabled || !online || !member()) return;
    const epoch = generation, reading = collect(), at = Date.now();
    let prior;
    try { prior = JSON.parse(sessionStorage.getItem(lastSample)); } catch {}
    const pending = await desktop?.diagnosticFault?.(true).catch(()=>null);
    if (epoch !== generation || !enabled || !online) return;
    if (pending && at-pending.at<86400000)
      fault(pending.code,pending.at,prior?.snapshot);
    history = [...history.filter(x=>at-x.at<60000), {at,snapshot:reading.snapshot}].slice(-6);
    try { sessionStorage.setItem(lastSample,JSON.stringify(history.at(-1))); } catch {}
    socket.volatile.emit('diagnostics:live',reading);
    void drain();
  }
  function syncConsent() {
    generation++;
    if (online && socket.connected) socket.emit('diagnostics:consent',enabled);
    if (enabled) { void sample(); return; }
    stopTest?.(); history=[]; queue=[]; recent.clear(); draft=null;
    try { sessionStorage.removeItem(lastSample); } catch {}
    desktop?.diagnosticFault?.(false).catch(()=>{});
  }
  function preview() {
    draft = {id:id(), code:'manual', confirmed:true, at:Date.now(), snapshot:collect().snapshot, history:history.slice()};
    return { id:draft.id, enabled, data:{ nick:member()?.name, configurações:draft.snapshot.settings,
      cliente:draft.snapshot.client, versão:draft.snapshot.version, conexões:draft.snapshot.streams, histórico:draft.history } };
  }
  function setConsent(value) {
    enabled=value === true;
    try { localStorage.setItem(preference,enabled?'yes':'no'); } catch {}
    syncConsent();
    return preview();
  }
  window.addEventListener('storage',e=>{
    if (e.key!==preference && e.key!==null) return;
    enabled=e.newValue==='yes'; syncConsent(); draft=null;
  });
  async function submit(draftId, text) {
    if (!online || !member()) throw Error('Entre na sala para enviar.');
    if (!draft || draft.id !== draftId) throw Error('Reabra o relato para atualizar a prévia.');
    if (typeof text !== 'string' || !text.trim() || text.length>600) throw Error('Descreva o problema em até 600 caracteres.');
    const result=await request({...draft,description:text.trim()});
    if (!result.ok) throw Error(result.error);
    return preview();
  }
  window.addEventListener('error',e=>{ if(e instanceof ErrorEvent) fault('script_error'); });
  window.addEventListener('unhandledrejection',()=>fault('script_error'));
  let lastTick=performance.now();
  document.addEventListener('visibilitychange',()=>{lastTick=performance.now();});
  setInterval(()=>{
    const now=performance.now(), elapsed=now-lastTick; lastTick=now;
    if (!desktop?.diagnosticFault && !document.hidden && elapsed>5000 && elapsed<60000) fault('interface_stalled');
  },1000);
  setInterval(sample,10000);
  // A pessoa já escolheu (sim ou não) neste servidor? Sem como guardar, conta como sim
  // (a sala não fica perguntando).
  function decided() { try { return localStorage.getItem(preference) !== null; } catch { return true; } }
  return { decided, retry(peer){if(enabled && online && socket.connected) socket.volatile.emit('diagnostics:retry',peer);}, fault, preview, setConsent, submit, joined(){ online=true; syncConsent(); },
    left(){ stopTest?.(); online=false; generation++; history=[]; if (socket.connected) queue=[]; draft=null;
      desktop?.diagnosticFault?.(false).catch(()=>{}); } };
};
