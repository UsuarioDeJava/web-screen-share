const { createHash, randomUUID } = require('node:crypto');

// Portas/protocolos do mesmo hostname são alternativas do mesmo relay.
function candidates(servers) {
  const result = [];
  for (const server of servers) {
    const groups = new Map();
    for (const url of [].concat(server.urls)) {
      const match = /^turns?:((?:\[[^\]]+\]|[^:?]+))/i.exec(url);
      if (!match) continue;
      const host = match[1].toLowerCase();
      if (!groups.has(host)) groups.set(host, []);
      groups.get(host).push(url);
    }
    for (const urls of groups.values()) result.push({
      id: createHash('sha256').update(JSON.stringify(urls)).digest('hex').slice(0, 24),
      server: { ...server, urls },
    });
  }
  return result;
}

function createRelaySelection({ now = Date.now, ttlMs = 180000 } = {}) {
  const rounds = new Map();
  return {
    begin(id, servers) {
      const list = candidates(servers);
      if (list.length < 2 || list.length > 8) return null;
      const round = { token: randomUUID(), at: now(), ids: list.map(c => c.id), values: null,
        previous: rounds.get(id)?.values ? rounds.get(id) : rounds.get(id)?.previous };
      rounds.set(id, round);
      return { token: round.token, candidates: list };
    },
    report(id, report) {
      const round = rounds.get(id);
      if (!round || round.values || now() < round.at || now() - round.at >= ttlMs
        || report?.token !== round.token || !Array.isArray(report.values) || report.values.length !== round.ids.length) return false;
      if (report.values.some(v => v !== null && (!Number.isFinite(v) || v <= 0 || v > 10000))) return false;
      round.values = [...report.values];
      delete round.previous;
      return true;
    },
    remove(id) { rounds.delete(id); },
    select(servers, participants) {
      const list = candidates(servers), ids = [...participants];
      if (list.length < 2 || !ids.length) return servers;
      const reports = ids.map(id => {
        const round = rounds.get(id);
        return round?.values ? round : round?.previous;
      });
      if (reports.some(r => !r?.values || now() < r.at || now() - r.at >= ttlMs
        || r.ids.length !== list.length || r.ids.some((id, i) => id !== list[i].id))) return servers;
      let best = null;
      for (let i = 0; i < list.length; i++) {
        const values = reports.map(r => r.values[i]);
        if (values.includes(null)) continue;
        const worst = Math.max(...values), sum = values.reduce((a, b) => a + b, 0);
        if (!best || worst < best.worst || worst === best.worst && sum < best.sum) best = { i, worst, sum };
      }
      if (!best) return servers;
      const stun = servers.flatMap(s => {
        const urls = [].concat(s.urls).filter(url => /^stuns?:/i.test(url));
        return urls.length ? [{ ...s, urls }] : [];
      });
      return [...stun, list[best.i].server];
    },
  };
}
module.exports = { candidates, createRelaySelection };
