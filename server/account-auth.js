// Contas (opcional, ACCOUNTS=on): entrar na sala com nick e senha, pelo socket (auth:*),
// e as operações do painel /admin sobre as contas. Sem ACCOUNTS=on nada disso existe e
// a sala é só com nick (e o painel /admin abre com o ADMIN_PASSWORD).
//
// Só o dono (a conta Admin) marca "Conta com administração" e mexe nessas contas. As outras contas com administração criam e mexem só em contas normais
// (e renomeiam a própria), pra ninguém sair criando administradores.

function createAccountAuth({ io, accounts, users, removeUser, logEvent = () => {}, allow, clientAddress, onChanged = () => {} }) {
  const accountOf = (socket) => socket.data.account || null;
  const socketsOf = (id) => [...io.sockets.sockets.values()].filter((s) => s.data.account && s.data.account.id === id);
  // A própria pessoa vê também a chave do OBS dela.
  const selfInfo = (account) => ({ ...account, obsKey: accounts.obsKeyOf(account.id) });
  // Conta normal: sem administração e não é a do dono.
  const plain = (account) => !account.root && !account.admin;
  const canManage = (by, target) => Boolean(by.root) || plain(target);
  const OWNER_ONLY = 'Só o dono do servidor (a conta Admin) mexe em contas com administração.';
  const reply = (ack) => (typeof ack === 'function' ? ack : () => {});
  const str = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');

  function setAccount(socket, account, token) {
    socket.data.account = account || null;
    if (token !== undefined) socket.data.token = token || null;
  }

  // A conta mudou (administração, nick) ou acabou (apagada, senha resetada): avisa
  // quem está com ela aberta. kick: a sessão não vale mais (volta pra tela de entrada).
  function refreshAccount(id, { kick = false, reason = '' } = {}) {
    const account = accounts.get(id);
    for (const s of socketsOf(id)) {
      if (!account || kick) {
        removeUser(s);
        setAccount(s, null, null);
        s.emit('auth:expired', { reason });
        continue;
      }
      setAccount(s, account);
      const user = users.get(s.id);
      if (user) user.admin = account.admin;
      s.emit('auth:account', selfInfo(account));
    }
    onChanged();
  }

  function attach(socket) {
    const address = clientAddress(socket);

    socket.on('auth:login', async (msg, ack) => {
      const done = reply(ack);
      if (!allow(socket, 'login', 10, 60000)) return done({ error: 'Muitas tentativas. Espere um pouco.' });
      const res = await accounts.login(str(msg && msg.nick, 100), str(msg && msg.password), address);
      if (!res.ok) return done({ error: res.error });
      setAccount(socket, res.account, res.token);
      logEvent(`${res.account.nick} entrou na conta (${address})`);
      done({ ok: true, token: res.token, account: selfInfo(res.account) });
    });

    socket.on('auth:resume', (msg, ack) => {
      const done = reply(ack);
      const token = str(msg && msg.token, 100);
      const account = accounts.resume(token);
      if (!account) return done({ error: 'Sessão expirada: entre de novo.' });
      setAccount(socket, account, token);
      done({ ok: true, account: selfInfo(account) });
    });

    socket.on('auth:password', async (msg, ack) => {
      const done = reply(ack);
      const account = accountOf(socket);
      if (!account) return done({ error: 'Entre com a sua conta.' });
      if (!allow(socket, 'password', 8, 60000)) return done({ error: 'Muitas tentativas. Espere um pouco.' });
      const res = await accounts.changePassword(account.id, { current: str(msg && msg.current), next: str(msg && msg.next, 400), keepToken: socket.data.token });
      if (!res.ok) return done({ error: res.error });
      // As outras sessões dessa conta caíram (a senha mudou).
      for (const s of socketsOf(account.id)) {
        if (s === socket) continue;
        removeUser(s);
        setAccount(s, null, null);
        s.emit('auth:expired', { reason: 'A senha da sua conta foi trocada.' });
      }
      setAccount(socket, res.account);
      logEvent(`${res.account.nick} trocou a senha`);
      done({ ok: true, account: selfInfo(res.account) });
    });

    socket.on('auth:nick', (msg, ack) => {
      const done = reply(ack);
      const account = accountOf(socket);
      if (!account) return done({ error: 'Entre com a sua conta.' });
      if (!allow(socket, 'nick', 10, 60000)) return done({ error: 'Calma aí: muitas trocas seguidas.' });
      const before = account.nick;
      const res = accounts.rename(account.id, msg && msg.nick);
      if (!res.ok) return done({ error: res.error });
      for (const s of socketsOf(account.id)) setAccount(s, res.account);
      if (res.account.nick !== before) logEvent(`${before} agora se chama ${res.account.nick}`);
      onChanged();
      done({ ok: true, account: selfInfo(res.account) });
    });

    socket.on('auth:logout', (ack) => {
      accounts.logout(socket.data.token);
      removeUser(socket);
      setAccount(socket, null, null);
      reply(ack)({ ok: true });
    });
  }

  // ---------- o painel /admin (by: a conta com administração que está mexendo) ----------

  function list() {
    const online = new Set([...users.values()].map((u) => u.account).filter(Boolean));
    return accounts.list().map((a) => ({ ...a, online: online.has(a.id) }));
  }

  async function create(by, msg) {
    const admin = msg.admin === true;
    if (admin && !by.root) return { error: 'Só o dono do servidor cria contas com administração.' };
    const res = await accounts.create({ nick: msg.nick, password: str(msg.password, 400), admin });
    if (!res.ok) return res;
    logEvent(`${by.nick} criou a conta ${res.account.nick}${res.account.admin ? ' (com administração)' : ''}`);
    onChanged();
    return res;
  }

  async function update(by, msg) {
    const target = accounts.get(str(msg.id, 40));
    if (!target) return { error: 'Essa conta não existe mais.' };
    if (!canManage(by, target)) return { error: OWNER_ONLY };
    const patch = {};
    if (typeof msg.admin === 'boolean') {
      if (!by.root) return { error: OWNER_ONLY };
      if (target.id === by.id && !msg.admin) return { error: 'Você não pode tirar a sua própria administração.' };
      patch.admin = msg.admin;
    }
    if (typeof msg.password === 'string') patch.password = str(msg.password, 400);
    const res = await accounts.update(target.id, patch);
    if (!res.ok) return res;
    if (patch.password !== undefined) {
      logEvent(`${by.nick} deu uma senha nova pra ${target.nick}`);
      refreshAccount(target.id, { kick: target.id !== by.id, reason: 'O administrador deu uma senha nova pra sua conta.' });
    } else {
      if (patch.admin !== undefined) logEvent(`${by.nick} ${patch.admin ? 'deu' : 'tirou'} a administração de ${target.nick}`);
      refreshAccount(target.id);
    }
    return res;
  }

  function rename(by, msg) {
    const target = accounts.get(str(msg.id, 40));
    if (!target) return { error: 'Essa conta não existe mais.' };
    if (target.id !== by.id && !canManage(by, target)) return { error: OWNER_ONLY };
    const res = accounts.rename(target.id, msg.nick);
    if (!res.ok) return res;
    if (res.account.nick !== target.nick) logEvent(`${by.nick} mudou o nick de ${target.nick} pra ${res.account.nick}`);
    refreshAccount(target.id);
    return res;
  }

  function remove(by, msg) {
    const target = accounts.get(str(msg.id, 40));
    if (!target) return { error: 'Essa conta não existe mais.' };
    if (target.id === by.id) return { error: 'Você não pode apagar a sua própria conta.' };
    if (!canManage(by, target)) return { error: OWNER_ONLY };
    const res = accounts.remove(target.id);
    if (!res.ok) return res;
    logEvent(`${by.nick} apagou a conta ${target.nick}`);
    refreshAccount(target.id, { kick: true, reason: 'A sua conta foi apagada pelo administrador.' });
    return res;
  }

  // A própria senha, pelo painel (as sessões da sala dessa conta caem, a do painel fica).
  async function password(by, msg) {
    const res = await accounts.changePassword(by.id, { current: str(msg.current), next: str(msg.next, 400) });
    if (!res.ok) return res;
    for (const s of socketsOf(by.id)) {
      removeUser(s);
      setAccount(s, null, null);
      s.emit('auth:expired', { reason: 'A senha da sua conta foi trocada.' });
    }
    logEvent(`${by.nick} trocou a senha`);
    return { ok: true };
  }

  return { attach, accountOf, refreshAccount, list, create, update, rename, remove, password };
}

module.exports = { createAccountAuth };
