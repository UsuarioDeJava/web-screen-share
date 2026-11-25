(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssInputPacing = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_INTERVAL_MS = 8;
  function createLatest({ interval = DEFAULT_INTERVAL_MS, deliver, canSend = () => true,
    now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout }) {
    let pending = null, timer = null, lastAt = -Infinity;
    function clear() {
      if (timer != null) cancel(timer);
      pending = timer = null; lastAt = -Infinity;
    }
    function flush() {
      if (timer != null) cancel(timer);
      timer = null;
      const value = pending; pending = null;
      if (value == null || !canSend()) return;
      lastAt = now(); deliver(value);
    }
    return { clear, flush,
      offer(value) {
        if (!canSend()) { clear(); return; }
        pending = value;
        const wait = interval - (now() - lastAt);
        if (wait <= 0) flush();
        else if (timer == null) timer = schedule(flush, wait);
      },
    };
  }
  function createFrameLatest({ deliver, canSend = () => true, schedule = requestAnimationFrame, cancel = cancelAnimationFrame }) {
    let pending = null, frame = null;
    function clear() { if (frame != null) cancel(frame); frame = pending = null; }
    function flush() {
      if (frame != null) cancel(frame);
      frame = null;
      const value = pending; pending = null;
      if (value != null && canSend()) deliver(value);
    }
    return { clear, flush, offer(value) {
      if (!canSend()) { clear(); return; }
      pending = value;
      if (frame == null) frame = schedule(flush);
    } };
  }
  return { DEFAULT_INTERVAL_MS, createLatest, createFrameLatest };
});
