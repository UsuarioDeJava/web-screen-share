// Limites independentes do renderer, sem fila ou timer. Excesso bloqueia a concessão
// até sua remoção/troca; a chamada onBlock deve neutralizar os dispositivos locais.
function createNativeInputBudget({ now = () => performance.now(), onBlock = () => {} } = {}) {
  const policies = {
    input: { rate: 1000, burst: 256, globalRate: 4000, globalBurst: 1024 },
    metadata: { rate: 64, burst: 32, globalRate: 256, globalBurst: 128 },
  };
  const peers = new Map(), global = new Map();
  const valid = value => typeof value === 'string' && value.length <= 128;
  function refill(bucket, time, rate, capacity) {
    if (!Number.isFinite(time) || time < bucket.at) return false;
    bucket.tokens = Math.min(capacity, bucket.tokens + (time - bucket.at) * rate / 1000);
    bucket.at = time;
    return bucket.tokens >= 1;
  }
  function accept(id, session, lane = 'input') {
    const peer = peers.get(id), policy = Object.hasOwn(policies, lane) ? policies[lane] : null;
    const identity = session === undefined ? '' : session;
    if (!peer || peer.session !== identity || peer.blocked || !policy) return false;
    const time = now();
    let local = peer[lane], shared = global.get(lane);
    if (!local) peer[lane] = local = { tokens: policy.burst, at: time };
    if (!shared) { shared = { tokens: policy.globalBurst, at: time }; global.set(lane, shared); }
    const localReady = refill(local, time, policy.rate, policy.burst);
    const globalReady = refill(shared, time, policy.globalRate, policy.globalBurst);
    if (!localReady || !globalReady) {
      peer.blocked = true;
      onBlock(id, peer.session);
      return false;
    }
    local.tokens--; shared.tokens--;
    return true;
  }
  return {
    accept,
    block(id, session) {
      const peer=peers.get(id);
      if(!peer||peer.session!==(session||'')||peer.blocked)return false;
      peer.blocked=true;onBlock(id,peer.session);return true;
    },
    retain(people) {
      const keep = new Set();
      for (const person of people.slice(0, 16)) {
        if (!valid(person?.id) || !person.id || (person.session != null && !valid(person.session))) continue;
        keep.add(person.id);
        const session = person.session || '';
        if (peers.get(person.id)?.session !== session) peers.set(person.id, { session, blocked: false });
      }
      for (const id of peers.keys()) if (!keep.has(id)) peers.delete(id);
    },
    blocked: id => peers.get(id)?.blocked === true,
  };
}
module.exports = { createNativeInputBudget };
