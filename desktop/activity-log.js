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
  let rows = new Array(limit);
  let start = 0;
  let size = 0;
  let epoch = 0;
  let sequence = 0;
  let omitted = 0;
  let windowAt = Date.now();
  let count = 0;
  const ordered = (offset = 0) => Array.from({ length: size - offset }, (_, i) => ({ ...rows[(start + offset + i) % limit] }));
  const metadata = () => ({ epoch, lastId: sequence, firstId: size ? rows[start].id : sequence + 1, total: size, omitted, enabled, limit });
  return {
    add(entry) {
      if (!enabled || !entry || typeof entry.message !== 'string') return;
      if (Date.now() - windowAt >= 1000) { windowAt = Date.now(); count = 0; }
      if (++count > 100) { omitted++; events.emit('change'); return; }
      const row = {
        id: ++sequence, at: new Date().toISOString(),
        level: ['info', 'warn', 'error'].includes(entry.level) ? entry.level : 'info',
        category: ['people', 'stream', 'connection', 'error', 'system'].includes(entry.category) ? entry.category : 'system',
        direction: ['in', 'out', 'local'].includes(entry.direction) ? entry.direction : 'local',
        message: safeMessage(entry.message),
      };
      rows[(start + size) % limit] = row;
      if (size < limit) size++;
      else start = (start + 1) % limit;
      events.emit('change');
    },
    configure(options) {
      enabled = Boolean(options.logging);
      const next = [500, 1000, 2000, 5000].includes(options.logLimit) ? options.logLimit : 2000;
      if (next !== limit) {
        const keep = ordered().slice(-next);
        limit = next; rows = new Array(limit); start = 0; size = keep.length;
        keep.forEach((row, i) => { rows[i] = row; });
        epoch++;
      }
      events.emit('change');
    },
    snapshot() { return { ...metadata(), rows: ordered() }; },
    changes(cursor) {
      const first = size ? rows[start].id : sequence + 1;
      const reset = !cursor || cursor.epoch !== epoch || !Number.isSafeInteger(cursor.lastId)
        || cursor.lastId < first - 1 || cursor.lastId > sequence;
      const offset = reset ? 0 : Math.min(size, Math.max(0, cursor.lastId - first + 1));
      return { ...metadata(), reset, rows: ordered(offset) };
    },
    clear() { rows = new Array(limit); start = size = 0; epoch++; omitted = 0; events.emit('change'); },
    subscribe(callback) { events.on('change', callback); return () => events.off('change', callback); },
  };
}

module.exports = { createActivityLog, safeMessage };
