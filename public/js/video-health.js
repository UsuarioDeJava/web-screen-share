(function (root, factory) {
  const create = factory();
  if (typeof module === 'object' && module.exports) module.exports = create;
  else root.createVideoHealth = create;
})(globalThis, () => function createVideoHealth({ stallMs = 12000, cooldownMs = 60000, firstFrameMs = 45000 } = {}) {
  let previous = null, stuckSince = null, retryAt = -Infinity, minRtt = null, congestedAt = null, debtSamples = 0;
  // Antes do primeiro quadro desta conexão, o vídeo pode estar só esperando um quadro-chave
  // (o OBS manda um a cada N s e não atende pedido): reconectar aí só recomeça a espera.
  let waitingSince = null, decodedOnce = false;
  const bufferBaseline = [];
  function reset() { previous = null; stuckSince = null; minRtt = congestedAt = null; debtSamples = 0; bufferBaseline.length = 0; }
  return {
    reset,
    sample(stats, now, { metrics = null, lowLatency = false } = {}) {
      const { bytesReceived, framesDecoded, framesDropped, totalDecodeTime } = stats;
      if (!Number.isFinite(now) || !Number.isFinite(bytesReceived) || !Number.isFinite(framesDecoded)) {
        reset(); return { stalled: false, latencyRecovery: false };
      }
      if (previous && (bytesReceived < previous.bytes || framesDecoded < previous.frames
        || stats.id && previous.id && stats.id !== previous.id
        || now < previous.at || now - previous.at > stallMs
        || Number.isFinite(stats.timestamp) && Number.isFinite(previous.timestamp) && stats.timestamp < previous.timestamp)) reset();
      if (previous && Number.isFinite(stats.timestamp) && stats.timestamp === previous.timestamp) return { stalled: false, latencyRecovery: false };
      const progress = previous && bytesReceived > previous.bytes && framesDecoded === previous.frames;
      if (progress) stuckSince ??= previous.at;
      else stuckSince = null; // tela estática ou chegada de novos quadros: não reconectar
      if (framesDecoded > 0) decodedOnce = true;
      else if (bytesReceived > 0) waitingSince ??= now;
      const stalled = (decodedOnce ? stuckSince !== null && now - stuckSince >= stallMs
        : waitingSince !== null && now - waitingSince >= firstFrameMs) && now >= retryAt;
      if (stalled) retryAt = now + cooldownMs;
      const rtt = Number.isFinite(metrics?.rttMs) && metrics.rttMs >= 0 ? metrics.rttMs : null;
      const buffer = Number.isFinite(metrics?.jitterBufferMs) && metrics.jitterBufferMs >= 0 ? metrics.jitterBufferMs : null;
      const packets = previous && Number.isFinite(stats.packetsReceived) && Number.isFinite(previous.packets) ? stats.packetsReceived - previous.packets : null;
      const lost = previous && Number.isFinite(stats.packetsLost) && Number.isFinite(previous.lost) ? stats.packetsLost - previous.lost : null;
      const loss = Number.isFinite(packets) && Number.isFinite(lost) && packets >= 0 && lost >= 0 && packets + lost > 0 ? lost / (packets + lost) : null;
      const fps = previous && now > previous.at ? (framesDecoded - previous.frames) * 1000 / (now - previous.at) : null;
      if (rtt != null) minRtt = minRtt == null ? rtt : Math.min(minRtt, rtt);
      if (minRtt != null && rtt > minRtt + 60 || loss != null && loss > 0.03) congestedAt = now;
      if (buffer != null && buffer <= 120 && rtt != null && rtt <= minRtt + 30 && fps >= 20 && loss != null && loss <= 0.03) {
        bufferBaseline.push(buffer); bufferBaseline.sort((a, b) => a - b); if (bufferBaseline.length > 2) bufferBaseline.pop();
      }
      const baseline = bufferBaseline.length >= 2 ? bufferBaseline[1] : null;
      const debt = lowLatency === true && baseline != null && buffer != null && buffer > Math.max(120, baseline + 75)
        && congestedAt != null && now - congestedAt <= 45000 && rtt != null && rtt <= minRtt + 30
        && loss != null && loss <= 0.03 && fps >= 20 && bytesReceived > previous?.bytes;
      debtSamples = debt ? debtSamples + 1 : 0;
      const latencyRecovery = !stalled && debtSamples >= 3 && now >= retryAt;
      if (latencyRecovery) { retryAt = now + cooldownMs; debtSamples = 0; }
      previous = { bytes: bytesReceived, frames: framesDecoded, at: now, id: stats.id, timestamp: stats.timestamp,
        packets: stats.packetsReceived, lost: stats.packetsLost };
      return { stalled, latencyRecovery, waitingKeyframe: !decodedOnce && waitingSince !== null && now - waitingSince >= 3000,
        bufferBaselineMs: baseline, recentLoss: loss, framesDecoded, framesDropped,
        decodeMs: framesDecoded && Number.isFinite(totalDecodeTime) ? totalDecodeTime * 1000 / framesDecoded : null };
    },
  };
});
