(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createVisibleTicker = factory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function ({ document, active, run, interval,
  schedule = setTimeout, cancel = clearTimeout, onError = error => console.error(error) }) {
  let timer = null, busy = false, closed = false;
  const enabled = () => !closed && !document.hidden && active();
  function sync() {
    if (!enabled()) { if (timer !== null) cancel(timer); timer = null; return; }
    if (timer === null && !busy) timer = schedule(tick, interval);
  }
  async function tick() {
    timer = null;
    if (!enabled()) return;
    busy = true;
    try { await run(); }
    catch (error) { onError(error); }
    finally { busy = false; sync(); }
  }
  document.addEventListener('visibilitychange', sync);
  sync();
  return { sync, close() {
    closed = true; sync(); document.removeEventListener('visibilitychange', sync);
  } };
});
