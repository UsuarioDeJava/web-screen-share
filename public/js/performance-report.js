(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssPerformanceReport = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const number = value => Number.isFinite(value) && value >= 0 ? value : null;
  const choice = (value, values) => values.includes(value) ? value : null;
  const text = value => typeof value === 'string' && /^[\w .()+-]{1,160}$/.test(value) ? value : null;
  const metricsKeys = ['width', 'height', 'fps', 'sourceFps', 'encodeMs', 'decodeMs', 'sendQueueMs', 'jitterBufferMs',
    'jitterTargetMs', 'jitterMinimumMs', 'framesDropped', 'freezes', 'freezeMs', 'processingMs', 'bitrate',
    'availableBitrate', 'rttMs', 'fractionLost', 'targetBitrate', 'frames'];
  function metrics(value, at) {
    if (!value) return null;
    return { codec: choice(value.codec, ['video/H264', 'video/VP8', 'video/VP9', 'video/AV1', 'video/H265']),
      implementation: text(value.implementation), powerEfficient: typeof value.powerEfficient === 'boolean' ? value.powerEfficient : null,
      ageMs: Number.isFinite(value.sampledAt) && value.sampledAt <= at ? at - value.sampledAt : null,
      ...Object.fromEntries(metricsKeys.map(key => [key, number(value[key])])) };
  }
  function route(value) {
    return { kind: choice(value?.kind, ['p2p', 'turn', 'unknown']), protocol: choice(value?.protocol, ['udp', 'tcp', 'tls', 'ssltcp']),
      vpn: choice(value?.vpn, ['possible', 'unknown']) || 'unknown' };
  }
  function build({ at = Date.now(), version, platform, capture = {}, streams = [], controls = [], hardware, experiments } = {}) {
    return { schema: 1, collectedAt: new Date(at).toISOString(), version: text(version),
      platform: /^Win/i.test(platform || '') ? 'Windows' : /^Linux/i.test(platform || '') ? 'Linux' : /^Mac/i.test(platform || '') ? 'macOS' : 'unknown',
      scope: 'Current local snapshots and command RTT samples; not input-to-photon. Compare clocks only within the same PC.',
      experiments: experiments ? Object.fromEntries(['active', 'saved'].map(group => [group,
        Object.fromEntries(['binaryFast', 'smallFastQueue', 'expireFastPackets', 'responsiveVideo', 'shortVideoBuffer', 'recoverDelayedVideo', 'relaySelection', 'gpuBudget'].map(key => [key,
          typeof experiments[group]?.[key] === 'boolean' ? experiments[group][key] : null]))])) : null,
      hardware: hardware ? { features: Object.fromEntries(['video_encode', 'video_decode', 'gpu_compositing'].map(key => [key, text(hardware.features?.[key])])),
        devices: (hardware.devices || []).slice(0, 4).map(d => ({ vendorId: number(d.vendorId), deviceId: number(d.deviceId), active: d.active === true })),
        telemetry: hardware.telemetry ? { available: hardware.telemetry.available === true,
          source: choice(hardware.telemetry.source, ['nvidia-smi', 'unavailable']),
          ageMs: number(at - hardware.telemetry.sampledAt),
          devices: (hardware.telemetry.devices || []).slice(0, 4).map(d => ({ active: d.active === true,
            vendorId: number(d.vendorId), deviceId: number(d.deviceId), sessionLimit: null,
            ...Object.fromEntries(['memoryTotalMiB', 'memoryFreeMiB', 'encoderUtilization', 'encoderSessions', 'encoderAverageFps', 'encoderLatencyMs'].map(key => [key, number(d[key])])) })) } : null } : null,
      capture: { active: capture.active === true, profile: choice(capture.options?.profile, ['desktop', 'game720', 'game1080']),
        capacity: capture.capacity ? { enabled: capture.capacity.enabled === true,
          level: choice(capture.capacity.level, [0, 1, 2, 3]),
          reason: choice(capture.capacity.reason, ['unknown', 'driver-pressure', 'encoder-pressure', 'healthy']) } : null,
        native: capture.native?.enabled ? {enabled:true,frames:number(capture.native.frames),skipped:number(capture.native.skipped),recoveries:number(capture.native.recoveries),
          transportQueueBoundVerified:false,
          framing: capture.native.framing ? Object.fromEntries(['frames','borrowedPayloads','allocatedPayloads','payloadBytesCopied','headerBytesCopied','maxOwnedPayloadBytes','ownedPayloadBytes'].map(key=>[key,number(capture.native.framing[key])])) : null,
          bitstream: capture.native.session?.bitstream ? Object.fromEntries(['frames','pSlices','iSlices','bSlices','rejected'].map(key=>[key,number(capture.native.session.bitstream[key])])) : null,
          admission: Object.fromEntries(['pendingFrames','pendingBytes','maxFrames','maxBytes','maxConfirmationMs','confirmationDeadlineMs','rejected','superseded','supersededBytes','waitingFrames','waitingBytes','creditWaits','maxCreditWaitMs'].map(key=>[key,number(capture.native.session?.admission?.[key])])),
          pacing: Object.fromEntries(['pendingFrames','pendingBytes','maxFrameWaitMs','originalPackets','repairPackets'].map(key=>[key,number(capture.native.session?.pacing?.[key])]))} : null,
        adaptive: typeof capture.options?.adaptive === 'boolean' ? capture.options.adaptive : null,
        preview: typeof capture.options?.preview === 'boolean' ? capture.options.preview : null,
        uploadMbps: number(capture.options?.uploadMbps), width: number(capture.actual?.width), height: number(capture.actual?.height),
        frameRateSetting: number(capture.actual?.frameRate),
        senders: (capture.senders || []).slice(0, 64).map((s, index) => ({ slot: index + 1, state: choice(s.state, ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']),
          route: route(s.route), maxBitrate: number(s.policy?.maxBitrate), maxFramerate: number(s.policy?.maxFramerate),
          adaptation: s.adaptation ? { strategy: choice(s.adaptation.strategy, ['conservative', 'bandwidth-v2', 'legacy','native-feedback']),
            intervalMs: number(s.adaptation.intervalMs), factor: number(s.adaptation.factor), bitrateCeiling: number(s.adaptation.bitrateCeiling) } : null,
          metrics: metrics(s.metrics, at) })) },
      streams: streams.slice(0, 64).map((s, index) => ({ slot: index + 1, watching: s.watching === true,
        state: choice(s.state, ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']), route: route(s.route), metrics: metrics(s.metrics, at),
        latencyRecoveries: number(s.latencyRecoveries),
        receiverTargets: (s.receiverTargets || []).slice(0, 2).map(t => ({ kind: choice(t.kind, ['audio', 'video']),
          requestedMs: [0,50].includes(t.requestedMs) ? t.requestedMs : null, readbackMs: number(t.readbackMs), supported: t.supported === true,
          status: choice(t.status, ['automatic', 'unsupported', 'accepted', 'unconfirmed', 'rejected']) })) })),
      controls: controls.slice(0, 64).map((s, index) => ({ slot: index + 1, role: choice(s.role, ['host', 'guest']),
        transport: choice(s.transport, ['webrtc', 'socket']), route: route(s.transport === 'webrtc' ? { kind: s.route, protocol: s.protocol, vpn: s.vpn } : null),
        fastFormat: choice(s.fastFormat, ['binary-v1', 'json']),
        fastMaxPacketLifeTime: number(s.fastMaxPacketLifeTime), fastMaxRetransmits: number(s.fastMaxRetransmits),
        ...Object.fromEntries(['commandRttMs', 'networkRttMs', 'commandProbeTimeouts', 'peerPacketsSent', 'binaryFastPacketsReceived', 'socketPacketsSent',
          'droppedSnapshots', 'droppedFastSnapshots', 'droppedIncomingPackets', 'maxFastBufferedAmount', 'signalingPending'].map(key => [key, number(s[key])])),
        commandLatency: s.commandLatency ? Object.fromEntries(['count', 'p50', 'p95', 'p99'].map(key => [key, number(s.commandLatency[key])])) : null })) };
  }
  return { build };
});
