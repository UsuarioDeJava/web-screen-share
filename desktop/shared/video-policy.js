(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssVideoPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const profiles = {
    desktop: { label: 'Tela e texto · 30 FPS', fps: 30, hint: 'detail', bitrate: 8000000 },
    game1080: { label: 'Jogo · até 1080p60', width: 1920, height: 1080, fps: 60, hint: 'motion', bitrate: 12000000 },
    game720: { label: 'Jogo · até 720p60', width: 1280, height: 720, fps: 60, hint: 'motion', bitrate: 6000000 },
  };
  function normalize(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return { profile: Object.hasOwn(profiles, value.profile) ? value.profile : 'desktop',
      priority: ['auto', 'motion', 'detail'].includes(value.priority) ? value.priority : 'auto',
      codec: ['auto', 'h264', 'vp8', 'av1'].includes(value.codec) ? value.codec : 'auto',
      uploadMbps: Number.isFinite(value.uploadMbps) && value.uploadMbps >= 0 && value.uploadMbps <= 1000 ? value.uploadMbps : 0,
      adaptive: value.adaptive !== false, preview: value.preview !== false };
  }
  function captureConstraints(value, initial = false) {
    const p = profiles[normalize(value).profile];
    const video = { frameRate: initial ? { ideal: p.fps } : { ideal: p.fps, max: p.fps } };
    if (p.width) {
      video.width = initial ? { ideal: p.width } : { ideal: p.width, max: p.width };
      video.height = initial ? { ideal: p.height } : { ideal: p.height, max: p.height };
    }
    return video;
  }
  function observeCapture(track, { onChange = () => {}, onEnded = () => {} } = {}) {
    if (!track || track.kind !== 'video' || track.readyState !== 'live') throw new Error('A fonte de vídeo já foi encerrada.');
    let closed = false;
    const events = ['mute', 'unmute', 'ended', 'configurationchange'];
    function close() {
      if (closed) return;
      closed = true; for (const event of events) track.removeEventListener(event, refresh);
    }
    function readState(event) {
      const settings = track.getSettings();
      return { muted: Boolean(track.muted), ended: event?.type === 'ended' || track.readyState !== 'live',
        width: Number.isFinite(settings.width) ? settings.width : null,
        height: Number.isFinite(settings.height) ? settings.height : null,
        frameRate: Number.isFinite(settings.frameRate) ? settings.frameRate : null };
    }
    let state = readState();
    if (state.ended) throw new Error('A fonte de vídeo já foi encerrada.');
    function refresh(event) {
      if (closed) return { ...state };
      const next = readState(event);
      const before = state; state = next;
      if (next.ended) { close(); onEnded(); }
      else if (Object.keys(next).some(key => next[key] !== before[key])) onChange({ ...next }, { ...before });
      return { ...next };
    }
    for (const event of events) track.addEventListener(event, refresh);
    return { refresh, close, read: () => ({ ...state }) };
  }
  function encodePolicy({ options, quality, source = {}, peers = 1, factor = 1, adaptiveBitrate = null, capacityLevel = 0 }) {
    const v = normalize(options), p = profiles[v.profile];
    let maxBitrate = Math.min(p.bitrate, quality.maxBitrate);
    if (v.uploadMbps > 0) maxBitrate = Math.min(maxBitrate, Math.floor(v.uploadMbps * 800000 / Math.max(1, peers)));
    // 20% do limite informado ficam fora do teto de vídeo para áudio, comandos e overhead.
    maxBitrate = Math.max(1, Math.floor(maxBitrate * Math.max(0.1, Math.min(1, factor))));
    const baselineBitrate = maxBitrate;
    if (Number.isFinite(adaptiveBitrate) && adaptiveBitrate > 0) maxBitrate = Math.min(maxBitrate, Math.max(1, Math.floor(adaptiveBitrate)));
    const maxWidth = Math.min(p.width || Infinity, quality.maxWidth || Infinity);
    const maxHeight = Math.min(p.height || Infinity, quality.maxHeight || Infinity);
    let scale = Math.max(quality.scaleResolutionDownBy || 1, (source.width || 0) / maxWidth, (source.height || 0) / maxHeight);
    const preference = v.priority === 'auto' ? p.hint : v.priority;
    // Em jogo/fluidez, diminui o custo do próximo quadro antes de acumular uma
    // sequência de quadros grandes. Não amplia fontes pequenas nem desfaz limites
    // mais baixos escolhidos pelo participante. Nitidez mantém a resolução.
    if (v.profile !== 'desktop' && preference === 'motion' && maxBitrate < baselineBitrate
      && source.width > 0 && source.height > 0) {
      const floor = Math.min(Math.max(source.width, source.height) / 640, Math.min(source.width, source.height) / 360);
      // O navegador ainda pode adaptar sua própria camada. Evita combinar uma
      // redução agressiva do app com outra redução interna do encoder.
      scale = Math.min(scale * Math.min(2, Math.sqrt(baselineBitrate / maxBitrate)), Math.max(scale, floor));
    }
    const level = Number.isInteger(capacityLevel) && capacityLevel >= 0 && capacityLevel <= 3 ? capacityLevel : 0;
    scale = Math.max(scale, [1, 1.25, 1.5, 2][level]);
    return { maxBitrate, maxFramerate: Math.min(p.fps, quality.maxFramerate, [60, 45, 30, 30][level]), scaleResolutionDownBy: scale,
      degradationPreference: preference === 'motion' ? 'maintain-framerate' : 'maintain-resolution', contentHint: preference };
  }
  function preferCodecs(codecs, preference) {
    if (!Array.isArray(codecs) || preference === 'auto') return codecs;
    const mime = `video/${preference === 'av1' ? 'av1' : preference}`;
    // Preferência, não exclusão: mantém codecs alternativos e os de reparação.
    return [...codecs.filter(c => c.mimeType?.toLowerCase() === mime), ...codecs.filter(c => c.mimeType?.toLowerCase() !== mime)];
  }
  const codecNames = { h264: 'video/H264', av1: 'video/AV1', vp8: 'video/VP8' };
  function cleanCapabilities(value) {
    const result = {};
    for (const key of Object.keys(codecNames)) {
      const item = value?.[key];
      if (item && typeof item.supported === 'boolean') result[key] = { supported: item.supported,
        rtpSupported: typeof item.rtpSupported === 'boolean' ? item.rtpSupported : item.supported,
        smooth: typeof item.smooth === 'boolean' ? item.smooth : null,
        powerEfficient: typeof item.powerEfficient === 'boolean' ? item.powerEfficient : null };
    }
    return result;
  }
  function selectCodec(preference, encoder, decoder) {
    const local = cleanCapabilities(encoder), remote = cleanCapabilities(decoder);
    if (preference !== 'auto') return Object.hasOwn(codecNames, preference) ? preference : 'auto';
    // MediaCapabilities é estimativa: nesta máquina informou false para H.264,
    // embora getStats confirmou NVIDIA MFT em hardware. Usa H.264 como base de
    // compatibilidade quando negociável; a confirmação continua sendo em execução.
    if (local.h264?.rtpSupported && remote.h264?.rtpSupported !== false) return 'h264';
    const candidates = Object.keys(codecNames).filter(key => local[key]?.supported && local[key]?.powerEfficient === true
      && local[key]?.smooth !== false && remote[key]?.supported !== false);
    candidates.sort((a, b) => {
      const rank = key => remote[key]?.powerEfficient === true ? 0 : remote[key]?.powerEfficient === false ? 2 : 1;
      return rank(a) - rank(b);
    });
    return candidates[0] || 'auto';
  }
  function createCapabilityProbe({ rtpCapabilities, mediaCapabilities, timeoutMs = 1000, now = Date.now }) {
    const cache = new Map();
    function rtp(direction) {
      let codecs = [];
      try { codecs = rtpCapabilities(direction)?.codecs || []; } catch {}
      return Object.fromEntries(Object.entries(codecNames).map(([name, mime]) => {
        const supported = codecs.some(c => c.mimeType?.toLowerCase() === mime.toLowerCase());
        return [name, { supported, rtpSupported: supported, smooth: null, powerEfficient: null }];
      }));
    }
    return {
      rtp,
      probe(direction, shape) {
        const config = { width: shape.width || 1920, height: shape.height || 1080, framerate: shape.fps || 60, bitrate: shape.bitrate || 8000000 };
        const key = direction + JSON.stringify(config), cached = cache.get(key);
        if (cached && now() - cached.at < 60000) return cached.promise;
        const promise = (async () => {
          const available = rtp(direction);
          const pairs = await Promise.all(Object.entries(codecNames).map(async ([name, mime]) => {
            const supported = available[name].supported;
            const fallback = { supported, rtpSupported: supported, smooth: null, powerEfficient: null };
            const method = direction === 'encode' ? 'encodingInfo' : 'decodingInfo';
            if (!supported || typeof mediaCapabilities?.[method] !== 'function') return [name, fallback];
            let timer;
            try {
              const value = await Promise.race([
                Promise.resolve().then(() => mediaCapabilities[method]({ type: 'webrtc', video: { ...config, contentType: mime } })),
                new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
              ]);
              return [name, value ? { supported: value.supported === true, rtpSupported: supported, smooth: value.smooth === true, powerEfficient: value.powerEfficient === true } : fallback];
            } catch { return [name, fallback]; }
            finally { clearTimeout(timer); }
          }));
          return Object.fromEntries(pairs);
        })();
        if (cache.size >= 8) cache.delete(cache.keys().next().value);
        cache.set(key, { at: now(), promise }); return promise;
      },
    };
  }
  function createStatsReader({ now = () => performance.now(), ttl = 750 } = {}) {
    const entries = new WeakMap();
    return {
      read(pc) {
        const previous = entries.get(pc);
        if (previous && (previous.busy || now() - previous.at < ttl)) return previous.promise;
        const entry = { at: now(), busy: true };
        entry.promise = Promise.resolve().then(() => pc.getStats()).then(value => {
          entry.busy = false; return value;
        }, error => { if (entries.get(pc) === entry) entries.delete(pc); throw error; });
        entries.set(pc, entry); return entry.promise;
      },
      clear(pc) { entries.delete(pc); },
    };
  }
  const finite = v => Number.isFinite(v) ? v : null;
  function createMetrics(direction) {
    let previous = null, last = null;
    return {
      reset() { previous = last = null; },
      sample(report) {
        const outgoing = direction === 'outbound';
        let video = null, pair = null;
        report.forEach(r => {
          if (r.type === (outgoing ? 'outbound-rtp' : 'inbound-rtp') && r.kind === 'video'
            && (outgoing ? Number.isFinite(r.framesEncoded) : Number.isFinite(r.framesDecoded))
            && (!video || (r.bytesSent || r.bytesReceived || 0) > (video.bytesSent || video.bytesReceived || 0))) video = r;
          if (r.type === 'transport' && r.selectedCandidatePairId) pair = report.get(r.selectedCandidatePairId);
        });
        if (!video) return null;
        if (previous?.id === video.id && previous.timestamp === video.timestamp) return last;
        const prior = previous?.id === video.id && video.timestamp > previous.timestamp ? previous : null;
        const delta = key => prior && Number.isFinite(video[key]) && Number.isFinite(prior[key]) && video[key] >= prior[key] ? video[key] - prior[key] : null;
        const average = (sum, count) => {
          const n = delta(count), total = delta(sum);
          return n > 0 && total != null ? total * 1000 / n : null;
        };
        const bytes = delta(outgoing ? 'bytesSent' : 'bytesReceived');
        const duration = prior ? video.timestamp - prior.timestamp : null;
        const frameDelta = delta(outgoing ? 'framesEncoded' : 'framesDecoded');
        const intervalFps = duration > 0 && frameDelta != null ? frameDelta * 1000 / duration : null;
        const remote = video.remoteId && report.get(video.remoteId);
        const freezeSeconds = outgoing ? null : delta('totalFreezesDuration');
        last = {
          sampledAt: finite(video.timestamp),
          codec: report.get(video.codecId)?.mimeType || null,
          width: finite(video.frameWidth), height: finite(video.frameHeight), fps: finite(video.framesPerSecond) ?? intervalFps,
          sourceFps: finite(outgoing ? report.get(video.mediaSourceId)?.framesPerSecond : null),
          implementation: String((outgoing ? video.encoderImplementation : video.decoderImplementation) || '').slice(0, 160) || null,
          powerEfficient: typeof (outgoing ? video.powerEfficientEncoder : video.powerEfficientDecoder) === 'boolean'
            ? (outgoing ? video.powerEfficientEncoder : video.powerEfficientDecoder) : null,
          encodeMs: outgoing ? average('totalEncodeTime', 'framesEncoded') : null,
          decodeMs: outgoing ? null : average('totalDecodeTime', 'framesDecoded'),
          sendQueueMs: outgoing ? average('totalPacketSendDelay', 'packetsSent') : null,
          jitterBufferMs: outgoing ? null : average('jitterBufferDelay', 'jitterBufferEmittedCount'),
          jitterTargetMs: outgoing ? null : average('jitterBufferTargetDelay', 'jitterBufferEmittedCount'),
          jitterMinimumMs: outgoing ? null : average('jitterBufferMinimumDelay', 'jitterBufferEmittedCount'),
          framesDropped: outgoing ? null : delta('framesDropped'),
          freezes: outgoing ? null : delta('freezeCount'),
          freezeMs: freezeSeconds == null ? null : freezeSeconds * 1000,
          processingMs: outgoing ? null : average('totalProcessingDelay', 'framesDecoded'),
          bitrate: duration > 0 && bytes != null ? bytes * 8000 / duration : null,
          qualityLimitation: outgoing ? video.qualityLimitationReason || null : null,
          availableBitrate: finite(pair?.availableOutgoingBitrate), rttMs: pair?.currentRoundTripTime == null ? null : pair.currentRoundTripTime * 1000,
          fractionLost: outgoing ? finite(remote?.fractionLost) : null,
          targetBitrate: finite(outgoing ? video.targetBitrate : null),
          frames: outgoing ? video.framesEncoded : video.framesDecoded,
        };
        previous = { ...video }; return last;
      },
    };
  }
  function applyReceiverBuffer(receiver, targetMs = null) {
    if (targetMs !== null && targetMs !== 0 && targetMs !== 50) throw new RangeError('Alvo de buffer experimental inválido.');
    const kind = receiver?.track?.kind;
    if (!['audio', 'video'].includes(kind)) return null;
    const supported = 'jitterBufferTarget' in receiver;
    const result = { kind, requestedMs: targetMs, readbackMs: null, supported,
      status: targetMs === null ? 'automatic' : 'unsupported' };
    if (targetMs === null || !supported) return result;
    try {
      receiver.jitterBufferTarget = targetMs;
      const value = receiver.jitterBufferTarget;
      result.readbackMs = Number.isFinite(value) && value >= 0 && value <= 4000 ? value : null;
      result.status = result.readbackMs === targetMs ? 'accepted' : 'unconfirmed';
    } catch { result.status = 'rejected'; }
    return result;
  }
  // Opt-in na aba Experimental; recuperação/qualidade entre PCs ainda pendentes.
  function createRateController({ realtime = false } = {}) {
    let factor = 1, maxBitrate = null, bad = 0, good = 0, seen = 0, peakBandwidth = 0, changedAt = -Infinity, sampledAt = null;
    return {
      get factor() { return factor; },
      get maxBitrate() { return maxBitrate; },
      get intervalMs() { return realtime ? 1000 : 2000; },
      get strategy() { return realtime ? 'bandwidth-v2' : 'conservative'; },
      get requiresCeiling() { return realtime; },
      reset() { factor = 1; maxBitrate = null; bad = good = seen = peakBandwidth = 0; changedAt = -Infinity; sampledAt = null; },
      restartSampling() {
        // Renovar somente a mídia não devolve imediatamente o teto anterior à
        // saturação. A nova conexão precisa produzir suas próprias evidências.
        bad = good = seen = peakBandwidth = 0; changedAt = -Infinity; sampledAt = null;
      },
      sample(metrics, now, ceiling) {
        if (!metrics) return factor;
        const queue = Number.isFinite(metrics.sendQueueMs) && metrics.sendQueueMs >= 0;
        const loss = Number.isFinite(metrics.fractionLost) && metrics.fractionLost >= 0 && metrics.fractionLost <= 1;
        if (!queue && !loss) return factor;
        if (Number.isFinite(metrics.sampledAt)) {
          if (sampledAt != null && metrics.sampledAt <= sampledAt) return factor;
          sampledAt = metrics.sampledAt;
        }
        seen++;
        const estimated = Number.isFinite(metrics.availableBitrate) && metrics.availableBitrate > 0;
        const responsive = realtime && Number.isFinite(ceiling) && ceiling > 0;
        const bandwidthDropped = responsive && estimated && peakBandwidth > 0 && metrics.availableBitrate < peakBandwidth * 0.75;
        if (estimated) peakBandwidth = Math.max(peakBandwidth, metrics.availableBitrate);
        const queued = queue && metrics.sendQueueMs > 40;
        const headroom = responsive && estimated && queue && metrics.sendQueueMs <= 20 && (!loss || metrics.fractionLost < 0.1)
          && metrics.availableBitrate * 0.9 >= (maxBitrate ?? ceiling * factor);
        const congested = queued || loss && metrics.fractionLost > 0.03 && !headroom;
        const healthy = queue && metrics.sendQueueMs <= 20 && (!loss || metrics.fractionLost <= 0.03 || headroom);
        if (congested) { bad++; good = 0; } else { good = !responsive || healthy ? good + 1 : 0; bad = 0; }
        if (responsive) {
          if (now - changedAt < 2000) return factor;
          const severe = queue && metrics.sendQueueMs >= 250 || loss && metrics.fractionLost >= 0.15;
          const established = maxBitrate != null || bandwidthDropped && seen >= 2;
          if (congested && (severe || established && bad >= 2 || bad >= 5)) {
            // Fila grave não espera convergência do estimador. Sem estimativa,
            // limita em bytes/s também: o piso de 10% do modo legado pode ser
            // maior que a conexão inteira quando há vários receptores.
            const currentLimit = Math.min(ceiling, maxBitrate ?? ceiling * factor);
            const budget = Math.max(32000, Math.min(ceiling * 0.8,
              estimated ? metrics.availableBitrate * 0.7 : currentLimit * (severe ? 0.5 : 0.8)));
            const current = maxBitrate == null ? budget : queued ? Math.max(32000, currentLimit * (severe && !estimated ? 0.5 : 0.8)) : maxBitrate;
            maxBitrate = Math.min(ceiling, budget, current);
            factor = 1; changedAt = now; bad = 0;
          } else if (good >= 3 && maxBitrate != null && healthy) {
            // Sobe no máximo 25% por etapa saudável; uma estimativa em salto
            // não deve recolocar de uma vez toda a carga que gerou a fila.
            const growth = maxBitrate * 0.25;
            const budget = Math.min(ceiling, maxBitrate + growth,
              estimated ? Math.max(maxBitrate, metrics.availableBitrate * 0.8) : Infinity);
            maxBitrate = budget >= ceiling ? null : budget;
            factor = 1; changedAt = now; good = 0;
          }
          return factor;
        }
        if (now - changedAt < 4000) return factor;
        if (bad >= 2) { factor = Math.max(0.1, factor * 0.8); changedAt = now; bad = 0; }
        else if (good >= 5 && factor < 1) { factor = Math.min(1, factor + 0.1); changedAt = now; good = 0; }
        return factor;
      },
    };
  }
  function createCapacityController() {
    let level = 0, bad = 0, good = 0, last = -Infinity, signature = null, reason = 'unknown';
    return {
      snapshot: () => ({ level, reason }),
      reset() { level = bad = good = 0; last = -Infinity; signature = null; reason = 'unknown'; },
      sample(hardware, senders, now, wallNow = Date.now()) {
        if (!Number.isFinite(now) || now - last >= 0 && now - last < 5000) return level;
        if (now < last || now - last > 15000) { bad = good = 0; signature = null; }
        last = now;
        const telemetry = hardware?.telemetry;
        const age = wallNow - telemetry?.sampledAt;
        const devices = telemetry?.available && age >= 0 && age <= 10000 ? telemetry.devices?.filter(d => d.active) || [] : [];
        const device = devices.length === 1 ? devices[0] : null;
        const observed = senders.filter(s => s.metrics && Number.isFinite(s.metrics.sampledAt)
          && wallNow - s.metrics.sampledAt >= 0 && wallNow - s.metrics.sampledAt <= 10000);
        const key = JSON.stringify([device ? telemetry.sampledAt : null, observed.map(s => s.metrics.sampledAt)]);
        if (key === signature) return level;
        signature = key;
        const pressured = device && (device.encoderUtilization >= 85
          || device.memoryFreeMiB != null && device.memoryTotalMiB > 0 && device.memoryFreeMiB < Math.max(256, device.memoryTotalMiB * 0.05));
        const overloaded = observed.some(s => s.metrics.powerEfficient === true && s.policy?.maxFramerate > 0
          && s.metrics.sourceFps >= s.policy.maxFramerate * 0.9 && s.metrics.fps < s.policy.maxFramerate * 0.8
          && s.metrics.encodeMs > 850 / s.policy.maxFramerate);
        const healthyDriver = device && device.encoderUtilization != null && device.encoderUtilization < 65
          && device.memoryFreeMiB != null && device.memoryFreeMiB > Math.max(512, device.memoryTotalMiB * 0.1);
        const healthyEncoder = !device && observed.length > 0 && observed.length === senders.length
          && observed.every(s => s.metrics.powerEfficient === true && s.policy?.maxFramerate > 0
            && s.metrics.fps >= s.policy.maxFramerate * 0.9 && s.metrics.encodeMs >= 0 && s.metrics.encodeMs < 500 / s.policy.maxFramerate);
        if (pressured || overloaded) {
          bad++; good = 0; reason = pressured ? 'driver-pressure' : 'encoder-pressure';
          if (bad >= 3) { level = Math.min(3, level + 1); bad = 0; }
        } else if (healthyDriver || healthyEncoder) {
          good++; bad = 0; reason = 'healthy';
          if (good >= 6) { level = Math.max(0, level - 1); good = 0; }
        } else { bad = good = 0; reason = 'unknown'; }
        return level;
      },
    };
  }
  return { profiles, normalize, captureConstraints, observeCapture, encodePolicy, preferCodecs, selectCodec, cleanCapabilities, createCapacityController,
    createCapabilityProbe, createStatsReader, createMetrics, createRateController, applyReceiverBuffer };
});
