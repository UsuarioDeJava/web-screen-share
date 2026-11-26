const fs = require('node:fs');
const path = require('node:path');
const { snapshot, codes } = require('../public/js/diagnostic-fields');
const { createSnapshotStore } = require('./snapshot-store');
const { createSystemSamples } = require('./system-samples');
const DAY = 86400000;

function createDiagnostics({ directory, users, allow, countSharing, version, log = console.warn }) {
  const file = path.join(directory, 'diagnostics.json');
  let reports = [], retention = 7, prior = {};
  try {
    fs.mkdirSync(directory, { recursive: true });
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    prior = saved;
    if ([1,7,30].includes(saved.retention)) retention = saved.retention;
    if (Array.isArray(saved.reports)) reports = saved.reports.filter(r => r && Object.hasOwn(codes,r.code) && r.snapshot).slice(-500);
  } catch (e) { if (e.code !== 'ENOENT') log('Falha ao abrir o histórico de diagnósticos.'); }
  const review=require("./incident-review").createReview(prior);
  const store = createSnapshotStore({ file, snapshot: () => ({retention, reports,...review.saved()}), onError: () => log('Falha ao salvar diagnósticos.') });
  const samples = createSystemSamples(directory, countSharing);
  const live = new Map();
  function prune() {
    const since = Date.now()-retention*DAY;
    if(review.prune(since)) store.changed();
    const keep = reports.filter(r => r.at >= since).slice(-500);
    if (keep.length !== reports.length) { reports = keep; store.changed(); }
  }
  prune();
  const timer = setInterval(prune, 60000);
  timer.unref();
  function attach(socket) {
    socket.on('diagnostics:consent', value => {
      socket.data.diagnosticsEnabled = users.has(socket.id) && value === true;
      if (!socket.data.diagnosticsEnabled) {live.delete(socket.id); review.forget(socket.id);}
    });
    socket.on('diagnostics:retry',peer=>{
      if(users.has(socket.id) && socket.data.diagnosticsEnabled && users.has(peer) && allow(socket,'diag-retry',12,60000))
        review.remember(socket.id,{at:Date.now(),peer,retry:true});
    });
    socket.on('diagnostics:live', raw => {
      const user = users.get(socket.id);
      if (user && raw?.snapshot && socket.data.diagnosticsEnabled && allow(socket,'diag-live',12,60000)) {
        const data = snapshot(raw.snapshot);
        const at=Date.now();
        if(review.observe(socket.id,data,at)) store.changed();
        review.remember(socket.id,{at,streams:data.streams,peers:data.streams.map((_,i)=>raw.peers?.[i])});
        live.set(socket.id, { nick:user.name, at:Date.now(), snapshot:data,
          peers:data.streams.map((_,i)=>users.get(raw.peers?.[i])?.name || null) });
      }
    });
    socket.on('diagnostics:report', async (msg, ack) => {
      if (typeof ack !== 'function') return;
      const user = users.get(socket.id);
      if (!user || !msg || typeof msg.code !== 'string' || !Object.hasOwn(codes,msg.code) ||
        (msg.code === 'manual' ? msg.confirmed !== true : !socket.data.diagnosticsEnabled))
        return ack({error:'É necessário autorizar o envio.'});
      if (typeof msg.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(msg.id)) return ack({error:'Relato inválido.'});
      if (!allow(socket,'diag-report',8,60000)) return ack({error:'Limite de relatos atingido. Tente em um minuto.'});
      if (!reports.some(r => r.id === msg.id)) {
        const at = Date.now();
        const observedAt=Number.isFinite(msg.at) && msg.at>at-DAY && msg.at<=at ? msg.at : at;
        const data=snapshot(msg.snapshot);
        review.observe(socket.id,data,at);
        reports.push({ serverVersion:version,timeline:review.capture(socket.id,observedAt,samples.history),id:msg.id, at, session:socket.id, nick:user.name, code:msg.code,
          observedAt,
          description:msg.code === 'manual' && typeof msg.description === 'string' ? msg.description.trim().slice(0,600) : '',
          snapshot:data, history:(Array.isArray(msg.history) ? msg.history : []).slice(-6)
            .filter(s => s && Number.isFinite(s.at) && Math.abs(s.at-(msg.at || at))<=60000)
            .map(s => ({at:s.at, snapshot:snapshot(s.snapshot)})) });
        prune(); store.changed();
      }
      ack(await store.flush() ? {ok:true} : {error:'Falha ao salvar o relato.'});
    });
  }
  const groupKey = r => [r.code,r.snapshot.client,r.snapshot.version].join('/');
  function state() {
    const groups = new Map();
    for (const r of reports) {
      const key = groupKey(r);
      if (!groups.has(key)) groups.set(key,{ key, code:r.code, client:r.snapshot.client, version:r.snapshot.version, first:r.at, sessions:new Set(), count:0 });
      const g = groups.get(key); g.count++; g.last=r.at; g.sessions.add(r.session);
    }
    return { ...review.state(reports), system:samples.history, retention, live:[...live.values()].filter(s => s.at > Date.now()-30000),
      groups:[...groups.values()].reverse().map(g=>({...g,sessions:g.sessions.size})).sort((a,b)=>b.last-a.last) };
  }
  return { attach, state, packet:id=>review.packet(reports.find(r=>r.id===id)),
    async track(key,status,fixed){if(!review.track(reports.find(r=>groupKey(r)===key),status,fixed)) return false; store.changed();return store.flush();}, forget(socket) { review.forget(socket.id); live.delete(socket.id); socket.data.diagnosticsEnabled=false; },
    details: key => reports.filter(r=>groupKey(r)===key).slice(-20).reverse().map(({session,...r})=>({...r,timeline:review.packet(r).timeline})),
    async configure(days) { if (![1,7,30].includes(days)) return false; retention=days; prune(); store.changed(); return store.flush(); },
    async clear() { reports=[]; review.clear(); store.changed(); return store.flush(); },
    close() { clearInterval(timer); samples.close(); return store.close(); } };
}
module.exports = { createDiagnostics };
