(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssExperiments = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const KEY = 'wss-transport-experiments-v1';
  const DEFAULTS = Object.freeze({ binaryFast: true, smallFastQueue: false, expireFastPackets: false,
    responsiveVideo: false, shortVideoBuffer: false, recoverDelayedVideo: false, relaySelection: false, gpuBudget: false });
  function normalize(value) {
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
      [key, value && typeof value[key] === 'boolean' ? value[key] : fallback]));
  }
  function create(storage) {
    function read() {
      try { return normalize(JSON.parse(storage.getItem(KEY))); }
      catch { return normalize(null); }
    }
    const active = Object.freeze(read());
    return {
      options: Object.freeze({ binaryFast: active.binaryFast,
        maxFastBufferedBytes: active.smallFastQueue ? 2048 : 16384,
        fastPacketLifeTimeMs: active.expireFastPackets ? 100 : null }),
      videoOptions: Object.freeze({ realtime: active.responsiveVideo,
        receiverBufferTargetMs: active.shortVideoBuffer ? 50 : null, recoverDelayedVideo: active.recoverDelayedVideo }),
      snapshot() {
        const saved = read();
        return { active: { ...active }, saved,
          pendingReload: Object.keys(DEFAULTS).some(key => saved[key] !== active[key]) };
      },
      set(key, enabled) {
        if (!Object.hasOwn(DEFAULTS, key) || typeof enabled !== 'boolean') throw new Error('Experimento inválido.');
        const next = { ...read(), [key]: enabled };
        storage.setItem(KEY, JSON.stringify(next));
        return this.snapshot();
      },
    };
  }
  return { create, normalize, DEFAULTS };
});
