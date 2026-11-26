const express = require('express');
const path = require('node:path');
const { createAdminSessions } = require('./admin-sessions');

function createAdmin({ router, password, io, users, config, diagnostics, removeUser, clearChat, onSettings, logEvent, version, obsAvailable, checkServices, guided }) {
  let services=null, pendingCheck=null;
  const startedAt = Date.now();
  const sessions = createAdminSessions({
    password,
    secure: process.env.ROOM_COOKIE_SECURE !== '0',
  });
  router.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' });
    next();
  });
  router.get('/', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
  router.use('/api', (req, res, next) => {
    if (!sessions.enabled) return res.status(503).json({ error: 'Defina ADMIN_PASSWORD no servidor para habilitar o painel.' });
    // Requisições de outro site não conseguem enviar JSON com esse cabeçalho sem CORS.
    if (req.method !== 'GET' && (!req.is('application/json') || req.get('X-WSS-Admin') !== '1'))
      return res.status(403).json({ error: 'Requisição inválida.' });
    next();
  }, express.json({ limit: '4kb' }));
  router.post('/api/login', (req, res) => {
    const key = req.body?.password;
    const result = sessions.authenticate({ key, address: req.socket.remoteAddress, cookie: req.headers.cookie });
    if (result.cookie) res.set('Set-Cookie', result.cookie);
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
    res.status(result.status).json(result.ok ? { ok: true } : {
      error: result.status === 429 ? 'Muitas tentativas. Aguarde para tentar novamente.' :
        result.status === 401 ? 'Senha incorreta.' : 'Painel temporariamente indisponível.',
    });
  });
  router.use('/api', (req, res, next) => {
    if (!sessions.valid(req.headers.cookie)) return res.status(401).json({ error: 'Entre com a senha do painel.' });
    next();
  });
  router.post('/api/logout', (req, res) => res.set('Set-Cookie', sessions.logout(req.headers.cookie)).json({ ok: true }));
  router.get('/api/state', (_req, res) => res.json({
    settings: config.get(), changes:config.history?.(), services, guided:guided?.state(),
    diagnostics: diagnostics?.state(),
    online: [...users.values()].map(({ id, name, sharing, voice, joinedAt }) => ({ id, name, sharing, voice: Boolean(voice), since: joinedAt })),
    server: { startedAt, version, obs: obsAvailable },
  }));
  router.post('/api/services',async(req,res)=>{
    const relay=['respondeu','sem confirmação'].includes(req.body?.relay)?req.body.relay:'indisponível';
    pendingCheck ||= checkServices().then(data=>services={at:Date.now(),relay,...data}).finally(()=>pendingCheck=null);
    res.json(await pendingCheck);
  });
  router.post('/api/guided',(req,res)=>res.json(guided.start(req.body?.sender,req.body?.viewer)));
  router.post('/api/settings-undo',(req,res)=>{
    const result=config.undo(req.body?.id);
    if(result.ok) onSettings(result.changed);
    res.json(result);
  });
  router.post('/api/report-export',(req,res)=>res.json(diagnostics.packet(req.body?.id) || {error:'Relato indisponível.'}));
  router.post('/api/report-track',async(req,res)=>res.json(await diagnostics.track(req.body?.key,req.body?.status,req.body?.fixed) ? {ok:true} : {error:'Confira a versão e o grupo.'}));
  router.post('/api/report-details', (req,res) => res.json({ reports: diagnostics.details(req.body?.key) }));
  router.post('/api/report-retention', async (req,res) => res.json(await diagnostics.configure(req.body?.days)
    ? { ok:true } : { error:'Não foi possível salvar a retenção.' }));
  router.post('/api/report-clear', async (_req,res) => res.json(await diagnostics.clear()
    ? { ok:true } : { error:'Não foi possível apagar os relatos.' }));
  router.post('/api/settings', (req, res) => {
    const result = config.set(req.body?.settings);
    if (!result.ok) return res.status(400).json(result);
    if (Object.keys(result.changed).length) {
      onSettings(result.changed);
      logEvent('Administração atualizou as configurações da sala.');
    }
    res.json({ ok: true });
  });
  router.post('/api/kick', (req, res) => {
    const target = io.sockets.sockets.get(req.body?.id);
    if (!target || !users.has(target.id)) return res.status(404).json({ error: 'Essa pessoa já saiu.' });
    logEvent(`Administração desconectou ${users.get(target.id).name} da sala.`);
    removeUser(target);
    target.emit('room:kicked', { by: 'administração' });
    res.json({ ok: true });
  });
  router.post('/api/chat-clear', (_req, res) => {
    clearChat();
    logEvent('Administração apagou o histórico do chat.');
    res.json({ ok: true });
  });
}
module.exports = { createAdmin };
