const crypto = require('node:crypto');
const PATH = /^pub_[a-f0-9]{32}$/;
function createObsPublishers({ now = Date.now, monotonic = () => performance.now(),
  schedule = setTimeout, cancel = clearTimeout, maxEntries = 1024,
  ttlMs = 8 * 60 * 60 * 1000, reconnectMs = 120000, onChanged = () => {} } = {}) {
  const entries = new Map(), owners = new Map();
  let closed = false;
  const hash = value => crypto.createHash('sha256').update(value).digest();
  function remove(entry) {
    if (!entry || entries.get(entry.path) !== entry) return;
    entries.delete(entry.path); owners.delete(entry.ownerId); cancel(entry.timer);
    onChanged(entry.path);
  }
  function valid(entry) {
    if (!entry) return false;
    const wall = now(), mono = monotonic();
    if (closed || !Number.isFinite(wall) || !Number.isFinite(mono) || wall < entry.wall || mono < entry.mono
      || wall >= entry.expires || mono >= entry.deadline || mono >= entry.reconnectDeadline || !entry.authorized()) {
      remove(entry); return false;
    }
    return true;
  }
  function arm(entry) {
    cancel(entry.timer);
    entry.timer = schedule(() => {
      if (entries.get(entry.path) !== entry || !valid(entry)) return;
      arm(entry);
    }, Math.max(1, Math.min(entry.expires - now(), entry.deadline - monotonic(), entry.reconnectDeadline - monotonic())));
    entry.timer?.unref?.();
  }
  function matches(entry, token) {
    return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
      && crypto.timingSafeEqual(hash(token), entry.digest);
  }
  function issue({ user, identity = null, principal = null, authorized = () => true, previous = null }) {
    if (closed || !user || typeof user.id !== 'string' || !authorized()) return { error: 'Entre novamente na sala.' };
    let entry = owners.get(user.id);
    if (!valid(entry)) entry = null;
    if (!entry && previous) {
      const candidate = typeof previous.path === 'string' && PATH.test(previous.path) ? entries.get(previous.path) : null;
      if (valid(candidate) && candidate.identity === identity && matches(candidate, previous.token)) entry = candidate;
    }
    if (!entry) {
      // Varrida apenas ao emitir, sem polling adicional por sessão.
      for (const candidate of entries.values()) valid(candidate);
      if (entries.size >= maxEntries) return { error: 'Não há publicação disponível agora.' };
      const wall = now(), mono = monotonic();
      if (!Number.isFinite(wall) || !Number.isFinite(mono)) return { error: 'Relógio indisponível.' };
      const path = 'pub_' + crypto.randomBytes(16).toString('hex'), token = crypto.randomBytes(32).toString('hex');
      entry = { path, token, digest: hash(token), identity, identityKey: principal || Symbol('OBS publisher'), ownerId: null, name: user.name,
        wall, mono, expires: wall + ttlMs, deadline: mono + ttlMs, reconnectDeadline: Infinity, authorized };
      entries.set(path, entry);
    }
    owners.delete(entry.ownerId);
    entry.ownerId = user.id; entry.name = user.name; entry.authorized = authorized;
    entry.reconnectDeadline = Infinity; owners.set(user.id, entry); arm(entry); onChanged(entry.path);
    return { path: entry.path, token: entry.token, expiresAt: entry.expires, url: '/obs-publish/' + entry.path.slice(4) };
  }
  function find(path, authorization) {
    if (typeof path !== 'string' || !PATH.test(path)) return null;
    const entry = entries.get(path);
    if (!valid(entry)) return null;
    const match = typeof authorization === 'string' && /^Bearer ([a-f0-9]{64})$/i.exec(authorization);
    return match && matches(entry, match[1]) ? entry : null;
  }
  return {
    issue,
    identity(path, authorization) { return find(path, authorization)?.identityKey || null; },
    accepts(path, authorization) { return Boolean(find(path, authorization)); },
    info(path) { const entry = entries.get(path); return valid(entry) ? { ownerId: entry.ownerId, name: entry.name } : null; },
    detach(ownerId, revoke = false) {
      const entry = owners.get(ownerId);
      if (!entry) return;
      if (revoke) return remove(entry);
      owners.delete(ownerId); entry.ownerId = null; entry.reconnectDeadline = monotonic() + reconnectMs;
      arm(entry); onChanged(entry.path);
    },
    close() { closed = true; for (const entry of [...entries.values()]) remove(entry); },
  };
}
module.exports = { createObsPublishers };
