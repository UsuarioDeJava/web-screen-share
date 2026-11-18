const { EventEmitter } = require('node:events');

function safeMessage(value) {
  return String(value || '').slice(0, 1600)
    .replace(/([a-z]+:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[oculto]@')
    .replace(/([?&](?:token|secret|password|credential|key|auth)=)[^\s&#]+/gi, '$1[oculto]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, 'Bearer [oculto]')
    .replace(/\b(password|credential|authorization|secret|token)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1$2[oculto]');
}

function createActivityLog({ enabled = true, limit = 2000 } = {}) {
  const events = new EventEmitter();
  let rows = [];
  let sequence = 0;
  let omitted = 0;
  let windowAt = Date.now();
  let count = 0;
  return {
    add(entry) {
      if (!enabled || !entry || typeof entry.message !== 'string') return;
      if (Date.now() - windowAt >= 1000) { windowAt = Date.now(); count = 0; }
      if (++count > 100) { omitted++; return; }
      const row = {
        id: ++sequence, at: new Date().toISOString(),
        level: ['info', 'warn', 'error'].includes(entry.level) ? entry.level : 'info',
        category: ['people', 'stream', 'connection', 'error', 'system'].includes(entry.category) ? entry.category : 'system',
        direction: ['in', 'out', 'local'].includes(entry.direction) ? entry.direction : 'local',
        message: safeMessage(entry.message),
      };
      rows.push(row);
      if (rows.length > limit) rows.splice(0, rows.length - limit);
      events.emit('change');
    },
    configure(options) {
      enabled = Boolean(options.logging);
      limit = [500, 1000, 2000, 5000].includes(options.logLimit) ? options.logLimit : 2000;
      if (rows.length > limit) rows = rows.slice(-limit);
      events.emit('change');
    },
    snapshot() { return { rows: rows.map((row) => ({ ...row })), omitted, enabled, limit }; },
    clear() { rows = []; omitted = 0; events.emit('change'); },
    subscribe(callback) { events.on('change', callback); return () => events.off('change', callback); },
  };
}

module.exports = { createActivityLog, safeMessage };
