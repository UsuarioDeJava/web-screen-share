// Entrar com conta (auth:*) e o painel de administração (admin:*), pelo socket da sala.
// Quem abre o painel: a conta Admin (que só faz isso) e as contas marcadas com
// administração (que também entram na sala normalmente).
//
// Só o dono (a conta Admin) marca "Conta com administração" e "Usuário de testes" e mexe
// nessas contas. As outras contas com administração criam e mexem só em contas normais
// (e renomeiam a própria), pra ninguém sair criando administradores.
const ADMINS = 'admins'; // sockets com administração: recebem os avisos de mudança

function createAdmin({ io, accounts, config, users, removeUser, clearChat, onSettings = () => {}, onChanged = () => {}, logEvent = () => {}, allow, clientAddress, version = 'dev', obsAvailable = false }) {
  const startedAt = Date.now();
  const accountOf = (socket) => socket.data.account || null;
  const isAdmin = (socket) => Boolean(accountOf(socket) && accountOf(socket).admin);
  const socketsOf = (id) => [...io.sockets.sockets.values()].filter((s) => s.data.account && s.data.account.id === id);
  // A própria pessoa vê também a chave do OBS dela.
  const selfInfo = (account) => ({ ...account, obsKey: accounts.obsKeyOf(account.id) });
  // Conta normal: sem administração, não é de testes nem a do dono.
  const plain = (account) => !account.root && !account.admin && !account.tester;
  const canManage = (by, target) => Boolean(by.root) || plain(target);
  const OWNER_ONLY = 'Só o dono do servidor (a conta Admin) mexe em contas com administração ou de testes.';

  function setAccount(socket, account, token) {
    socket.data.account = account || null;
    if (token !== undefined) socket.data.token = token || null;
    if (account && account.admin) socket.join(ADMINS);
    else socket.leave(ADMINS);
  }

  // O painel aberto atualiza sozinho (de leve: várias mudanças juntas viram um aviso).
  let changedTimer = null;
  function changed() {
    if (changedTimer) return;
    changedTimer = setTimeout(() => {
      changedTimer = null;
      io.to(ADMINS).emit('admin:changed');
      onChanged();
    }, 200);
  }

  // A conta mudou (administração, nick) ou acabou (apagada, senha resetada): avisa quem
  // está com ela aberta. kick: a sessão não vale mais (volta pra tela de entrada).
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
      if (user) {
        user.admin = account.admin;
        user.tester = account.tester;
      }
      s.emit('auth:account', selfInfo(account));
    }
    changed();
  }

  function state() {
    const onlineAccounts = new Set([...users.values()].map((u) => u.account).filter(Boolean));
    return {
      settings: config.get(),
      accounts: accounts.list().map((a) => ({ ...a, online: onlineAccounts.has(a.id) })),
      online: [...users.values()].map((u) => ({ id: u.id, name: u.name, sharing: Boolean(u.sharing), voice: Boolean(u.voice), admin: Boolean(u.admin), tester: Boolean(u.tester), since: u.joinedAt || null })),
      server: { version, startedAt, obs: obsAvailable },
    };
  }

  const reply = (ack) => (typeof ack === 'function' ? ack : () => {});
  const str = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');

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
      changed();
      done({ ok: true, account: selfInfo(res.account) });
    });

    socket.on('auth:logout', (ack) => {
      accounts.logout(socket.data.token);
      removeUser(socket);
      setAccount(socket, null, null);
      reply(ack)({ ok: true });
    });

    // ---------- painel ----------

    const guard = (handler) => async (msg, ack) => {
      const done = reply(typeof msg === 'function' ? msg : ack);
      // Confere a conta de novo (pode ter perdido a administração agora há pouco).
      const account = accountOf(socket) && accounts.get(accountOf(socket).id);
      if (!account || !account.admin) return done({ error: 'Só contas com administração.' });
      if (!allow(socket, 'admin', 40, 10000)) return done({ error: 'Calma aí: muitas ações seguidas.' });
      try {
        done(await handler(typeof msg === 'function' ? {} : (msg || {}), account));
      } catch (err) {
        logEvent(`ERRO no painel: ${err.message}`);
        done({ error: 'Não deu certo. Tente de novo.' });
      }
    };

    socket.on('admin:state', guard(() => ({ ok: true, ...state() })));

    socket.on('admin:settings', guard((msg, by) => {
      const res = config.set(msg.settings);
      if (!res.ok) return res;
      if (Object.keys(res.changed).length) {
        logEvent(`${by.nick} mudou as configurações da sala: ${Object.keys(res.changed).join(', ')}`);
        onSettings(res.changed, res.settings);
        changed();
      }
      return { ok: true, settings: res.settings };
    }));

    socket.on('admin:account-create', guard(async (msg, by) => {
      const admin = msg.admin === true;
      const tester = msg.tester === true;
      if ((admin || tester) && !by.root) return { error: 'Só o dono do servidor cria contas com administração ou de testes.' };
      const res = await accounts.create({ nick: msg.nick, password: str(msg.password, 400), admin, tester });
      if (!res.ok) return res;
      const marks = [res.account.admin && 'com administração', res.account.tester && 'de testes'].filter(Boolean);
      logEvent(`${by.nick} criou a conta ${res.account.nick}${marks.length ? ` (${marks.join(', ')})` : ''}`);
      changed();
      return res;
    }));

    socket.on('admin:account-update', guard(async (msg, by) => {
      const target = accounts.get(str(msg.id, 40));
      if (!target) return { error: 'Essa conta não existe mais.' };
      if (!canManage(by, target)) return { error: OWNER_ONLY };
      const patch = {};
      if (typeof msg.admin === 'boolean') {
        if (!by.root) return { error: OWNER_ONLY };
        if (target.id === by.id && !msg.admin) return { error: 'Você não pode tirar a sua própria administração.' };
        patch.admin = msg.admin;
      }
      if (typeof msg.tester === 'boolean') {
        if (!by.root) return { error: OWNER_ONLY };
        patch.tester = msg.tester;
      }
      if (typeof msg.password === 'string') patch.password = str(msg.password, 400);
      const res = await accounts.update(target.id, patch);
      if (!res.ok) return res;
      if (patch.password !== undefined) {
        logEvent(`${by.nick} deu uma senha nova pra ${target.nick}`);
        refreshAccount(target.id, { kick: target.id !== by.id, reason: 'O administrador deu uma senha nova pra sua conta.' });
      } else {
        if (patch.admin !== undefined) logEvent(`${by.nick} ${patch.admin ? 'deu' : 'tirou'} a administração de ${target.nick}`);
        if (patch.tester !== undefined) logEvent(`${by.nick} ${patch.tester ? 'marcou' : 'desmarcou'} ${target.nick} como usuário de testes`);
        refreshAccount(target.id);
      }
      return res;
    }));

    socket.on('admin:account-rename', guard((msg, by) => {
      const target = accounts.get(str(msg.id, 40));
      if (!target) return { error: 'Essa conta não existe mais.' };
      if (target.id !== by.id && !canManage(by, target)) return { error: OWNER_ONLY };
      const res = accounts.rename(target.id, msg.nick);
      if (!res.ok) return res;
      if (res.account.nick !== target.nick) logEvent(`${by.nick} mudou o nick de ${target.nick} pra ${res.account.nick}`);
      refreshAccount(target.id);
      return res;
    }));

    socket.on('admin:account-delete', guard((msg, by) => {
      const target = accounts.get(str(msg.id, 40));
      if (!target) return { error: 'Essa conta não existe mais.' };
      if (target.id === by.id) return { error: 'Você não pode apagar a sua própria conta.' };
      if (!canManage(by, target)) return { error: OWNER_ONLY };
      const res = accounts.remove(target.id);
      if (!res.ok) return res;
      logEvent(`${by.nick} apagou a conta ${target.nick}`);
      refreshAccount(target.id, { kick: true, reason: 'A sua conta foi apagada pelo administrador.' });
      return res;
    }));

    socket.on('admin:kick', guard((msg, by) => {
      const target = io.sockets.sockets.get(str(msg.id, 40));
      const user = target && users.get(target.id);
      if (!user) return { error: 'Essa pessoa já saiu.' };
      logEvent(`${by.nick} desconectou ${user.name} da sala`);
      removeUser(target);
      target.emit('room:kicked', { by: by.nick });
      changed();
      return { ok: true };
    }));

    socket.on('admin:chat-clear', guard((msg, by) => {
      clearChat();
      logEvent(`${by.nick} apagou o histórico do chat`);
      return { ok: true };
    }));
  }

  return { attach, accountOf, isAdmin, changed, refreshAccount, state };
}

module.exports = { createAdmin, ADMINS };
