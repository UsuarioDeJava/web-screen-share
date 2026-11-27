// Contas da sala: só entra quem tem conta, criada pelo dono do servidor no painel de
// administração. Fica tudo num arquivo (accounts.json, na pasta de dados): as contas
// (nick, senha guardada como scrypt com sal, se tem administração) e as
// sessões abertas (só o hash do token: o token mesmo fica só no navegador/app da pessoa).
//
// A conta "Admin" (root) é criada na primeira vez, com uma senha aleatória que aparece no
// log do servidor/container. Ela só abre o painel: não entra na sala.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_NAME_LENGTH = 24;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 200;
const SESSION_TTL_MS = 60 * 24 * 3600 * 1000; // sessão sem uso há 60 dias: expira
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_TRIES = 10; // por endereço, a cada 5 min
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

const cleanNick = (raw) => (typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '');
// Nick repetido não pode: "Ana", "ana" e "ＡＮＡ" são o mesmo.
const nickKey = (nick) => cleanNick(nick).normalize('NFKC').toLocaleLowerCase('pt-BR');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const newId = () => `a_${crypto.randomBytes(8).toString('hex')}`;
const newSecret = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
// Senha pra dar pra alguém (Admin e "Gerar senha" no painel): fácil de ler e digitar.
function readablePassword(length = 12) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const key = await scrypt(password, Buffer.from(salt, 'base64'));
  const expected = Buffer.from(hash, 'base64');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `A senha precisa de pelo menos ${MIN_PASSWORD} caracteres.`;
  if (password.length > MAX_PASSWORD) return 'Senha grande demais.';
  return null;
}

function createAccounts({ file, log = console.log, now = Date.now } = {}) {
  let accounts = []; // { id, nick, password, admin, root, mustChange, obsKey, createdAt }
  let sessions = []; // { hash, account, createdAt, seenAt }
  let saveTimer = null;
  const tries = new Map(); // endereço -> [horários]
  const dummyHash = hashPassword(newSecret()); // pra nick que não existe levar o mesmo tempo

  function load() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      accounts = Array.isArray(data.accounts) ? data.accounts.filter((a) => a && a.id && cleanNick(a.nick) && a.password) : [];
      sessions = Array.isArray(data.sessions) ? data.sessions.filter((s) => s && s.hash && s.account) : [];
    } catch (err) {
      if (err.code !== 'ENOENT') log(`AVISO: não deu pra ler as contas (${err.message}).`);
    }
    for (const a of accounts) {
      if (!a.obsKey) a.obsKey = newSecret(18);
      delete a.tester; // o "Usuário de testes" saiu: a marca antiga some do arquivo
    }
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ accounts, sessions }, null, 1), { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch (err) {
      log(`AVISO: não deu pra salvar as contas (${err.message}).`);
    }
  }
  const saveSoon = () => { if (!saveTimer) saveTimer = setTimeout(saveNow, 1000); };

  const byId = (id) => accounts.find((a) => a.id === id) || null;
  const byNick = (nick) => {
    const key = nickKey(nick);
    return key ? accounts.find((a) => nickKey(a.nick) === key) || null : null;
  };
  const publicAccount = (a) => ({ id: a.id, nick: a.nick, admin: Boolean(a.admin || a.root), root: Boolean(a.root), mustChange: Boolean(a.mustChange), createdAt: a.createdAt });
  function nickProblem(nick, except = null) {
    const clean = cleanNick(nick);
    if (!clean) return 'Escolha um nick.';
    const other = byNick(clean);
    if (other && other.id !== except) return 'Já existe uma conta com esse nick.';
    return null;
  }

  // A conta Admin: criada na primeira vez (ou com senha nova, se reset). Mostra a senha
  // no log uma vez só.
  async function ensureRoot({ reset = false } = {}) {
    let root = accounts.find((a) => a.root);
    if (root && !reset) return null;
    const password = readablePassword();
    if (!root) {
      let nick = 'Admin';
      for (let i = 2; byNick(nick); i += 1) nick = `Admin${i}`;
      root = { id: newId(), nick, root: true, admin: true, createdAt: now(), obsKey: newSecret(18) };
      accounts.unshift(root);
    }
    root.password = await hashPassword(password);
    root.mustChange = true;
    revokeSessions(root.id);
    saveNow();
    const line = '='.repeat(64);
    log(line);
    log(`Conta de administração ${reset ? 'com senha nova' : 'criada'}: nick "${root.nick}", senha: ${password}`);
    log('Entre com ela em /admin (ou na página da sala) pra abrir a administração (no');
    log('primeiro acesso ela pede uma senha sua). Esta senha não aparece de novo: guarde ou troque.');
    log(line);
    return { nick: root.nick, password };
  }

  async function create({ nick, password, admin = false }) {
    const problem = nickProblem(nick) || passwordProblem(password);
    if (problem) return { error: problem };
    const account = { id: newId(), nick: cleanNick(nick), password: await hashPassword(password), admin: Boolean(admin), mustChange: true, createdAt: now(), obsKey: newSecret(18) };
    if (nickProblem(account.nick)) return { error: 'Já existe uma conta com esse nick.' }; // criada no meio
    accounts.push(account);
    saveNow();
    return { ok: true, account: publicAccount(account) };
  }

  // O painel muda: administração e senha (a nova vale como provisória: no
  // próximo acesso ela pede outra). A conta Admin não perde nada. Quem pode mudar o quê,
  // o admin.js decide.
  async function update(id, { admin, password } = {}) {
    const account = byId(id);
    if (!account) return { error: 'Essa conta não existe mais.' };
    if (password !== undefined) {
      const problem = passwordProblem(password);
      if (problem) return { error: problem };
      account.password = await hashPassword(password);
      account.mustChange = true;
      revokeSessions(id);
    }
    if (admin !== undefined && !account.root) account.admin = Boolean(admin);
    saveNow();
    return { ok: true, account: publicAccount(account) };
  }

  function remove(id) {
    const account = byId(id);
    if (!account) return { error: 'Essa conta não existe mais.' };
    if (account.root) return { error: 'A conta Admin não pode ser apagada.' };
    accounts = accounts.filter((a) => a !== account);
    revokeSessions(id);
    saveNow();
    return { ok: true };
  }

  function rename(id, nick) {
    const account = byId(id);
    if (!account) return { error: 'Essa conta não existe mais.' };
    const problem = nickProblem(nick, id);
    if (problem) return { error: problem };
    account.nick = cleanNick(nick);
    saveNow();
    return { ok: true, account: publicAccount(account) };
  }

  // A própria pessoa troca a senha (com a atual, menos no primeiro acesso, quando a atual
  // é a provisória que ela acabou de usar). As outras sessões dela caem.
  async function changePassword(id, { current, next, keepToken = null }) {
    const account = byId(id);
    if (!account) return { error: 'Essa conta não existe mais.' };
    if (!account.mustChange && !(await checkPassword(String(current || ''), account.password))) return { error: 'A senha atual não confere.' };
    const problem = passwordProblem(next);
    if (problem) return { error: problem };
    if (await checkPassword(next, account.password)) return { error: 'A senha nova precisa ser diferente da atual.' };
    account.password = await hashPassword(next);
    account.mustChange = false;
    revokeSessions(id, keepToken);
    saveNow();
    return { ok: true, account: publicAccount(account) };
  }

  // Muitas tentativas de um mesmo endereço: espera uns minutos.
  function tooMany(address) {
    const t = now();
    const recent = (tries.get(address) || []).filter((at) => t - at < LOGIN_WINDOW_MS);
    tries.set(address, recent);
    return recent.length >= LOGIN_MAX_TRIES;
  }
  async function login(nick, password, address = '') {
    if (tooMany(address)) return { error: 'Muitas tentativas. Espere uns minutos e tente de novo.' };
    tries.get(address).push(now());
    const account = byNick(nick);
    const ok = account
      ? await checkPassword(String(password || ''), account.password)
      : (await checkPassword(String(password || ''), await dummyHash), false);
    if (!ok) return { error: 'Nick ou senha errados.' };
    tries.delete(address);
    const token = newSecret();
    sessions.push({ hash: sha256(token), account: account.id, createdAt: now(), seenAt: now() });
    saveSoon();
    return { ok: true, token, account: publicAccount(account) };
  }

  // A sessão do token (null se não vale mais). Marca o uso (pra expirar só as paradas).
  function resume(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const hash = sha256(token);
    const session = sessions.find((s) => s.hash === hash);
    if (!session) return null;
    const account = byId(session.account);
    if (!account || now() - session.seenAt > SESSION_TTL_MS) {
      sessions = sessions.filter((s) => s !== session);
      saveSoon();
      return null;
    }
    if (now() - session.seenAt > 3600000) { session.seenAt = now(); saveSoon(); }
    return publicAccount(account);
  }
  function logout(token) {
    if (typeof token !== 'string') return;
    const hash = sha256(token);
    const before = sessions.length;
    sessions = sessions.filter((s) => s.hash !== hash);
    if (sessions.length !== before) saveSoon();
  }
  function revokeSessions(id, exceptToken = null) {
    const keep = exceptToken ? sha256(exceptToken) : null;
    sessions = sessions.filter((s) => s.account !== id || s.hash === keep);
  }

  // Chave do OBS (o "Bearer Token" do WHIP): de quem é.
  const obsKeyOf = (id) => (byId(id) || {}).obsKey || null;
  const byObsKey = (key) => {
    if (typeof key !== 'string' || !key) return null;
    const account = accounts.find((a) => a.obsKey && a.obsKey.length === key.length && crypto.timingSafeEqual(Buffer.from(a.obsKey), Buffer.from(key)));
    return account ? publicAccount(account) : null;
  };

  load();
  return {
    ensureRoot, create, update, remove, rename, changePassword, login, resume, logout, revokeSessions,
    list: () => accounts.map(publicAccount),
    get: (id) => { const a = byId(id); return a ? publicAccount(a) : null; },
    byNick: (nick) => { const a = byNick(nick); return a ? publicAccount(a) : null; },
    obsKeyOf, byObsKey, nickProblem, flush: saveNow,
  };
}

module.exports = { createAccounts, cleanNick, nickKey, readablePassword, passwordProblem, MIN_PASSWORD };
