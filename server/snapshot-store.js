const fs = require('node:fs/promises');

// Escrita atômica serializada. Uma alteração durante I/O gera outra versão,
// sem permitir que uma gravação antiga substitua um snapshot mais recente.
function createSnapshotStore({ file, snapshot, io = fs, delay = 2000,
  onError = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let revision = 0, saved = 0, timer = null, inFlight = null, closed = false;
  function clearTimer() { if (timer != null) cancel(timer); timer = null; }
  function soon() {
    if (file && !closed && !inFlight && timer == null && saved < revision) {
      timer = schedule(() => { timer = null; void flush(); }, delay);
    }
  }
  function flush() {
    clearTimer();
    if (inFlight) return inFlight;
    if (!file || saved === revision) return Promise.resolve(true);
    inFlight = (async () => {
      try {
        while (saved < revision) {
          const current = revision;
          const data = JSON.stringify(snapshot());
          await io.writeFile(`${file}.tmp`, data, 'utf8');
          await io.rename(`${file}.tmp`, file);
          saved = current;
        }
        return true;
      } catch (error) {
        try { await io.unlink(`${file}.tmp`); } catch {}
        onError(error);
        return false;
      }
    })().finally(() => { inFlight = null; soon(); });
    return inFlight;
  }
  return {
    changed() { if (file && !closed) { revision++; soon(); } },
    flush,
    close() { closed = true; clearTimer(); return flush(); },
  };
}

module.exports = { createSnapshotStore };
