const crypto = require('node:crypto');
const { createCredentialLimiter } = require('./credential-limiter');
function createAdminSessions({ password, secure = true, ttlMs = 8 * 60 * 60 * 1000,
  maxSessions = 1024, now = Date.now, monotonic = () => performance.now(),
  schedule = setTimeout, cancel = clearTimeout, random = crypto.randomBytes } = {}) {
  const hash = value => crypto.createHash('sha256').update(value).digest();
  const credential = password ? hash(password) : null;
  const limiter = createCredentialLimiter({ perMinute: 6, globalPerMinute: 30, now: monotonic });
  const cookieName = secure ? '__Host-wss-admin' : 'wss-admin';
  const sessions = new Map();
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
  function authenticate({ key, cookie: previous, address } = {}) {
    const quota = limiter.consume(address);
    if (!quota.allowed) return { ok: false, status: 429, retryAfter: quota.retryAfter };
    if (!credential || typeof key !== 'string') return { ok: false, status: 401 };
    const supplied = hash(key);
    if (!crypto.timingSafeEqual(supplied, credential)) return { ok: false, status: 401 };
    return open(previous, null);
  }
  // Com contas (ACCOUNTS=on): quem confere nick e senha é o accounts.js; a sessão do painel
  // guarda de qual conta ela é (subject), pra conferir a administração a cada ação.
  function start({ cookie: previous, address, subject } = {}) {
    const quota = limiter.consume(address);
    if (!quota.allowed) return { ok: false, status: 429, retryAfter: quota.retryAfter };
    if (typeof subject !== 'string' || !subject) return { ok: false, status: 401 };
    return open(previous, subject);
  }
  function open(previous, subject) {
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
    const entry = { digest, subject, createdAt: wall, createdMono: mono, expiresAt: wall + ttlMs,
      expiresMono: mono + ttlMs, timer: null };
    arm(entry, ttlMs); sessions.set(digest, entry);
    revoke(old);
    return { ok: true, status: 200, cookie: cookie(token, Math.floor(ttlMs / 1000)), expiresAt: entry.expiresAt };
  }
  return { enabled: Boolean(credential), authenticate, start, valid: header => Boolean(find(header)),
    subject: header => find(header)?.subject || null,
    // Uma conta perdeu a administração (ou foi apagada): as sessões dela no painel acabam.
    revokeSubject(subject) { for (const entry of [...sessions.values()]) if (entry.subject === subject) revoke(entry); },
    logout(header) { revoke(find(header)); return cookie('', 0); },
  };
}
module.exports = { createAdminSessions };
