(function (root) {
  const choice = (value, options) => options.includes(value) ? value : null;
  const number = value => Number.isFinite(value) && value >= 0 && value <= 1e12 ? value : null;
  const flag = value => typeof value === 'boolean' ? value : null;
  const codes = { manual: 'Relato manual', video_stalled: 'Vídeo sem novos quadros', capture_failed: 'Falha de captura',
    renderer_crash: 'Processo da interface encerrado', interface_stalled: 'Interface travada', script_error: 'Erro de aplicação' };
  function snapshot(raw = {}) {
    const settings = raw?.settings || {};
    const experiments = {};
    for (const key of ['binaryFast','smallFastQueue','expireFastPackets','responsiveVideo','shortVideoBuffer','recoverDelayedVideo','relaySelection','gpuBudget'])
      if (typeof settings.experiments?.[key] === 'boolean') experiments[key] = settings.experiments[key];
    const streams = Array.isArray(raw?.streams) ? raw.streams.slice(0, 12).filter(Boolean).map(s => ({
      direction: choice(s.direction, ['envio', 'recepção']), route: choice(s.route, ['p2p','turn','unknown']),
      state: choice(s.state, ['new','connecting','connected','disconnected','failed','closed']),
      codec: choice(s.codec, ['video/H264','video/H265','video/VP8','video/VP9','video/AV1']),
      ...Object.fromEntries(['fps','width','height','bitrate','rttMs','fractionLost','freezes'].map(k => [k, number(s[k])]))
    })) : [];
    return { client: choice(raw?.client, ['App','Navegador']), version: typeof raw?.version === 'string' && /^(?:dev|\d+(?:\.\d+){1,3})$/.test(raw.version) ? raw.version : null,
      settings: { profile: choice(settings.profile,['desktop','game720','game1080']), priority: choice(settings.priority,['auto','motion','detail']),
        codec: choice(settings.codec,['auto','vp8','av1','h264']), uploadMbps: number(settings.uploadMbps), adaptive: flag(settings.adaptive),
        preview: flag(settings.preview), nativeCapture: flag(settings.nativeCapture), experiments }, streams };
  }
  const api = { snapshot, codes };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WssDiagnosticFields = api;
})(globalThis);
