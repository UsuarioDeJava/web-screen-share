(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.createIceServers = factory();
})(globalThis, () => function createIceServers({ fetch, now = () => performance.now(), wallNow = Date.now, timeoutMs = 10000, onRateLimit = () => {},
  fallback = [{ urls: 'stun:stun.l.google.com:19302' }] }) {
  let cached = null, until = -Infinity, wallUntil = -Infinity, cachedAt = 0, cachedWallAt = 0, pending = null;
  let retryAt = -Infinity, retryWallAt = -Infinity, retryStarted = 0, retryWallStarted = 0;
  const copy = value => value.map(server => ({ ...server, urls: Array.isArray(server.urls) ? [...server.urls] : server.urls }));
  return function getIceServers() {
    if (cached && now() >= cachedAt && now() < until && wallNow() >= cachedWallAt && wallNow() < wallUntil) return Promise.resolve(copy(cached));
    if (now() >= retryStarted && now() < retryAt && wallNow() >= retryWallStarted && wallNow() < retryWallAt) return Promise.resolve(copy(fallback));
    if (!pending) {
      const started = now(), wallStarted = wallNow(), controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error('Tempo de consulta ICE esgotado.'));
      }, timeoutMs); });
      pending = Promise.race([Promise.resolve().then(async () => {
        const response = await fetch('/ice-servers', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          if (response.status === 429) {
            const header = response.headers?.get('Retry-After');
            const seconds = header && /^\d+$/.test(header) ? Math.max(1, Math.min(60, Number(header))) : 1;
            retryStarted = now(); retryWallStarted = wallNow(); retryAt = retryStarted + seconds * 1000; retryWallAt = retryWallStarted + seconds * 1000;
            try { onRateLimit(seconds); } catch {}
          }
          try { await response.body?.cancel(); } catch {}
          throw new Error('Não foi possível consultar ICE.');
        }
        const value = await response.json();
        if (!Array.isArray(value) || value.length > 32 || value.some(server => !server || typeof server !== 'object'
          || !(typeof server.urls === 'string' || Array.isArray(server.urls) && server.urls.every(url => typeof url === 'string'))))
          throw new Error('Resposta ICE inválida.');
        const header = response.headers?.get('X-ICE-Cache-Seconds');
        const seconds = header && /^\d+$/.test(header) ? Math.min(300, Number(header)) : 60;
        return { value, until: started + seconds * 1000, wallUntil: wallStarted + seconds * 1000, seconds };
      }), timeout]).then(result => {
        if (result.seconds > 0 && (now() >= result.until || wallNow() >= result.wallUntil)) throw new Error('Consulta ICE antiga.');
        cached = copy(result.value); until = result.until; wallUntil = result.wallUntil; cachedAt = started; cachedWallAt = wallStarted;
        return cached;
      }).catch(() => {
        // Falha não reutiliza a credencial expirada nem fica presa no cache da página.
        cached = null; until = -Infinity; return copy(fallback);
      }).finally(() => { clearTimeout(timer); pending = null; });
    }
    return pending.then(copy);
  };
});
