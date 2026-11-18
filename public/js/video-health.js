(function (root, factory) {
  const create = factory();
  if (typeof module === 'object' && module.exports) module.exports = create;
  else root.createVideoHealth = create;
})(globalThis, () => function createVideoHealth({ stallMs = 12000, cooldownMs = 60000 } = {}) {
  let previous = null, stuckSince = null, retryAt = -Infinity;
  return {
    reset() { previous = null; stuckSince = null; },
    sample(stats, now) {
      const { bytesReceived, framesDecoded, framesDropped, totalDecodeTime } = stats;
      if (!Number.isFinite(bytesReceived) || !Number.isFinite(framesDecoded)) {
        previous = null; stuckSince = null; return { stalled: false };
      }
      const progress = previous && bytesReceived > previous.bytes && framesDecoded === previous.frames;
      if (progress) stuckSince ??= previous.at;
      else stuckSince = null; // tela estática ou chegada de novos quadros: não reconectar
      const stalled = stuckSince !== null && now - stuckSince >= stallMs && now >= retryAt;
      if (stalled) retryAt = now + cooldownMs;
      previous = { bytes: bytesReceived, frames: framesDecoded, at: now };
      return { stalled, framesDecoded, framesDropped,
        decodeMs: framesDecoded && Number.isFinite(totalDecodeTime) ? totalDecodeTime * 1000 / framesDecoded : null };
    },
  };
});
