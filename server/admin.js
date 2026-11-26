const express = require('express');
const path = require('node:path');
const { createAdminSessions } = require('./admin-sessions');

// accounts/accountAuth (só com ACCOUNTS=on): o painel abre com o nick e a senha de uma conta
// com administração (no lugar do ADMIN_PASSWORD) e ganha as contas.
function createAdmin({ router, password, io, users, config, diagnostics, removeUser, clearChat, onSettings, logEvent, version, obsAvailable, checkServices, guided,
  accounts = null, accountAuth = null }) {
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
  const enabled = Boolean(accounts) || sessions.enabled;
  // A página pergunta antes do login: contas (nick e senha) ou a senha do painel.
  router.get('/api/mode', (_req, res) => res.json({ accounts: Boolean(accounts), enabled }));
  router.use('/api', (req, res, next) => {
    if (!enabled) return res.status(503).json({ error: 'Defina ADMIN_PASSWORD no servidor para habilitar o painel.' });
    // Requisições de outro site não conseguem enviar JSON com esse cabeçalho sem CORS.
    if (req.method !== 'GET' && (!req.is('application/json') || req.get('X-WSS-Admin') !== '1'))
      return res.status(403).json({ error: 'Requisição inválida.' });
    next();
  }, express.json({ limit: '4kb' }));
  // Com contas: a sessão do painel é da conta (só as com administração entram).
  const sendSession = (res, result) => {
    if (result.cookie) res.set('Set-Cookie', result.cookie);
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
    res.status(result.status).json(result.ok ? { ok: true } : {
      error: result.status === 429 ? 'Muitas tentativas. Aguarde para tentar novamente.' : 'Painel temporariamente indisponível.' });
  };
  const startFor = (req, account) => sessions.start({ subject: account.id, address: req.socket.remoteAddress, cookie: req.headers.cookie });
  const NOT_ADMIN = 'Essa conta não abre a administração.';
  router.post('/api/login', async (req, res, next) => {
    if (!accounts) return next();
    const str = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
    // A sessão da sala (mesmo navegador): entra direto, sem digitar de novo.
    if (req.body?.session) {
      const account = accounts.resume(str(req.body.session, 100));
      if (!account || account.mustChange) return res.status(401).json({ error: 'Entre com o seu nick e a sua senha.' });
      if (!account.admin) return res.status(403).json({ error: NOT_ADMIN });
      return sendSession(res, startFor(req, account));
    }
    const result = await accounts.login(str(req.body?.nick, 100), str(req.body?.password, 200), req.socket.remoteAddress);
    if (!result.ok) return res.status(401).json({ error: result.error });
    if (!result.account.admin) { accounts.logout(result.token); return res.status(403).json({ error: NOT_ADMIN }); }
    // Primeiro acesso (senha provisória): cria a senha antes de abrir o painel.
    if (result.account.mustChange) return res.json({ mustChange: true, ticket: result.token, nick: result.account.nick });
    accounts.logout(result.token);
    logEvent(`${result.account.nick} abriu a administração`);
    sendSession(res, startFor(req, result.account));
  });
  router.post('/api/new-password', async (req, res) => {
    if (!accounts) return res.status(404).json({ error: 'Sem contas neste servidor.' });
    const ticket = typeof req.body?.ticket === 'string' ? req.body.ticket.slice(0, 100) : '';
    const account = accounts.resume(ticket);
    if (!account || !account.admin) return res.status(401).json({ error: 'Entre de novo com o seu nick e a senha provisória.' });
    const result = await accounts.changePassword(account.id, { next: typeof req.body?.next === 'string' ? req.body.next.slice(0, 400) : '' });
    if (!result.ok) return res.status(400).json({ error: result.error });
    logEvent(`${account.nick} criou a senha e abriu a administração`);
    sendSession(res, startFor(req, result.account));
  });
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
    if (!sessions.valid(req.headers.cookie)) return res.status(401).json({ error: accounts ? 'Entre com a sua conta.' : 'Entre com a senha do painel.' });
    if (accounts) {
      // Confere a conta de novo a cada ação (pode ter perdido a administração agora há pouco).
      const subject = sessions.subject(req.headers.cookie);
      const by = subject && accounts.get(subject);
      if (!by || !by.admin) {
        if (subject) sessions.revokeSubject(subject);
        return res.status(401).json({ error: 'Entre com a sua conta.' });
      }
      req.by = by;
    }
    next();
  });
  const who = (req) => (req.by ? req.by.nick : 'Administração');
  router.post('/api/logout', (req, res) => res.set('Set-Cookie', sessions.logout(req.headers.cookie)).json({ ok: true }));
  router.get('/api/state', (req, res) => res.json({
    settings: config.get(), changes:config.history?.(), services, guided:guided?.state(),
    diagnostics: diagnostics?.state(),
    online: [...users.values()].map(({ id, name, sharing, voice, joinedAt, admin, tester }) => ({ id, name, sharing, voice: Boolean(voice), since: joinedAt,
      admin: Boolean(admin), tester: Boolean(tester) })),
    server: { startedAt, version, obs: obsAvailable },
    ...(accounts ? { accounts: accountAuth.list(), me: { id: req.by.id, nick: req.by.nick, root: Boolean(req.by.root) } } : {}),
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
      logEvent(`${who(req)} atualizou as configurações da sala.`);
    }
    res.json({ ok: true });
  });
  router.post('/api/kick', (req, res) => {
    const target = io.sockets.sockets.get(req.body?.id);
    if (!target || !users.has(target.id)) return res.status(404).json({ error: 'Essa pessoa já saiu.' });
    logEvent(`${who(req)} desconectou ${users.get(target.id).name} da sala.`);
    removeUser(target);
    target.emit('room:kicked', { by: req.by ? req.by.nick : 'administração' });
    res.json({ ok: true });
  });
  router.post('/api/chat-clear', (req, res) => {
    clearChat();
    logEvent(`${who(req)} apagou o histórico do chat.`);
    res.json({ ok: true });
  });

  // ---------- contas (ACCOUNTS=on) ----------
  if (accounts) {
    const accountRoute = (name, handler) => router.post(`/api/${name}`, async (req, res) => {
      try {
        const result = await handler(req.by, req.body || {});
        res.status(result && result.error ? 400 : 200).json(result || { ok: true });
      } catch (err) {
        logEvent(`ERRO no painel: ${err.message}`);
        res.status(500).json({ error: 'Não deu certo. Tente de novo.' });
      }
    });
    accountRoute('account-create', (by, msg) => accountAuth.create(by, msg));
    accountRoute('account-update', async (by, msg) => {
      const result = await accountAuth.update(by, msg);
      // Perdeu a administração ou ganhou senha nova: as sessões dela no painel acabam.
      if (result.ok && (msg.admin === false || typeof msg.password === 'string') && msg.id !== by.id) sessions.revokeSubject(msg.id);
      return result;
    });
    accountRoute('account-rename', (by, msg) => accountAuth.rename(by, msg));
    accountRoute('account-delete', (by, msg) => {
      const result = accountAuth.remove(by, msg);
      if (result.ok) sessions.revokeSubject(msg.id);
      return result;
    });
    accountRoute('password', (by, msg) => accountAuth.password(by, msg));
  }
}
module.exports = { createAdmin };
