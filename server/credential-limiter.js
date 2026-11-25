// Token buckets: cotas global, por transporte e identidade opcional, com memória limitada.
function createCredentialLimiter({ perMinute = 120, identityPerMinute = perMinute, globalPerMinute = 1200, maxClients = 4096, now = () => performance.now() } = {}) {
  if (![perMinute, identityPerMinute, globalPerMinute].every(n => Number.isInteger(n) && n >= 1 && n <= 60000)
    || !Number.isInteger(maxClients) || maxClients < 1 || maxClients > 65536) throw Error('Limites de emissão TURN inválidos.');
  const clients = new Map(), identities = new Map(); let sweep = clients.entries(), identitySweep = identities.entries(), last = now();
  if (!Number.isFinite(last)) throw Error('Relógio do limite TURN inválido.');
  const global = { tokens: globalPerMinute, at: last };
  const refill = (bucket, capacity, time) => {
    bucket.tokens = Math.min(capacity, bucket.tokens + (time - bucket.at) * capacity / 60000); bucket.at = time;
  };
  const retry = (bucket, capacity) => Math.max(1, Math.ceil((1 - bucket.tokens) * 60 / capacity));
  return {
    get size() { return clients.size; },
    get identitySize() { return identities.size; },
    consume(address, identity = null) {
      const measured = now(), time = Number.isFinite(measured) ? Math.max(last, measured) : last; last = time;
      refill(global, globalPerMinute, time);
      if (global.tokens < 1) return { allowed: false, retryAfter: retry(global, globalPerMinute) };
      // Trabalho constante por chamada, inclusive quando há muitas origens novas.
      for (let i = 0; i < 8; i++) {
        const item = sweep.next();
        if (item.done) { sweep = clients.entries(); if (!clients.size) break; continue; }
        if (time - item.value[1].seen >= 60000) clients.delete(item.value[0]);
      }
      for (let i = 0; identities.size && i < 8; i++) {
        const item = identitySweep.next();
        if (item.done) { identitySweep = identities.entries(); continue; }
        if (time - item.value[1].seen >= 60000) identities.delete(item.value[0]);
      }
      const key = String(address || 'unknown').replace(/^::ffff:/, '');
      let client = clients.get(key);
      const identified = identity !== null && identity !== undefined;
      let principal = identified ? identities.get(identity) : null;
      if (!client && clients.size >= maxClients || identified && !principal && identities.size >= maxClients) return { allowed: false, retryAfter: 60 };
      if (client) { refill(client, perMinute, time); client.seen = time; }
      if (principal) { refill(principal, identityPerMinute, time); principal.seen = time; }
      let retryAfter = 0;
      if (client && client.tokens < 1) retryAfter = retry(client, perMinute);
      if (principal && principal.tokens < 1) retryAfter = Math.max(retryAfter, retry(principal, identityPerMinute));
      if (retryAfter) return { allowed: false, retryAfter };
      // Só cria registros/consome tokens se todas as cotas permitem a emissão.
      if (!client) { client = { tokens: perMinute, at: time, seen: time }; clients.set(key, client); }
      if (identified && !principal) { principal = { tokens: identityPerMinute, at: time, seen: time }; identities.set(identity, principal); }
      global.tokens--; client.tokens--; if (principal) principal.tokens--;
      return { allowed: true, retryAfter: 0 };
    },
  };
}
module.exports = { createCredentialLimiter };
