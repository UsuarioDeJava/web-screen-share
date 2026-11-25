// Base de sessões; a integração das rotas/login deve aplicar a mesma instância.
const crypto = require('node:crypto');
const { createCredentialLimiter } = require('./credential-limiter');
function createRoomSessions({ accessKey, accountKeys, secure = true, ttlMs = 8 * 60 * 60 * 1000,
  maxSessions = 1024, maxSockets = 8, now = Date.now, monotonic = () => performance.now(),
  schedule = setTimeout, cancel = clearTimeout, random = crypto.randomBytes } = {}) {
  const shared = accessKey !== undefined && accessKey !== '';
  const individual = accountKeys !== undefined && accountKeys !== '';
  const enabled = shared || individual;
  if (shared && (typeof accessKey !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(accessKey)))
    throw Error('A chave de acesso da sala deve ter 32 a 256 caracteres ASCII sem espaços.');
  if (typeof secure !== 'boolean' || !Number.isSafeInteger(ttlMs) || ttlMs < 60000 || ttlMs > 86400000
    || !Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 4096
    || !Number.isInteger(maxSockets) || maxSockets < 1 || maxSockets > 64) throw Error('Configuração de sessões da sala inválida.');
  const hash = value => crypto.createHash('sha256').update(value).digest();
  const credentials = [];
  if (individual) {
    if (shared) throw Error('Configure somente um modo de acesso à sala.');
    let accounts;
    try { accounts = JSON.parse(accountKeys); } catch { throw Error('ROOM_ACCOUNT_KEYS deve ser um objeto JSON válido.'); }
    if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) throw Error('Cadastro de contas inválido.');
    const entries = Object.entries(accounts);
    if (!entries.length || entries.length > 256) throw Error('Configure entre 1 e 256 contas.');
    const seen = new Set();
    for (const [name, key] of entries) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name) || typeof key !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(key) || seen.has(key))
        throw Error('Identificador ou chave individual inválida ou duplicada.');
      seen.add(key);
      credentials.push({ digest: hash(key), principal: Symbol('room account') });
    }
  } else if (shared) credentials.push({ digest: hash(accessKey), principal: null });
  const limiter = createCredentialLimiter({ perMinute: 6, globalPerMinute: 30, now: monotonic });
  const cookieName = secure ? '__Host-wss-room' : 'wss-room';
  const sessions = new Map(); let closed = false;
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
  function cookieDigest(header) {
    if (typeof header !== 'string' || header.length > 8192) return null;
    let token = null;
    for (const part of header.split(';')) {
      const equals = part.indexOf('=');
      if (equals < 0 || part.slice(0, equals).trim() !== cookieName) continue;
      if (token !== null) return null;
      token = part.slice(equals + 1).trim();
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
    }
    return token === null ? null : hash(token).toString('hex');
  }
  function revoke(entry) {
    if (!entry || sessions.get(entry.digest) !== entry) return;
    sessions.delete(entry.digest); cancel(entry.timer);
    for (const [socket, listener] of entry.sockets) {
      socket.off('disconnect', listener); socket.disconnect(true);
    }
    entry.sockets.clear();
  }
  function expired(entry) {
    const wall = now(), mono = monotonic();
    return !Number.isFinite(wall) || !Number.isFinite(mono) || wall < entry.createdAt || mono < entry.createdMono
      || wall >= entry.expiresAt || mono >= entry.expiresMono;
  }
  function arm(entry, delay) {
    entry.timer = schedule(() => {
      if (sessions.get(entry.digest) !== entry) return;
      if (expired(entry)) revoke(entry);
      else arm(entry, Math.max(1, Math.min(entry.expiresAt - now(), entry.expiresMono - monotonic())));
    }, delay);
    entry.timer?.unref?.();
  }
  function find(header) {
    const digest = cookieDigest(header), entry = digest && sessions.get(digest);
    if (!entry) return null;
    if (expired(entry)) { revoke(entry); return null; }
    return entry;
  }
  function status(header) {
    const entry = enabled ? find(header) : null;
    return { required: enabled, authenticated: !enabled || Boolean(entry), expiresAt: entry?.expiresAt ?? null };
  }
  function authenticate({ key, cookie: previous, address } = {}) {
    if (closed) return { ok: false, status: 503 };
    if (!enabled) return { ok: true, status: 200, cookie: null, expiresAt: null };
    const quota = limiter.consume(address);
    if (!quota.allowed) return { ok: false, status: 429, retryAfter: quota.retryAfter };
    if (typeof key !== 'string' || key.length > 256) return { ok: false, status: 401 };
    const supplied = hash(key);
    let credential;
    for (const candidate of credentials) {
      if (crypto.timingSafeEqual(supplied, candidate.digest)) credential = candidate;
    }
    if (!credential) return { ok: false, status: 401 };
    const old = find(previous);
    if (sessions.size - Number(Boolean(old)) >= maxSessions) return { ok: false, status: 503 };
    const wall = now(), mono = monotonic();
    if (!Number.isFinite(wall) || !Number.isFinite(mono)) return { ok: false, status: 503 };
    let token, digest;
    for (let i = 0; i < 4; i++) {
      const bytes = random(32);
      if (!Buffer.isBuffer(bytes) || bytes.length !== 32) throw Error('Gerador de sessão inválido.');
      token = bytes.toString('hex'); digest = hash(token).toString('hex');
      if (!sessions.has(digest)) break;
      digest = null;
    }
    if (!digest) return { ok: false, status: 503 };
    const entry = { digest, principal: credential.principal, identity: Symbol('room session'), createdAt: wall, createdMono: mono, expiresAt: wall + ttlMs,
      expiresMono: mono + ttlMs, sockets: new Map(), timer: null };
    arm(entry, ttlMs); sessions.set(digest, entry);
    revoke(old);
    return { ok: true, status: 200, cookie: cookie(token, Math.floor(ttlMs / 1000)), expiresAt: entry.expiresAt };
  }
  function http(req, res, next) {
    if (!enabled) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (find(req.headers?.cookie)) return next();
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Autenticação da sala necessária.', code: 'ROOM_AUTH_REQUIRED' }));
  }
  function authorizeSocket(socket, next) {
    if (!enabled) return next();
    const entry = find(socket.handshake?.headers?.cookie);
    const deny = code => { const error = Error('Autenticação da sala indisponível.'); error.data = { code }; next(error); };
    if (!entry) return deny('ROOM_AUTH_REQUIRED');
    if (!entry.sockets.has(socket) && entry.sockets.size >= maxSockets) return deny('ROOM_SOCKET_LIMIT');
    if (!entry.sockets.has(socket)) {
      const listener = () => entry.sockets.delete(socket);
      entry.sockets.set(socket, listener); socket.once('disconnect', listener);
    }
    next();
  }
  return { enabled, cookieName, authenticate, status, http, authorizeSocket,
    quotaIdentity(header) {
      const entry = find(header);
      return entry?.principal || entry?.identity || null;
    },
    account(header) { return individual ? find(header)?.principal || null : null; },
    identity(header) { return enabled ? find(header)?.identity || null : null; },
    logout(header) { revoke(find(header)); return cookie('', 0); },
    get size() { return sessions.size; },
    close() { closed = true; for (const entry of sessions.values()) revoke(entry); },
  };
}
module.exports = { createRoomSessions };
