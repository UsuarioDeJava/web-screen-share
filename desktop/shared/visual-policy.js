(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.WssVisualPolicy = factory();
    root.WssVisualPolicy.instance = root.WssVisualPolicy.mount(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const INTERVAL = 250, BAD_DELAY = 50, WINDOW = 5000, RECOVERY = 10000;
  const normalize = mode => ['normal', 'economy', 'auto'].includes(mode) ? mode : 'normal';
  function create({ mode = 'normal', now = () => performance.now(), onChange = () => {} } = {}) {
    let selected = normalize(mode), economy = selected === 'economy', bad = [], lastBad = null;
    function change(value) { if (economy !== value) { economy = value; onChange(value); } }
    return {
      get mode() { return selected; }, get economy() { return economy; },
      setMode(value) {
        const next = normalize(value); if (next === selected) return;
        selected = next; bad = []; lastBad = null; change(next === 'economy');
      },
      suspend() { bad = []; lastBad = null; },
      sample(delay) {
        if (selected !== 'auto' || !Number.isFinite(delay) || delay < 0) return;
        const time = now(); bad = bad.filter(at => time - at <= WINDOW);
        if (delay >= BAD_DELAY) { bad.push(time); lastBad = time; }
        if (!economy && bad.length >= 3) change(true);
        if (economy) {
          if (lastBad == null) lastBad = time;
          if (time - lastBad >= RECOVERY) { bad = []; lastBad = null; change(false); }
        }
      },
    };
  }
  function mount(win) {
    const doc = win.document, root = doc.documentElement;
    let timer = null, at = 0;
    const paint = economy => root.toggleAttribute('data-wss-economy', economy);
    const policy = create({ mode: root.getAttribute('data-wss-visual-mode'), now: () => win.performance.now(), onChange: paint });
    function stop() { if (timer != null) win.clearInterval(timer); timer = null; policy.suspend(); }
    function sync() {
      policy.setMode(root.getAttribute('data-wss-visual-mode')); paint(policy.economy);
      stop();
      if (policy.mode !== 'auto' || doc.hidden) return;
      at = win.performance.now();
      timer = win.setInterval(() => {
        if (doc.hidden) { stop(); return; }
        const time = win.performance.now();
        policy.sample(Math.max(0, time - at - INTERVAL)); at = time;
      }, INTERVAL);
    }
    const observer = new win.MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-wss-visual-mode'] });
    doc.addEventListener('visibilitychange', sync);
    function destroy() { stop(); observer.disconnect(); doc.removeEventListener('visibilitychange', sync); }
    win.addEventListener('pagehide', destroy, { once: true });
    sync();
    return { get mode() { return policy.mode; }, get economy() { return policy.economy; }, destroy };
  }
  return { create, mount };
});
