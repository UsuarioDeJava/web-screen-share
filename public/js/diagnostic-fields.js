(function (root) {
  const choice = (value, options) => options.includes(value) ? value : null;
  const number = value => Number.isFinite(value) && value >= 0 && value <= 1e12 ? value : null;
  const flag = value => typeof value === 'boolean' ? value : null;
  const codes = { manual: 'Relato manual', video_stalled: 'Vídeo sem novos quadros', capture_failed: 'Falha de captura',
    renderer_crash: 'Processo da interface encerrado', interface_stalled: 'Interface travada', script_error: 'Erro de aplicação',
    // Tela preta: conectado, mas nenhum quadro (quem assiste) ou nenhum quadro codificado (quem transmite).
    video_black: 'Vídeo sem imagem (conectado, sem quadros)', encode_stalled: 'Transmissão sem quadros codificados' };
  // Nome do codificador/decodificador (ex.: "NVIDIA MFT", "libvpx", "ExternalEncoder"): só letras e pontuação simples.
  const implementation = value => typeof value === 'string' && value.trim()
    ? value.replace(/[^A-Za-z0-9 ._()+,\/-]/g, '').trim().slice(0, 80) || null : null;
  // O detalhe de um erro automático (mensagem, arquivo e linha): sem endereços completos
  // (fica só o nome do arquivo, sem parâmetros) e curto.
  function detail(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\b(?:https?|wss?|file):\/\/[^\s)'"]*/gi, url => (url.split(/[?#]/)[0].split('/').pop() || 'endereço'))
      .replace(/\b[a-f0-9]{32,}\b/gi, '…').replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  function snapshot(raw = {}) {
    const settings = raw?.settings || {};
    const experiments = {};
    for (const key of ['binaryFast','smallFastQueue','expireFastPackets','responsiveVideo','shortVideoBuffer','recoverDelayedVideo','relaySelection','gpuBudget'])
      if (typeof settings.experiments?.[key] === 'boolean') experiments[key] = settings.experiments[key];
    const streams = Array.isArray(raw?.streams) ? raw.streams.slice(0, 12).filter(Boolean).map(s => ({
      direction: choice(s.direction, ['envio', 'recepção']), route: choice(s.route, ['p2p','turn','unknown']),
      state: choice(s.state, ['new','connecting','connected','disconnected','failed','closed']),
      codec: choice(s.codec, ['video/H264','video/H265','video/VP8','video/VP9','video/AV1']),
      implementation: implementation(s.implementation), powerEfficient: flag(s.powerEfficient),
      ...Object.fromEntries(['fps','width','height','bitrate','rttMs','fractionLost','freezes','frames','encodeMs','decodeMs'].map(k => [k, number(s[k])]))
    })) : [];
    const platform = raw?.platform || {};
    return { client: choice(raw?.client, ['App','Navegador']),
      platform: { os: choice(platform.os, ['Windows','macOS','Linux','ChromeOS','Android','iOS']),
        browser: choice(platform.browser, ['Chrome','Edge','Firefox','Safari','Opera','Electron']), major: number(platform.major) }, version: typeof raw?.version === 'string' && /^(?:dev|\d+(?:\.\d+){1,3})$/.test(raw.version) ? raw.version : null,
      settings: { profile: choice(settings.profile,['desktop','game720','game1080']), priority: choice(settings.priority,['auto','motion','detail']),
        codec: choice(settings.codec,['auto','vp8','av1','h264']), uploadMbps: number(settings.uploadMbps), adaptive: flag(settings.adaptive),
        preview: flag(settings.preview), nativeCapture: flag(settings.nativeCapture), experiments }, streams };
  }
  // Sistema e navegador desta página (só o nome e a versão principal).
  function platform(nav = root.navigator) {
    const ua = String(nav?.userAgent || '');
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
      : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
    const found = [['Electron', /Electron\/(\d+)/], ['Edge', /Edg\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /Firefox\/(\d+)/],
      ['Chrome', /Chrome\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]].find(([, re]) => re.test(ua));
    return { os, browser: found ? found[0] : null, major: found ? Number(ua.match(found[1])[1]) : null };
  }
  const api = { snapshot, codes, detail, platform };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WssDiagnosticFields = api;
})(globalThis);
