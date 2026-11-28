(() => {
  const PRESETS = window.QUALITY_PRESETS;
  const DEFAULT_QUALITY = window.DEFAULT_QUALITY;
  const Video = window.WssVideoPolicy;
  const gpuCapacity = Video.createCapacityController();
  let gpuHardwarePending = null, gpuHardwareAt = -Infinity;
  const transportExperiments = window.WssExperiments.create(localStorage);
  const peerStats = Video.createStatsReader();
  const codecProbe = Video.createCapabilityProbe({ mediaCapabilities: navigator.mediaCapabilities,
    rtpCapabilities: direction => (direction === 'encode' ? window.RTCRtpSender : window.RTCRtpReceiver)?.getCapabilities('video') });
  const TILE_BAR_HEIGHT = 48; // precisa bater com .tile-bar no CSS
  const TILE_BORDER = 1; // borda do .tile no CSS
  const TILE_GAP = 12;
  const MIN_TILE_WIDTH = 280;
  // Miniaturas das outras transmissões quando uma está fixada em destaque.
  const PIN_THUMB_MIN = 160;
  const PIN_THUMB_MAX = 360;

  const ICONS = {
    share: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/>',
    stop: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9.5 7.5l5 5M14.5 7.5l-5 5"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    volumeX: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="m2 2 20 20"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    pinOff: '<path d="M12 17v5"/><path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/><path d="m2 2 20 20"/><path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    pip: '<path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4"/><rect width="10" height="7" x="12" y="13" rx="2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
    headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    headphonesOff: '<path d="M21 14h-1.343"/><path d="M9.128 3.47A9 9 0 0 1 21 12v3.343"/><path d="m2 2 20 20"/><path d="M20.414 20.414A2 2 0 0 1 19 21h-1a2 2 0 0 1-2-2v-3"/><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 2.636-6.364"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
    micOff: '<path d="m2 2 20 20M18.89 13.23A7.12 7.12 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.34V5a3 3 0 0 0-5.68-1.33M9 9v3a3 3 0 0 0 5.12 2.12M12 19v3"/>',
    phoneOff: '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91M22 2 2 22"/>',
    pointer: '<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"/>',
    pointerOff: '<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.13 1.58a2 2 0 0 0-1.43 1.43l-1.58 6.13a.5.5 0 0 1-.95.06z"/><path d="m2 2 20 20"/>',
    gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.41.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.54-.6-6.58-.68-7.26A4 4 0 0 0 17.32 5z"/>',
    broadcast: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  };

  // Reações que sobem por cima da transmissão (o servidor aceita só estas).
  const REACTIONS = ['🔥', '😂', '😮', '👏', '❤️', '💀'];

  const CONNECTION_LABELS = {
    new: 'iniciando',
    connecting: 'conectando',
    connected: 'conectado',
    disconnected: 'instável',
    failed: 'falhou',
    closed: 'encerrada',
  };

  const $ = (id) => document.getElementById(id);
  const loginEl = $('login');
  const loginForm = $('login-form');
  const nickInput = $('nick');
  const loginBtn = $('login-btn');
  const loginError = $('login-error');
  const appEl = $('app');
  const userListEl = $('user-list');
  const userCountEl = $('user-count');
  const meAvatarEl = $('me-avatar');
  const meNameEl = $('me-name');
  const connDot = $('conn-dot');
  const connText = $('conn-text');
  const btnLeave = $('btn-leave');
  const btnShare = $('btn-share');
  const shareHint = $('share-hint');
  const liveCountEl = $('live-count');
  const gridEl = $('grid');
  const gridInner = $('grid-inner');
  const emptyEl = $('empty');
  const emptyHint = $('empty-hint');
  const emptyTitle = $('empty-title');
  const defaultEmptyTitle = emptyTitle.textContent;
  const defaultEmptyHint = emptyHint.innerHTML;
  const toastEl = $('toast');
  const loginVersionEl = $('login-version');
  const sidebarVersionEl = $('sidebar-version');
  const updateBanner = $('update-banner');
  const certWarningEls = [$('login-cert'), $('cert-banner')];
  const CERT_WARNING_DAYS = 30;
  const btnObs = $('btn-obs');
  let localObsEndpoint=null;
  let obsCredentials = null, obsCredentialRequest = null, obsCredentialOwner = null, obsIdentitySupported = false, obsCredentialGeneration = 0;
  try {
    const raw = sessionStorage.getItem('wss-obs-publication');
    const saved = raw && raw.length < 512 ? JSON.parse(raw) : null;
    if (saved && /^pub_[a-f0-9]{32}$/.test(saved.path) && /^[a-f0-9]{64}$/.test(saved.token) && Number.isFinite(saved.expiresAt))
      obsCredentials = { path: saved.path, token: saved.token, expiresAt: saved.expiresAt,
        url: new URL('/obs-publish/' + saved.path.slice(4), location.origin).href, individual: true };
  } catch {}
  const proxyBanner = $('proxy-banner');
  const sidebarEl = $('sidebar');
  const btnPeople = $('btn-people');
  const peopleCountEl = $('people-count');
  const topbarConn = $('topbar-conn');
  const diagDialog = $('diag-dialog');
  const diagOutput = $('diag-output');
  const btnChat = $('btn-chat');
  const chatUnreadEl = $('chat-unread');
  const chatEl = $('chat');
  const chatList = $('chat-list');
  const chatEmpty = $('chat-empty');
  const chatForm = $('chat-form');
  const chatInput = $('chat-input');
  const chatError = $('chat-error');
  const keysDialog = $('keys-dialog');
  const btnVoice = $('btn-voice');
  const voiceControls = $('voice-controls');
  const voicePeople = $('voice-people');
  const btnMic = $('btn-mic');
  const btnDeafen = $('btn-deafen');
  const btnVoiceLeave = $('btn-voice-leave');
  const sounds = window.RoomSounds;

  const socket = io({ autoConnect: false });
  let stopRelayProbe = null;
  // Identifica esta aba entre reconexões do socket, pro servidor derrubar o
  // socket antigo ("fantasma") em vez de duplicar a pessoa na sala.
  const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const getIceServers = window.createIceServers({ fetch: window.fetch.bind(window),
    onRateLimit: seconds => showToast(`O servidor limitou as consultas de conexão. Aguarde ${seconds} s antes de tentar novamente.`) });
  const canShare = Boolean(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  // iOS ignora video.volume (é sempre 1); lá só o botão de mutar funciona.
  const canSetVolume = (() => {
    const probe = document.createElement('video');
    probe.volume = 0.5;
    return probe.volume === 0.5;
  })();

  let wantedName = null;
  let me = null; // { id, name } enquanto estiver na sala
  const users = new Map(); // id -> { id, name, sharing }
  let localStream = null;
  let localNative = null;
  let nativeSnapshot = null;
  window.wssDesktop?.onNativeVideo?.(event => {
    if(!localNative || event.token!==localNative.token)return;
    if(event.type==='error'){showToast(event.error);stopSharing();return;}
    const o=outgoing.get(event.viewer);if(!o?.native)return;
    if(event.type==='offer'){o.sid=event.sid;sidCounter=Math.max(sidCounter,event.sid);send(event.viewer,{stream:me.id,type:'offer',sid:event.sid,sdp:event.sdp,nativeVideo:true});}
    else if(event.type==='state'){o.pc.connectionState=event.state;renderSelfTile();}
    else if(event.type==='recovering'){o.pc.connectionState='connecting';renderSelfTile();}
  });
  let capturePending = false, captureAttempt = 0, activeCapture = null;
  let captureMonitor = null, captureState = null;
  let captureHardware = null, captureCodecEstimates = null, captureProbePending = false;
  let captureOptions;
  try { captureOptions = Video.normalize(JSON.parse(localStorage.getItem('wss-capture-options') || '{}')); }
  catch { captureOptions = Video.normalize(); }
  const captureDialog = $('capture-dialog');
  const captureFields = { profile: $('capture-profile'), priority: $('capture-priority'), codec: $('capture-codec'),
    uploadMbps: $('capture-upload'), adaptive: $('capture-adaptive'), preview: $('capture-preview') };
  let selfTile = null;
  let uptimeTicker;
  const outgoing = new Map(); // viewerId -> { pc, sid, quality, pending }
  const streams = new Map(); // broadcasterId -> estado do tile de quem está transmitindo
  let sidCounter = 0;
  const signalQueue = WssSignaling.createQueue({
    handle: ({ from, data, address }) => handleSignal(from, data, address),
    onError: error => console.warn('Erro de sinalização', error),
  });
  let toastTimer = null;
  let pageVersion = null; // versão do servidor quando esta página foi carregada
  let serverStatus = {};
  let serverOffset = 0; // hora do servidor menos a hora daqui (pro tempo ao vivo)
  let shareStartedAt = null; // quando você começou a transmitir (hora daqui)
  let quietUntil = 0; // logo depois de reconectar: sem avisos de quem reconecta junto
  let joinedBefore = false;

  // ---------- helpers de DOM ----------

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(name) {
    const span = el('span', 'icon');
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    return span;
  }

  function setIcon(btn, name, label) {
    btn.replaceChildren(icon(name));
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function iconButton(name, label) {
    const btn = el('button', 'icon-btn');
    btn.type = 'button';
    setIcon(btn, name, label);
    return btn;
  }

  // Cor de cada pessoa (avatar, nome no chat, marcação na tela, mouse): a que ela
  // escolheu no perfil ou, sem escolha, uma fixa pelo nick. A foto de perfil (se tiver)
  // entra no lugar da letrinha. Os perfis dos outros chegam com a lista da sala.
  const profileColors = new Map(); // nick -> cor escolhida (#rrggbb)
  const profileHues = new Map(); // nick -> tom escolhido (de antes da cor livre)
  const profileAvatars = new Map(); // nick -> endereço da foto no servidor
  // Estilo do mouse e das marcações (setinha, efeito, rastro, clique, ping, pincel): o
  // catálogo e os desenhos ficam em js/fx.js. nick -> estilo.
  const Fx = window.WssFx;
  const profileStyles = new Map();
  // myStyle: o que você escolheu (salvo; "imagem própria" continua escolhida mesmo antes de
  // a imagem chegar no servidor). myImages: as suas imagens já mandadas. myFull: o estilo
  // de verdade, com as imagens (é o que aparece, aqui e pros outros).
  let myStyle = Fx.normalize(null);
  const myImages = { cursor: null, ping: null };
  const plainStyle = (style) => {
    const out = Fx.normalize({ ...style, keepCustom: true });
    delete out.img;
    delete out.pingImg;
    return out;
  };
  try {
    myStyle = plainStyle(JSON.parse(localStorage.getItem('wss-style') || 'null'));
  } catch {}
  let myFull = Fx.normalize(myStyle);
  const refreshMyFull = () => {
    myFull = Fx.normalize({ ...myStyle, img: myImages.cursor, pingImg: myImages.ping });
  };
  const AVATAR_PATH = /^\/avatar\/[0-9a-f]{32}$/;
  const HEX_COLOR = /^#[0-9a-f]{6}$/;
  let myColor = null; // a cor que você escolheu (null: automática), salva neste navegador
  let myHue = null; // só o tom (quem escolheu antes da cor livre), até escolher de novo
  try {
    const savedColor = String(localStorage.getItem('wss-color') || '').toLowerCase();
    const savedHue = parseInt(localStorage.getItem('wss-hue'), 10);
    if (HEX_COLOR.test(savedColor)) myColor = savedColor;
    else if (savedHue >= 0 && savedHue < 360) myHue = savedHue;
  } catch {}

  const { clampByte, hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, hslToHex, hexHue, normalizeHex, luminance, contrast, autoHue } = window.WssColor;

  // O nome escrito na cor escolhida: escura demais pro fundo escuro da sala, clareia só o
  // necessário pra dar pra ler.
  const readableCache = new Map();
  function readable(hex) {
    if (readableCache.has(hex)) return readableCache.get(hex);
    const [r, g, b] = hexToRgb(hex);
    let out = '#ffffff';
    for (let t = 0; t <= 1.001; t += 0.05) {
      const c = rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
      if (contrast(c, '#141725') >= 4.5) {
        out = c;
        break;
      }
    }
    readableCache.set(hex, out);
    return out;
  }

  // A cor de alguém: { hue, color }. color: a cor exata que a pessoa escolheu; sem ela,
  // tudo sai do tom (hue), escolhido ou fixo pelo nick. saved: a cor guardada junto (ex.:
  // numa mensagem antiga do chat), pra quem não está mais na sala.
  function toneOf(name, saved) {
    const color = profileColors.get(name);
    if (color) return { hue: hexHue(color), color };
    if (profileHues.has(name)) return { hue: profileHues.get(name) };
    if (saved && HEX_COLOR.test(saved.color || '')) return { hue: hexHue(saved.color), color: saved.color };
    if (saved && Number.isInteger(saved.hue)) return { hue: saved.hue };
    return { hue: autoHue(name) };
  }

  const nameHue = (name) => toneOf(name).hue;
  const styleOf = (name) => (me && name === me.name ? myFull : profileStyles.get(name) || Fx.normalize(null));
  // Pra camada do app (uma página local): as imagens com o endereço completo do servidor.
  const absoluteStyle = (style) => {
    const out = { ...style };
    for (const key of ['img', 'pingImg']) if (out[key]) out[key] = new URL(out[key], location.href).href;
    return out;
  };
  const overlayStyle = (name) => absoluteStyle(styleOf(name));
  const avatarFill = (tone) => tone.color || `hsl(${tone.hue} 45% 42%)`;
  // Letra em cima da cor: escura numa cor clara (amarelo, branco...), senão branca.
  const inkFor = (tone) => (tone.color && luminance(tone.color) > 0.36 ? '#12141c' : '#ffffff');
  const nameFill = (tone, lightness) => (tone.color ? readable(tone.color) : `hsl(${tone.hue} ${lightness})`);
  // Mouse, marcação, rabisco e reação: a cor exata (ou a viva do tom), sempre em #rrggbb.
  const markFill = (tone) => tone.color || hslToHex(tone.hue, 95, 64);

  function paintAvatar(node, name) {
    const photo = profileAvatars.get(name);
    const tone = toneOf(name);
    node.dataset.photoFrame = profileLooks.get(name)?.frame || 'none';
    node.style.setProperty('--frame-color',markFill(tone));
    node.dataset.name = name;
    node.textContent = photo ? '' : [...name][0] || '?';
    node.style.setProperty('--avatar', avatarFill(tone));
    node.style.setProperty('--avatar-ink', inkFor(tone));
    node.style.backgroundImage = photo ? `url("${photo}")` : '';
    node.classList.toggle('has-photo', Boolean(photo));
    return node;
  }

  function avatar(name) {
    return paintAvatar(el('span', 'avatar'), name);
  }

  // Nome colorido (chat): guarda de quem é, pra mudar de cor junto com o perfil.
  function paintName(node, msg, lightness) {
    node.dataset.nickStyle = profileLooks.get(msg.name)?.nick || 'normal';
    node.dataset.hueName = msg.name;
    node.dataset.hueSl = lightness;
    if (Number.isInteger(msg.hue)) node.dataset.hue = String(msg.hue);
    if (HEX_COLOR.test(msg.color || '')) node.dataset.color = msg.color;
    node.style.setProperty('--name', nameFill(toneOf(msg.name, msg), lightness));
  }

  // Remonta os perfis pela lista da sala; se algo mudou, repinta o que já está na tela.
  const profileLooks = new Map();
  let myLookSettings = window.WssProfileLook.normalize();
  try { myLookSettings = window.WssProfileLook.normalize(JSON.parse(localStorage.getItem('wss-profile-look'))); } catch {}
  function indexProfiles() {
    const colors = new Map();
    const hues = new Map();
    const photos = new Map();
    const styles = new Map();
    const looks = new Map();
    for (const u of users.values()) {
      if (u.kind === 'obs') continue; // o OBS usa o perfil de quem tem o mesmo nick
      looks.set(u.name, window.WssProfileLook.normalize(u.id === me?.id ? myLookSettings : u.look));
      if ((u.style && typeof u.style === 'object') || u.cursorImg || u.pingImg) {
        const imgs = { img: AVATAR_PATH.test(u.cursorImg || '') ? u.cursorImg : null, pingImg: AVATAR_PATH.test(u.pingImg || '') ? u.pingImg : null };
        styles.set(u.name, JSON.stringify(Fx.normalize({ ...(u.style || {}), ...imgs })));
      }
      if (typeof u.color === 'string' && HEX_COLOR.test(u.color)) colors.set(u.name, u.color);
      if (Number.isInteger(u.hue)) hues.set(u.name, u.hue);
      if (typeof u.avatar === 'string' && AVATAR_PATH.test(u.avatar)) photos.set(u.name, u.avatar);
    }
    const same = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
    const knownStyles = new Map([...profileStyles].map(([k, v]) => [k, JSON.stringify(v)]));
    const sameLooks = looks.size === profileLooks.size && [...looks].every(([name,look]) =>
      profileLooks.get(name)?.nick === look.nick && profileLooks.get(name)?.frame === look.frame);
    if (sameLooks && same(colors, profileColors) && same(hues, profileHues) && same(photos, profileAvatars) && same(styles, knownStyles)) return;
    profileLooks.clear();
    for (const [name,look] of looks) profileLooks.set(name,look);
    meNameEl.dataset.nickStyle = myLookSettings.nick;
    for (const [target, source] of [[profileColors, colors], [profileHues, hues], [profileAvatars, photos]]) {
      target.clear();
      for (const [k, v] of source) target.set(k, v);
    }
    profileStyles.clear();
    for (const [k, v] of styles) profileStyles.set(k, JSON.parse(v));
    for (const node of document.querySelectorAll('.avatar[data-name]')) paintAvatar(node, node.dataset.name);
    for (const node of document.querySelectorAll('[data-hue-name]')) {
      node.dataset.nickStyle = looks.get(node.dataset.hueName)?.nick || 'normal';
      const saved = { hue: node.dataset.hue === undefined ? undefined : Number(node.dataset.hue), color: node.dataset.color };
      node.style.setProperty('--name', nameFill(toneOf(node.dataset.hueName, saved), node.dataset.hueSl));
    }
    if (me) onMyProfileChanged();
  }

  function exitFullscreen() {
    const result = document.exitFullscreen && document.exitFullscreen();
    if (result && result.catch) result.catch(() => {});
  }

  function showToast(text, ms = 5000) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
  }

  // ---------- login / sala ----------

  try { nickInput.value = localStorage.getItem('wss-nick') || ''; } catch {}

  function setPageVersion(version) {
    if (pageVersion || !version) return;
    pageVersion = version;
    const label = version === 'dev' ? 'versão de desenvolvimento' : `versão ${version}`;
    loginVersionEl.textContent = label;
    sidebarVersionEl.textContent = label;
    window.wssServerVersion = version === 'dev' ? 'em desenvolvimento' : version; // topo das Configurações
  }

  function showCertificateWarning(cert) {
    if (!cert) return;
    const expires = new Date(cert.expiresAt);
    const days = Math.ceil((expires.getTime() - Date.now()) / 86400000);
    if (days > CERT_WARNING_DAYS) return;
    const date = expires.toLocaleDateString('pt-BR');
    const name = cert.names[0] ? ` (${cert.names[0]})` : '';
    const when = days <= 0
      ? `venceu em ${date}`
      : `vence ${days === 1 ? 'amanhã' : `em ${days} dias`}, em ${date}`;
    const text = `O certificado HTTPS deste servidor${name} ${when}. Pra renovar, rode de novo o "tailscale cert" no NAS e reinicie o app.`;
    for (const el of certWarningEls) {
      el.textContent = text;
      el.classList.toggle('is-expired', days <= 0);
      el.hidden = false;
    }
  }

  let serverStatusRequest = null;
  function loadServerStatus() {
    if (serverStatusRequest) return serverStatusRequest;
    serverStatusRequest = fetch('/status', { cache: 'no-store' })
    .then((res) => res.ok ? res.json() : null)
    .then((status) => {
      if (!status) return;
      serverStatus = status;
      setPageVersion(status.version);
      showCertificateWarning(status.certificate);
      btnObs.hidden = !status.obs;
      applyRoomSettings({ ...status });
      if (status.accounts) enableAccounts();
      if (status.proxy) {
        proxyBanner.textContent = proxyWarningText(status.proxy.port);
        proxyBanner.hidden = false;
      }
    })
    .catch(() => {}).finally(() => { serverStatusRequest = null; });
    return serverStatusRequest;
  }

  // Aberta por um proxy reverso (ex.: Caddy numa porta "+30000") sem PUBLIC_PORT: o
  // TURN do servidor não atravessa o proxy.
  function proxyWarningText(port) {
    return `Esta página foi aberta por um proxy (porta ${port}), e o vídeo que passa pelo servidor (TURN) não atravessa o proxy: `
      + 'quem depende dele pra assistir e as transmissões pelo OBS podem não conectar. '
      + 'Pra corrigir, defina a variável PUBLIC_PORT do app com a porta em que ele está publicado direto no servidor, sem o proxy, e reinicie (veja o README).';
  }

  $('btn-reload').addEventListener('click', () => window.location.reload());

  function showLogin(error) {
    appEl.hidden = true;
    loginEl.hidden = false;
    loginForm.hidden = false;
    newpassForm.hidden = true;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar';
    loginError.textContent = error || '';
    if (accountsMode && nickInput.value) passwordInput.focus();
    else nickInput.focus();
  }

  // ---------- contas (opcional: ACCOUNTS=on no servidor) ----------
  // Com contas, só entra quem tem conta: nick e senha. A sessão (um token) fica guardada
  // neste navegador/app e da próxima vez entra direto. A conta Admin só abre a
  // administração (/admin); as contas com administração entram na sala e abrem a
  // administração pelo botão do escudo.
  const passwordInput = $('password');
  const newpassForm = $('newpass-form');
  const btnAdmin = $('btn-admin');
  let accountsMode = false;
  let account = null; // { id, nick, admin, root, mustChange, obsKey }
  let session = null;
  try { session = localStorage.getItem('wss-session') || null; } catch {}
  function saveSession(token) {
    session = token || null;
    try {
      if (session) localStorage.setItem('wss-session', session);
      else localStorage.removeItem('wss-session');
    } catch {}
  }
  // Pra assistir pelo OBS (WHEP) com contas: a sessão vai junto.
  const authHeaders = () => (accountsMode && session ? { Authorization: `Bearer ${session}` } : {});
  let roomSettings = { roomName: '', notice: '', sharing: 'all', control: true };

  function enableAccounts() {
    if (accountsMode) return;
    accountsMode = true;
    passwordInput.hidden = false;
    $('login-sub').textContent = 'Entre com a sua conta.';
    $('login-hint').textContent = 'A sua conta é criada pelo dono do servidor: peça pra ele.';
    $('ptab-account').hidden = false;
    if (session && socket.connected) resumeSession();
  }

  // O nome da sala, o recado da entrada e as regras que o dono escolheu no painel.
  function applyRoomSettings(next) {
    roomSettings = {
      roomName: typeof next.roomName === 'string' ? next.roomName : roomSettings.roomName,
      notice: typeof next.notice === 'string' ? next.notice : roomSettings.notice,
      sharing: next.sharing === 'admins' ? 'admins' : 'all',
      control: next.control !== false,
    };
    $('login-title').textContent = roomSettings.roomName || 'Web Screen Share';
    $('room-name').textContent = roomSettings.roomName || 'Sala';
    $('login-notice').textContent = roomSettings.notice;
    $('login-notice').hidden = !roomSettings.notice;
    if (typeof next.obs === 'boolean') btnObs.hidden = !next.obs;
  }
  const shareAllowed = () => roomSettings.sharing !== 'admins' || Boolean(me && me.admin);

  // A administração é a página /admin. No navegador, abre numa aba nova e entra sozinha
  // com a sessão desta conta; no app, abre no navegador do sistema (lá pede nick e senha).
  const adminUrl = () => new URL('/admin', location.href).href;
  function openAdmin() {
    if (!account || !account.admin) return;
    window.open(adminUrl(), '_blank', 'noopener');
  }
  btnAdmin.addEventListener('click', openAdmin);

  // Entrou na conta (ou voltou numa sessão guardada): cria a senha, vai pra
  // administração (a conta Admin) ou entra na sala.
  function afterAuth(enter) {
    try { localStorage.setItem('wss-nick', account.nick); } catch {}
    nickInput.value = account.nick;
    if (account.mustChange) {
      showNewPass();
      return;
    }
    if (account.root) {
      wantedName = null;
      if (desktop) {
        window.open(adminUrl(), '_blank', 'noopener');
        socket.emit('auth:logout');
        forgetAccount();
        showLogin('A conta Admin só abre a administração: ela abriu no seu navegador (/admin).');
      } else location.assign(adminUrl());
      return;
    }
    if (enter || wantedName) {
      wantedName = account.nick;
      loginBtn.disabled = true;
      loginBtn.textContent = 'Entrando…';
      join();
    }
  }

  function resumeSession(enter = true) {
    socket.emit('auth:resume', { token: session }, (res) => {
      if (!res || res.error) {
        const wasIn = Boolean(me) || Boolean(wantedName);
        forgetAccount();
        if (wasIn || !loginEl.hidden) showLogin(wasIn ? (res && res.error) || 'Entre de novo.' : '');
        return;
      }
      account = res.account;
      afterAuth(enter);
    });
  }

  function forgetAccount() {
    saveSession(null);
    account = null;
    wantedName = null;
  }

  // Sair da conta: a sessão deste aparelho acaba (as dos outros continuam).
  function logout() {
    leaveVoice();
    stopSharing();
    socket.emit('auth:logout');
    forgetAccount();
    if (me) leaveRoomLocally();
    showLogin();
  }

  function showNewPass() {
    loginEl.hidden = false;
    appEl.hidden = true;
    loginForm.hidden = true;
    newpassForm.hidden = false;
    $('newpass-nick').textContent = account.nick;
    $('newpass-error').textContent = '';
    $('newpass').value = '';
    $('newpass2').value = '';
    $('newpass').focus();
  }

  newpassForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = $('newpass').value;
    const error = $('newpass-error');
    if (next.length < 6) { error.textContent = 'A senha precisa de pelo menos 6 caracteres.'; return; }
    if (next !== $('newpass2').value) { error.textContent = 'As duas senhas não estão iguais.'; return; }
    $('newpass-btn').disabled = true;
    socket.emit('auth:password', { next }, (res) => {
      $('newpass-btn').disabled = false;
      if (!res || res.error) { error.textContent = (res && res.error) || 'Não deu pra salvar a senha.'; return; }
      account = res.account;
      afterAuth(true);
    });
  });
  $('newpass-cancel').addEventListener('click', logout);

  // A conta mudou do lado do servidor (nick, administração) ou acabou.
  socket.on('auth:account', (next) => {
    if (!next || !account || next.id !== account.id) return;
    const renamed = next.nick !== account.nick;
    account = next;
    if (me) {
      me.admin = Boolean(next.admin);
      btnAdmin.hidden = !me.admin;
      if (renamed) rejoin();
    }
  });
  socket.on('auth:expired', (msg) => {
    const wasIn = Boolean(me) || Boolean(account);
    leaveVoice();
    stopSharing();
    forgetAccount();
    if (me) leaveRoomLocally();
    if (wasIn) showLogin((msg && msg.reason) || 'A sua sessão acabou: entre de novo.');
  });
  socket.on('room:kicked', (msg) => {
    leaveVoice();
    stopSharing();
    wantedName = null;
    saveSession(null);
    account = null;
    if (me) leaveRoomLocally();
    showLogin(`Você foi desconectado da sala${msg && msg.by ? ` por ${msg.by}` : ''}.`);
  });
  socket.on('room:settings', (next) => {
    if (!next) return;
    applyRoomSettings(next);
    if (me) renderUsers();
  });
  socket.on('share:refused', (msg) => {
    stopSharing();
    showToast((msg && msg.reason) || 'Você não pode transmitir nesta sala.');
  });
  socket.on('chat:cleared', () => { if (me) loadChat([]); });

  // Trocou de nick: sai e entra de novo com o nick novo (pros outros, sai um e entra o
  // outro; transmissão e voz continuam).
  function rejoin() {
    if (!me || !account) return;
    socket.emit('leave');
    leaveRoomLocally();
    wantedName = account.nick;
    join();
  }

  function showApp() {
    loginEl.hidden = true;
    appEl.hidden = false;
    meNameEl.textContent = me.name;
    paintAvatar(meAvatarEl, me.name);
    renderAll();
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nickInput.value.replace(/\s+/g, ' ').trim();
    if (!name) {
      loginError.textContent = 'Digite um nick.';
      return;
    }
    // Com contas, a senha vai junto.
    const password = passwordInput.value;
    if (accountsMode && !password) {
      loginError.textContent = 'Digite a senha.';
      passwordInput.focus();
      return;
    }
    sounds.unlock(); // o navegador só libera som depois de um clique
    loginBtn.disabled = true;
    loginBtn.textContent = socket.connected ? 'Entrando…' : 'Conectando ao servidor…';
    loginError.textContent = '';
    try {
      if (!serverStatus.version) await loadServerStatus();
      if (accountsMode) {
        if (!socket.connected) socket.connect();
        socket.emit('auth:login', { nick: name, password }, (res) => {
          if (!res || res.error) {
            showLogin((res && res.error) || 'Não deu pra entrar.');
            passwordInput.select();
            return;
          }
          passwordInput.value = '';
          saveSession(res.token);
          account = res.account;
          afterAuth(true);
        });
        return;
      }
      wantedName = name;
      try { localStorage.setItem('wss-nick', name); } catch {}
      if (socket.connected) join(); else socket.connect();
    } catch (error) { showLogin(error.message || 'Não foi possível entrar.'); }
  });

  function join() {
    socket.emit('join', { name: wantedName, clientId, look:myLookSettings, hue: myColor ? hexHue(myColor) : myHue, color: myColor, style: Fx.isDefault(myStyle) ? null : myStyle }, (res) => {
      if (!res || res.error) {
        wantedName = null;
        stopSharing();
        // Com contas: sem sessão (expirou), ou a conta ainda precisa de senha nova.
        if (res && res.auth && account && account.mustChange) { showNewPass(); return; }
        if (res && res.auth && account && account.root) { afterAuth(false); return; }
        showLogin((res && res.error) || 'Não foi possível entrar na sala.');
        return;
      }
      me = { id: res.me.id, name: res.me.name, admin: Boolean(res.me.admin) };
      btnAdmin.hidden = !me.admin;
      if (res.settings) applyRoomSettings(res.settings);
      stopRelayProbe?.();
      if (transportExperiments.snapshot().active.relaySelection && window.WssRelayProbe)
        stopRelayProbe = window.WssRelayProbe.start(socket);
      assetUploadHttp = res.assetUpload === 1;
      // Permissões de controle não sobrevivem a uma queda (o servidor já cancelou): o
      // aviso do app some junto.
      if (window.wssDesktop && window.wssDesktop.controlState) window.wssDesktop.controlState({ on: false });
      if (Number.isFinite(res.now)) serverOffset = res.now - Date.now();
      // Voltando de uma queda (ou do app atualizando), os outros reconectam junto com
      // você: isso não vira aviso de "entrou" nem de "começou a transmitir".
      if (joinedBefore) quietUntil = Date.now() + 8000;
      joinedBefore = true;
      setPageVersion(res.version);
      obsIdentitySupported = res.obsPublication === 1;
      loadServerStatus();
      // O container reinicia ao atualizar e o socket reconecta sozinho, mas esta
      // página continua com o código antigo até ser recarregada.
      updateBanner.hidden = !res.version || res.version === pageVersion;
      users.clear();
      for (const u of res.users) users.set(u.id, u);
      indexProfiles();
      sendDesktopIdentity();
      // Reconexão no meio de uma transmissão: continua transmitindo.
      if (localStream) {
        users.get(me.id).sharing = true;
        socket.emit('share', true, shareStartedAt + serverOffset);
      }
      if (voice.joined) {
        users.get(me.id).voice = voiceState();
        socket.emit('voice:join', voiceState());
      }
      showApp();
      reporting.joined();
      maybeAskConsent();
      if(obsIdentitySupported && desktop?.obsLocal) configureLocalObs().catch(e=>showToast('Entrada OBS local indisponível: '+e.message));
      loadChat(res.chat || []);
      if (voice.joined) {
        for (const u of users.values()) {
          if (u.id !== me.id && u.voice && shouldOffer(u.id)) connectVoice(u.id);
        }
      }
      for (const u of users.values()) {
        if (u.sharing && u.id !== me.id) addStreamTile(u);
      }
      // O que estava no ar antes da queda e não está mais: conta a janela pra retomar
      // a partir de agora (se voltar logo, volta do jeito que estava).
      const live = new Set([...streams.values()].map((s) => s.key));
      for (const [key, prefs] of streamPrefs) {
        if (prefs.endedAt == null && !live.has(key)) prefs.endedAt = Date.now();
      }
      renderUsers(); // agora com os quadros criados (botões de assistir/ir pra tela)
      restoreProfilePhoto();
      if (obsCredentials && obsIdentitySupported) getObsPublication().catch(() => {});
    });
  }

  // Transmissão nova abre sozinha, mas sem som. Como você deixou cada uma (assistindo
  // ou fechada no X, som, volume, qualidade) fica guardado pelo nick, que sobrevive a
  // reconexões: quando a SUA conexão cai e volta (ou o app é atualizado), ou quando a
  // transmissão cai e volta logo (ex.: o OBS reconectando), ela volta do mesmo jeito,
  // inclusive fixada em destaque. endedAt: quando a transmissão acabou (null = no ar).
  const streamPrefs = new Map(); // chave -> { watching, muted, volume, quality, endedAt }
  const RESUME_WINDOW_MS = 60000;
  const streamKey = (user) => `${user.kind === 'obs' ? 'obs' : 'web'}:${user.name}`;
  let pinnedKey = null; // transmissão fixada em destaque (uma só)

  // watching: a transmissão abre sozinha ao entrar no ar (a sua própria do OBS, não:
  // pra ver, é o Assistir na lista).
  function prefsFor(key, watching = true) {
    const saved = streamPrefs.get(key);
    if (saved && (saved.endedAt == null || Date.now() - saved.endedAt < RESUME_WINDOW_MS)) {
      saved.endedAt = null;
      return saved;
    }
    if (pinnedKey === key) pinnedKey = null;
    const prefs = { watching, muted: true, volume: 1, quality: DEFAULT_QUALITY, endedAt: null };
    streamPrefs.set(key, prefs);
    return prefs;
  }

  function leaveRoomLocally() {
    reporting.left();localObsEndpoint=null;desktop?.obsLocal?.(null).catch(()=>{});
    stopRelayProbe?.(); stopRelayProbe = null;
    obsCredentialGeneration++; obsCredentialOwner = null;
    signalQueue.reset();
    me = null;
    resetControl();
    // Continua "na voz": ao reconectar, as conexões de voz são refeitas.
    for (const id of [...voicePeers.keys()]) closeVoicePeer(id);
    for (const id of [...outgoing.keys()]) closeOutgoing(id);
    for (const id of [...streams.keys()]) removeStreamTile(id);
    users.clear();
    renderAll();
  }

  btnLeave.addEventListener('click', async () => {
    obsCredentials = null; obsCredentialOwner = null;
    try { sessionStorage.removeItem('wss-obs-publication'); } catch {}
    leaveVoice();
    streamPrefs.clear();
    pinnedKey = null;
    chatSeenId = null;
    joinedBefore = false;
    stopSharing();
    if (accountsMode) {
      logout();
      return;
    }
    socket.emit('leave');
    wantedName = null;
    leaveRoomLocally();
    showLogin();
  });

  function setConnection(ok) {
    connDot.className = ok ? 'dot ok' : 'dot err';
    connText.textContent = ok ? 'Conectado' : 'Reconectando…';
    // A lista de pessoas fica escondida no computador: o aviso aparece no topo também.
    topbarConn.hidden = ok;
  }

  socket.on('connect', () => {
    setConnection(true);
    // Com contas, o socket novo precisa da sessão de novo antes de entrar (a sessão
    // guardada entra direto, inclusive ao abrir a página).
    if (accountsMode && session) resumeSession();
    else if (wantedName) join();
  });

  socket.on('disconnect', (reason) => {
    setConnection(false);
    if (me) leaveRoomLocally();
    if (reason !== 'io server disconnect') return; // queda: o Socket.IO reconecta sozinho
    // O servidor fechou a conexão ao parar (reiniciando ou atualizando o container): nesse
    // caso o Socket.IO não tenta de novo sozinho. Tenta, como numa queda.
    setTimeout(() => { if (!socket.connected) socket.connect(); }, 1000);
  });

  socket.on('user:joined', (user) => {
    if (!me) return;
    users.set(user.id, user);
    // Quem entra pelo OBS já chega transmitindo.
    if (user.sharing) addStreamTile(user);
    renderUsers();
    if (user.kind === 'obs') announceLive(user.name, ' pelo OBS');
    else announceJoin(user.name);
  });

  socket.on('user:updated', (user) => {
    if (!me) return;
    const before = users.get(user.id);
    users.set(user.id, user);
    const existing = streams.get(user.id);
    if (user.kind === 'obs' && existing && before?.ownerId !== user.ownerId) {
      // Só o participante que ganha/perde a propriedade muda seus controles
      // locais. Os demais mantêm a mesma conexão WHEP e a imagem em reprodução.
      if (existing.mine !== Boolean(me && user.ownerId === me.id)) {
        removeStreamTile(user.id);
        if (user.sharing) addStreamTile(user);
      }
    }
    if (user.sharing && !(before && before.sharing)) {
      addStreamTile(user);
      announceLive(user.name, '');
    }
    if (!user.sharing && before && before.sharing) removeStreamTile(user.id, { ended: true });
    if (Boolean(user.voice) !== Boolean(before && before.voice)) {
      if (user.voice) onVoiceJoined(user);
      else onVoiceLeft(user.id);
    }
    renderUsers();
  });

  socket.on('user:left', ({ id }) => {
    if (!me || id === me.id) return;
    signalQueue.remove(id);
    const gone = users.get(id);
    if (gone && gone.kind !== 'obs') announceLeave(gone.name);
    closeVoicePeer(id);
    users.delete(id);
    if (gone && gone.kind !== 'obs') releaseAltStrokes(gone.name);
    clearPeerCursors((key) => key.endsWith(`|${id}`));
    removeStreamTile(id, { ended: true });
    closeOutgoing(id);
    renderUsers();
  });

  // ---------- renderização ----------

  function renderAll() {
    renderUsers();
    renderShareButton();
    layoutGrid();
  }

  // Uma linha por pessoa. A transmissão OBS vinculada ao ID do participante entra
  // na linha dessa pessoa; a de quem só está no OBS, sem a página aberta, fica sozinha.
  function roomEntries() {
    const myId = me && me.id;
    const entries = [];
    const byId = new Map();
    for (const u of users.values()) {
      if (u.kind === 'obs') continue;
      const entry = { user: u, live: Boolean(u.sharing), obs: false, streamIds: u.sharing && u.id !== myId ? [u.id] : [] };
      entries.push(entry);
      byId.set(u.id, entry);
    }
    for (const u of users.values()) {
      if (u.kind !== 'obs') continue;
      const entry = byId.get(u.ownerId);
      if (entry) {
        entry.live = true;
        entry.obs = true;
        entry.streamIds.push(u.id);
      } else {
        entries.push({ user: u, live: true, obs: true, streamIds: [u.id] });
      }
    }
    return entries;
  }

  function renderUsers() {
    indexProfiles();
    const myId = me && me.id;
    const list = roomEntries().sort((a, b) =>
      (b.user.id === myId) - (a.user.id === myId) || b.live - a.live || a.user.name.localeCompare(b.user.name));
    userCountEl.textContent = list.length;
    userListEl.replaceChildren(...list.map((entry) => {
      const u = entry.user;
      const li = el('li', entry.live ? 'user is-live' : 'user');
      const face = avatar(u.name);
      if (u.voice) face.dataset.voiceId = u.id;
      const nick = el('span', 'user-name', u.name);
      nick.dataset.nickStyle = profileLooks.get(u.name)?.nick || 'normal';
      li.append(face, nick);
      if (u.voice) li.append(voiceIndicator(u));
      if (u.id === myId) li.append(el('span', 'user-you', 'você'));
      if (entry.obs) li.append(el('span', 'tag tag-obs', u.kind === 'obs' && !u.ownerId ? 'OBS · sem vínculo' : 'OBS'));
      const grant = controlGrantButton(u);
      if (grant) li.append(grant);
      const tiles = entry.streamIds.map((id) => streams.get(id)).filter(Boolean);
      const watched = tiles.find((s) => s.watching);
      const unwatched = tiles.filter((s) => !s.watching);
      const resume = () => unwatched.forEach(resumeWatching);
      if (unwatched.length) {
        const btn = el('button', 'watch-btn');
        btn.type = 'button';
        btn.title = u.id === myId ? 'Ver a sua própria transmissão do OBS' : `Assistir a tela de ${u.name}`;
        btn.setAttribute('aria-label', btn.title);
        btn.append(icon('eye'), 'Assistir');
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          resume();
        });
        li.append(btn);
      } else if (entry.live) {
        li.append(el('span', 'live-badge', 'AO VIVO'));
      }
      if (tiles.length) {
        li.tabIndex = 0;
        li.title = watched ? `Ir para a tela de ${u.name}` : u.id === myId ? 'Ver a sua própria transmissão do OBS' : `Assistir a tela de ${u.name}`;
        const go = () => (watched ? focusTile(watched.id) : resume());
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      if (u.voice && volumeOpenFor === u.id && canAdjustVoice(u)) {
        li.classList.add('has-volume');
        li.append(voiceVolumeRow(u));
      }
      return li;
    }));
    const live = list.filter((entry) => entry.live).length;
    liveCountEl.textContent = live ? `${live} ao vivo` : '';
    peopleCountEl.textContent = list.length;
    controlTargetsShown = myControlStream();
    const unwatched = [...streams.values()].some((s) => !s.watching && !s.mine);
    btnPeople.classList.toggle('has-unwatched', unwatched);
    btnPeople.title = unwatched
      ? 'Pessoas na sala (tem transmissão que você parou de assistir)'
      : 'Pessoas na sala';
    renderVoice();
    syncObsOverlay();
    if (controlDialog.open) renderControlPanel();
  }

  function renderShareButton() {
    if (!canShare) {
      btnShare.hidden = true;
      shareHint.hidden = false;
      shareHint.textContent = window.isSecureContext
        ? 'Este navegador não permite compartilhar a tela, só assistir.'
        : 'Compartilhar a tela exige HTTPS (ou localhost). Você ainda pode assistir.';
      return;
    }
    // No celular o texto some e fica só o ícone; o nome vai no title/aria-label.
    const label = localStream ? 'Parar transmissão' : 'Compartilhar tela';
    btnShare.replaceChildren(icon(localStream ? 'stop' : 'share'), el('span', 'btn-label', label));
    btnShare.title = label;
    btnShare.setAttribute('aria-label', label);
    btnShare.className = localStream ? 'btn btn-danger' : 'btn btn-primary';
    btnShare.disabled = !me || capturePending || captureProbePending;
    $('btn-capture-settings').disabled = !me;
    renderCaptureSettings();
  }

  function focusTile(id) {
    const s = streams.get(id);
    if (!s) return;
    s.tile.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    s.tile.classList.remove('flash');
    void s.tile.offsetWidth;
    s.tile.classList.add('flash');
  }

  // Escolhe o número de colunas que deixa os tiles (16:9 + barra) o maior
  // possível sem precisar rolar; se não couber nem no tamanho mínimo, rola.
  function renderEmpty(count) {
    emptyEl.hidden = count > 0;
    if (count) return;
    if ([...streams.values()].some((s) => !s.watching && !s.mine)) {
      emptyTitle.textContent = 'Você não está assistindo nenhuma transmissão';
      emptyHint.textContent = 'Tem transmissão no ar: abra a lista de pessoas e clique em Assistir.';
    } else if ([...streams.values()].some((s) => s.mine)) {
      emptyTitle.textContent = 'A sua transmissão do OBS está no ar';
      emptyHint.textContent = 'Pra ver como ela está chegando, clique em Assistir ao lado do seu nome, na lista da sala.';
    } else {
      emptyTitle.textContent = defaultEmptyTitle;
      if (canShare) emptyHint.innerHTML = defaultEmptyHint;
      else emptyHint.textContent = 'Assim que alguém começar a transmitir, a tela aparece aqui.';
    }
  }

  // Altura de um quadro com essa largura (vídeo 16:9 + barra + borda) e o contrário.
  const tileHeight = (w) => (w - TILE_BORDER * 2) * (9 / 16) + TILE_BAR_HEIGHT + TILE_BORDER * 2;
  const tileWidthFor = (h) => (h - TILE_BAR_HEIGHT - TILE_BORDER * 2) * (16 / 9) + TILE_BORDER * 2;

  function layoutGrid() {
    uptimeTicker?.sync();
    let pinned = null;
    for (const s of streams.values()) {
      const on = s.key === pinnedKey;
      s.tile.classList.toggle('is-pinned', on);
      if (on && !s.tile.hidden) pinned = s;
      if (s.pinShown !== on) {
        s.pinShown = on;
        setIcon(s.btnPin, on ? 'pinOff' : 'pin', on ? 'Desafixar' : 'Fixar em destaque');
        s.btnPin.classList.toggle('active', on);
        s.btnPin.setAttribute('aria-pressed', String(on));
      }
    }
    // Quadros de quem você parou de assistir ficam escondidos e não ocupam espaço.
    const count = [...gridInner.children].filter((tile) => !tile.hidden).length;
    renderEmpty(count);
    const width = gridEl.clientWidth;
    const height = gridEl.clientHeight;
    const pinLayout = pinned && count > 1 && width && height ? layoutPinned(count - 1, width, height) : null;
    gridInner.classList.toggle('pin-side', pinLayout === 'side');
    gridInner.classList.toggle('pin-below', pinLayout === 'below');
    if (pinLayout || !count || !width || !height) return;
    let best = 0;
    for (let cols = 1; cols <= count; cols += 1) {
      const rows = Math.ceil(count / cols);
      const byWidth = (width - TILE_GAP * (cols - 1)) / cols;
      const byHeight = tileWidthFor((height - TILE_GAP * (rows - 1)) / rows);
      best = Math.max(best, Math.min(byWidth, byHeight));
    }
    if (best < MIN_TILE_WIDTH) best = width < MIN_TILE_WIDTH * 2 + TILE_GAP ? width : MIN_TILE_WIDTH;
    gridEl.style.setProperty('--tile-w', `${Math.floor(best) - 1}px`);
  }

  // Uma transmissão fixada fica grande e as outras (n) viram miniaturas, numa coluna do
  // lado ou numa fileira embaixo: o que deixar a fixada maior (tela larga: do lado;
  // celular em pé: embaixo). Todas continuam tocando.
  function layoutPinned(n, width, height) {
    const thumb = (w, max) => Math.max(Math.min(PIN_THUMB_MIN, max), Math.min(w, max));
    const sideThumb = thumb(tileWidthFor((height - TILE_GAP * (n - 1)) / n), Math.min(PIN_THUMB_MAX, width * 0.3));
    const perColumn = Math.max(1, Math.floor((height + TILE_GAP) / (tileHeight(sideThumb) + TILE_GAP)));
    const sidePin = Math.min(width - Math.ceil(n / perColumn) * (sideThumb + TILE_GAP), tileWidthFor(height));
    const belowThumb = thumb((width - TILE_GAP * (n - 1)) / n, Math.min(PIN_THUMB_MAX, width * 0.45));
    const perRow = Math.max(1, Math.floor((width + TILE_GAP) / (belowThumb + TILE_GAP)));
    const belowRows = Math.ceil(n / perRow);
    const belowPin = Math.min(width, tileWidthFor(height - belowRows * (tileHeight(belowThumb) + TILE_GAP)));
    const side = sidePin >= belowPin;
    const pin = Math.max(side ? sidePin : belowPin, Math.min(width, MIN_TILE_WIDTH));
    gridEl.style.setProperty('--pin-w', `${Math.floor(pin) - 1}px`);
    gridEl.style.setProperty('--tile-w', `${Math.floor(side ? sideThumb : belowThumb) - 1}px`);
    return side ? 'side' : 'below';
  }

  function togglePin(s) {
    pinnedKey = pinnedKey === s.key ? null : s.key;
    layoutGrid();
  }

  new ResizeObserver(layoutGrid).observe(gridEl);

  function createTile(name, label, kind) {
    const tile = el('div', 'tile');
    const media = el('div', 'tile-media');
    const video = el('video');
    video.autoplay = true;
    video.playsInline = true;
    const status = el('div', 'tile-status');
    status.hidden = true;
    // Camada das reações e marcações, por cima do vídeo e sem pegar cliques.
    const fx = el('div', 'tile-fx');
    media.append(video, status, fx);
    const bar = el('div', 'tile-bar');
    const who = el('div', 'tile-who');
    who.append(avatar(name), el('span', 'tile-name', label));
    if (kind === 'obs') who.append(el('span', 'tag tag-obs', 'OBS'));
    const uptime = el('span', 'tile-uptime');
    uptime.title = 'Tempo ao vivo';
    who.append(el('span', 'live-badge', 'AO VIVO'), uptime);
    bar.append(who);
    // Em tela cheia, monitor com G-SYNC/FreeSync acompanha a quantidade de quadros que o
    // app desenha: com só o vídeo mudando (uns 30 por segundo), o monitor inteiro caía pra
    // ~30 Hz e o mouse ficava travando. Este pontinho (invisível) muda a cada quadro e
    // mantém o monitor na taxa máxima dele.
    tile.append(media, bar, el('span', 'keep-hz'));
    return { tile, media, video, status, bar, fx, uptime };
  }

  function setStatus(s, text, loading) {
    s.status.textContent = text || '';
    s.status.hidden = !text;
    s.status.classList.toggle('loading', Boolean(loading));
  }

  // ---------- tile da própria transmissão ----------

  function renderSelfTile() {
    if (!localStream) {
      if (selfTile) {
        selfTile.tile.remove();
        selfTile = null;
        layoutGrid();
      }
      return;
    }
    if (!selfTile) {
      const base = createTile(me ? me.name : wantedName, 'Você');
      base.tile.classList.add('tile-self');
      base.video.muted = true;
      const meta = el('div', 'tile-meta');
      const viewers = el('span', 'tile-viewers');
      meta.append(viewers);
      if (!localStream.getAudioTracks().length) meta.append(el('span', 'tag', 'sem áudio'));
      const overlayTag = el('span', 'tag tag-overlay', 'na sua tela');
      overlayTag.title = 'Quando alguém apontar, desenhar ou reagir na sua transmissão, aparece também na sua tela de verdade';
      overlayTag.hidden = true;
      meta.prepend(overlayTag);
      base.bar.append(meta);
      selfTile = { ...base, viewers, overlayTag };
      base.video.addEventListener('resize', () => captureMonitor?.refresh());
      // Quem transmite também pode apontar na própria tela, pra quem está assistindo.
      enableMarkup(base, () => me && me.id);
      gridInner.prepend(base.tile);
      layoutGrid();
      renderUptimes();
    }
    if (captureOptions.preview && !localNative) {
      if (selfTile.video.srcObject !== localStream) { selfTile.video.srcObject = localStream; selfTile.video.play().catch(() => {}); }
      selfTile.video.hidden = false;
      setStatus(selfTile, captureState?.muted ? 'Captura temporariamente pausada; aguardando a fonte.' : '');
    } else {
      selfTile.video.pause(); selfTile.video.srcObject = null; selfTile.video.hidden = true;
      setStatus(selfTile, localNative ? 'Motor nativo ativo · janela em 720p · sem prévia local.' : 'Prévia desativada; a transmissão continua.');
    }
    const names = [...outgoing.entries()]
      .filter(([, o]) => o.pc.connectionState === 'connected')
      .map(([id]) => users.get(id))
      .filter(Boolean)
      .map((u) => u.name);
    selfTile.overlayTag.hidden = !desktopOverlay;
    selfTile.viewers.replaceChildren(icon('eye'), String(names.length));
    selfTile.viewers.title = names.length ? `Assistindo: ${names.join(', ')}` : 'Ninguém assistindo ainda';
  }

  // ---------- transmitir ----------

  function captureSnapshot() {
    const settings = localNative ? {width:1280,height:720,frameRate:nativeSnapshot?.session?.rate?.target<500000?30:60} : localStream?.getVideoTracks()[0]?.getSettings() || {};
    return { active: Boolean(localStream), pending: capturePending, options: { ...captureOptions },
      native: localNative ? {enabled:true,...nativeSnapshot} : null,
      capacity: { enabled: transportExperiments.snapshot().active.gpuBudget && captureOptions.adaptive && !localNative, ...gpuCapacity.snapshot() },
      actual: { width: settings.width, height: settings.height, frameRate: settings.frameRate }, sourceState: captureState && { ...captureState }, hardware: captureHardware,
      senders: [...outgoing.entries()].map(([id, o]) => ({ id, name: users.get(id)?.name || 'Participante',
        state: o.pc.connectionState, quality: o.quality, codecPreference: o.codecPreference || 'auto', encoderCapabilities: o.encoderCapabilities || null,
        policy: o.policy || null, metrics: o.metrics || null,
        native: o.native===true,
        adaptation: o.native ? {strategy:'native-feedback',bitrateCeiling:nativeSnapshot?.session?.rate?.target??null} : { factor: o.rate.factor, bitrateCeiling: o.rate.maxBitrate ?? null, intervalMs: o.rate.intervalMs || 2000, strategy: o.rate.strategy || 'legacy' },
        error: o.qualityError || null })) };
  }
  function renderCaptureSettings(syncFields = true) {
    if (syncFields) {
      for (const [key, field] of Object.entries(captureFields)) {
        if (field !== document.activeElement) {
          if (field.type === 'checkbox') field.checked = captureOptions[key]; else field.value = captureOptions[key];
        }
      }
      captureFields.profile.disabled = captureFields.codec.disabled = Boolean(localStream || capturePending || captureProbePending);
      for(const key of ['priority','uploadMbps','adaptive','preview'])captureFields[key].disabled=!!localNative;
      $('capture-probe').disabled = Boolean(localStream || capturePending || captureProbePending);
    }
    if (!captureDialog.open) return;
    const state = captureSnapshot(), lines = [];
    if(localNative)lines.push('Motor nativo: saída 1280×720, seleção até 60 FPS (30 em baixa taxa), uma janela e um receptor. Perfil e limite de upload do Chromium não se aplicam a este modo.', '');
    if (captureHardware) {
      lines.push(`Recursos gráficos do app: encode ${captureHardware.features?.video_encode || 'não informado'}; decode ${captureHardware.features?.video_decode || 'não informado'}.`);
      lines.push('Disponibilidade gráfica não comprova uso do encoder por hardware nesta transmissão.', '');
      for (const device of captureHardware.telemetry?.devices || []) {
        lines.push(`GPU${device.active ? ' ativa' : ''}: ${device.encoderSessions ?? '?'} sessões de encoder no driver (todos os apps); uso do encoder ${device.encoderUtilization ?? '?'}%; VRAM livre ${device.memoryFreeMiB ?? '?'} / ${device.memoryTotalMiB ?? '?'} MiB.`);
      }
      lines.push('Limite máximo de sessões do driver: desconhecido; sessões não são unidades físicas de encoder.');
    }
    if (captureCodecEstimates) {
      lines.push('Estimativas de capacidade (não comprovam aceleração em uso):');
      for (const [codec, capability] of Object.entries(captureCodecEstimates)) {
        lines.push(`${codec.toUpperCase()}: ${capability.supported ? 'suportado' : 'não indicado'}; eficiente ${capability.powerEfficient === true ? 'sim' : capability.powerEfficient === false ? 'não' : 'desconhecido'}`);
      }
      lines.push('');
    }
    if (state.active) {
      lines.push(`Captura: ${state.actual.width || '?'}×${state.actual.height || '?'} · ${state.actual.frameRate?.toFixed(1) || '?'} FPS`);
      if (state.sourceState?.muted) lines.push('Fonte temporariamente indisponível; aguardando a retomada da mesma captura.');
      const ceiling = state.senders.reduce((total, o) => total + (o.policy?.maxBitrate || 0), 0);
      lines.push(`${state.senders.length} conexão(ões) de vídeo · teto somado ${(ceiling / 1e6).toFixed(1)} Mbps, sem overhead`);
      lines.push('Conexões não comprovam quantas sessões físicas de encoder a GPU utiliza.');
      if (state.capacity.enabled) {
        const reason = { unknown: 'aguardando medições válidas', 'driver-pressure': 'pressão medida na GPU',
          'encoder-pressure': 'encoder sobrecarregado', healthy: 'carga normal' }[state.capacity.reason];
        lines.push(`Limite experimental de GPU: nível ${state.capacity.level}/3 (${reason}).`);
      }
      for (const sender of state.senders) {
        lines.push('', `${sender.name}: ${sender.state}`);
        lines.push(`Preferência de codec: ${sender.codecPreference.toUpperCase()} (capacidades estimadas; confirme o codec efetivo abaixo)`);
        if(sender.native)lines.push(`H.264 nativo · alvo ${((nativeSnapshot?.session?.rate?.target||4000000)/1e6).toFixed(2)} Mbps · ${nativeSnapshot?.recoveries||0} recuperações.`, 'Admissão: até 8 quadros/64 KiB sem recibo; fila interna do binding não observável.');
        else if (sender.metrics) lines.push(...videoMetricLines(sender.metrics, true));
        else lines.push('Aguardando estatísticas do encoder.');
        if (sender.error) lines.push(sender.error);
      }
    } else lines.push(capturePending ? 'Aguardando escolha da fonte…' : 'Nenhuma transmissão ativa. O OBS usa as configurações do próprio OBS.');
    $('capture-status').textContent = lines.join('\n');
  }
  function saveCaptureSettings() {
    const next = Video.normalize({ profile: captureFields.profile.value, priority: captureFields.priority.value,
      codec: captureFields.codec.value, uploadMbps: Number(captureFields.uploadMbps.value),
      adaptive: captureFields.adaptive.checked, preview: captureFields.preview.checked });
    if (localStream || capturePending) { next.profile = captureOptions.profile; next.codec = captureOptions.codec; }
    if (next.profile !== captureOptions.profile) captureCodecEstimates = null;
    captureOptions = next;
    if (!next.adaptive) gpuCapacity.reset();
    try { localStorage.setItem('wss-capture-options', JSON.stringify(next)); } catch {}
    const track = localStream?.getVideoTracks()[0];
    if (track) track.contentHint = next.priority === 'auto' ? Video.profiles[next.profile].hint : next.priority;
    for (const o of outgoing.values()) { if (!o.native && !next.adaptive) o.rate.reset(); applyQuality(o); }
    renderSelfTile(); renderCaptureSettings();
  }
  for (const field of Object.values(captureFields)) field.addEventListener('change', saveCaptureSettings);
  $('capture-probe').addEventListener('click', async () => {
    if (localStream || capturePending || captureProbePending) return;
    captureProbePending = true; renderShareButton();
    try { captureCodecEstimates = await codecProbe.probe('encode', Video.profiles[captureOptions.profile]); }
    finally { captureProbePending = false; renderShareButton(); }
  });
  $('btn-capture-settings').addEventListener('click', () => {
    captureDialog.showModal(); renderCaptureSettings();
    if(localNative){const token=localNative.token;window.wssDesktop.nativeVideoCommand({token,type:'snapshot'}).then(value=>{if(localNative?.token===token){nativeSnapshot=value;renderCaptureSettings(false);}}).catch(()=>{});}
    desktop?.mediaCapabilities?.().then(info => { captureHardware = info; renderCaptureSettings(); }).catch(() => {});
  });
  captureDialog.addEventListener('click', event => { if (event.target === captureDialog) captureDialog.close(); });

  btnShare.addEventListener('click', () => {
    if (localStream) stopSharing();
    else startSharing();
  });

  async function startSharing() {
    if (capturePending || captureProbePending || localStream || !me) return;
    if (!shareAllowed()) {
      showToast('Nesta sala só contas com administração transmitem.');
      return;
    }
    capturePending = true;
    const attempt = ++captureAttempt, owner = me.id;
    const options = { ...captureOptions };
    renderShareButton();
    let stream, preparedNative;
    try {
      const nativeCaps=await window.wssDesktop?.nativeVideoCaps?.();
      if(nativeCaps?.enabled){
        if(!nativeCaps.available)throw Error('Motor nativo indisponível neste app.');
        preparedNative=await window.wssDesktop.nativeVideoPrepare();
        if(!preparedNative)throw new DOMException('Seleção cancelada.','AbortError');
        stream=new MediaStream();
      }else{
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: Video.captureConstraints(options, true),
        // Sem isso, o áudio do sistema leva junto a voz dos outros e o som das outras
        // transmissões que tocam nesta página (eco pra quem assiste). Navegador antigo
        // ignora.
        audio: { restrictOwnAudio: true },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('A fonte escolhida não forneceu vídeo.');
      track.contentHint = options.priority === 'auto' ? Video.profiles[options.profile].hint : options.priority;
      // Restrições max/exact não são permitidas na chamada inicial getDisplayMedia.
      // Depois da escolha, tenta limitar a captura; o sender também aplica os tetos.
      try { await track.applyConstraints(Video.captureConstraints(options)); }
      catch { showToast('A fonte não aceitou todos os limites de captura; o envio será limitado pelo app.'); }
      if (track.readyState !== 'live') throw new Error('A fonte foi encerrada antes de iniciar a transmissão. Escolha novamente.');
      }
    } catch (err) {
      stream?.getTracks().forEach(t => t.stop());
      // Cancelar a escolha não é erro (no app de desktop, o cancelamento chega assim).
      const cancelled = err.name === 'NotAllowedError' || err.name === 'AbortError'
        || (window.wssDesktop && /invalid capture constraints/i.test(err.message));
      if (!cancelled) { reporting.fault('capture_failed', undefined, undefined, `${err.name || 'Erro'}: ${err.message || ''}`); showToast(`Não foi possível compartilhar a tela: ${err.message}`); }
      capturePending = false; renderShareButton();
      return;
    }
    capturePending = false;
    if (!me || me.id !== owner || localStream || attempt !== captureAttempt) {
      if(preparedNative)window.wssDesktop.nativeVideoCommand({token:preparedNative.token,type:'stop'}).catch(()=>{});
      stream.getTracks().forEach((t) => t.stop());
      renderShareButton();
      return;
    }
    await useWindowAudio(stream);
    if (!me || localStream || stream.getVideoTracks()[0]?.readyState !== 'live') {
      stopWindowAudio();
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    localStream = stream;
    localNative = preparedNative || null;
    activeCapture = options;
    shareStartedAt = Date.now();
    // Eventos pertencem a esta captura; uma track antiga nunca encerra a nova.
    try {
      if(localNative){captureState={width:1280,height:720,frameRate:60,displaySurface:'window',readyState:'live',muted:false};}
      else {
      captureMonitor = Video.observeCapture(stream.getVideoTracks()[0], {
        onChange(state, before) {
          if (localStream !== stream) return;
          captureState = state;
          if (state.width !== before.width || state.height !== before.height || (before.muted && !state.muted)) {
            for (const sender of outgoing.values()) applyQuality(sender);
          }
          if (state.muted !== before.muted) renderSelfTile();
          renderCaptureSettings(false);
        },
        onEnded() { if (localStream === stream) stopSharing(); },
      });
      captureState = captureMonitor.read();
      }
    } catch {
      stopSharing(); showToast('A fonte foi encerrada antes de iniciar a transmissão. Escolha novamente.'); return;
    }
    users.get(me.id).sharing = true;
    socket.emit('share', true, shareStartedAt + serverOffset);
    renderSelfTile();
    renderAll();
    startDesktopOverlay();
  }

  // App (Windows): "só o som deste programa", escolhido no seletor. O app pega o som do
  // programa da janela e manda pra cá, ao vivo; ele entra na transmissão no lugar do som
  // do PC. Não deu: fica o som do PC (e um aviso).
  let windowAudio = null; // { ctx, unsubscribe }
  async function useWindowAudio(stream) {
    if (!desktop || typeof desktop.windowAudio !== 'function') return;
    const status = await desktop.windowAudio().catch(() => null);
    if (!status || !status.wanted) return;
    if (!status.ok) {
      showToast(`Não deu pra pegar só o som do programa${status.error ? ` (${status.error})` : ''}: vai o som do PC.`);
      return;
    }
    let ctx = null;
    let unsubscribe = null;
    try {
      ctx = new AudioContext({ sampleRate: status.rate, latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule('/js/pcm-worklet.js');
      const node = new AudioWorkletNode(ctx, 'wss-pcm-player', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [status.channels] });
      const dest = ctx.createMediaStreamDestination();
      node.connect(dest);
      unsubscribe = desktop.onWindowAudio((pcm) => node.port.postMessage(pcm));
      await ctx.resume().catch(() => {});
      for (const track of stream.getAudioTracks()) {
        stream.removeTrack(track);
        track.stop();
      }
      stream.addTrack(dest.stream.getAudioTracks()[0]);
      windowAudio = { ctx, unsubscribe };
    } catch (err) {
      if (unsubscribe) unsubscribe();
      if (ctx) ctx.close().catch(() => {});
      desktop.windowAudioStop?.();
      showToast(`Não deu pra pegar só o som do programa (${err.message}): vai o som do PC.`);
    }
  }
  function stopWindowAudio() {
    if (windowAudio) {
      windowAudio.unsubscribe?.();
      windowAudio.ctx.close().catch(() => {});
      windowAudio = null;
    }
    desktop?.windowAudioStop?.();
  }

  function stopSharing() {
    gpuCapacity.reset();
    captureAttempt++;
    captureMonitor?.close(); captureMonitor = null; captureState = null;
    if (!localStream) return;
    stopWindowAudio();
    if (me) {
      socket.emit('share', false);
      users.get(me.id).sharing = false;
    }
    for (const id of [...outgoing.keys()]) closeOutgoing(id);
    localStream.getTracks().forEach((t) => t.stop());
    if(localNative)window.wssDesktop.nativeVideoCommand({token:localNative.token,type:'stop'}).catch(()=>{});
    localNative=null;
    nativeSnapshot=null;
    localStream = null;
    activeCapture = null;
    shareStartedAt = null;
    stopDesktopOverlay();
    renderSelfTile();
    renderAll();
  }

  function send(to, data) {
    socket.emit('signal', { to, data });
  }

  async function startOutgoing(viewerId, quality, decoderCapabilities, nativeSupported=false) {
    const previousSource = localStream;
    let previousRate = captureOptions.adaptive && transportExperiments.videoOptions.realtime ? outgoing.get(viewerId)?.rate : null;
    closeOutgoing(viewerId);
    const iceServers = await getIceServers();
    if (!localStream || !users.has(viewerId)) return;
    if (localStream !== previousSource) previousRate = null;
    previousRate?.restartSampling();
    if(localNative){
      const token=localNative.token,sid=++sidCounter;
      const pc={connectionState:'connecting',close(){window.wssDesktop.nativeVideoCommand({token,type:'close-peer',viewer:viewerId}).catch(()=>{});}};
      const o={native:true,pc,sid,pending:[],policyRevision:0};outgoing.set(viewerId,o);
      try{await window.wssDesktop.nativeVideoCommand({token,type:'offer',viewer:viewerId,sid,iceServers,supported:nativeSupported});}
      catch(error){if(outgoing.get(viewerId)===o){outgoing.delete(viewerId);renderSelfTile();}send(viewerId,{stream:me.id,sid,type:'native-unavailable',reason:!nativeSupported?'unsupported':[...outgoing.values()].some(x=>x.native)?'busy':'failed'});showToast(error.message);}
      return;
    }
    const source = localStream;
    const encoderCapabilities = codecProbe.rtp('encode');
    if (localStream !== source || !users.has(viewerId)) return;
    const codecPreference = Video.selectCodec(activeCapture?.codec || 'auto', encoderCapabilities, decoderCapabilities);
    const pc = new RTCPeerConnection({ iceServers });
    const o = { pc, sid: ++sidCounter, quality: Object.hasOwn(PRESETS, quality) ? quality : DEFAULT_QUALITY, pending: [],
      sampler: Video.createMetrics('outbound'), rate: previousRate || Video.createRateController({ realtime: transportExperiments.videoOptions.realtime }), policyRevision: 0, codecPreference, encoderCapabilities };
    outgoing.set(viewerId, o);
    for (const track of localStream.getTracks()) {
      const initial = track.kind === 'video' ? Video.encodePolicy({ options: captureOptions, quality: PRESETS[o.quality],
        source: track.getSettings(), peers: outgoing.size,
        factor: captureOptions.adaptive ? o.rate.factor : 1, adaptiveBitrate: captureOptions.adaptive ? o.rate.maxBitrate : null,
        capacityLevel: captureOptions.adaptive && transportExperiments.snapshot().active.gpuBudget ? gpuCapacity.snapshot().level : 0 }) : null;
      const sender = initial ? pc.addTransceiver(track, { direction: 'sendonly', streams: [localStream], sendEncodings: [{
        maxBitrate: initial.maxBitrate, maxFramerate: initial.maxFramerate, scaleResolutionDownBy: initial.scaleResolutionDownBy,
      }] }).sender : pc.addTrack(track, localStream);
      if (track.kind === 'video') {
        o.sender = sender;
        o.policy = initial;
        const transceiver = pc.getTransceivers().find(t => t.sender === sender);
        if (transceiver?.setCodecPreferences && codecPreference !== 'auto') {
          try { transceiver.setCodecPreferences(Video.preferCodecs(RTCRtpSender.getCapabilities('video').codecs, codecPreference)); }
          catch { o.qualityError = 'Preferência de codec indisponível; usando negociação automática.'; }
        }
      }
    }
    for (const other of outgoing.values()) applyQuality(other);

    pc.onicecandidate = (e) => {
      if (e.candidate) send(viewerId, { stream: me.id, sid: o.sid, type: 'candidate', candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && outgoing.get(viewerId) === o) closeOutgoing(viewerId);
      if (pc.connectionState === 'connected') startOutgoingHealth(o);
      renderSelfTile();
    };

    const offer = await pc.createOffer();
    if (outgoing.get(viewerId) !== o) return;
    await pc.setLocalDescription(offer);
    if (outgoing.get(viewerId) !== o || !me) return;
    send(viewerId, { stream: me.id, sid: o.sid, type: 'offer', sdp: pc.localDescription });
  }

  function closeOutgoing(viewerId) {
    const o = outgoing.get(viewerId);
    if (!o) return;
    outgoing.delete(viewerId);
    o.pending.length = 0;
    o.closed = true; clearTimeout(o.healthTimer); peerStats.clear(o.pc);
    o.pc.close();
    for (const other of outgoing.values()) applyQuality(other);
    renderSelfTile();
  }

  function applyQuality(o) {
    o.policyRevision++;
    if (o.closed || !o.pc.remoteDescription || !o.sender) return Promise.resolve();
    if (o.applyingPolicy) return o.applyingPolicy;
    o.applyingPolicy = (async () => {
      let revision;
      do {
        revision = o.policyRevision;
        if (o.closed || !localStream) break;
        const policy = Video.encodePolicy({ options: { ...captureOptions, profile: activeCapture?.profile || captureOptions.profile },
          quality: PRESETS[o.quality], source: o.sender.track.getSettings(), peers: outgoing.size,
          factor: captureOptions.adaptive ? o.rate.factor : 1, adaptiveBitrate: captureOptions.adaptive ? o.rate.maxBitrate : null,
          capacityLevel: captureOptions.adaptive && transportExperiments.snapshot().active.gpuBudget ? gpuCapacity.snapshot().level : 0 });
        const key = JSON.stringify(policy);
        if (key !== o.appliedPolicy) {
          try {
            const params = o.sender.getParameters();
            if (!params.encodings?.length) params.encodings = [{}];
            Object.assign(params.encodings[0], { maxBitrate: policy.maxBitrate, maxFramerate: policy.maxFramerate, scaleResolutionDownBy: policy.scaleResolutionDownBy });
            if (!o.preferenceUnsupported) params.degradationPreference = policy.degradationPreference;
            else delete params.degradationPreference;
            try { await o.sender.setParameters(params); }
            catch (error) {
              if (o.preferenceUnsupported || o.closed) throw error;
              const fallback = o.sender.getParameters();
              if (!fallback.encodings?.length) fallback.encodings = [{}];
              Object.assign(fallback.encodings[0], { maxBitrate: policy.maxBitrate, maxFramerate: policy.maxFramerate, scaleResolutionDownBy: policy.scaleResolutionDownBy });
              delete fallback.degradationPreference;
              await o.sender.setParameters(fallback); o.preferenceUnsupported = true;
            }
            o.policy = policy; o.appliedPolicy = key; o.qualityError = null;
          } catch (error) {
            o.qualityError = `O navegador não aplicou o perfil de envio: ${error.name || 'erro'}.`;
          }
        }
      } while (revision !== o.policyRevision && !o.closed);
    })().finally(() => { o.applyingPolicy = null; renderCaptureSettings(false); });
    return o.applyingPolicy;
  }
  async function updateGpuCapacity() {
    if (!captureOptions.adaptive || !transportExperiments.snapshot().active.gpuBudget || localNative) return;
    const source = localStream;
    if (performance.now() - gpuHardwareAt >= 5000 && !gpuHardwarePending) {
      gpuHardwareAt = performance.now();
      gpuHardwarePending = Promise.resolve().then(() => desktop?.mediaCapabilities?.()).then(value => {
        captureHardware = value || null;
      }).catch(() => { captureHardware = null; }).finally(() => { gpuHardwarePending = null; });
    }
    await gpuHardwarePending;
    if (source !== localStream || !captureOptions.adaptive) return;
    const before = gpuCapacity.snapshot().level;
    const level = gpuCapacity.sample(captureHardware, [...outgoing.values()].filter(o => !o.native), performance.now());
    if (level !== before) for (const sender of outgoing.values()) applyQuality(sender);
  }
  function startOutgoingHealth(o) {
    if (o.healthStarted) return;
    o.healthStarted = true;
    const tick = async () => {
      if (o.closed) return;
      try {
        if (o.pc.connectionState === 'connected') {
          captureMonitor?.refresh();
          const stats = await peerStats.read(o.pc);
          o.diagnosticRoute = window.WssNetworkHealth.routeFromStats(stats).kind;
          o.metrics = o.sampler.sample(stats);
          checkSilentSender(o, stats);
          if (o.closed) return;
          await updateGpuCapacity();
          if (o.closed) return;
          if (captureOptions.adaptive && o.sender) {
            const ceiling = o.rate.requiresCeiling ? Video.encodePolicy({
              options: { ...captureOptions, profile: activeCapture?.profile || captureOptions.profile },
              quality: PRESETS[o.quality], source: o.sender.track.getSettings(), peers: outgoing.size }).maxBitrate : undefined;
            o.rate.sample(o.metrics, performance.now(), ceiling);
          }
          await applyQuality(o);
        }
      } catch {}
      finally { if (!o.closed) o.healthTimer = setTimeout(tick, captureOptions.adaptive ? o.rate.intervalMs || 2000 : 2000); }
    };
    tick();
  }

  // Sem permissão de câmera/microfone o navegador troca o IP local por um nome .local
  // (mDNS), que não resolve entre redes diferentes (o Tailscale não repassa mDNS). A
  // mesma porta no IP de onde o outro lado chega ao servidor costuma alcançar o socket.
  function withPeerAddress(candidate, address) {
    if (!address || !candidate.candidate) return null;
    const parts = candidate.candidate.split(' ');
    if (parts[7] !== 'host' || !parts[4] || !parts[4].endsWith('.local')) return null;
    parts[4] = address;
    return { ...candidate, candidate: parts.join(' ') };
  }

  async function addCandidate(entry, candidate, address) {
    const pc = entry.pc;
    if (!candidate || !pc || pc.signalingState === 'closed') return;
    if (!pc.remoteDescription) {
      if (entry.pending.length < 64) entry.pending.push({ candidate, address });
      return;
    }
    for (const c of [candidate, withPeerAddress(candidate, address)]) {
      if (entry.pc !== pc || pc.signalingState === 'closed') return;
      if (!c) continue;
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        console.warn('Falha ao adicionar ICE candidate', err);
      }
    }
  }

  async function flushPending(entry) {
    const pc = entry.pc;
    for (const { candidate, address } of entry.pending.splice(0)) {
      if (entry.pc !== pc) return;
      await addCandidate(entry, candidate, address);
    }
  }

  // ---------- sinalização ----------

  // Processa em ordem: um candidate não pode ser aplicado antes do offer/answer
  // da mesma conexão terminar de ser processado.
  socket.on('signal', ({ from, address, data }) => {
    const clean = WssSignaling.clean(data);
    if (clean) signalQueue.enqueue(from, { from, address: typeof address === 'string' && address.length <= 64 ? address : null, data: clean });
  });

  async function handleSignal(from, data, address) {
    if (!me || !data) return;
    if (data.voice) {
      await handleVoiceSignal(from, data, address);
      return;
    }
    if (data.stream === me.id) await handleAsBroadcaster(from, data, address);
    else if (data.stream === from) await handleAsViewer(from, data, address);
  }

  async function handleAsBroadcaster(viewerId, data, address) {
    if (data.type === 'watch') {
      if (localStream) await startOutgoing(viewerId, data.quality, Video.cleanCapabilities(data.decoderCapabilities),data.nativeVideo===true);
      return;
    }
    if (data.type === 'unwatch') {
      closeOutgoing(viewerId);
      return;
    }
    const o = outgoing.get(viewerId);
    if (!o) return;
    if (data.type === 'quality' && Object.hasOwn(PRESETS, data.quality)) {
      o.quality = data.quality;
      applyQuality(o);
    }
    if (data.sid !== o.sid) return;
    if(o.native){
      if(data.type==='answer'||data.type==='candidate')await window.wssDesktop.nativeVideoCommand({token:localNative.token,viewer:viewerId,sid:o.sid,type:data.type,sdp:data.sdp?.sdp,candidate:data.candidate});
      return;
    }
    if (data.type === 'answer') {
      await o.pc.setRemoteDescription(data.sdp);
      await flushPending(o);
      applyQuality(o);
    } else if (data.type === 'candidate') {
      await addCandidate(o, data.candidate, address);
    }
  }

  async function handleAsViewer(broadcasterId, data, address) {
    const s = streams.get(broadcasterId);
    if (!s || !s.watching) return;
    if(data.type==='native-unavailable'){closeIncoming(s);setStatus(s,data.reason==='busy'?'O motor nativo aceita um espectador por vez.':data.reason==='unsupported'?'Este navegador não suporta a recepção do motor nativo.':'Não foi possível iniciar o vídeo nativo.');return;}
    if (data.type === 'offer') {
      closeIncoming(s);
      const iceServers = await getIceServers();
      if (!s.watching || streams.get(broadcasterId) !== s) return;
      const pc = new RTCPeerConnection({ iceServers });
      s.pc = pc;
      s.sid = data.sid;
      if(data.nativeVideo===true){
        s.nativeReceiver=window.WssNativeVideo.attach(pc);
        if(s.qualitySelect){s.nativeQualityOption=new Option('Nativo · 720p até 60 FPS','native720',true,true);s.qualitySelect.append(s.nativeQualityOption);s.qualitySelect.disabled=true;}
      }

      pc.ontrack = (e) => {
        if (s.pc !== pc) return;
        configureReceiverBuffer(s, e.receiver);
        const stream = e.streams[0] || new MediaStream([e.track]);
        s.hasAudio = stream.getAudioTracks().length > 0;
        renderAudio(s);
        if (s.video.srcObject !== stream) {
          s.video.srcObject = stream;
          playVideo(s);
        }
      };
      pc.onicecandidate = (e) => {
        if (s.pc === pc && e.candidate) {
          send(broadcasterId, { stream: broadcasterId, sid: data.sid, type: 'candidate', candidate: e.candidate });
        }
      };
      pc.onconnectionstatechange = () => onIncomingState(s, pc);

      await pc.setRemoteDescription(data.sdp);
      if (s.pc !== pc || !s.watching) return;
      await flushPending(s);
      if (s.pc !== pc || !s.watching) return;
      const answer = await pc.createAnswer();
      if (s.pc !== pc || !s.watching) return;
      await pc.setLocalDescription(answer);
      if (s.pc !== pc || !s.watching) return;
      send(broadcasterId, { stream: broadcasterId, sid: data.sid, type: 'answer', sdp: pc.localDescription });
    } else if (data.type === 'candidate' && s.pc && data.sid === s.sid) {
      await addCandidate(s, data.candidate, address);
    }
  }

  function onIncomingState(s, pc) {
    if (s.pc !== pc) return;
    if (pc.connectionState === 'failed') {
      setStatus(s, 'A conexão falhou. Tentando de novo…', true);
      scheduleRetry(s);
    } else if (pc.connectionState === 'disconnected') {
      setStatus(s, 'Conexão instável…', true);
    } else if (pc.connectionState === 'connected' && !s.video.paused) {
      setStatus(s, '');
    }
    if (pc.connectionState === 'connected') startVideoHealth(s, pc);
  }

  function startVideoHealth(s, pc) {
    if (s.healthTimer) return;
    const health = window.createVideoHealth();
    let busy = false;
    const tick = async () => {
      if (busy) return;
      if (s.pc !== pc || !s.watching || s.video.paused || document.hidden || pc.connectionState !== 'connected') { health.reset(); return; }
      busy = true;
      try {
        const stats = await peerStats.read(pc);
        if (s.pc !== pc) return;
        const video = [...stats.values()].filter((r) => r.type === 'inbound-rtp' && r.kind === 'video' && Number.isFinite(r.framesDecoded))
          .sort((a, b) => (b.bytesReceived || 0) - (a.bytesReceived || 0))[0];
        const codec = video && stats.get(video.codecId)?.mimeType;
        checkBlackVideo(s, pc, video, codec);
        if (!video) return;
        // AV1 que chega e não decodifica nunca (10 bits: o decodificador do navegador só
        // aceita 8): mostra o motivo e não fica reconectando à toa.
        if (/av1/i.test(codec || '') && !video.framesDecoded && (video.framesReceived || 0) >= 60) {
          if (s.undecodablePc !== pc) { s.undecodablePc = pc; setStatus(s, AV1_UNDECODABLE, false); }
          health.reset();
          return;
        }
        if (s.undecodablePc === pc) { s.undecodablePc = null; setStatus(s, ''); }
        s.videoSampler ||= Video.createMetrics('inbound');
        s.videoMetrics = s.videoSampler.sample(stats);
        s.diagnosticRoute = window.WssNetworkHealth.routeFromStats(stats).kind;
        const recoveryAllowed = Date.now() - (s.lastHealthRecovery || 0) > 60000;
        s.healthStats = health.sample(video, performance.now(), { metrics: s.videoMetrics,
          lowLatency: transportExperiments.videoOptions.recoverDelayedVideo && recoveryAllowed && s.kind !== 'obs'
            && (controlling === s.id || s.quality === 'jogo720' || s.quality === 'jogo1080') });
        // Conectado e chegando vídeo, mas ainda sem um quadro-chave pra começar a imagem.
        if (s.healthStats.waitingKeyframe && !s.waitingKeyframe) { s.waitingKeyframe = true; setStatus(s, 'Esperando a imagem…', true); }
        else if (!s.healthStats.waitingKeyframe && s.waitingKeyframe) { s.waitingKeyframe = false; setStatus(s, ''); }
        if ((s.healthStats.stalled || s.healthStats.latencyRecovery) && recoveryAllowed) {
          s.lastHealthRecovery = Date.now();
          if (s.healthStats.latencyRecovery) {
            s.latencyRecoveries = (s.latencyRecoveries || 0) + 1;
            console.info('Rede recuperada com atraso persistente no vídeo de jogo; renovando somente a conexão de mídia.');
            setStatus(s, 'Atualizando a conexão para reduzir o atraso…', true);
            scheduleRetry(s, 0);
          } else {
            reporting.fault('video_stalled');
            console.warn('Vídeo recebe dados sem decodificar novos quadros; reconectando a transmissão.');
            setStatus(s, 'Vídeo sem novos quadros. Reconectando…', true);
            scheduleRetry(s, 1000);
          }
        }
      } catch { health.reset(); }
      finally { busy = false; }
    };
    s.healthTimer = setInterval(tick, 2000);
    tick();
  }

  // ---------- tela preta: conectado, mas sem quadros ----------
  // Conectado há 15 s e nenhum quadro: quem assiste não vê nada (às vezes nem chega pacote
  // de vídeo) e quem transmite não está codificando (o caso do H.264 que ficava preto).
  // Vira um erro automático, uma vez por conexão, com o que ajuda a achar a causa.
  const SILENT_AFTER = 15000;
  function checkSilentSender(o, stats) {
    if (o.silentPc !== o.pc) { o.silentPc = o.pc; o.silentSince = Date.now(); o.silentReported = false; }
    const video = [...stats.values()].find((r) => r.type === 'outbound-rtp' && r.kind === 'video');
    if (o.silentReported || (video && video.framesEncoded > 0) || Date.now() - o.silentSince < SILENT_AFTER) return;
    o.silentReported = true;
    const track = localStream && localStream.getVideoTracks()[0];
    const set = track && track.getSettings ? track.getSettings() : {};
    const codec = video && stats.get(video.codecId)?.mimeType;
    reporting.fault('encode_stalled', undefined, undefined, `Conectado há ${Math.round((Date.now() - o.silentSince) / 1000)} s sem codificar quadros. `
      + `Codec ${codec || 'não negociado'}, preferência ${captureOptions.codec || 'auto'}, codificador ${video?.encoderImplementation || 'não informado'}, `
      + `${video ? `${video.packetsSent || 0} pacotes enviados` : 'sem envio de vídeo'}; captura ${set.width || '?'}x${set.height || '?'} a ${Math.round(set.frameRate || 0)} fps, `
      + `faixa ${track ? track.readyState : 'ausente'}${track && track.muted ? ' (muda)' : ''}.`);
  }
  const AV1_UNDECODABLE = 'Sem imagem: este AV1 não toca no navegador (10 bits). No OBS, use o formato de cor NV12.';
  function checkBlackVideo(s, pc, video, codec) {
    if (s.blackPc !== pc) { s.blackPc = pc; s.blackSince = Date.now(); s.blackReported = false; }
    if (s.blackReported || (video && video.framesDecoded > 0) || s.video.videoWidth > 0 || Date.now() - s.blackSince < SILENT_AFTER) return;
    s.blackReported = true;
    reporting.fault('video_black', undefined, undefined, `Conectado há ${Math.round((Date.now() - s.blackSince) / 1000)} s sem nenhum quadro`
      + `${s.kind === 'obs' ? ' (transmissão do OBS)' : ''}: ${video ? `${video.bytesReceived || 0} bytes e ${video.packetsReceived || 0} pacotes de vídeo recebidos, `
      + `${video.framesReceived || 0} quadros recebidos (${video.keyFramesDecoded || 0} quadros-chave decodificados, ${video.pliCount || 0} pedidos de quadro-chave), codec ${codec || 'não informado'}, `
      + `decodificador ${video.decoderImplementation || 'não informado'}` : 'nenhum pacote de vídeo chegou'}.`);
  }

  // ---------- assistir uma transmissão do OBS (WHEP) ----------

  const OBS_CODEC_ERROR = 'O player e a transmissão OBS precisam de um codec em comum. Confira o suporte a AV1 ou H.264 em Conexão e testes.';

  // Sem trickle: manda a oferta já com os candidatos (o caminho é sempre pelo TURN
  // do servidor, que responde rápido), com um limite pra não travar se demorar.
  function iceGatheringDone(pc, timeoutMs) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState !== 'complete') return;
        clearTimeout(timer);
        resolve();
      });
    });
  }

  function configureReceiverBuffer(s, receiver) {
    const target = Video.applyReceiverBuffer(receiver, transportExperiments.videoOptions.receiverBufferTargetMs ?? (s.nativeReceiver ? 0 : null));
    if (target) (s.receiverTargets ||= {})[target.kind] = target;
  }

  async function startWhep(s) {
    const attempt = s.attempt;
    const current = () => s.attempt === attempt && s.watching && streams.get(s.id) === s;
    const iceServers = await getIceServers();
    if (!current()) return;
    const pc = new RTCPeerConnection({ iceServers });
    s.pc = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const media = new MediaStream();
    pc.ontrack = (e) => {
      if (s.pc !== pc) return;
      configureReceiverBuffer(s, e.receiver);
      media.addTrack(e.track);
      if (s.video.srcObject !== media) {
        s.video.srcObject = media;
        playVideo(s);
      }
    };
    pc.onconnectionstatechange = () => onIncomingState(s, pc);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await iceGatheringDone(pc, 3000);
      if (!current()) return;
      const res = await fetch(`/mtx/${encodeURIComponent(s.stream)}/whep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp', ...authHeaders() },
        body: pc.localDescription.sdp,
      });
      const location = res.status === 201 && res.headers.get('Location');
      if (!current()) {
        if (location) fetch(location, { method: 'DELETE', keepalive: true }).catch(() => {});
        return;
      }
      if (!location) {
        const reason = await res.text().catch(() => '');
        // O OBS manda H.264; navegador sem esse decodificador nunca vai conseguir, então
        // explica em vez de ficar tentando de novo.
        if (res.status === 400 && /codecs not supported/i.test(reason)) {
          closeIncoming(s);
          setStatus(s, OBS_CODEC_ERROR, false);
          return;
        }
        throw new Error(`WHEP respondeu ${res.status}`);
      }
      s.whepUrl = location;
      await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
      s.hasAudio = media.getAudioTracks().length > 0;
      renderAudio(s);
    } catch (err) {
      if (!current()) return;
      console.warn('Falha ao assistir a transmissão do OBS', err);
      setStatus(s, 'Não deu pra conectar. Tentando de novo…', true);
      scheduleRetry(s);
    }
  }

  // ---------- transmitir pelo OBS ----------

  btnObs.replaceChildren(icon('broadcast'), el('span', 'btn-label', 'OBS'));
  btnObs.setAttribute('aria-label', 'Transmitir pelo OBS');

  async function configureLocalObs() {
    const owner=me?.id;
    const publication=await getObsPublication();
    if(!desktop?.obsLocal || !publication.individual || me?.id!==owner)return null;
    const endpoint=await desktop.obsLocal({path:publication.path,token:publication.token,expiresAt:publication.expiresAt-serverOffset});
    if(me?.id===owner) localObsEndpoint=endpoint;
    return endpoint;
  }
  async function getObsPublication() {
    if (!me) throw Error('Entre na sala para configurar o OBS.');
    if (!obsIdentitySupported) return { url: `${location.origin}/obs/${encodeURIComponent(me.name)}`, token: null, individual: false };
    const owner = me.id, generation = obsCredentialGeneration;
    if (obsCredentialOwner === owner && obsCredentials?.expiresAt > Date.now() + serverOffset + 1000) return obsCredentials;
    if (obsCredentialRequest?.owner === owner && obsCredentialRequest.generation === generation) return obsCredentialRequest.promise;
    const promise = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(Error('O servidor não respondeu à configuração OBS.')); }, 5000);
      socket.emit('obs:credentials', obsCredentials ? { path: obsCredentials.path, token: obsCredentials.token } : null, result => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (!me || me.id !== owner || !socket.connected || generation !== obsCredentialGeneration) return reject(Error('A conexão com a sala mudou.'));
        if (!result || result.error || !/^pub_[a-f0-9]{32}$/.test(result.path) || !/^[a-f0-9]{64}$/.test(result.token)
          || result.url !== '/obs-publish/' + result.path.slice(4)) return reject(Error(result?.error || 'Credencial OBS inválida.'));
        obsCredentials = { ...result, url: new URL(result.url, location.origin).href, individual: true };
        try { sessionStorage.setItem('wss-obs-publication', JSON.stringify({ path: result.path, token: result.token, expiresAt: result.expiresAt })); } catch {}
        obsCredentialOwner = owner; resolve(obsCredentials);
      });
    });
    obsCredentialRequest = { owner, generation, promise };
    try { return await promise; } finally { if (obsCredentialRequest?.promise === promise) obsCredentialRequest = null; }
  }

  btnObs.addEventListener('click', async () => {
    if (!me) return;
    openSettings('obs');
  });


  // O OBS manda o vídeo pelo TURN em UDP (não sabe usar TURN por TCP). Testa daqui se
  // essa porta está publicada, que é o passo que mais fica pra trás no CasaOS.
  // A aba OBS das Configurações mostra o resultado (ação 'obs-check'). null: sem TURN por UDP.
  async function obsPortCheck() {
    const servers = await getIceServers();
    let server = null;
    let url = null;
    for (const candidate of servers) {
      url = [].concat(candidate.urls).find((u) => /^turn:.*transport=udp/.test(u));
      if (url) {
        server = candidate;
        break;
      }
    }
    if (!server) return null;
    if (serverStatus.proxy) return { ok: false, text: proxyWarningText(serverStatus.proxy.port) };
    const port = (url.match(/:(\d+)\?/) || [])[1] || '3000';
    let pc;
    let ok = false;
    try {
      pc = new RTCPeerConnection({
        iceServers: [{ urls: url, username: server.username, credential: server.credential }],
        iceTransportPolicy: 'relay',
      });
      pc.createDataChannel('teste');
      const relay = new Promise((resolve) => {
        setTimeout(() => resolve(false), 5000);
        pc.onicecandidate = (e) => {
          if (!e.candidate) resolve(false);
          else if (/ typ relay/.test(e.candidate.candidate)) resolve(true);
        };
      });
      await pc.setLocalDescription(await pc.createOffer());
      ok = await relay;
    } catch {
      ok = false;
    } finally {
      if (pc) pc.close();
    }
    return {
      ok,
      text: ok
        ? `Porta ${port}/UDP do servidor respondendo: é por ela que o OBS manda o vídeo.`
        : `A porta ${port}/UDP do servidor não respondeu daqui, e o OBS precisa dela pra mandar o vídeo. No CasaOS, edite o app e adicione a porta ${port} → 3478 com protocolo UDP (veja o README).`,
    };
  }

  // ---------- diagnóstico de conexão ----------

  // Quem não consegue assistir roda isto e manda o resultado: mostra se o TURN do
  // servidor responde por UDP e por TCP, se uma conexão completa por ele fecha neste
  // navegador, se ele decodifica H.264 (o codec do OBS) e se conecta numa transmissão
  // do OBS que estiver no ar.

  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  function turnServers(servers) {
    const list = [];
    for (const server of servers) {
      for (const url of [].concat(server.urls)) {
        if (/^turns?:/.test(url)) list.push({ url, server });
      }
    }
    return list;
  }

  async function gatherRelay(iceServer, timeoutMs) {
    const started = performance.now();
    const pc = new RTCPeerConnection({ iceServers: [iceServer], iceTransportPolicy: 'relay' });
    try {
      pc.createDataChannel('diag');
      const found = new Promise((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
        pc.onicecandidate = (e) => {
          if (!e.candidate) resolve(null);
          else if (/ typ relay/.test(e.candidate.candidate)) resolve(e.candidate.candidate);
        };
      });
      await pc.setLocalDescription(await pc.createOffer());
      const candidate = await found;
      const parts = candidate ? candidate.split(' ') : [];
      return { ok: Boolean(candidate), address: candidate ? `${parts[4]}:${parts[5]}` : null, ms: Math.round(performance.now() - started) };
    } finally {
      pc.close();
    }
  }

  async function selectedRoute(pc) {
    const report = await pc.getStats();
    let pair = null;
    report.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pair = report.get(r.selectedCandidatePairId);
    });
    if (!pair) report.forEach((r) => { if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r; });
    const local = pair && report.get(pair.localCandidateId);
    const remote = pair && report.get(pair.remoteCandidateId);
    const describe = (c) => c && `${c.candidateType} ${c.address || c.ip}:${c.port}${c.relayProtocol ? ` via ${c.relayProtocol}` : ''}`;
    return local ? `${describe(local)} → ${describe(remote)}` : 'sem par escolhido';
  }

  // Duas conexões neste mesmo navegador, só por TURN: é o caminho de quem assiste sem
  // transmitir e o único caminho até o servidor do OBS.
  async function testRelayPair(iceServers, timeoutMs) {
    const cfg = { iceServers, iceTransportPolicy: 'relay' };
    const a = new RTCPeerConnection(cfg);
    const b = new RTCPeerConnection(cfg);
    try {
      // Candidatos trocados um a um, como na sala (em lote, duas conexões no mesmo
      // navegador às vezes não fecham pelo TURN, o que daria um falso negativo).
      const toA = [];
      const toB = [];
      const deliver = (pc, queue, candidate) => {
        if (pc.remoteDescription) pc.addIceCandidate(candidate).catch(() => {});
        else queue.push(candidate);
      };
      a.onicecandidate = (e) => { if (e.candidate) deliver(b, toB, e.candidate); };
      b.onicecandidate = (e) => { if (e.candidate) deliver(a, toA, e.candidate); };
      const channel = a.createDataChannel('diag');
      const opened = new Promise((resolve) => {
        setTimeout(() => resolve(false), timeoutMs);
        channel.onopen = () => resolve(true);
      });
      await a.setLocalDescription(await a.createOffer());
      await b.setRemoteDescription(a.localDescription);
      for (const c of toB.splice(0)) await b.addIceCandidate(c).catch(() => {});
      await b.setLocalDescription(await b.createAnswer());
      await a.setRemoteDescription(b.localDescription);
      for (const c of toA.splice(0)) await a.addIceCandidate(c).catch(() => {});
      const ok = await opened;
      return { ok, route: ok ? await selectedRoute(a) : `estado: ${a.iceConnectionState}` };
    } finally {
      a.close();
      b.close();
    }
  }

  async function testWhep(stream, iceServers, timeoutMs) {
    const pc = new RTCPeerConnection({ iceServers });
    let location = null;
    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      await pc.setLocalDescription(await pc.createOffer());
      await iceGatheringDone(pc, 3000);
      const res = await fetch(`/mtx/${encodeURIComponent(stream)}/whep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp', ...authHeaders() },
        body: pc.localDescription.sdp,
      });
      const body = await res.text();
      if (res.status !== 201) return { ok: false, detail: `servidor respondeu ${res.status}: ${body.slice(0, 160)}` };
      location = res.headers.get('Location');
      const video = /m=video [1-9]/.test(body) ? (body.match(/a=rtpmap:\d+ ([A-Za-z0-9]+)\/90000/) || [])[1] : null;
      await pc.setRemoteDescription({ type: 'answer', sdp: body });
      if (!video) return { ok: false, detail: 'o servidor não aceitou nenhum codec de vídeo deste navegador' };
      const connected = await new Promise((resolve) => {
        const check = () => {
          if (pc.connectionState === 'connected') resolve(true);
          else if (pc.connectionState === 'failed') resolve(false);
        };
        pc.addEventListener('connectionstatechange', check);
        setTimeout(() => resolve(pc.connectionState === 'connected'), timeoutMs);
      });
      if (!connected) return { ok: false, detail: `não conectou (estado: ${pc.connectionState}, ICE: ${pc.iceConnectionState}); codec ${video}` };
      await wait(2500);
      let bytes = 0;
      let frames = 0;
      (await pc.getStats()).forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          bytes = r.bytesReceived || 0;
          frames = r.framesDecoded || 0;
        }
      });
      return {
        ok: frames > 0,
        detail: `conectou (${await selectedRoute(pc)}), codec ${video}, ${frames} quadros decodificados, ${Math.round(bytes / 1024)} KB recebidos`,
      };
    } finally {
      pc.close();
      if (location) fetch(location, { method: 'DELETE', keepalive: true }).catch(() => {});
    }
  }

  let diagRunning = false;

  async function printCurrentRoutes(print) {
    const peers = [...outgoing.values()].map(o => ({ owner: o, pc: o.pc, label: 'Vídeo enviado' }))
      .concat([...streams.values()].filter(s => s.watching).map(s => ({ owner: s, pc: s.pc, label: 'Vídeo recebido' })));
    const routes = await Promise.all(peers.slice(0, 16).map(async entry => {
      const observed = await window.WssNetworkHealth.inspectRoute(entry.pc, { readStats: pc => peerStats.read(pc) });
      return { ...entry, route: entry.owner.pc === entry.pc ? observed : window.WssNetworkHealth.route() };
    }));
    print('Rotas da sessão (consulta passiva, sem endereços dos jogadores):');
    routes.forEach((entry, index) => print(`${entry.label} ${index + 1}: ${entry.route.label}${entry.route.result === 'timeout' ? ' (consulta expirou)' : ''}.`));
    const controls = [...controlTransport.snapshot(),...await desktop?.receiverSnapshot?.()||[]];
    controls.slice(0, 16).forEach((s, index) => {
      const kind = s.route === 'turn' ? 'TURN' : s.route === 'p2p' ? 'P2P WebRTC' : 'desconhecida';
      print(`Comandos ${index + 1}: ${s.transport === 'webrtc' ? `${kind} (última rota observada)` : 'Socket.IO via servidor'}.`);
    });
    if (!peers.length && !controls.length) print('Nenhuma conexão de vídeo ou comandos ativa.');
    if (peers.length > 16 || controls.length > 16) print('Exibição limitada a 16 conexões de cada tipo.');
    print('P2P WebRTC não confirma LAN nem conexão direta da VPN; DERP entre PCs continua não verificado.');
    print('');
  }

  async function runDiagnostics() {
    if (diagRunning) return;
    diagRunning = true;
    const out = [];
    const print = (line) => {
      out.push(line);
      diagOutput.textContent = out.join('\n');
      diagOutput.scrollTop = diagOutput.scrollHeight;
    };
    const mark = (ok) => (ok ? '✓' : '✗');
    try {
      print(`Web Screen Share, ${pageVersion ? `versão ${pageVersion}` : 'versão desconhecida'}`);
      print(`Navegador: ${navigator.userAgent}`);
      print(`Endereço: ${window.location.origin}${serverStatus.proxy ? ` (aberto por proxy SEM PUBLIC_PORT: TURN indo pra porta ${serverStatus.proxy.port})` : ''}`);
      await printCurrentRoutes(print);
      if (desktop?.networkDiagnostics) {
        print('Verificando a rota Tailscale até o servidor configurado…');
        const vpn = await desktop.networkDiagnostics();
        if (vpn.available && vpn.samples?.length) {
          const label = vpn.route === 'direct' ? 'direta' : vpn.route === 'derp' ? `via DERP (${vpn.relay})` : 'não identificada';
          print(`Tailscale até o servidor: última rota ${label}; ${vpn.samples.length} resposta(s).`);
          print(`RTT Tailscale p50/p95: ${vpn.latency.p50.toFixed(1)} / ${vpn.latency.p95.toFixed(1)} ms. Este teste não mede o caminho de vídeo entre jogadores.`);
        } else print(`Tailscale: ${vpn.reason || 'rota não verificada'}`);
        if (vpn.localNat) {
          const indicator = value => value === true ? 'sim' : value === false ? 'não' : '?';
          print(`Neste PC: UDP disponível ${indicator(vpn.localNat.UDP)}, mapeamento varia por destino ${indicator(vpn.localNat.MappingVariesByDestIP)}.`);
          print(`Protocolos anunciados pelo roteador: UPnP ${indicator(vpn.localNat.UPnP)}, NAT-PMP ${indicator(vpn.localNat.PMP)}, PCP ${indicator(vpn.localNat.PCP)}.`);
        }
      }
      const servers = await getIceServers();
      const turns = turnServers(servers);
      print(`TURN: ${turns.map((t) => t.url).join(', ') || 'nenhum'}`);
      print('');
      for (const { url, server } of turns) {
        const r = await gatherRelay({ urls: url, username: server.username, credential: server.credential }, 6000);
        const transport = /transport=tcp/.test(url) ? 'TCP' : 'UDP';
        print(`${mark(r.ok)} TURN por ${transport}: ${r.ok ? `respondeu, endereço ${r.address} (${r.ms} ms)` : `não respondeu em ${Math.round(r.ms / 1000)} s`}`);
      }
      if (turns.length) {
        const pair = await testRelayPair(servers, 10000);
        print(`${mark(pair.ok)} Conexão completa pelo TURN: ${pair.ok ? `fechou (${pair.route})` : `não fechou (${pair.route})`}`);
      }
      const caps = window.RTCRtpReceiver && RTCRtpReceiver.getCapabilities ? RTCRtpReceiver.getCapabilities('video') : null;
      const codecs = caps ? [...new Set(caps.codecs.map((c) => c.mimeType.replace(/^video\//, '')).filter((c) => !/rtx|red|ulpfec|flexfec/i.test(c)))] : [];
      const h264 = codecs.some((c) => /^h264$/i.test(c));
      const av1 = codecs.some(c=>/^av1$/i.test(c));
      print(`Vídeo OBS via WebRTC · AV1: ${av1?'sim':'não'} · H.264: ${h264?'sim':'não'}`);
      if (!h264 && !av1) print(OBS_CODEC_ERROR);
      const obsStream = [...users.values()].find((u) => u.kind === 'obs');
      if (obsStream) {
        const r = await testWhep(obsStream.stream, servers, 10000);
        print(`${mark(r.ok)} Transmissão do OBS de ${obsStream.name}: ${r.detail}`);
      } else {
        print('- Transmissão do OBS: ninguém transmitindo pelo OBS agora, teste pulado');
      }
    } catch (err) {
      print(`✗ O teste parou com erro: ${err && err.message ? err.message : err}`);
    } finally {
      print('');
      print('Fim do teste.');
      diagRunning = false;
    }
  }

  $('diag-again').addEventListener('click', runDiagnostics);
  let performanceReportPending = null;
  function performanceReport() {
    if (performanceReportPending) return performanceReportPending;
    performanceReportPending = (async () => {
      if(localNative){const token=localNative.token;const value=await desktop.nativeVideoCommand({token,type:'snapshot'}).catch(()=>null);if(localNative?.token===token)nativeSnapshot=value;}
      const capture = captureSnapshot(), controls = [...controlTransport.snapshot(),...await desktop?.receiverSnapshot?.()||[]];
      const hardwareTask = Promise.resolve(desktop?.mediaCapabilities?.()).catch(() => null);
      const incoming = [...streams.values()].map(s => ({ state: s.pc?.connectionState, watching: s.watching, metrics: s.videoMetrics, pc: s.pc,
        latencyRecoveries: s.latencyRecoveries || 0, receiverTargets: Object.values(s.receiverTargets || {}) }));
      const peers = [...outgoing.values()].map((o, index) => ({ pc: o.pc, target: capture.senders[index], direction: 'outbound' }))
        .concat(incoming.map(s => ({ pc: s.pc, target: s, direction: 'inbound' })));
      await Promise.allSettled(peers.slice(0, 128).map(async ({ pc, target, direction }) => {
        if (!pc || !target || typeof pc.getStats!=='function') return;
        let timer;
        try {
          const report = await Promise.race([peerStats.read(pc), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Stats timeout')), 2000); })]);
          // Primeira consulta pode preceder o monitor periódico. Aproveita os
          // campos já expostos pelo RTC; taxas sem baseline continuam null.
          const age = Date.now() - target.metrics?.sampledAt;
          if (!target.metrics || !Number.isFinite(age) || age < 0 || age > 10000) {
            target.metrics = Video.createMetrics(direction).sample(report);
          }
          target.state = pc.connectionState;
          target.route = pc.connectionState === 'connected' ? window.WssNetworkHealth.routeFromStats(report) : window.WssNetworkHealth.route();
        } finally { clearTimeout(timer); }
      }));
      const hardware = await hardwareTask || capture.hardware;
      return window.WssPerformanceReport.build({ at: Date.now(), version: pageVersion, platform: navigator.platform, capture, controls, streams: incoming, hardware, experiments: transportExperiments.snapshot() });
    })().finally(() => { performanceReportPending = null; });
    return performanceReportPending;
  }
  async function copySessionMetrics(event) {
    const button = event.currentTarget;
    button.disabled = true;
    try { await navigator.clipboard.writeText(JSON.stringify(await performanceReport(), null, 2)); showToast('Métricas da sessão copiadas.'); }
    catch { showToast('Não foi possível copiar as métricas.'); }
    finally { button.disabled = false; }
  }
  $('diag-metrics').addEventListener('click', copySessionMetrics);
  $('diag-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(diagOutput.textContent);
      showToast('Resultado copiado.');
    } catch {
      const range = document.createRange();
      range.selectNodeContents(diagOutput);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      showToast('Selecionei o resultado: copie com Ctrl+C.');
    }
  });
  diagDialog.addEventListener('click', (e) => {
    if (e.target === diagDialog) diagDialog.close();
  });

  // ---------- assistir ----------

  function addStreamTile(user) {
    if (streams.has(user.id)) return;
    const isObs = user.kind === 'obs';
    const isMine = isObs && me && user.ownerId === me.id;
    const base = createTile(user.name, isMine ? 'Você' : user.name, user.kind);
    const key = streamKey(user);
    // Toda transmissão nova começa tocando sem som (inclusive a sua do OBS, cujo som
    // voltaria pro OBS pelo áudio do PC); uma que voltou fica como você deixou. A sua do
    // OBS nem abre sozinha: assistir a própria transmissão só gasta internet.
    const prefs = prefsFor(key, !isMine);
    const s = {
      ...base,
      id: user.id,
      key,
      mine: Boolean(isMine),
      prefs,
      name: user.name,
      since: user.since || Date.now() + serverOffset,
      kind: user.kind || null,
      stream: user.stream || null,
      whepUrl: null,
      attempt: 0,
      pc: null,
      sid: null,
      pending: [],
      watching: prefs.watching,
      quality: Object.hasOwn(PRESETS, prefs.quality) ? prefs.quality : DEFAULT_QUALITY,
      volume: prefs.volume,
      muted: prefs.muted,
      hasAudio: true,
      pinShown: null,
      retryTimer: null,
      statsTimer: null,
      lastBytes: null,
    };

    const tools = el('div', 'tile-tools');
    // A qualidade vem do próprio OBS (um vídeo só, igual pra todo mundo).
    const qualitySelect = isObs ? null : el('select');
    if (qualitySelect) {
      qualitySelect.title = 'Qualidade (só pra você)';
      qualitySelect.setAttribute('aria-label', 'Qualidade');
      for (const [key, preset] of Object.entries(PRESETS)) {
        const opt = el('option', null, preset.label);
        opt.value = key;
        opt.selected = key === s.quality;
        qualitySelect.append(opt);
      }
      tools.append(qualitySelect);
    }
    const btnStats = iconButton('info', 'Estatísticas da conexão');
    btnStats.classList.add('stats-btn');
    const btnPin = iconButton('pin', 'Fixar em destaque');
    btnPin.classList.add('pin-btn');
    const btnFull = iconButton('maximize', 'Tela cheia (F)');
    const btnClose = iconButton('close', 'Parar de assistir');
    tools.append(btnStats, btnPin);
    // Janelinha por cima de tudo, pra continuar vendo enquanto usa outro programa.
    const btnPip = document.pictureInPictureEnabled && base.video.requestPictureInPicture
      ? iconButton('pip', 'Picture-in-picture: janelinha por cima de tudo')
      : null;
    if (btnPip) {
      btnPip.classList.add('pip-btn');
      tools.append(btnPip);
    }
    // Controle remoto: só aparece quando quem transmite deixou você mexer.
    const btnControl = isMine ? null : iconButton('gamepad', `Controlar o mouse e o teclado de ${user.name}`);
    // Controlando: esconde tudo que fica por cima da transmissão (pra clicar em qualquer
    // canto da tela de lá). Volta pelo botão na barra de baixo ou Ctrl+Shift+H.
    const btnHudHide = btnControl ? iconButton('eyeOff', 'Esconder os botões de cima da transmissão (Ctrl+Shift+H)') : null;
    if (btnHudHide) {
      btnHudHide.classList.add('hud-btn');
      btnHudHide.hidden = true;
      tools.append(btnHudHide);
    }
    if (btnControl) {
      btnControl.classList.add('control-btn');
      btnControl.hidden = true;
      tools.append(btnControl);
    }
    tools.append(btnFull, btnClose);

    const stats = el('pre', 'tile-stats');
    stats.hidden = true;
    base.media.append(tools, stats);

    const audio = el('div', 'tile-audio');
    const btnMute = iconButton('volume', 'Silenciar');
    audio.append(btnMute);
    let slider = null;
    if (canSetVolume) {
      slider = el('input', 'volume');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.setAttribute('aria-label', `Volume de ${user.name}`);
      audio.append(slider);
    }
    const actions = el('div', 'tile-actions');
    const btnReact = iconButton('smile', 'Reagir (teclas 1 a 6)');
    btnReact.classList.add('react-btn');
    const btnShot = iconButton('camera', 'Salvar um print da transmissão (S)');
    btnShot.classList.add('shot-btn');
    actions.append(btnReact, btnShot);
    const btnHudShow = btnControl ? iconButton('eye', 'Mostrar os botões em cima da transmissão (Ctrl+Shift+H)') : null;
    if (btnHudShow) {
      btnHudShow.classList.add('hud-show-btn');
      btnHudShow.hidden = true;
      actions.prepend(btnHudShow);
    }
    const reactPop = el('div', 'react-pop');
    reactPop.hidden = true;
    REACTIONS.forEach((emoji, i) => {
      const choice = el('button', 'react-choice', emoji);
      choice.type = 'button';
      choice.title = `${emoji} (tecla ${i + 1})`;
      choice.addEventListener('click', () => sendReaction(s.id, emoji));
      reactPop.append(choice);
    });
    base.tile.append(reactPop);
    base.bar.append(actions, audio);
    Object.assign(s, { qualitySelect, btnStats, btnPin, btnPip, btnControl, btnHudHide, btnHudShow, stats, audio, btnMute, slider, btnReact, reactPop });

    btnMute.addEventListener('click', () => {
      s.muted = !s.muted;
      if (!s.muted && s.volume === 0) s.volume = 1;
      renderAudio(s);
      if (!s.muted && s.video.paused && s.video.srcObject) s.video.play().catch(() => {});
    });
    if (slider) {
      slider.addEventListener('input', () => {
        const value = Number(slider.value) / 100;
        if (value === 0) {
          s.muted = true;
        } else {
          s.volume = value;
          s.muted = false;
        }
        renderAudio(s);
      });
    }
    if (qualitySelect) {
      qualitySelect.addEventListener('change', () => {
        s.quality = qualitySelect.value;
        s.prefs.quality = s.quality;
        if (s.pc) send(s.id, { stream: s.id, type: 'quality', quality: s.quality });
        qualitySelect.blur(); // senão o foco prende os botões de cima na tela
      });
    }
    btnStats.addEventListener('click', () => toggleStats(s));
    btnPin.addEventListener('click', () => togglePin(s));
    btnFull.addEventListener('click', () => toggleFullscreen(s));
    base.video.addEventListener('dblclick', () => {
      if (controlling !== s.id) toggleFullscreen(s);
    });
    btnClose.addEventListener('click', () => stopWatching(s));
    base.video.addEventListener('playing', () => setStatus(s, ''));
    btnReact.addEventListener('click', () => toggleReactions(s));
    btnShot.addEventListener('click', () => capture(s));
    if (btnPip) {
      btnPip.addEventListener('click', () => togglePip(s));
      base.video.addEventListener('enterpictureinpicture', () => btnPip.classList.add('active'));
      base.video.addEventListener('leavepictureinpicture', () => btnPip.classList.remove('active'));
    }
    enableMarkup(s, () => s.id);
    if (btnHudHide) btnHudHide.addEventListener('click', () => setHudHidden(true));
    if (btnHudShow) btnHudShow.addEventListener('click', () => setHudHidden(false));
    if (btnControl) {
      btnControl.addEventListener('click', () => toggleControlling(s));
      enableCursorShare(s);
      enableControl(s);
    }

    if (isMine && window.wssDesktop) {
      s.overlayTag = el('span', 'tag tag-overlay', 'na sua tela');
      s.overlayTag.title = 'Quando alguém apontar, desenhar ou reagir na sua transmissão do OBS, aparece também na sua tela de verdade';
      s.overlayTag.hidden = true;
      base.bar.firstElementChild.append(s.overlayTag);
    }
    streams.set(user.id, s);
    gridInner.append(s.tile);
    renderControlButton(s);
    renderAudio(s);
    if (s.watching) requestWatch(s);
    else s.tile.hidden = true; // fechada no X: fica na lista, com o botão Assistir
    layoutGrid();
    renderUptimes();
  }

  // ended: a transmissão acabou (ou quem transmite caiu): o jeito que você deixou vale
  // se ela voltar logo. Sem isso, é a sua conexão que caiu, e vale quando você voltar.
  function removeStreamTile(id, { ended = false } = {}) {
    const s = streams.get(id);
    if (!s) return;
    if (ended) s.prefs.endedAt = Date.now();
    if (activeStream === id) deactivateCursor();
    s.cursorShare?.close();
    s.controlPointerReset?.();
    streams.delete(id);
    if (controlling === id) stopControlling();
    leavePip(s);
    closeIncoming(s);
    stopStats(s);
    if (document.fullscreenElement === s.tile) exitFullscreen();
    s.tile.remove();
    layoutGrid();
  }

  function requestWatch(s) {
    closeIncoming(s);
    s.watching = true;
    s.prefs.watching = true;
    setStatus(s, 'Conectando…', true);
    const attempt = s.attempt;
    if (s.kind === 'obs') { startWhep(s);obsRoutes.watch(s); }
    s.decoderCapabilities = codecProbe.rtp('decode');
    if (s.attempt === attempt && s.kind !== 'obs') send(s.id, { stream: s.id, type: 'watch', quality: s.quality, decoderCapabilities: s.decoderCapabilities, nativeVideo: window.WssNativeVideo?.supported()===true });
  }

  // Parar de assistir tira o quadro da tela (pra sobrar espaço pras outras
  // transmissões); pra voltar, é o botão Assistir na lista de pessoas.
  function stopWatching(s) {
    if (activeStream === s.id) deactivateCursor();
    s.watching = false;
    s.prefs.watching = false;
    if (pinnedKey === s.key) pinnedKey = null;
    if (controlling === s.id) stopControlling();
    if (s.kind !== 'obs') send(s.id, { stream: s.id, type: 'unwatch' });
    leavePip(s);
    s.reactPop.hidden = true;
    closeIncoming(s);
    stopStats(s);
    setStatus(s, '');
    if (document.fullscreenElement === s.tile) exitFullscreen();
    s.tile.hidden = true;
    layoutGrid();
    renderUsers();
  }

  function resumeWatching(s) {
    if (streams.get(s.id) !== s) return;
    s.tile.hidden = false;
    requestWatch(s);
    layoutGrid();
    renderUsers();
    focusTile(s.id);
  }

  function closeIncoming(s) {
    obsRoutes.stop(s);
    delete s.tile.dataset.obsRoute;
    s.nativeReceiver?.close();s.nativeReceiver=null;
    s.nativeQualityOption?.remove();s.nativeQualityOption=null;if(s.qualitySelect){s.qualitySelect.disabled=false;s.qualitySelect.value=s.quality;}
    clearInterval(s.healthTimer);
    s.healthTimer = null;
    s.healthStats = null;
    s.videoSampler = null; s.videoMetrics = null;
    s.receiverTargets = null;
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
    s.attempt += 1;
    if (s.whepUrl) {
      fetch(s.whepUrl, { method: 'DELETE', keepalive: true }).catch(() => {});
      s.whepUrl = null;
    }
    if (s.pc) {
      peerStats.clear(s.pc);
      s.pc.close();
      s.pc = null;
    }
    s.sid = null;
    s.pending = [];
    s.video.srcObject = null;
  }

  function scheduleRetry(s, delay = 3000) {
    if (s.retryTimer) return;
    s.retryTimer = setTimeout(() => {
      s.retryTimer = null;
      if (s.watching && streams.get(s.id) === s) { reporting.retry(s.id); requestWatch(s); }
    }, delay);
  }

  function playVideo(s) {
    s.video.muted = s.muted;
    s.video.play().catch((err) => {
      if (err.name !== 'NotAllowedError') return;
      // Navegador bloqueou autoplay com som: começa mudo e a pessoa ativa no botão.
      s.muted = true;
      renderAudio(s);
      s.video.play().catch(() => {});
      showToast('O navegador bloqueou o som automático. Clique no alto-falante pra ativar.');
    });
  }

  function renderAudio(s) {
    s.prefs.muted = s.muted;
    s.prefs.volume = s.volume;
    const silent = s.muted || s.volume === 0;
    s.video.muted = s.muted;
    s.video.volume = s.volume;
    s.audio.classList.toggle('no-audio', !s.hasAudio);
    s.btnMute.disabled = !s.hasAudio;
    if (!s.hasAudio) setIcon(s.btnMute, 'volumeX', 'Esta transmissão não tem áudio');
    else setIcon(s.btnMute, silent ? 'volumeX' : 'volume', s.muted ? 'Ativar som' : 'Silenciar');
    s.btnMute.classList.toggle('is-muted', silent);
    if (s.slider) {
      const value = s.muted ? 0 : Math.round(s.volume * 100);
      s.slider.value = String(value);
      s.slider.disabled = !s.hasAudio;
      s.slider.title = `Volume: ${value}%`;
      s.slider.style.setProperty('--fill', `${value}%`);
    }
  }

  // ---------- lista de pessoas por cima (computador) ----------

  // No computador a lista não ocupa espaço: aparece por cima das transmissões quando o
  // mouse encosta na borda esquerda e some quando ele sai; o botão do topo abre e
  // deixa aberta até clicar fora, apertar Esc ou no botão de novo. Fixada (o "<<" no topo
  // dela, que vira "x"), ela fica sempre aberta, do lado, e as transmissões se ajeitam no resto.
  const desktopLayout = window.matchMedia('(min-width: 761px)');
  const SIDEBAR_EDGE_PX = 8;
  const SIDEBAR_HIDE_MS = 400;
  const btnSidebarPin = $('btn-sidebar-close');
  let sidebarPinned = false; // aberta pelo botão do topo (fica até clicar fora)
  let sidebarDocked = false; // fixada do lado
  let sidebarTimer = null;
  try {
    sidebarDocked = localStorage.getItem('wss-sidebar-docked') === '1';
  } catch {}

  function setSidebar(open, pinned = false) {
    clearTimeout(sidebarTimer);
    sidebarTimer = null;
    sidebarPinned = open && pinned;
    appEl.classList.toggle('show-sidebar', open);
    btnPeople.setAttribute('aria-expanded', String(open || sidebarDocked));
  }

  // O botão do topo da lista (só no computador; no celular ela é a faixa de cima):
  // "<<" fixa e vira "x"; o "x" solta e esconde.
  function renderSidebarPin() {
    appEl.classList.toggle('sidebar-docked', sidebarDocked);
    btnSidebarPin.classList.toggle('docked', sidebarDocked);
    const label = sidebarDocked ? 'Soltar a lista (volta a abrir só ao encostar na borda)' : 'Fixar a lista do lado';
    btnSidebarPin.title = label;
    btnSidebarPin.setAttribute('aria-label', label);
    btnPeople.setAttribute('aria-expanded', String(sidebarDocked || appEl.classList.contains('show-sidebar')));
  }

  function setSidebarDocked(docked) {
    sidebarDocked = docked;
    try { localStorage.setItem('wss-sidebar-docked', docked ? '1' : '0'); } catch {}
    setSidebar(false);
    renderSidebarPin();
    layoutGrid(); // as transmissões ganham (ou perdem) o espaço da lista
  }
  renderSidebarPin();
  btnSidebarPin.addEventListener('click', () => setSidebarDocked(!sidebarDocked));

  btnPeople.addEventListener('click', () => {
    if (sidebarDocked && desktopLayout.matches) {
      setSidebarDocked(false); // fixada: o botão do topo solta e esconde
      return;
    }
    setSidebar(!(appEl.classList.contains('show-sidebar') && sidebarPinned), true);
  });

  document.addEventListener('pointermove', (e) => {
    if (!desktopLayout.matches || sidebarDocked || appEl.hidden || document.fullscreenElement || e.pointerType === 'touch') return;
    const open = appEl.classList.contains('show-sidebar');
    if (e.clientX <= SIDEBAR_EDGE_PX) {
      if (!open) setSidebar(true);
      else if (!sidebarPinned) {
        clearTimeout(sidebarTimer);
        sidebarTimer = null;
      }
    } else if (open && !sidebarPinned) {
      if (e.clientX <= sidebarEl.offsetWidth || e.buttons) {
        clearTimeout(sidebarTimer);
        sidebarTimer = null;
      } else if (!sidebarTimer) {
        sidebarTimer = setTimeout(() => {
          sidebarTimer = null;
          if (!sidebarPinned && !sidebarEl.matches(':hover')) setSidebar(false);
        }, SIDEBAR_HIDE_MS);
      }
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!sidebarPinned || sidebarEl.contains(e.target) || btnPeople.contains(e.target)) return;
    if (e.target.closest && e.target.closest('dialog')) return;
    setSidebar(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appEl.classList.contains('show-sidebar') && !document.querySelector('dialog[open]')) setSidebar(false);
  });

  // ---------- tela cheia ----------

  const FS_EDGE_PX = 8; // encostar o mouse a até 8px da borda de baixo mostra a barra
  const FS_IDLE_MS = 2500; // mouse parado: somem os botões de cima e o cursor
  const FS_BAR_HIDE_MS = 600; // atraso pra esconder a barra depois que o mouse sai dela
  const fs = { idleTimer: null, barTimer: null };

  const fullscreenTile = () => {
    const node = document.fullscreenElement;
    return node && node.classList.contains('tile') ? node : null;
  };

  function fsActivity(tile) {
    tile.classList.add('show-tools');
    tile.classList.remove('is-idle');
    clearTimeout(fs.idleTimer);
    fs.idleTimer = setTimeout(() => {
      if (fullscreenTile() !== tile) return;
      if (tile.querySelector('.tile-tools:hover')) {
        fsActivity(tile);
        return;
      }
      tile.classList.remove('show-tools');
      if (!tile.classList.contains('show-bar')) tile.classList.add('is-idle');
    }, FS_IDLE_MS);
  }

  function fsCancelBarHide() {
    clearTimeout(fs.barTimer);
    fs.barTimer = null;
  }

  function fsScheduleBarHide(tile, ms) {
    fsCancelBarHide();
    fs.barTimer = setTimeout(() => {
      fs.barTimer = null;
      fsHideBar(tile);
    }, ms);
  }

  function fsShowBar(tile, hideAfterMs) {
    tile.classList.add('show-bar');
    tile.classList.remove('is-idle');
    if (hideAfterMs) fsScheduleBarHide(tile, hideAfterMs);
    else fsCancelBarHide();
  }

  function fsHideBar(tile) {
    if (fullscreenTile() !== tile || tile.querySelector('.tile-bar:hover')) return;
    tile.classList.remove('show-bar');
  }

  document.addEventListener('fullscreenchange', () => {
    clearTimeout(fs.idleTimer);
    fsCancelBarHide();
    for (const node of gridInner.querySelectorAll('.tile')) node.classList.remove('show-bar', 'show-tools', 'is-idle');
    const tile = fullscreenTile();
    if (!tile) return;
    // Mostra tudo por um instante ao entrar, pra deixar claro onde as coisas estão.
    fsShowBar(tile, 2000);
    fsActivity(tile);
  });

  document.addEventListener('pointermove', (e) => {
    const tile = fullscreenTile();
    if (!tile) return;
    fsActivity(tile);
    if (e.pointerType === 'touch') return;
    const fromBottom = window.innerHeight - e.clientY;
    const barHeight = tile.querySelector('.tile-bar').offsetHeight;
    if (fromBottom <= FS_EDGE_PX) {
      fsShowBar(tile);
    } else if (fromBottom <= barHeight || e.buttons) {
      // Em cima da barra, ou arrastando o volume: continua aberta.
      if (tile.classList.contains('show-bar')) fsCancelBarHide();
    } else if (tile.classList.contains('show-bar') && !fs.barTimer) {
      fsScheduleBarHide(tile, FS_BAR_HIDE_MS);
    }
  });

  // O mouse saiu da janela (ex.: foi pra outro monitor) ou o foco foi pra outro
  // programa: esconde tudo que aparece por cima do vídeo. Sem isso, passar pela borda
  // de baixo a caminho do monitor de baixo abria a barra e ela ficava aberta, porque
  // a página não recebe mais o movimento do mouse.
  function hideOverlays() {
    const tile = fullscreenTile();
    if (tile) {
      clearTimeout(fs.idleTimer);
      fsCancelBarHide();
      tile.classList.remove('show-bar', 'show-tools');
      tile.classList.add('is-idle');
    }
    if (appEl.classList.contains('show-sidebar')) setSidebar(false);
    // Um botão clicado continua com foco e mantém os controles do quadro visíveis.
    // Menu de qualidade aberto fica de fora: tirar o foco fecharia o menu.
    const active = document.activeElement;
    if (active && active.tagName !== 'SELECT' && active.closest && active.closest('.tile-tools, .tile-bar')) active.blur();
  }

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) hideOverlays();
  });
  window.addEventListener('blur', hideOverlays);

  // No celular/tablet não tem mouse: um toque mostra a barra e os botões por um tempo.
  document.addEventListener('pointerdown', (e) => {
    const tile = fullscreenTile();
    if (!tile || e.pointerType !== 'touch') return;
    fsShowBar(tile, 4000);
    fsActivity(tile);
  });

  function toggleFullscreen(s) {
    if (document.fullscreenElement) {
      exitFullscreen();
    } else if (s.tile.requestFullscreen) {
      s.tile.requestFullscreen().catch(() => {});
    } else if (s.video.webkitEnterFullscreen) {
      s.video.webkitEnterFullscreen();
    }
  }

  // ---------- estatísticas ----------

  function toggleStats(s) {
    if (s.statsOpen) {
      stopStats(s);
      return;
    }
    s.stats.hidden = false;
    s.statsOpen = true;
    const generation = s.statsGeneration = (s.statsGeneration || 0) + 1;
    s.btnStats.classList.add('active');
    s.lastBytes = null;
    s.lastObs = null;
    let busy = false;
    const tick = async () => {
      if (busy || document.hidden || !s.statsOpen || s.statsGeneration !== generation) return;
      busy = true;
      try {
        const text = await describeStats(s).catch(() => 'Estatísticas indisponíveis.');
        if (document.hidden || !s.statsOpen || s.statsGeneration !== generation) return;
        s.stats.textContent = text;
      } finally { busy = false; }
    };
    s.statsTicker = window.createVisibleTicker({ document, interval: 1000,
      active: () => s.statsOpen && s.statsGeneration === generation, run: tick });
    tick();
  }

  function stopStats(s) {
    s.statsTicker?.close(); s.statsTicker = null;
    clearTimeout(s.statsTimer);
    s.statsTimer = null;
    s.statsOpen = false; s.statsGeneration = (s.statsGeneration || 0) + 1;
    s.stats.hidden = true;
    s.btnStats.classList.remove('active');
  }

  function describeStats(s) {
    if (s.statsDescription) return s.statsDescription;
    const pending = collectStatsDescription(s).finally(() => {
      if (s.statsDescription === pending) s.statsDescription = null;
    });
    s.statsDescription = pending; return pending;
  }
  async function collectStatsDescription(s) {
    const pc = s.pc;
    if (!pc) return 'Sem conexão.';
    const report = await peerStats.read(pc);
    if (s.pc !== pc) return 'A conexão mudou; aguardando novas estatísticas.';
    let video = null;
    let pair = null;
    report.forEach((r) => {
      if (r.type === 'inbound-rtp' && r.kind === 'video') video = r;
      if (r.type === 'transport' && r.selectedCandidatePairId) pair = report.get(r.selectedCandidatePairId);
    });
    if (!pair) {
      report.forEach((r) => {
        if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = r;
      });
    }
    const local = pair && report.get(pair.localCandidateId);
    const remote = pair && report.get(pair.remoteCandidateId);
    const route = window.WssNetworkHealth.route(local, remote).label;
    const lines = [
      `Conexão: ${CONNECTION_LABELS[pc.connectionState] || pc.connectionState}`,
      `Rota: ${route}`,
    ];
    if (video) {
      const codec = video.codecId && report.get(video.codecId);
      if (codec && codec.mimeType) lines.push(`Codec: ${codec.mimeType.replace(/^video\//, '')}`);
      if (video.frameWidth) lines.push(`Resolução: ${video.frameWidth}×${video.frameHeight}`);
      if (video.framesPerSecond != null) lines.push(`Quadros: ${Math.round(video.framesPerSecond)} fps`);
      if (video.framesDecoded != null) lines.push(`Decodificados: ${video.framesDecoded}`);
      if (video.framesDropped != null) lines.push(`Descartados (total): ${video.framesDropped}`);
      if (video.freezeCount != null) lines.push(`Congelamentos: ${video.freezeCount}`);
      if (video.framesDecoded && video.totalDecodeTime != null) lines.push(`Decodificação: ${(video.totalDecodeTime * 1000 / video.framesDecoded).toFixed(1)} ms/quadro`);
      if (s.lastBytes && video.bytesReceived >= s.lastBytes.bytes && video.timestamp > s.lastBytes.ts) {
        const kbps = ((video.bytesReceived - s.lastBytes.bytes) * 8) / (video.timestamp - s.lastBytes.ts);
        lines.push(`Taxa: ${(kbps / 1000).toFixed(1)} Mbps`);
      }
      s.lastBytes = { bytes: video.bytesReceived, ts: video.timestamp };
    }
    s.videoSampler ||= Video.createMetrics('inbound');
    s.videoMetrics = s.videoSampler.sample(report);
    if (s.videoMetrics) lines.push(...videoMetricLines(s.videoMetrics, false));
    const codecKey = s.videoMetrics?.codec?.split('/')[1]?.toLowerCase();
    const decodeCapability = s.decoderCapabilities?.[codecKey];
    if (decodeCapability) lines.push(`Capacidade estimada de decodificação eficiente: ${decodeCapability.powerEfficient === true ? 'sim' : decodeCapability.powerEfficient === false ? 'não' : 'não informada'} (não comprova o decoder em uso)`);
    if (pair && pair.currentRoundTripTime != null) {
      lines.push(`RTT da conexão de mídia: ${Math.round(pair.currentRoundTripTime * 1000)} ms (não mede atraso da imagem)`);
    }
    const controls = controlTransport.snapshot().find(c => c.role === 'guest' && c.stream === s.id);
    if (controls) {
      lines.push(`Comandos: ${controls.transport === 'webrtc' ? 'WebRTC' : 'via servidor (fallback)'}`);
      if (controls.transport === 'webrtc') {
        if (controls.routeLabel) lines.push(`Rota dos comandos: ${controls.routeLabel}`);
        if (controls.commandLatency) {
          const p = controls.commandLatency;
          lines.push(`RTT do DataChannel: p50 ${p.p50.toFixed(1)} / p95 ${p.p95.toFixed(1)} / p99 ${p.p99.toFixed(1)} ms (${p.count} amostras; sem execução nativa)`);
        }
        if (controls.commandProbeTimeouts) lines.push(`Diagnósticos de comandos sem resposta em 5 s: ${controls.commandProbeTimeouts}`);
      } else if (controls.reason) lines.push(controls.reason);
    }
    if (s.kind === 'obs') lines.push(s.obsDirect?.active?'OBS → jogador: conexão direta':'OBS → espectador: via servidor',...(await describeObsSource(s)));
    if (s.pc !== pc) return 'A conexão mudou; aguardando novas estatísticas.';
    return lines.join('\n');
  }

  function videoMetricLines(metrics, outbound) {
    const lines = [];
    const name = outbound ? 'Encoder' : 'Decoder';
    if (metrics.codec) lines.push(`Codec: ${metrics.codec.replace(/^video\//, '')}`);
    lines.push(`${name}: ${metrics.implementation || 'implementação não informada'}`);
    lines.push(`Aceleração por hardware: ${metrics.powerEfficient === true ? 'indicada pelo navegador' : metrics.powerEfficient === false ? 'não indicada pelo navegador' : 'não informada'}`);
    if (metrics.width && metrics.height) lines.push(`Vídeo: ${metrics.width}×${metrics.height}${metrics.fps != null ? ` · ${metrics.fps.toFixed(1)} FPS` : ''}`);
    if (outbound && metrics.sourceFps != null) lines.push(`Entrada no encoder: ${metrics.sourceFps.toFixed(1)} FPS`);
    if (metrics.bitrate != null) lines.push(`${outbound ? 'Enviando' : 'Recebendo'}: ${(metrics.bitrate / 1e6).toFixed(2)} Mbps`);
    const values = outbound ? [['Codificação', metrics.encodeMs], ['Fila de envio por pacote', metrics.sendQueueMs]]
      : [['Decodificação', metrics.decodeMs], ['Jitter buffer por quadro', metrics.jitterBufferMs], ['Alvo informado pelo navegador', metrics.jitterTargetMs],
        ['Mínimo estimado pela rede', metrics.jitterMinimumMs], ['Processamento de recepção', metrics.processingMs]];
    for (const [label, value] of values) if (value != null) lines.push(`${label}: ${value.toFixed(2)} ms (intervalo recente)`);
    if (!outbound) {
      if (metrics.framesDropped != null) lines.push(`Quadros descartados: ${metrics.framesDropped} (intervalo recente)`);
      if (metrics.freezes != null) lines.push(`Congelamentos registrados: ${metrics.freezes} (intervalo recente)`);
      if (metrics.freezeMs != null) lines.push(`Tempo em congelamentos registrados: ${(metrics.freezeMs / 1000).toFixed(2)} s (intervalo recente)`);
    }
    if (metrics.qualityLimitation) lines.push(`Limitação informada: ${metrics.qualityLimitation}`);
    return lines;
  }

  // Trecho do OBS até o servidor. Pacote perdido ali vira imagem "derretida" pra todo
  // mundo até o próximo quadro-chave do OBS, e não aparece nas estatísticas acima.
  async function describeObsSource(s) {
    let st;
    try {
      const res = await fetch(`/mtx/${encodeURIComponent(s.stream)}/stats`, { cache: 'no-store', headers: authHeaders() });
      if (!res.ok) return [];
      st = await res.json();
    } catch {
      return [];
    }
    const now = performance.now();
    const prev = s.lastObs;
    s.lastObs = { ...st, at: now };
    const lines = ['', 'Do OBS até o servidor:'];
    const total = st.packets + st.lost;
    const pct = total ? (st.lost * 100) / total : 0;
    let lost = `${st.lost.toLocaleString('pt-BR')} no total (${pct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)`;
    if (prev && st.lost >= prev.lost) lost = `${st.lost - prev.lost} agora, ${lost}`;
    lines.push(`Perdas: ${lost}`);
    // O MediaMTX conta cada pedaço de vídeo que teve de jogar fora (o resto de um quadro
    // que perdeu um pacote), não quadros inteiros.
    if (prev && st.framesInError >= prev.framesInError) {
      lines.push(`Descartados: ${st.framesInError - prev.framesInError} agora, ${st.framesInError} no total`);
    } else {
      lines.push(`Descartados: ${st.framesInError} no total`);
    }
    if (prev && st.bytes >= prev.bytes && now > prev.at) {
      const mbps = ((st.bytes - prev.bytes) * 8) / ((now - prev.at) * 1000);
      lines.push(`Chegando: ${mbps.toFixed(1)} Mbps`);
    }
    return lines;
  }

  // ---------- tempo ao vivo ----------

  function formatUptime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(total % 60)}` : `${m}:${pad(total % 60)}`;
  }

  function renderUptimes() {
    uptimeTicker?.sync();
    if (document.hidden) return;
    const now = Date.now();
    if (selfTile && shareStartedAt) selfTile.uptime.textContent = formatUptime(now - shareStartedAt);
    for (const s of streams.values()) {
      if (!s.tile.hidden) s.uptime.textContent = formatUptime(now + serverOffset - s.since);
    }
  }

  uptimeTicker = createVisibleTicker({ document, interval: 1000, run: renderUptimes, active: () => {
    if (selfTile && shareStartedAt) return true;
    for (const s of streams.values()) if (!s.tile.hidden) return true;
    return false;
  } });

  // ---------- reações, "olha aqui", print e picture-in-picture ----------

  let lastReactionAt = 0;

  function sendReaction(streamId, emoji) {
    const now = Date.now();
    if (!me || now - lastReactionAt < 120) return;
    lastReactionAt = now;
    socket.emit('react', { stream: streamId, emoji });
  }

  function toggleReactions(s) {
    const open = s.reactPop.hidden;
    closeReactions();
    s.reactPop.hidden = !open;
    s.btnReact.classList.toggle('active', open);
  }

  function closeReactions() {
    for (const s of streams.values()) {
      s.reactPop.hidden = true;
      s.btnReact.classList.remove('active');
    }
  }

  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest || e.target.closest('.react-pop, .react-btn')) return;
    closeReactions();
  });

  // Quadro onde aparecem as reações e marcações de uma transmissão: o seu (se for a
  // sua) ou o de quem você está assistindo.
  function fxTarget(streamId) {
    if (me && streamId === me.id) return selfTile;
    const s = streams.get(streamId);
    return s && s.watching && !s.tile.hidden ? s : null;
  }

  socket.on('react', ({ stream, emoji, name }) => {
    if (!REACTIONS.includes(emoji)) return;
    const tone = toneOf(name);
    toDesktopOverlay(stream, { type: 'react', emoji, name, hue: tone.hue, color: markFill(tone) });
    const target = fxTarget(stream);
    if (!target) return;
    const { fx } = target;
    const old = fx.querySelectorAll('.fx-reaction');
    for (let i = 0; i <= old.length - 30; i += 1) old[i].remove();
    const item = el('span', 'fx-reaction');
    item.append(el('span', 'fx-emoji', emoji), el('span', 'fx-who', name));
    item.style.left = `${10 + Math.random() * 80}%`;
    item.style.setProperty('--drift', `${Math.round(Math.random() * 80 - 40)}px`);
    item.style.setProperty('--tilt', `${Math.round(Math.random() * 30 - 15)}deg`);
    item.addEventListener('animationend', () => item.remove());
    fx.append(item);
  });

  // Área da imagem dentro do elemento (o vídeo fica centralizado, com faixas pretas).
  function contentBox(video, width, height) {
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const scale = Math.min(width / vw, height / vh);
    return { left: (width - vw * scale) / 2, top: (height - vh * scale) / 2, width: vw * scale, height: vh * scale };
  }

  // Ponto da imagem (de 0 a 1) debaixo do ponteiro; null nas faixas pretas. Com clamp,
  // o ponto mais perto dentro da imagem (pra um traço que passa da borda).
  function videoPoint(video, clientX, clientY, clamp = false) {
    const r = video.getBoundingClientRect();
    const box = contentBox(video, r.width, r.height);
    let x = (clientX - r.left - box.left) / box.width;
    let y = (clientY - r.top - box.top) / box.height;
    if (clamp) {
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
    }
    return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
  }

  // ---------- desenho ao vivo ----------

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STROKE_MAX = 1200; // números por traço ([x, y, x, y...]: 600 pontos)
  let strokeCounter = 0;
  let altGesture = false;

  // Traço suave: curvas que passam pelo meio entre os pontos.
  function strokePath(pts) {
    const f = (v) => v.toFixed(4);
    if (pts.length < 2) return '';
    const start = `M${f(pts[0])} ${f(pts[1])}`;
    if (pts.length === 2) return `${start}L${f(pts[0])} ${f(pts[1])}`;
    let d = start;
    for (let i = 2; i < pts.length - 2; i += 2) {
      d += `Q${f(pts[i])} ${f(pts[i + 1])} ${f((pts[i] + pts[i + 2]) / 2)} ${f((pts[i + 1] + pts[i + 3]) / 2)}`;
    }
    return `${d}L${f(pts[pts.length - 2])} ${f(pts[pts.length - 1])}`;
  }

  // O desenho fica em cima só da imagem (sem as faixas pretas), em coordenadas de 0 a 1:
  // acompanha o quadro se ele mudar de tamanho.
  // A cor de um traço: a que veio com ele (#rrggbb, ou o tom: -1 é branco) ou a da pessoa.
  function strokeColor(name, hue, color) {
    if (HEX_COLOR.test(color || '')) return color;
    if (hue === -1) return '#ffffff';
    return Number.isInteger(hue) ? hslToHex(hue, 95, 64) : markFill(toneOf(name));
  }

  // style: o estilo de quem desenha (o pincel e a espessura, do js/fx.js).
  // arrow: com ponta de flecha (Alt + Shift + arrastar).
  function createStrokeView(target, color, style, arrow = false) {
    const { fx, video } = target;
    const width = fx.clientWidth || 1;
    const height = fx.clientHeight || 1;
    const box = contentBox(video, width, height);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'fx-draw');
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.left = `${(box.left / width) * 100}%`;
    svg.style.top = `${(box.top / height) * 100}%`;
    svg.style.width = `${(box.width / width) * 100}%`;
    svg.style.height = `${(box.height / height) * 100}%`;
    svg.style.setProperty('--ping', color);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path);
    fx.append(svg);
    return { svg, path, points: [], expire: null, arrow, brush: Fx.brush(svg, path, style, color, strokePath, { arrow }) };
  }

  function drawStroke(view) {
    view.brush.update(view.points);
  }

  // Terminado, o traço fica uns segundos na tela e some devagar.
  function finishStroke(view) {
    clearTimeout(view.expire);
    view.svg.classList.add('fading');
    view.svg.addEventListener('animationend', () => view.svg.remove());
  }

  // alt: desenhando com o Alt apertado (mouse): o traço fica até soltar o Alt. arrow: com
  // o Shift também, o traço termina numa flecha.
  function startStroke(target, streamId, clientX, clientY, alt = false, arrow = false) {
    const stroke = {
      id: (++strokeCounter).toString(36),
      stream: streamId,
      alt,
      arrow,
      target,
      pending: [],
      timer: null,
      view: createStrokeView(target, markFill(toneOf(me.name)), myFull, arrow),
    };
    addStrokePoint(stroke, clientX, clientY);
    return stroke;
  }

  function setStrokeArrow(stroke) {
    if (stroke.arrow) return;
    stroke.arrow = true;
    stroke.view.arrow = true;
    stroke.view.brush.setArrow(true);
    if (!stroke.timer) stroke.timer = setTimeout(() => flushStroke(stroke), 40); // avisa os outros
  }

  function addStrokePoint(stroke, clientX, clientY) {
    const { points } = stroke.view;
    if (points.length >= STROKE_MAX) return;
    const p = videoPoint(stroke.target.video, clientX, clientY, true);
    const x = Math.round(p.x * 10000) / 10000;
    const y = Math.round(p.y * 10000) / 10000;
    const n = points.length;
    if (n && Math.hypot(x - points[n - 2], y - points[n - 1]) < 0.002) return;
    points.push(x, y);
    stroke.pending.push(x, y);
    drawStroke(stroke.view);
    // Vai saindo em pedaços enquanto a pessoa desenha (uns 25 por segundo).
    if (!stroke.timer) stroke.timer = setTimeout(() => flushStroke(stroke), 40);
  }

  function flushStroke(stroke, end = false) {
    clearTimeout(stroke.timer);
    stroke.timer = null;
    const message = (points, last) => ({ stream: stroke.stream, id: stroke.id, points, end: last, ...(stroke.alt ? { hold: 'alt' } : {}), ...(stroke.arrow ? { arrow: true } : {}) });
    flushStyle();
    while (stroke.pending.length > 128) socket.emit('draw', message(stroke.pending.splice(0, 128), false));
    if (stroke.pending.length || end) socket.emit('draw', message(stroke.pending.splice(0), end));
  }

  // Os seus traços com o Alt ainda apertado: ficam (aqui e pros outros) até você soltar.
  const myAltStrokes = [];

  // keep: ainda segurando o Alt. Senão o traço some como sempre (e, se era um traço com
  // Alt, avisa que o Alt foi solto: os anteriores somem junto).
  function endStroke(stroke, keep = false) {
    flushStroke(stroke, true);
    if (keep && stroke.alt) {
      myAltStrokes.push(stroke.view);
      return;
    }
    finishStroke(stroke.view);
    if (stroke.alt) releaseMyAltStrokes(true);
  }

  // Soltou o Alt (ou a janela perdeu o foco): os traços somem, do mesmo jeito de sempre.
  function releaseMyAltStrokes(force = false) {
    if (!myAltStrokes.length && !force) return;
    for (const view of myAltStrokes.splice(0)) finishStroke(view);
    if (me) socket.emit('draw:release');
  }

  const remoteStrokes = new Map(); // "transmissão|nome|id" -> traço sendo desenhado
  // Traços de quem transmite rabiscando a própria tela pelo app: ficam até ela desfazer,
  // limpar ou sair do modo desenho. "transmissão|nome" -> Map(id -> traço)
  const heldStrokes = new Map();

  // local: o seu próprio rabisco (do modo desenho do app), mostrado no seu quadro.
  function handleDraw({ stream, id, points, end, name, hold, hue, color: sent, arrow }, local = false) {
    const color = strokeColor(name, hue, sent);
    // hue: pro app de antes da cor livre (ele só entende o tom).
    const oldHue = Number.isInteger(hue) ? hue : HEX_COLOR.test(sent || '') ? hexHue(sent) : nameHue(name);
    if (!local) toDesktopOverlay(stream, { type: 'draw', key: `${name}|${id}`, points, end: Boolean(end), hue: oldHue, color, name, hold: hold === 'alt' ? 'alt' : undefined, style: overlayStyle(name), arrow: arrow === true });
    const target = fxTarget(stream);
    if (!target || !Array.isArray(points)) return;
    const key = `${stream}|${name}|${id}`;
    let view = remoteStrokes.get(key);
    if (!view) {
      if (!points.length) return;
      view = createStrokeView(target, color, styleOf(name), arrow === true);
      remoteStrokes.set(key, view);
    } else if (arrow === true && !view.arrow) {
      view.arrow = true; // o Shift veio no meio do traço
      view.brush.setArrow(true);
    }
    view.points.push(...points);
    drawStroke(view);
    clearTimeout(view.expire);
    const done = () => {
      remoteStrokes.delete(key);
      if (hold === 'alt') {
        keepAltStroke(name, view);
        return;
      }
      if (!hold) {
        finishStroke(view);
        return;
      }
      const owner = `${stream}|${name}`;
      if (!heldStrokes.has(owner)) heldStrokes.set(owner, new Map());
      heldStrokes.get(owner).set(id, view);
    };
    if (end) done();
    else view.expire = setTimeout(done, hold === true ? 60000 : 5000); // quem desenhava caiu no meio do traço
  }

  // Traços de quem assiste com o Alt ainda apertado: ficam até a pessoa soltar o Alt
  // (draw:release) ou sair da sala. Se o aviso não vier, somem sozinhos em 2 minutos.
  const altStrokes = new Map(); // nick -> { views, timer }

  function keepAltStroke(name, view) {
    let held = altStrokes.get(name);
    if (!held) {
      held = { views: [], timer: null };
      altStrokes.set(name, held);
    }
    held.views.push(view);
    clearTimeout(held.timer);
    held.timer = setTimeout(() => releaseAltStrokes(name), 120000);
  }

  function releaseAltStrokes(name) {
    const held = altStrokes.get(name);
    if (held) {
      altStrokes.delete(name);
      clearTimeout(held.timer);
      for (const view of held.views) finishStroke(view);
    }
    // Na sua tela de verdade (app), os traços dessa pessoa também somem.
    if (desktop && me && (desktopOverlay || obsOverlay)) desktop.overlay({ type: 'draw-release', name });
  }

  function undoStroke(stream, name, id) {
    const key = `${stream}|${name}|${id}`;
    const held = heldStrokes.get(`${stream}|${name}`);
    const view = (held && held.get(id)) || remoteStrokes.get(key);
    if (held) held.delete(id);
    remoteStrokes.delete(key);
    if (!view) return;
    clearTimeout(view.expire);
    view.svg.remove();
  }

  function clearHeld(stream, name) {
    const owner = `${stream}|${name}`;
    const held = heldStrokes.get(owner);
    heldStrokes.delete(owner);
    if (!held) return;
    // Limpar ou sair do modo desenho: os rabiscos somem logo.
    for (const view of held.values()) {
      clearTimeout(view.expire);
      view.svg.classList.add('clearing');
      view.svg.addEventListener('animationend', () => view.svg.remove());
    }
  }

  socket.on('draw', (msg) => handleDraw(msg || {}));
  socket.on('draw:undo', ({ stream, id, name }) => undoStroke(stream, name, id));
  socket.on('draw:clear', ({ stream, name }) => clearHeld(stream, name));
  socket.on('draw:release', (msg) => {
    if (msg && typeof msg.name === 'string') releaseAltStrokes(msg.name);
  });

  // Alt + clique aponta e Alt + arrastar desenha, ao vivo, pra todo mundo que está vendo
  // a transmissão (inclusive quem transmite, que também pode marcar a própria tela). No
  // celular: tocar e segurar aponta; segurar e arrastar desenha.
  function enableMarkup(target, streamId) {
    const { media, video } = target;
    let gesture = null;
    const outside = (node) => node.closest('.tile-tools, .tile-stats');
    const ping = (clientX, clientY) => {
      const point = videoPoint(video, clientX, clientY);
      const id = streamId();
      if (point && id && me) {
        flushStyle(); // o estilo novo chega antes do ping
        socket.emit('ping', { stream: id, x: point.x, y: point.y });
      }
    };
    // altKey: o Alt ainda está apertado quando o traço acaba (aí ele fica até soltar).
    const finish = (g, cancelled, altKey = false) => {
      clearTimeout(g.timer);
      if (gesture === g) gesture = null;
      if (g.stroke) endStroke(g.stroke, altKey);
      else if (g.armed && !cancelled) ping(g.x, g.y);
    };
    media.addEventListener('pointerdown', (e) => {
      if (!me || outside(e.target)) return;
      if (controlling && controlling === streamId()) return; // controlando: o clique vai pro PC de lá
      if (gesture) finish(gesture, true);
      const g = { id: e.pointerId, touch: e.pointerType === 'touch', x: e.clientX, y: e.clientY, armed: false, stroke: null, timer: null, arrow: e.shiftKey };
      if (g.touch) {
        g.timer = setTimeout(() => {
          g.armed = true;
          if (navigator.vibrate) navigator.vibrate(15);
        }, 450);
      } else {
        if (!e.altKey || e.button !== 0) return;
        e.preventDefault();
        g.armed = true;
        altGesture = true;
        try { media.setPointerCapture(e.pointerId); } catch {}
      }
      gesture = g;
    });
    media.addEventListener('pointermove', (e) => {
      const g = gesture;
      if (!g || e.pointerId !== g.id) return;
      const dist = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (!g.armed) {
        if (dist > 12) finish(g, true); // o dedo andou antes de segurar: é rolagem
        return;
      }
      if (e.shiftKey && !g.arrow) {
        // Apertou o Shift no meio: o traço vira flecha.
        g.arrow = true;
        if (g.stroke) setStrokeArrow(g.stroke);
      }
      if (!g.stroke) {
        const id = streamId();
        if (dist < 6 || !id) return;
        g.stroke = startStroke(target, id, g.x, g.y, !g.touch, g.arrow);
      }
      const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of coalesced.length ? coalesced : [e]) addStrokePoint(g.stroke, ev.clientX, ev.clientY);
    });
    media.addEventListener('pointerup', (e) => {
      if (gesture && e.pointerId === gesture.id) finish(gesture, false, e.altKey);
    });
    media.addEventListener('pointercancel', (e) => {
      if (gesture && e.pointerId === gesture.id) finish(gesture, true, e.altKey);
    });
    // Segurando o dedo pra desenhar, a tela não rola nem abre o menu do navegador.
    media.addEventListener('touchmove', (e) => {
      if (gesture && gesture.armed) e.preventDefault();
    }, { passive: false });
    media.addEventListener('contextmenu', (e) => {
      if (gesture && gesture.touch) e.preventDefault();
    });
  }

  // Com o Alt apertado, o cursor vira uma mira em cima dos vídeos. Soltou: os rabiscos
  // feitos com ele somem.
  const setAltDown = (on) => {
    document.body.classList.toggle('alt-down', on);
    if (!on) releaseMyAltStrokes();
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') setAltDown(true);
  });
  window.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt') return;
    setAltDown(false);
    // Soltar o Alt depois de apontar/desenhar não abre o menu do navegador (Windows).
    if (altGesture) e.preventDefault();
    altGesture = false;
  });
  window.addEventListener('blur', () => setAltDown(false));

  socket.on('ping', ({ stream, x, y, name }) => {
    // O seu próprio clique no seu quadro não precisa aparecer na sua tela de verdade.
    const tone = toneOf(name);
    const style = styleOf(name);
    if (me && name !== me.name) toDesktopOverlay(stream, { type: 'ping', x, y, name, hue: tone.hue, color: markFill(tone), style: absoluteStyle(style) });
    const target = fxTarget(stream);
    if (!target) return;
    const { fx, video } = target;
    const width = fx.clientWidth;
    const height = fx.clientHeight;
    if (!width || !height) return;
    const box = contentBox(video, width, height);
    const left = `${((box.left + x * box.width) / width) * 100}%`;
    const top = `${((box.top + y * box.height) / height) * 100}%`;
    // O estilo de ping e o som que a pessoa escolheu (o clássico é este daqui).
    if (style.pingSound === 'classic') sounds.play('ping');
    else if (sounds.enabled) Fx.playPing(style.pingSound);
    if (Fx.ping(fx, left, top, style, markFill(tone), name, x > 0.75)) return;
    const mark = el('span', 'fx-ping');
    mark.style.left = left;
    mark.style.top = top;
    mark.style.setProperty('--ping', markFill(tone));
    // Sem o nome (atrapalhava): a cor (e a foto no mouse) já dizem quem foi.
    mark.append(el('span', 'fx-ping-ring'), el('span', 'fx-ping-ring'), el('span', 'fx-ping-dot'));
    mark.addEventListener('animationend', (e) => {
      if (e.target === mark) mark.remove();
    });
    fx.append(mark);
  });

  function fileStamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
  }

  // Print do quadro atual na resolução de verdade da transmissão, baixado como PNG.
  function capture(s) {
    const { video } = s;
    if (!video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const name = `${s.name.replace(/[\\/:*?"<>|]+/g, '_')} ${fileStamp(new Date())}.png`;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = el('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, 'image/png');
    const flash = el('span', 'fx-flash');
    flash.addEventListener('animationend', () => flash.remove());
    s.fx.append(flash);
  }

  function togglePip(s) {
    if (document.pictureInPictureElement === s.video) {
      document.exitPictureInPicture().catch(() => {});
    } else if (s.video.readyState >= 1) {
      s.video.requestPictureInPicture().catch(() => {});
    }
  }

  function leavePip(s) {
    if (document.pictureInPictureElement === s.video) document.exitPictureInPicture().catch(() => {});
  }

  // ---------- chat ----------

  const BASE_TITLE = document.title;
  const URL_PATTERN = /\bhttps?:\/\/[^\s<>"]+/gi;
  let chatOpen = false;
  try { chatOpen = localStorage.getItem('wss-chat') === '1'; } catch {}
  let chatUnread = 0;
  let chatSeenId = null; // última mensagem que você já viu (null: ainda não entrou)
  let chatLastId = 0;
  let chatLast = null; // última linha, pra juntar mensagens seguidas da mesma pessoa
  let chatErrorTimer = null;
  const isTouch = window.matchMedia('(hover: none)').matches;

  const chatVisible = () => chatOpen && !document.hidden;

  function setChat(open, { focus = false } = {}) {
    chatOpen = open;
    appEl.classList.toggle('show-chat', open);
    btnChat.classList.toggle('active', open);
    btnChat.setAttribute('aria-expanded', String(open));
    btnChat.setAttribute('aria-label', open ? 'Fechar o chat' : 'Abrir o chat');
    try { localStorage.setItem('wss-chat', open ? '1' : '0'); } catch {}
    if (open) {
      markChatRead();
      scrollChat();
      if (focus && !isTouch) chatInput.focus();
    } else if (chatEl.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  function markChatRead() {
    chatSeenId = chatLastId;
    chatUnread = 0;
    renderUnread();
  }

  function renderUnread() {
    chatUnreadEl.hidden = !chatUnread;
    chatUnreadEl.textContent = chatUnread > 99 ? '99+' : String(chatUnread);
    document.title = chatUnread ? `(${chatUnread}) ${BASE_TITLE}` : BASE_TITLE;
  }

  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function mentionsMe(text) {
    return Boolean(me) && new RegExp(`@${escapeRegExp(me.name)}(?![\\p{L}\\p{N}_])`, 'iu').test(text);
  }

  function linkify(node, text) {
    let last = 0;
    for (const match of text.matchAll(URL_PATTERN)) {
      const url = match[0].replace(/[.,;:!?)\]]+$/, ''); // pontuação colada no fim fica de fora
      if (match.index > last) node.append(text.slice(last, match.index));
      const link = el('a', null, url);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      node.append(link);
      last = match.index + url.length;
    }
    if (last < text.length) node.append(text.slice(last));
  }

  const chatTime = (at) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function scrollChat() {
    chatList.scrollTop = chatList.scrollHeight;
  }

  function pushChatLine(li, { stick = false } = {}) {
    const atBottom = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 80;
    chatList.append(li);
    while (chatList.childElementCount > 200) chatList.firstElementChild.remove();
    chatEmpty.hidden = true;
    if (atBottom || stick) scrollChat();
  }

  function appendChatMessage(msg) {
    const mine = Boolean(me) && msg.name === me.name;
    const grouped = chatLast && chatLast.name === msg.name && msg.at - chatLast.at < 300000;
    const li = el('li', 'chat-msg');
    li.classList.toggle('grouped', Boolean(grouped));
    li.classList.toggle('mention', !mine && mentionsMe(msg.text));
    if (!grouped) {
      const meta = el('div', 'chat-meta');
      const name = el('span', 'chat-name', msg.name);
      paintName(name, msg, '75% 72%');
      meta.append(avatar(msg.name), name, el('time', 'chat-time', chatTime(msg.at)));
      li.append(meta);
    }
    const body = el('div', 'chat-text');
    body.title = chatTime(msg.at);
    linkify(body, msg.text);
    li.append(body);
    pushChatLine(li, { stick: mine });
    chatLast = { name: msg.name, at: msg.at };
    chatLastId = Math.max(chatLastId, msg.id);
  }

  // Linha cinza de aviso (entrou, saiu, começou a transmitir). Fica só nesta página.
  const recentNotes = new Map();
  function chatNote(text) {
    const now = Date.now();
    if (now - (recentNotes.get(text) || 0) < 120000) return; // OBS caindo e voltando não enche o chat
    recentNotes.set(text, now);
    const li = el('li', 'chat-note');
    li.append(el('span', null, text), el('time', 'chat-time', chatTime(now)));
    pushChatLine(li);
    chatLast = null;
  }

  function loadChat(history) {
    chatList.replaceChildren();
    chatLast = null;
    for (const msg of history) appendChatMessage(msg);
    chatEmpty.hidden = history.length > 0;
    const lastId = history.length ? history[history.length - 1].id : 0;
    if (chatSeenId == null || chatVisible()) chatSeenId = lastId; // ao entrar, o histórico conta como lido
    chatUnread = history.filter((m) => m.id > chatSeenId && m.name !== me.name).length;
    renderUnread();
    scrollChat();
  }

  socket.on('chat:message', (msg) => {
    if (!me || !msg || msg.id <= chatLastId) return;
    appendChatMessage(msg);
    fsChatLine(msg);
    if (msg.name === me.name) return;
    if (chatVisible()) chatSeenId = msg.id;
    else {
      chatUnread += 1;
      renderUnread();
    }
    if (mentionsMe(msg.text)) sounds.play('mention');
    else if (!chatVisible()) sounds.play('message');
    if (desktop && (!chatVisible() || !document.hasFocus())) desktop.attention();
  });

  document.addEventListener('visibilitychange', () => {
    if (chatVisible()) markChatRead();
  });

  function showChatError(text) {
    chatError.textContent = text;
    chatError.hidden = false;
    clearTimeout(chatErrorTimer);
    chatErrorTimer = setTimeout(() => { chatError.hidden = true; }, 4000);
  }

  function sendChat(input) {
    const text = input.value.trim();
    if (!text || !me) return;
    input.value = '';
    socket.emit('chat:send', text, (res) => {
      if (!res || !res.error) return;
      if (!input.value) input.value = text;
      showChatError(res.error);
    });
  }

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendChat(chatInput);
  });
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') chatInput.blur();
  });
  btnChat.addEventListener('click', () => setChat(!chatOpen, { focus: true }));
  $('btn-chat-close').addEventListener('click', () => setChat(false));
  setChat(chatOpen);

  // Avisos de quem entra, sai e começa a transmitir: linha no chat e som. Quem cai e
  // volta em poucos segundos (internet piscando, app atualizando) não gera aviso.
  const pendingLeaves = new Map(); // nome -> timer
  const rejoinedAt = new Map(); // nome -> quando voltou de uma queda

  function announceJoin(name) {
    if (pendingLeaves.has(name)) {
      clearTimeout(pendingLeaves.get(name));
      pendingLeaves.delete(name);
      rejoinedAt.set(name, Date.now());
      return;
    }
    if (Date.now() < quietUntil) return;
    chatNote(`${name} entrou na sala`);
    sounds.play('join');
  }

  function announceLeave(name) {
    clearTimeout(pendingLeaves.get(name));
    pendingLeaves.set(name, setTimeout(() => {
      pendingLeaves.delete(name);
      if (!me) return;
      chatNote(`${name} saiu da sala`);
      sounds.play('leave');
    }, 6000));
  }

  function announceLive(name, how) {
    if (Date.now() < quietUntil || Date.now() - (rejoinedAt.get(name) || 0) < 15000) return;
    chatNote(`${name} começou a transmitir${how}`);
    if (!(me && name === me.name)) sounds.play('live');
  }

  // ---------- chat em tela cheia ----------

  // Em tela cheia as mensagens novas aparecem por cima do vídeo, e o Enter abre um
  // campo pra responder sem sair dela.
  const fsChat = el('div', 'fs-chat');
  const fsFeed = el('ol', 'fs-chat-feed');
  const fsForm = el('form', 'fs-chat-form');
  const fsInput = el('input');
  fsInput.maxLength = 500;
  fsInput.placeholder = 'Mensagem pra sala (Enter envia)';
  fsInput.setAttribute('aria-label', 'Mensagem pra sala');
  fsInput.autocomplete = 'off';
  fsForm.hidden = true;
  fsForm.append(fsInput);
  fsChat.append(fsFeed, fsForm);

  function fsChatLine(msg) {
    if (!fullscreenTile()) return;
    const li = el('li', 'fs-chat-line');
    const who = el('b', null, msg.name);
    paintName(who, msg, '80% 72%');
    li.append(who, msg.text);
    fsFeed.append(li);
    while (fsFeed.childElementCount > 5) fsFeed.firstElementChild.remove();
    setTimeout(() => li.classList.add('fade'), 8000);
    setTimeout(() => li.remove(), 8700);
  }

  function openFsChat() {
    const tile = fullscreenTile();
    if (!tile) return;
    fsForm.hidden = false;
    fsInput.focus();
  }

  fsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendChat(fsInput);
    fsInput.blur();
  });
  fsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fsInput.blur();
  });
  fsInput.addEventListener('blur', () => {
    if (!fsInput.value) fsForm.hidden = true;
  });

  document.addEventListener('fullscreenchange', () => {
    fsFeed.replaceChildren();
    fsForm.hidden = true;
    const tile = fullscreenTile();
    if (tile) tile.append(fsChat);
    else fsChat.remove();
  });

  // ---------- atalhos de teclado ----------

  let hoveredTile = null;
  gridInner.addEventListener('pointerover', (e) => { hoveredTile = e.target.closest('.tile'); });
  gridInner.addEventListener('pointerleave', () => { hoveredTile = null; });

  // Quadro que os atalhos controlam: o em tela cheia, o debaixo do mouse, o fixado ou
  // o único na tela.
  function targetStream() {
    const visible = [...streams.values()].filter((s) => s.watching && !s.tile.hidden);
    const byTile = (tile) => (tile ? visible.find((s) => s.tile === tile) : null);
    return byTile(fullscreenTile()) || byTile(hoveredTile)
      || visible.find((s) => s.key === pinnedKey) || (visible.length === 1 ? visible[0] : null);
  }

  document.addEventListener('keydown', (e) => {
    if (appEl.hidden || !me || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const key = e.key;
    const reaction = /^[1-6]$/.test(key);
    if (e.repeat && !reaction) return;
    if (key === 'Enter' && fullscreenTile()) {
      e.preventDefault();
      openFsChat();
      return;
    }
    if (key === '?') {
      e.preventDefault();
      openSettings('shortcuts');
      return;
    }
    const lower = key.toLowerCase();
    if (lower === 'v') {
      e.preventDefault();
      if (voice.joined) toggleMic();
      else joinVoice();
      return;
    }
    if (lower === 'c' && !fullscreenTile()) {
      e.preventDefault();
      setChat(!chatOpen, { focus: true });
      return;
    }
    const s = targetStream();
    if (!s) return;
    if (lower === 'm') s.btnMute.click();
    else if (lower === 'f') toggleFullscreen(s);
    else if (lower === 'p') togglePin(s);
    else if (lower === 's') capture(s);
    else if (reaction) sendReaction(s.id, REACTIONS[Number(key) - 1]);
    else return;
    e.preventDefault();
  });

  keysDialog.addEventListener('click', (e) => {
    if (e.target === keysDialog) keysDialog.close();
  });

  // ---------- sons ----------

  // ---------- chat de voz ----------

  // O áudio vai direto entre cada par de pessoas na voz (pelo TURN do servidor quando
  // precisa), com o mesmo relay de sinalização das transmissões. Em cada par, quem tem
  // o id menor faz a oferta, pra os dois não ligarem um pro outro ao mesmo tempo.
  const voice = { joined: false, joining: false, stream: null, muted: false, deafened: false, noMic: false, meter: null, speakingAt: 0 };
  const voicePeers = new Map(); // id -> { pc, sid, pending, audio, speakingAt, retryTimer }
  let volumeOpenFor = null; // pessoa com a barrinha de volume aberta na lista
  const voiceAudio = el('div');
  voiceAudio.hidden = true;
  document.body.append(voiceAudio);
  let voiceVolumes = {}; // nick -> volume da voz dessa pessoa (só pra você)
  try { voiceVolumes = JSON.parse(localStorage.getItem('wss-voice-volumes') || '{}') || {}; } catch {}

  const voiceState = () => ({ muted: voice.muted, deafened: voice.deafened });
  const shouldOffer = (peerId) => Boolean(me) && me.id < peerId;
  const micTrack = () => (voice.stream ? voice.stream.getAudioTracks()[0] || null : null);
  const micOn = () => !voice.muted && !voice.deafened;

  function applyMic() {
    if (voice.stream) voice.stream.getAudioTracks().forEach((t) => { t.enabled = micOn(); });
  }

  function applyPeerVolume(id) {
    const peer = voicePeers.get(id);
    const user = users.get(id);
    if (!peer || !peer.audio) return;
    const volume = user ? voiceVolumes[user.name] : undefined;
    peer.audio.volume = Number.isFinite(volume) ? volume : 1;
    peer.audio.muted = voice.deafened;
  }

  function setVoiceVolume(name, value) {
    voiceVolumes[name] = value;
    try { localStorage.setItem('wss-voice-volumes', JSON.stringify(voiceVolumes)); } catch {}
    for (const [id] of voicePeers) {
      const user = users.get(id);
      if (user && user.name === name) applyPeerVolume(id);
    }
  }

  async function joinVoice() {
    if (voice.joined || voice.joining || !me) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('O chat de voz precisa de HTTPS (ou localhost) pra usar o microfone.');
      return;
    }
    voice.joining = true;
    renderVoice();
    sounds.unlock();
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        voice.joining = false;
        renderVoice();
        showToast('O navegador não liberou o microfone. Libere no cadeado ao lado do endereço e tente de novo.');
        return;
      }
      showToast('Não achei um microfone: você entrou na voz só pra ouvir.');
    }
    voice.joining = false;
    if (!me) {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      renderVoice();
      return;
    }
    voice.joined = true;
    voice.stream = stream;
    voice.noMic = !stream;
    if (voice.noMic) voice.muted = true;
    applyMic();
    startMeter();
    users.get(me.id).voice = voiceState();
    socket.emit('voice:join', voiceState());
    for (const u of users.values()) {
      if (u.id !== me.id && u.voice && shouldOffer(u.id)) connectVoice(u.id);
    }
    sounds.play('voiceJoin');
    renderUsers();
  }

  function leaveVoice() {
    if (!voice.joined) return;
    voice.joined = false;
    if (me) {
      socket.emit('voice:leave');
      const self = users.get(me.id);
      if (self) self.voice = null;
    }
    for (const id of [...voicePeers.keys()]) closeVoicePeer(id);
    stopMeter();
    if (voice.stream) voice.stream.getTracks().forEach((t) => t.stop());
    voice.stream = null;
    voice.noMic = false;
    sounds.play('voiceLeave');
    renderUsers();
  }

  function sendVoiceState() {
    applyMic();
    for (const id of voicePeers.keys()) applyPeerVolume(id);
    if (me) {
      const self = users.get(me.id);
      if (self) self.voice = voiceState();
      socket.emit('voice:state', voiceState());
    }
    renderUsers();
  }

  // Ligar o microfone também volta a ouvir (como no Discord).
  function toggleMic() {
    if (!voice.joined || voice.noMic) return;
    if (micOn()) {
      voice.muted = true;
    } else {
      voice.muted = false;
      voice.deafened = false;
    }
    sounds.play(micOn() ? 'unmute' : 'mute');
    sendVoiceState();
  }

  function toggleDeafen() {
    if (!voice.joined) return;
    voice.deafened = !voice.deafened;
    sounds.play(voice.deafened ? 'mute' : 'unmute');
    sendVoiceState();
  }

  function closeVoicePeer(id) {
    const peer = voicePeers.get(id);
    if (!peer) return;
    voicePeers.delete(id);
    peer.pending.length = 0;
    clearTimeout(peer.retryTimer);
    peer.pc.close();
    if (peer.audio) {
      peer.audio.srcObject = null;
      peer.audio.remove();
    }
  }

  function createVoicePeer(id, sid, iceServers) {
    const pc = new RTCPeerConnection({ iceServers });
    const peer = { pc, sid, pending: [], audio: null, speakingAt: 0, retryTimer: null };
    voicePeers.set(id, peer);
    const current = () => voicePeers.get(id) === peer;
    pc.onicecandidate = (e) => {
      if (current() && e.candidate) send(id, { voice: true, sid, type: 'candidate', candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      if (!current()) return;
      if (!peer.audio) {
        peer.audio = el('audio');
        peer.audio.autoplay = true;
        voiceAudio.append(peer.audio);
      }
      peer.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      applyPeerVolume(id);
      peer.audio.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (!current()) return;
      // Caiu: quem fez a oferta liga de novo; o outro lado só espera.
      if (pc.connectionState === 'failed' && shouldOffer(id)) {
        clearTimeout(peer.retryTimer);
        peer.retryTimer = setTimeout(() => {
          if (current() && voice.joined) connectVoice(id);
        }, 2000);
      }
    };
    return peer;
  }

  async function connectVoice(id) {
    closeVoicePeer(id);
    const iceServers = await getIceServers();
    if (!voice.joined || !me || !users.has(id) || voicePeers.has(id)) return;
    const peer = createVoicePeer(id, ++sidCounter, iceServers);
    const track = micTrack();
    if (track) peer.pc.addTransceiver(track, { direction: 'sendrecv', streams: [voice.stream] });
    else peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
    const offer = await peer.pc.createOffer();
    if (voicePeers.get(id) !== peer) return;
    await peer.pc.setLocalDescription(offer);
    if (voicePeers.get(id) !== peer || !voice.joined) return;
    send(id, { voice: true, sid: peer.sid, type: 'offer', sdp: peer.pc.localDescription });
  }

  async function handleVoiceSignal(from, data, address) {
    if (!voice.joined) return;
    if (data.type === 'offer') {
      const iceServers = await getIceServers();
      if (!voice.joined || !users.has(from)) return;
      closeVoicePeer(from);
      const peer = createVoicePeer(from, data.sid, iceServers);
      await peer.pc.setRemoteDescription(data.sdp);
      if (voicePeers.get(from) !== peer || !voice.joined) return;
      const track = micTrack();
      if (track) peer.pc.addTrack(track, voice.stream);
      await flushPending(peer);
      if (voicePeers.get(from) !== peer || !voice.joined) return;
      const answer = await peer.pc.createAnswer();
      if (voicePeers.get(from) !== peer) return;
      await peer.pc.setLocalDescription(answer);
      if (voicePeers.get(from) !== peer || !voice.joined) return;
      send(from, { voice: true, sid: data.sid, type: 'answer', sdp: peer.pc.localDescription });
      return;
    }
    const peer = voicePeers.get(from);
    if (!peer || data.sid !== peer.sid) return;
    if (data.type === 'answer') {
      await peer.pc.setRemoteDescription(data.sdp);
      await flushPending(peer);
    } else if (data.type === 'candidate') {
      await addCandidate(peer, data.candidate, address);
    }
  }

  // Alguém entrou ou saiu da voz (um aviso só, mesmo que a pessoa tenha caído e voltado).
  function onVoiceJoined(user) {
    if (!voice.joined) return;
    const quiet = Date.now() < quietUntil || Date.now() - (rejoinedAt.get(user.name) || 0) < 15000;
    if (!quiet) sounds.play('voiceJoin');
    if (shouldOffer(user.id)) connectVoice(user.id);
  }

  function onVoiceLeft(id) {
    closeVoicePeer(id);
    if (voice.joined) sounds.play('voiceLeave');
  }

  // ---- quem está falando: o seu microfone e o nível do áudio que chega de cada um

  function startMeter() {
    stopMeter();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!voice.stream || !AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(voice.stream).connect(analyser);
      voice.meter = { ctx, analyser, buffer: new Float32Array(analyser.fftSize) };
    } catch {
      voice.meter = null;
    }
  }

  function stopMeter() {
    if (!voice.meter) return;
    voice.meter.ctx.close().catch(() => {});
    voice.meter = null;
  }

  function micLevel() {
    const m = voice.meter;
    if (!m) return 0;
    m.analyser.getFloatTimeDomainData(m.buffer);
    let sum = 0;
    for (const v of m.buffer) sum += v * v;
    return Math.sqrt(sum / m.buffer.length);
  }

  // Cada navegador conta o horário dessas medições de um jeito: aceita os dois.
  const freshSource = (src) => Math.min(Math.abs(Date.now() - src.timestamp), Math.abs(performance.now() - src.timestamp)) < 1000;
  const SPEAKING_HOLD_MS = 400;
  let speakingPainted = false;

  function pollSpeaking() {
    if (document.hidden || (!voice.joined && !speakingPainted)) return;
    const now = performance.now();
    const speaking = new Set();
    if (voice.joined && me) {
      if (micOn() && micLevel() > 0.03) voice.speakingAt = now;
      if (now - voice.speakingAt < SPEAKING_HOLD_MS) speaking.add(me.id);
      for (const [id, peer] of voicePeers) {
        for (const receiver of peer.pc.getReceivers()) {
          if (!receiver.track || receiver.track.kind !== 'audio' || !receiver.getSynchronizationSources) continue;
          for (const src of receiver.getSynchronizationSources()) {
            if (src.audioLevel > 0.03 && freshSource(src)) peer.speakingAt = now;
          }
        }
        if (now - peer.speakingAt < SPEAKING_HOLD_MS) speaking.add(id);
      }
    }
    for (const node of document.querySelectorAll('[data-voice-id]')) {
      node.classList.toggle('speaking', speaking.has(node.dataset.voiceId));
    }
    speakingPainted = speaking.size > 0;
  }

  const speakingTicker = createVisibleTicker({ document, interval: 120, run: pollSpeaking,
    active: () => voice.joined || speakingPainted });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { renderUptimes(); pollSpeaking(); speakingTicker.sync(); }
  });

  // ---- tela

  function voiceStateIcon(state, className) {
    const off = state.deafened || state.muted;
    const node = icon(state.deafened ? 'headphonesOff' : state.muted ? 'micOff' : 'mic');
    node.classList.add(className);
    node.classList.toggle('is-off', off);
    node.title = state.deafened ? 'Na voz, sem ouvir nem falar' : state.muted ? 'Na voz, com o microfone desligado' : 'Na voz';
    return node;
  }

  function voiceMembers() {
    const myId = me && me.id;
    return [...users.values()]
      .filter((u) => u.voice && u.kind !== 'obs')
      .sort((a, b) => (b.id === myId) - (a.id === myId) || a.name.localeCompare(b.name));
  }

  // Volume da voz de cada pessoa, só pra você (no iPhone o navegador não deixa).
  const canAdjustVoice = (u) => voice.joined && Boolean(me) && u.id !== me.id && canSetVolume && desktopLayout.matches;

  // Ícone do microfone na lista da sala. Com você na voz, clicar nele abre ali mesmo o
  // volume da voz daquela pessoa.
  function voiceIndicator(u) {
    const state = voiceStateIcon(u.voice, 'user-voice');
    if (!canAdjustVoice(u)) return state;
    const btn = el('button', 'user-voice-btn');
    btn.type = 'button';
    btn.title = `${state.title}. Clique pra mudar o volume`;
    state.removeAttribute('title');
    btn.setAttribute('aria-label', `Volume da voz de ${u.name}`);
    btn.setAttribute('aria-expanded', String(volumeOpenFor === u.id));
    btn.append(state);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      volumeOpenFor = volumeOpenFor === u.id ? null : u.id;
      renderUsers();
    });
    return btn;
  }

  function voiceVolumeRow(u) {
    const row = el('div', 'user-volume');
    const slider = el('input', 'volume');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.setAttribute('aria-label', `Volume da voz de ${u.name}`);
    const value = el('span', 'user-volume-value');
    const show = (volume) => {
      slider.value = String(Math.round(volume * 100));
      slider.style.setProperty('--fill', `${slider.value}%`);
      value.textContent = `${slider.value}%`;
    };
    show(Number.isFinite(voiceVolumes[u.name]) ? voiceVolumes[u.name] : 1);
    slider.addEventListener('input', () => {
      const volume = Number(slider.value) / 100;
      setVoiceVolume(u.name, volume);
      show(volume);
    });
    row.append(icon('volume'), slider, value);
    // Mexer no volume não conta como clique na pessoa (que levaria até a transmissão).
    row.addEventListener('click', (e) => e.stopPropagation());
    row.addEventListener('keydown', (e) => e.stopPropagation());
    return row;
  }

  function closeVoiceVolume() {
    volumeOpenFor = null;
    for (const node of userListEl.querySelectorAll('.user-volume')) {
      node.parentElement.classList.remove('has-volume');
      node.remove();
    }
    for (const btn of userListEl.querySelectorAll('.user-voice-btn')) btn.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('pointerdown', (e) => {
    if (volumeOpenFor && e.target.closest && !e.target.closest('.user-volume, .user-voice-btn')) closeVoiceVolume();
  });

  function renderVoice() {
    const members = me ? voiceMembers() : [];
    btnVoice.hidden = voice.joined;
    voiceControls.hidden = !voice.joined;
    btnVoice.disabled = voice.joining || !me;
    btnVoice.replaceChildren(icon('headphones'), el('span', 'btn-label', voice.joining ? 'Entrando…' : 'Voz'));
    btnVoice.setAttribute('aria-label', 'Entrar no chat de voz');
    const on = micOn();
    setIcon(btnMic, on ? 'mic' : 'micOff', voice.noMic ? 'Sem microfone: só ouvindo' : on ? 'Desligar o microfone (V)' : 'Ligar o microfone (V)');
    btnMic.classList.toggle('is-off', !on);
    btnMic.disabled = voice.noMic;
    setIcon(btnDeafen, voice.deafened ? 'headphonesOff' : 'headphones', voice.deafened ? 'Voltar a ouvir a voz' : 'Parar de ouvir a voz (ensurdecer)');
    btnDeafen.classList.toggle('is-off', voice.deafened);
    setIcon(btnVoiceLeave, 'phoneOff', 'Sair da voz');
    $('voice-bar').classList.toggle('is-joined', voice.joined);

    voicePeople.hidden = !members.length;
    const faces = members.slice(0, 4).map((u) => {
      const face = avatar(u.name);
      face.dataset.voiceId = u.id;
      return face;
    });
    if (members.length > 4) faces.push(el('span', 'voice-more', `+${members.length - 4}`));
    voicePeople.replaceChildren(...faces);
    voicePeople.title = members.length ? `Na voz: ${members.map((u) => u.name).join(', ')}` : '';
    voicePeople.setAttribute('aria-label', voicePeople.title || 'Ninguém na voz');
    if (!voice.joined && speakingPainted) pollSpeaking();
    speakingTicker.sync();
  }

  btnVoice.addEventListener('click', joinVoice);
  btnMic.addEventListener('click', toggleMic);
  btnDeafen.addEventListener('click', toggleDeafen);
  btnVoiceLeave.addEventListener('click', leaveVoice);
  voicePeople.addEventListener('click', () => setSidebar(true, true));
  renderVoice();

  // ---------- app de desktop ----------

  // Dentro do app (Electron), o que acontece na SUA transmissão (alguém apontando,
  // desenhando ou reagindo) aparece também na sua tela de verdade, numa camada por cima
  // de tudo que fica de fora da captura. No navegador, o rodapé oferece o app.
  const desktop = window.wssDesktop || null;

  // ---------- Configurações: iguais no app e no navegador ----------
  // No app, a janela de Configurações dele. No navegador, a MESMA página
  // (/settings/settings.html, do app) num popup por cima da sala: ela desenha o fundo
  // escurecido e o cartão, e fala com a sala pelo wssRoomSettings (settings-web.js).
  // Perfil, OBS, atalhos, teste de conexão e mouse e controle abrem a aba certa dela.
  let settingsLayer = null;
  let settingsReturnFocus = null;
  function openSettings(section = 'profile') {
    if (desktop && typeof desktop.openSettings === 'function') { desktop.openSettings(section); return; }
    if (!me && !accountsMode) return;
    if (!settingsLayer) {
      settingsLayer = document.createElement('dialog');
      settingsLayer.className = 'settings-layer';
      settingsLayer.setAttribute('aria-label', 'Configurações');
      const frame = document.createElement('iframe');
      frame.title = 'Configurações';
      frame.src = '/settings/settings.html';
      settingsLayer.append(frame);
      // Esc com o foco fora da página das Configurações (raro): fecha igual.
      settingsLayer.addEventListener('cancel', (e) => { e.preventDefault(); closeSettings(); });
      document.body.append(settingsLayer);
    }
    const frame = settingsLayer.querySelector('iframe');
    if (!settingsLayer.open) {
      settingsReturnFocus = document.activeElement;
      settingsLayer.showModal();
    }
    const show = () => {
      frame.contentWindow.wssSettingsSection(section);
      frame.focus();
    };
    if (frame.contentWindow && typeof frame.contentWindow.wssSettingsSection === 'function') show();
    else frame.addEventListener('load', show, { once: true });
  }
  function closeSettings() {
    if (!settingsLayer || !settingsLayer.open) return;
    settingsLayer.close();
    if (settingsReturnFocus && document.contains(settingsReturnFocus)) settingsReturnFocus.focus();
    settingsReturnFocus = null;
  }
  window.WssSettings = Object.freeze({ open: openSettings, close: closeSettings });
  // A engrenagem embaixo da lista (o app põe a dele no mesmo lugar).
  const btnSettings = $('btn-settings');
  btnSettings.hidden = Boolean(desktop);
  btnSettings.addEventListener('click', () => openSettings('profile'));
  // Ctrl+, como no app.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === ',' || e.code === 'Comma') && me) {
      e.preventDefault();
      openSettings('profile');
    }
  });
  let desktopOverlay = false;

  function toDesktopOverlay(stream, event) {
    if (!desktop || !me) return;
    const mine = (desktopOverlay && stream === me.id) || (obsOverlay && stream === myObsStreamId());
    if (mine) desktop.overlay(event);
  }

  // Transmitindo pelo OBS com credencial vinculada, as marcações também aparecem na sua
  // tela: o app abre a camada no monitor que o OBS captura (escolhido na janela do OBS).
  let obsOverlayWanted = false;
  let obsOverlay = false;
  const desktopObs = () => Boolean(desktop) && typeof desktop.obs === 'function';

  function myObsStreamId() {
    if (!me) return null;
    for (const u of users.values()) {
      if (u.kind === 'obs' && u.ownerId === me.id) return u.id;
    }
    return null;
  }

  function renderObsOverlayTag() {
    const s = streams.get(myObsStreamId());
    if (s && s.overlayTag) s.overlayTag.hidden = !obsOverlay;
  }

  function syncObsOverlay() {
    if (!desktopObs()) return;
    const live = Boolean(myObsStreamId());
    if (live === obsOverlayWanted) {
      renderObsOverlayTag();
      return;
    }
    obsOverlayWanted = live;
    if (!live) obsOverlay = false;
    desktop.obs(live).then((result) => {
      if (obsOverlayWanted === live) obsOverlay = live && Boolean(result && result.overlay);
      renderObsOverlayTag();
      checkControlTargets();
    }).catch(() => {});
  }

  function startDesktopOverlay() {
    if (!desktop) return;
    desktop.sharing(true).then((result) => {
      desktopOverlay = Boolean(result && result.overlay) && Boolean(localStream);
      renderSelfTile();
      checkControlTargets();
    }).catch(() => {});
  }

  function stopDesktopOverlay() {
    desktopOverlay = false;
    if (desktop) desktop.sharing(false).catch(() => {});
    checkControlTargets();
  }

  if (desktop && typeof desktop.onOverlayState === 'function') {
    desktop.onOverlayState((state) => {
      desktopOverlay = Boolean(localStream && state.share);
      obsOverlay = Boolean(obsOverlayWanted && state.obs);
      renderSelfTile();
      renderObsOverlayTag();
      desktop.caps().then((caps) => {
        desktopCaps = caps;
        checkControlTargets();
        if (controlDialog.open) renderControlPanel();
      }).catch(() => {});
    });
  }

  // Modo desenho do app (Ctrl+Shift+D): o que você rabisca na sua tela de verdade vai pra
  // quem assiste a sua transmissão (pelo app ou pelo OBS), e aparece também no seu quadro.
  function onLocalDraw(msg) {
    if (!me || !msg) return;
    const stream = msg.owner === 'obs' ? myObsStreamId() : (localStream ? me.id : null);
    if (!stream) return;
    const id = `d${msg.id}`;
    if (msg.type === 'undo') {
      socket.emit('draw:undo', { stream, id });
      undoStroke(stream, me.name, id);
    } else if (msg.type === 'clear') {
      socket.emit('draw:clear', { stream });
      clearHeld(stream, me.name);
    } else if (msg.type === 'draw') {
      const points = Array.isArray(msg.points) ? msg.points : [];
      const hue = Number.isInteger(msg.hue) ? msg.hue : nameHue(me.name);
      const color = HEX_COLOR.test(msg.color || '') ? msg.color : undefined; // app 1.4.6+
      // Em pedaços de até 64 pontos (o tamanho máximo de cada mensagem no servidor).
      for (let i = 0; i < points.length || i === 0; i += 128) {
        const data = { stream, id, points: points.slice(i, i + 128), end: Boolean(msg.end) && i + 128 >= points.length, hold: true, hue, color, ...(msg.arrow === true ? { arrow: true } : {}) };
        socket.emit('draw', data);
        handleDraw({ ...data, name: me.name }, true);
      }
    }
  }

  if (desktop) {
    if (typeof desktop.onLocalDraw === 'function') desktop.onLocalDraw(onLocalDraw);
    for (const node of document.querySelectorAll('.desktop-only')) node.hidden = false;
    $('btn-server').hidden = false;
    $('btn-server').addEventListener('click', () => {
      leaveVoice();
      stopSharing();
      desktop.changeServer();
    });
    sidebarVersionEl.title = `App de desktop ${desktop.version}`;
  } else {
    $('desktop-download').hidden = isTouch;
  }

  // ---------- aviso de versão nova do app ----------

  // O app procura versão nova ao abrir, a cada 15 minutos e ao voltar pra ele. Instalado:
  // "Atualizar" baixa, instala e reabre o app; com as atualizações automáticas, ele baixa
  // sozinho e o aviso só aparece pronto ("Reiniciar"). Portátil: "Baixar" abre a página da
  // versão nova. "Depois" esconde o aviso até o app abrir de novo (fica o link no rodapé).
  const appUpdateEl = $('app-update');
  const APP_UPDATE_LATER = 'wss-app-update-later';
  let appUpdate = null;

  function appUpdateLater() {
    try { return sessionStorage.getItem(APP_UPDATE_LATER); } catch { return null; }
  }

  // "Depois" vale pra versão e pro estado: depois de esconder "Saiu a versão X", o "X está
  // pronta" aparece mesmo assim.
  const laterKey = (u) => (u.state === 'ready' ? `ready:${u.version}` : u.version);

  function renderAppUpdate() {
    const u = appUpdate;
    const pending = Boolean(u) && (u.state === 'available' || u.state === 'error' || u.state === 'ready');
    // Baixando sozinho (atualizações automáticas): não mostra nada até ficar pronta.
    const busy = Boolean(u) && ((u.state === 'downloading' && !u.background) || u.state === 'installing');
    const later = pending && appUpdateLater() === laterKey(u);
    appUpdateEl.hidden = !(pending || busy) || later;
    $('btn-app-update-link').hidden = !later;
    $('btn-app-update-link').textContent = u?.state === 'ready' ? 'Reiniciar e atualizar' : 'Atualizar o app';
    if (!u || appUpdateEl.hidden) return;
    const button = $('btn-app-update');
    const bar = $('app-update-bar');
    let text;
    if (u.state === 'ready') {
      text = `A versão ${u.version} do app está pronta. Reinicie pra aplicar.`;
      button.textContent = 'Reiniciar';
      button.title = 'Fecha e abre o app de novo, já na versão nova';
    } else if (u.state === 'available' && u.mode === 'install') {
      text = `Saiu a versão ${u.version} do app (você está na ${u.current}).`;
      button.textContent = 'Atualizar';
      button.title = 'Baixa a versão nova, instala e abre o app de novo';
    } else if (u.state === 'available') {
      text = `Saiu a versão ${u.version} do app (você está na ${u.current}). Baixe a nova e use no lugar desta.`;
      button.textContent = 'Baixar';
      button.title = 'Abre a página da versão nova no navegador';
    } else if (u.state === 'downloading') {
      text = `Baixando a versão ${u.version}… ${u.percent || 0}%`;
    } else if (u.state === 'installing') {
      text = `Instalando a versão ${u.version}. O app fecha e abre de novo sozinho.`;
    } else {
      text = `Não deu pra atualizar sozinho. Baixe a versão ${u.version} pela página.`;
      button.textContent = 'Baixar';
      button.title = 'Abre a página da versão nova no navegador';
    }
    $('app-update-text').textContent = text;
    appUpdateEl.querySelector('.update-actions').hidden = busy;
    appUpdateEl.classList.toggle('is-busy', u.state === 'installing');
    bar.hidden = !busy;
    bar.firstElementChild.style.width = u.state === 'downloading' ? `${u.percent || 0}%` : '';
  }

  function runAppUpdate() {
    if (!appUpdate) return;
    const busyWith = localStream ? 'transmitindo' : voice.joined ? 'na voz' : null;
    if (busyWith && appUpdate.state === 'ready'
      && !window.confirm(`Você está ${busyWith}. O app fecha e abre de novo pra aplicar a versão nova. Reiniciar agora?`)) return;
    if (busyWith && appUpdate.state === 'available' && appUpdate.mode === 'install'
      && !window.confirm(`Você está ${busyWith}. Pra atualizar, o app fecha e abre de novo quando terminar de baixar. Atualizar agora?`)) return;
    try { sessionStorage.removeItem(APP_UPDATE_LATER); } catch {}
    desktop.update().catch(() => {});
  }

  // "Verificar atualização" (rodapé da lista, no app): procura agora, sem precisar reabrir
  // o app. Aproveita e confere se o servidor já está numa versão mais nova que esta página.
  const btnCheckUpdate = $('btn-check-update');
  async function checkUpdatesNow() {
    btnCheckUpdate.disabled = true;
    btnCheckUpdate.textContent = 'Verificando…';
    let serverNew = false;
    try {
      const res = await fetch('/version', { cache: 'no-store' });
      const { version } = await res.json();
      serverNew = Boolean(version && pageVersion && version !== pageVersion);
      if (serverNew) updateBanner.hidden = false;
    } catch {}
    const found = (await desktop.checkUpdate().catch(() => null)) || { result: 'error' };
    btnCheckUpdate.disabled = false;
    btnCheckUpdate.textContent = 'Verificar atualização';
    let text;
    if (found.result === 'available') {
      try { sessionStorage.removeItem(APP_UPDATE_LATER); } catch {} // mesmo se tinha clicado em "Depois"
      renderAppUpdate();
      text = `Saiu a versão ${found.version} do app: o aviso está no topo.`;
    } else if (found.result === 'ready') {
      try { sessionStorage.removeItem(APP_UPDATE_LATER); } catch {}
      renderAppUpdate();
      text = `A versão ${found.version} do app está pronta: reinicie pelo aviso no topo.`;
    } else if (found.result === 'busy') {
      text = 'A versão nova do app já está sendo baixada.';
    } else if (found.result === 'current') {
      text = `O app está atualizado (versão ${found.current}).`;
    } else if (found.result === 'off') {
      text = 'Rodando do código-fonte: aqui não tem atualização automática.';
    } else {
      text = 'Não deu pra verificar o app agora (sem internet?).';
    }
    if (serverNew) text += ' E o servidor tem versão nova: clique em Recarregar, no topo.';
    showToast(text);
    return text;
  }
  if (desktop && typeof desktop.checkUpdate === 'function') {
    btnCheckUpdate.hidden = false;
    btnCheckUpdate.addEventListener('click', checkUpdatesNow);
  }

  if (desktop && typeof desktop.onUpdate === 'function') {
    desktop.onUpdate((data) => {
      if (!data || typeof data.state !== 'string') return;
      appUpdate = data;
      renderAppUpdate();
    });
    $('btn-app-update').addEventListener('click', runAppUpdate);
    $('btn-app-update-link').addEventListener('click', runAppUpdate);
    $('btn-app-update-later').addEventListener('click', () => {
      try { sessionStorage.setItem(APP_UPDATE_LATER, laterKey(appUpdate)); } catch {}
      if (!appUpdateLater()) appUpdateEl.hidden = true; // sem sessionStorage: só esconde
      else renderAppUpdate();
    });
  }

  // ---------- perfil: cor e foto ----------

  // A cor e a foto ficam salvas neste navegador (como o nick) e vão pro servidor a cada
  // entrada na sala. A foto: PNG/JPG/WebP viram um quadrado de 256 px; GIF vai do jeito
  // que está (animado), até 5 MB.
  const profileDialog = $('profile-dialog');
  const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  // Cores prontas (duas fileiras: vivas e escuras), como no Discord.
  const COLOR_PRESETS = [
    '#ff4d5e', '#ff8a3d', '#ffc53d', '#c6e83a', '#3ee07f', '#2ee6c8', '#3ccfff', '#4d8dff', '#9b6bff', '#f25ce0',
    '#b3263a', '#c25a12', '#a87b0c', '#5f8f14', '#16884a', '#11867a', '#14709e', '#2848b8', '#5d34b8', '#a12d8f',
  ];
  let colorSendTimer = null;

  // A setinha com a fotinha (ou a letrinha) na cor da pessoa: a mesma da tela de quem
  // transmite.
  const CURSOR_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5 19.5 13l-7 1.2-3.6 6.3z"/></svg>';

  function cursorNode() {
    const node = el('div', 'mouse-cursor');
    node.innerHTML = CURSOR_ARROW;
    node.append(el('span', 'cursor-badge'));
    return node;
  }

  // Clique/rodinha de alguém: a animação fica parada onde aconteceu (js/fx.js), não vai
  // junto do mouse. layer: onde ela entra; left/top: CSS com a unidade.
  function showClick(layer, left, top, kind, name) {
    Fx.click(layer, left, top, kind, styleOf(name), markFill(toneOf(name)));
  }

  function paintCursor(node, name) {
    const photo = profileAvatars.get(name);
    const badge = node.querySelector('.cursor-badge');
    const tone = toneOf(name);
    node.style.setProperty('--c', markFill(tone));
    node.style.setProperty('--ink', inkFor(tone));
    badge.textContent = photo ? '' : [...name][0] || '?';
    badge.style.backgroundImage = photo ? `url("${photo}")` : '';
    badge.classList.toggle('has-photo', Boolean(photo));
    // Modelo da setinha, tamanho e efeito. No seu próprio mouse a setinha é o cursor do
    // sistema: aqui vai só o efeito (a sua foto você não vê; os outros veem).
    Fx.applyCursor(node, styleOf(name), { arrow: !node.classList.contains('my-badge') });
  }

  // A foto fica no IndexedDB (cabe um GIF de 5 MB, o localStorage não aguenta bem).
  const photoStore = {
    db: null,
    open() {
      if (!this.db) {
        this.db = new Promise((resolve, reject) => {
          const req = indexedDB.open('wss-profile', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('files');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return this.db;
    },
    // key: 'avatar' (a foto) ou 'fx-cursor' / 'fx-ping' (as imagens do estilo).
    async get(key = 'avatar') {
      try {
        const db = await this.open();
        return await new Promise((resolve) => {
          const req = db.transaction('files').objectStore('files').get(key);
          req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
          req.onerror = () => resolve(null);
        });
      } catch {
        return null;
      }
    },
    async set(blob, key = 'avatar') {
      try {
        const db = await this.open();
        await new Promise((resolve, reject) => {
          const tx = db.transaction('files', 'readwrite');
          if (blob) tx.objectStore('files').put(blob, key);
          else tx.objectStore('files').delete(key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        return true;
      } catch {
        return false;
      }
    },
  };

  async function preparePhoto(file) {
    const gif = file.type === 'image/gif' || (!file.type && /\.gif$/i.test(file.name));
    if (gif) {
      if (file.size > PHOTO_MAX_BYTES) throw new Error('Esse GIF passa de 5 MB. Escolha um menor.');
      return file; // do jeito que veio, animado
    }
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      throw new Error('Use uma foto PNG, JPG, WebP ou GIF.');
    }
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('Não deu pra abrir essa imagem.');
    }
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error('Não deu pra preparar a foto.');
    return blob;
  }

  let assetUploadHttp = false;
  async function sendImageAsset(kind, blob) {
    if (!me || !socket.connected) return { error: 'Entre na sala primeiro.' };
    const owner = me;
    if (blob && assetUploadHttp) {
      const permit = await new Promise(resolve => {
        const timer = setTimeout(() => resolve({ error: 'Não foi possível autorizar o upload.' }), 10000);
        socket.emit('asset:permit', kind, reply => { clearTimeout(timer); resolve(reply || {}); });
      });
      if (permit.error) return permit;
      if (owner !== me || !socket.connected) return { error: 'A sessão mudou durante o upload.' };
      if (permit.url !== '/asset-upload' || !/^[a-f0-9]{64}$/.test(permit.token || '')) return { error: 'Autorização de upload inválida.' };
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
      try {
        const response = await fetch(permit.url, { method: 'POST', cache: 'no-store', signal: controller.signal,
          headers: { 'Content-Type': 'application/octet-stream', Authorization: 'Bearer ' + permit.token }, body: blob });
        const result = await response.json();
        if (owner !== me || !socket.connected) return { error: 'A sessão mudou durante o upload.' };
        return response.ok ? result : { error: result.error || 'Não foi possível enviar a imagem.' };
      } catch { return { error: 'Não foi possível enviar a imagem. Tente novamente.' }; }
      finally { clearTimeout(timer); }
    }
    // Servidor antigo: caminho anterior. Remoções pequenas também ficam no socket.
    const data = blob ? await blob.arrayBuffer() : null;
    if (owner !== me || !socket.connected) return { error: 'A sessão mudou durante o upload.' };
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve({ error: 'O servidor não respondeu (ele já foi atualizado?).' }), 60000);
      const reply = value => { clearTimeout(timer); resolve(owner === me ? value || { error: 'Não foi possível enviar a imagem.' } : { error: 'A sessão mudou durante o upload.' }); };
      if (kind === 'avatar') socket.emit('avatar', data, reply);
      else socket.emit('fx:image', { kind, data }, reply);
    });
  }

  // Manda a foto (ou null pra tirar) pro servidor.
  async function sendPhoto(blob) {
    if (!me) return { error: 'Entre na sala primeiro.' };
    const res = await sendImageAsset('avatar', blob);
    if (res.ok && me && users.has(me.id)) {
      const self = users.get(me.id);
      if (res.avatar) self.avatar = res.avatar;
      else delete self.avatar;
      renderUsers();
    }
    return res;
  }

  // Entrou na sala: a foto salva vai junto, sem precisar escolher de novo (e as imagens
  // próprias da setinha e do ping também).
  async function restoreProfilePhoto() {
    for (const kind of ['cursor', 'ping']) {
      photoStore.get(`fx-${kind}`).then(async (saved) => {
        if (!saved || !me) return;
        const res = await sendFxImage(kind, saved);
        if (res.error) showToast(`Imagem do ${kind === 'cursor' ? 'mouse' : 'ping'}: ${res.error}`);
      });
    }
    const blob = await photoStore.get();
    if (!blob || !me) return;
    const res = await sendPhoto(blob);
    if (res.error) showToast(`Foto de perfil: ${res.error}`);
  }

  // Imagens próprias do estilo (a setinha e o ping): manda (ou tira, com null) e guarda o
  // endereço que o servidor deu.
  async function sendFxImage(kind, blob) {
    if (!me) return { error: 'Entre na sala primeiro.' };
    const res = await sendImageAsset(kind, blob);
    if (res.ok) {
      myImages[kind] = AVATAR_PATH.test(res.url || '') ? res.url : null;
      if (me && users.has(me.id)) {
        const field = kind === 'cursor' ? 'cursorImg' : 'pingImg';
        if (myImages[kind]) users.get(me.id)[field] = myImages[kind];
        else delete users.get(me.id)[field];
      }
      refreshMyFull();
      onMyProfileChanged();
    }
    return res;
  }

  // Escolheu um arquivo no editor: prepara (lê .cur/.ani, reduz...), manda e guarda.
  async function uploadFxImage(kind, file) {
    if (!window.WssFxImage) return { error: 'Recarregue a página pra usar imagens próprias.' };
    let prepared;
    try {
      prepared = await window.WssFxImage.prepare(file, kind);
    } catch (err) {
      return { error: err.message || 'Não deu pra usar essa imagem.' };
    }
    const res = await sendFxImage(kind, prepared.blob);
    if (res.error) return res;
    if (!(await photoStore.set(prepared.blob, `fx-${kind}`))) showToast('A imagem foi aplicada, mas não deu pra salvar neste PC.');
    return { ok: true, url: myImages[kind], hx: prepared.hx, hy: prepared.hy };
  }

  async function removeFxImage(kind) {
    await photoStore.set(null, `fx-${kind}`);
    return sendFxImage(kind, null);
  }

  // color: '#rrggbb' ou null (automática). send 'now': manda já (soltou o mouse, clicou numa
  // cor pronta...); sem, espera 300 ms parado (arrastando no seletor).
  function setMyColor(color, send) {
    myColor = HEX_COLOR.test(color || '') ? color : null;
    myHue = null;
    try {
      if (myColor) localStorage.setItem('wss-color', myColor);
      else localStorage.removeItem('wss-color');
      localStorage.removeItem('wss-hue');
    } catch {}
    const msg = { hue: myColor ? hexHue(myColor) : null, color: myColor };
    if (me && users.has(me.id)) {
      const self = users.get(me.id);
      if (myColor) Object.assign(self, msg);
      else {
        delete self.hue;
        delete self.color;
      }
    }
    clearTimeout(colorSendTimer);
    if (send === 'now') {
      socket.emit('profile', msg);
      if (myColor && !COLOR_PRESETS.includes(myColor)) rememberColor(myColor);
    } else {
      colorSendTimer = setTimeout(() => socket.emit('profile', msg), 300);
    }
    renderUsers();
    renderProfileDialog();
  }

  // As últimas cores personalizadas que você usou.
  const RECENT_COLORS = 8;
  function recentColors() {
    try {
      const list = JSON.parse(localStorage.getItem('wss-color-recent') || '[]');
      return Array.isArray(list) ? list.filter((c) => HEX_COLOR.test(c)).slice(0, RECENT_COLORS) : [];
    } catch {
      return [];
    }
  }
  function rememberColor(color) {
    const list = [color, ...recentColors().filter((c) => c !== color)].slice(0, RECENT_COLORS);
    try {
      localStorage.setItem('wss-color-recent', JSON.stringify(list));
    } catch {}
  }

  function sendDesktopIdentity() {
    if (!me || !desktop || typeof desktop.identity !== 'function') return;
    const tone = toneOf(me.name);
    desktop.identity({ hue: tone.hue, color: markFill(tone), style: absoluteStyle(myFull) });
  }

  // O estilo do mouse e das marcações (aba "Mouse e efeitos" do perfil, ou as
  // Configurações do app): salvo neste navegador e mandado pra sala na hora.
  let styleSendTimer = null;
  let pendingStyle = null; // o estilo esperando pra ir pro servidor
  function setMyStyle(style) {
    myStyle = plainStyle(style);
    refreshMyFull();
    const plain = Fx.isDefault(myStyle) ? null : myStyle;
    try {
      if (plain) localStorage.setItem('wss-style', JSON.stringify(plain));
      else localStorage.removeItem('wss-style');
    } catch {}
    if (me && users.has(me.id)) {
      const self = users.get(me.id);
      if (plain) self.style = plain;
      else delete self.style;
    }
    clearTimeout(styleSendTimer);
    pendingStyle = { style: plain };
    styleSendTimer = setTimeout(flushStyle, 150);
    onMyProfileChanged();
  }

  // Manda já o estilo que estava esperando (antes de um ping ou desenho, pra ele sair no
  // estilo novo).
  function flushStyle() {
    clearTimeout(styleSendTimer);
    if (!pendingStyle) return;
    socket.emit('profile', pendingStyle);
    pendingStyle = null;
  }

  // A aba "Mouse e efeitos": o editor com a prévia (js/fx.js), montado na primeira vez.
  let fxEditor = null;
  function myLook() {
    if (!me) return { color: '#4d8dff', ink: '#ffffff', letter: '?', photo: null, name: '' };
    const tone = toneOf(me.name);
    return { color: markFill(tone), ink: inkFor(tone), letter: [...me.name][0] || '?', photo: profileAvatars.get(me.name) || null, name: me.name };
  }
  // Abas do perfil: 'look' (foto e cor), 'fx' (mouse e efeitos) e 'account' (nick e
  // senha, com contas). Aceita true/false do jeito antigo (fx ou não).
  const PROFILE_TABS = ['look', 'fx', 'account'];
  function selectProfileTab(which) {
    const name = which === true ? 'fx' : which === false ? 'look' : which;
    for (const tab of PROFILE_TABS) {
      const on = tab === name;
      $(`ptab-${tab}`).setAttribute('aria-selected', String(on));
      $(`ptab-${tab}`).tabIndex = on ? 0 : -1;
      $(`ppanel-${tab}`).hidden = !on;
    }
    if (name === 'fx' && !fxEditor) fxEditor = Fx.editor($('fx-editor'), { get: () => myFull, look: myLook, change: setMyStyle, images: { upload: uploadFxImage, remove: removeFxImage } });
    else if (name === 'fx') fxEditor.refresh();
    if (name === 'account') renderAccountTab();
  }
  for (const tab of PROFILE_TABS) {
    $(`ptab-${tab}`).addEventListener('click', () => selectProfileTab(tab));
    $(`ptab-${tab}`).addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const shown = PROFILE_TABS.filter((t) => !$(`ptab-${t}`).hidden);
      const next = shown[(shown.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + shown.length) % shown.length];
      selectProfileTab(next);
      $(`ptab-${next}`).focus();
    });
  }

  // Aba Conta: trocar o nick (único na sala: se já existir, o aviso vermelho) e a senha.
  function accountMessage(id, text, ok = false) {
    const el = $(id);
    el.textContent = text;
    el.classList.toggle('is-bad', !ok && Boolean(text));
    el.classList.toggle('is-ok', ok);
  }
  function renderAccountTab() {
    $('account-nick').value = account ? account.nick : '';
    accountMessage('account-nick-msg', '');
    accountMessage('account-pass-msg', '');
    for (const id of ['account-pass-current', 'account-pass-new', 'account-pass-new2']) $(id).value = '';
  }
  function changeNick(nick) {
    return new Promise((resolve) => {
      socket.emit('auth:nick', { nick }, (res) => {
        if (!res || res.error) { resolve({ error: (res && res.error) || 'Não deu pra trocar o nick.' }); return; }
        const renamed = account && res.account.nick !== account.nick;
        account = res.account;
        if (renamed) rejoin();
        resolve({ ok: true, nick: res.account.nick });
      });
    });
  }
  function changePassword(current, next) {
    return new Promise((resolve) => {
      socket.emit('auth:password', { current, next }, (res) => {
        if (!res || res.error) { resolve({ error: (res && res.error) || 'Não deu pra trocar a senha.' }); return; }
        account = res.account;
        resolve({ ok: true });
      });
    });
  }
  $('account-nick-save').addEventListener('click', async () => {
    const nick = $('account-nick').value.replace(/\s+/g, ' ').trim();
    if (!nick) { accountMessage('account-nick-msg', 'Digite um nick.'); return; }
    $('account-nick-save').disabled = true;
    const res = await changeNick(nick);
    $('account-nick-save').disabled = false;
    if (res.error) accountMessage('account-nick-msg', res.error);
    else accountMessage('account-nick-msg', `Pronto: agora você é ${res.nick}.`, true);
  });
  $('account-pass-save').addEventListener('click', async () => {
    const current = $('account-pass-current').value;
    const next = $('account-pass-new').value;
    if (next.length < 6) { accountMessage('account-pass-msg', 'A senha nova precisa de pelo menos 6 caracteres.'); return; }
    if (next !== $('account-pass-new2').value) { accountMessage('account-pass-msg', 'As duas senhas novas não estão iguais.'); return; }
    $('account-pass-save').disabled = true;
    const res = await changePassword(current, next);
    $('account-pass-save').disabled = false;
    if (res.error) { accountMessage('account-pass-msg', res.error); return; }
    for (const id of ['account-pass-current', 'account-pass-new', 'account-pass-new2']) $(id).value = '';
    accountMessage('account-pass-msg', 'Senha trocada. As outras sessões da sua conta foram desconectadas.', true);
  });

  // A sua cor ou foto mudou: a cor dos rabiscos no app, o seu mouse e a janela do perfil.
  function onMyProfileChanged() {
    sendDesktopIdentity();
    renderMyCursors();
    renderProfileDialog();
  }

  // ---- seletor de cor: quadrado (saturação × brilho), faixa do tom, código (HEX e RGB),
  // conta-gotas (qualquer lugar da tela), cores da sua foto e as recentes.
  const picker = { h: 0, s: 1, v: 1 }; // o tom fica guardado mesmo no cinza/preto
  const pickerEl = $('color-picker');
  const pickerHex = () => rgbToHex(...hsvToRgb(picker.h, picker.s, picker.v));

  function pickerFrom(hex) {
    const hsv = rgbToHsv(...hexToRgb(hex));
    if (hsv.s > 0.001 && hsv.v > 0.001) picker.h = hsv.h;
    picker.s = hsv.s;
    picker.v = hsv.v;
  }

  // A cor que o seletor mostra ao abrir: a escolhida ou a que você tem agora.
  const currentColor = () => myColor || (me ? markFill(toneOf(me.name)) : '#4d8dff');

  // force: arruma até o campo em que você está digitando (confirmou com Enter).
  function renderPicker(force = false) {
    if (pickerEl.hidden) return;
    const hex = pickerHex();
    const area = $('cp-area');
    const hue = $('cp-hue');
    area.style.setProperty('--hue', `hsl(${picker.h} 100% 50%)`);
    area.style.setProperty('--c', hex);
    hue.style.setProperty('--c', `hsl(${picker.h} 100% 50%)`);
    area.firstElementChild.style.left = `${picker.s * 100}%`;
    area.firstElementChild.style.top = `${(1 - picker.v) * 100}%`;
    hue.firstElementChild.style.left = `${(picker.h / 360) * 100}%`;
    area.setAttribute('aria-valuetext', `saturação ${Math.round(picker.s * 100)}%, brilho ${Math.round(picker.v * 100)}%`);
    hue.setAttribute('aria-valuenow', String(Math.round(picker.h)));
    $('cp-preview').style.background = hex;
    // Não mexe no campo que você está digitando.
    const typing = force ? null : document.activeElement;
    if (typing !== $('cp-hex')) $('cp-hex').value = hex.toUpperCase();
    hexToRgb(hex).forEach((v, i) => {
      const field = $(['cp-r', 'cp-g', 'cp-b'][i]);
      if (typing !== field) field.value = String(v);
    });
  }

  // Uma fileira de bolinhas de cor (da foto, recentes).
  function renderChips(row, colors) {
    row.hidden = !colors.length;
    row.querySelector('.cp-chips').replaceChildren(...colors.map((color) => {
      const chip = el('button', 'cp-chip');
      chip.type = 'button';
      chip.style.setProperty('--sw', color);
      chip.title = color.toUpperCase();
      chip.setAttribute('aria-label', `Usar a cor ${color.toUpperCase()}`);
      chip.classList.toggle('active', color === myColor);
      chip.addEventListener('click', () => {
        pickerFrom(color);
        setMyColor(color, 'now');
      });
      return chip;
    }));
  }

  // As cores que mais aparecem na sua foto (no GIF, a do primeiro quadro).
  const photoPalette = { url: null, colors: [] };
  async function loadPhotoPalette(url) {
    if (photoPalette.url === url) return;
    photoPalette.url = url;
    photoPalette.colors = [];
    const colors = await window.WssColor.loadPalette(url);
    if (photoPalette.url === url) { photoPalette.colors = colors; renderProfileDialog(); }
  }

  function setPickerOpen(open) {
    pickerEl.hidden = !open;
    $('color-custom').setAttribute('aria-expanded', String(open));
    if (open) pickerFrom(currentColor());
    renderProfileDialog();
  }

  function renderProfileDialog() {
    if (!profileDialog.open || !me) return;
    const tone = toneOf(me.name);
    paintAvatar($('profile-avatar'), me.name);
    const name = $('profile-name');
    name.textContent = me.name;
    name.style.setProperty('--name', nameFill(tone, '75% 72%'));
    paintCursor($('profile-cursor').firstElementChild, me.name);
    // Automática, personalizada (a escolhida fora das prontas, ou o tom de antes) ou pronta.
    const isAuto = !myColor && myHue === null;
    const isPreset = Boolean(myColor) && COLOR_PRESETS.includes(myColor);
    const auto = $('color-auto');
    const autoTone = { hue: autoHue(me.name) };
    auto.style.setProperty('--sw', avatarFill(autoTone));
    auto.style.setProperty('--ink', inkFor(autoTone));
    auto.classList.toggle('active', isAuto);
    auto.setAttribute('aria-pressed', String(isAuto));
    const custom = $('color-custom');
    const customOn = !isAuto && !isPreset;
    custom.classList.toggle('active', customOn);
    custom.classList.toggle('has-color', customOn);
    custom.setAttribute('aria-pressed', String(customOn));
    custom.style.setProperty('--sw', customOn ? markFill(tone) : 'transparent');
    custom.style.setProperty('--ink', customOn ? inkFor({ color: markFill(tone) }) : 'var(--text)');
    for (const btn of $('color-presets').children) {
      const on = btn.dataset.color === myColor;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    }
    const photo = profileAvatars.get(me.name) || null;
    loadPhotoPalette(photo);
    renderChips($('cp-photo'), photo ? photoPalette.colors : []);
    renderChips($('cp-recent'), recentColors());
    $('btn-photo-remove').hidden = !photo;
    renderPicker();
    if (fxEditor && !$('ppanel-fx').hidden) fxEditor.refresh();
  }

  function openProfile() {
    if (!me) return;
    openSettings('profile');
  }

  {
    const presets = $('color-presets');
    for (const color of COLOR_PRESETS) {
      const btn = el('button', 'color-preset');
      btn.type = 'button';
      btn.dataset.color = color;
      btn.title = color.toUpperCase();
      btn.style.setProperty('--sw', color);
      btn.style.setProperty('--ink', inkFor({ color }));
      btn.setAttribute('aria-label', `Cor ${color.toUpperCase()}`);
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
      btn.addEventListener('click', () => {
        pickerFrom(color);
        setMyColor(color, 'now');
      });
      presets.append(btn);
    }
    $('profile-cursor').append(cursorNode());
  }
  $('color-auto').addEventListener('click', () => setMyColor(null, 'now'));
  $('color-custom').addEventListener('click', () => setPickerOpen(pickerEl.hidden));

  // Arrastar no quadrado e na faixa do tom (mouse, caneta ou dedo).
  function dragSlider(node, apply) {
    const move = (e) => {
      const r = node.getBoundingClientRect();
      apply(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      setMyColor(pickerHex());
    };
    node.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      node.focus();
      node.setPointerCapture(e.pointerId);
      move(e);
    });
    node.addEventListener('pointermove', (e) => {
      if (node.hasPointerCapture(e.pointerId)) move(e);
    });
    const done = (e) => {
      if (!node.hasPointerCapture(e.pointerId)) return;
      node.releasePointerCapture(e.pointerId);
      setMyColor(pickerHex(), 'now');
    };
    node.addEventListener('pointerup', done);
    node.addEventListener('pointercancel', done);
  }
  dragSlider($('cp-area'), (x, y) => {
    picker.s = x;
    picker.v = 1 - y;
  });
  dragSlider($('cp-hue'), (x) => {
    picker.h = Math.min(359.9, x * 360);
  });

  // Setas do teclado: de 1 em 1 (com Shift, de 10 em 10). Entra nas recentes só a cor
  // em que você parou.
  let keyCommit = null;
  function arrowKeys(node, apply) {
    node.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 1;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (!delta) return;
      e.preventDefault();
      apply(...delta);
      setMyColor(pickerHex());
      clearTimeout(keyCommit);
      keyCommit = setTimeout(() => setMyColor(pickerHex(), 'now'), 800);
    });
  }
  arrowKeys($('cp-area'), (dx, dy) => {
    picker.s = Math.min(1, Math.max(0, picker.s + dx / 100));
    picker.v = Math.min(1, Math.max(0, picker.v + dy / 100));
  });
  arrowKeys($('cp-hue'), (dx, dy) => {
    picker.h = (picker.h + dx + dy + 360) % 360;
  });

  // Digitando o código: vale assim que fica completo; Enter (ou sair do campo) confirma.
  // Enter não pode fechar a janela (o formulário dela fecha com Enter).
  function typedColor() {
    return normalizeHex($('cp-hex').value);
  }
  function rgbColor() {
    const values = ['cp-r', 'cp-g', 'cp-b'].map((id) => $(id).value.trim());
    if (!values.every((v) => /^\d{1,3}$/.test(v) && Number(v) <= 255)) return null;
    return rgbToHex(...values.map(Number));
  }
  // Confirma (manda já e entra nas recentes) com Enter ou quando o foco sai do grupo: de
  // R pra G não conta, senão cada passo da digitação virava uma cor recente.
  for (const [ids, read] of [[['cp-hex'], typedColor], [['cp-r', 'cp-g', 'cp-b'], rgbColor]]) {
    let dirty = false;
    const commit = () => {
      const color = read();
      if (dirty && color) {
        pickerFrom(color);
        setMyColor(color, 'now');
      }
      dirty = false;
      renderPicker(true); // arruma o que ficou no campo (ex.: "abc" vira "#AABBCC")
    };
    for (const id of ids) {
      const field = $(id);
      field.addEventListener('input', () => {
        dirty = true;
        const color = read();
        if (!color || color === myColor) return;
        pickerFrom(color);
        setMyColor(color);
      });
      field.addEventListener('focusout', (e) => {
        if (!ids.some((other) => $(other) === e.relatedTarget)) commit();
      });
      field.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        commit();
        field.select();
      });
    }
  }

  // Conta-gotas do Chrome/Edge e do app: a cor de qualquer pixel da tela.
  const eyeBtn = $('cp-eyedropper');
  eyeBtn.hidden = typeof window.EyeDropper !== 'function';
  eyeBtn.addEventListener('click', async () => {
    try {
      const { sRGBHex } = await new window.EyeDropper().open();
      const color = normalizeHex(sRGBHex);
      if (!color) return;
      pickerFrom(color);
      setMyColor(color, 'now');
    } catch {} // Esc: desistiu
  });
  $('btn-photo').addEventListener('click', () => $('photo-input').click());
  $('photo-input').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const error = $('photo-error');
    const btn = $('btn-photo');
    error.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    try {
      const blob = await preparePhoto(file);
      const res = await sendPhoto(blob);
      if (res.error) throw new Error(res.error);
      if (!(await photoStore.set(blob))) showToast('A foto entrou, mas este navegador não deixou salvar: na próxima vez, escolha de novo.');
    } catch (err) {
      error.textContent = err.message || 'Não deu pra usar essa foto.';
      error.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Escolher foto';
      renderProfileDialog();
    }
  });
  $('btn-photo-remove').addEventListener('click', async () => {
    const res = await sendPhoto(null);
    if (res.error) {
      $('photo-error').textContent = res.error;
      $('photo-error').hidden = false;
      return;
    }
    await photoStore.set(null);
    renderProfileDialog();
  });
  profileDialog.addEventListener('click', (e) => {
    if (e.target === profileDialog) profileDialog.close();
  });
  meAvatarEl.setAttribute('role', 'button');
  meAvatarEl.tabIndex = 0;
  meAvatarEl.title = 'Seu perfil: foto e cor';
  meAvatarEl.addEventListener('click', openProfile);
  meAvatarEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openProfile();
    }
  });
  meNameEl.title = 'Seu perfil: foto e cor';
  meNameEl.addEventListener('click', openProfile);

  // ---------- mouse de quem assiste e controle remoto ----------

  const controlDialog = $('control-dialog');
  const round4 = (v) => Math.round(v * 10000) / 10000;
  // O seu mouse em cima das transmissões funciona como janelas do Windows: ele só aparece
  // (pra quem transmite, na tela dela, e pra quem assiste junto) na transmissão que você
  // clicou, a "ativa". Clicou fora dela (outro quadro, o chat, a lista...), trocou de
  // programa ou escondeu a página: ela fica inativa e o seu mouse some de lá. Cada
  // transmissão ainda tem um botão (em cima dela) pra desligar o seu mouse só ali; a
  // escolha fica salva por pessoa que transmite.
  let cursorDefault = true; // transmissões sem escolha própria (o antigo "mostrar o meu mouse")
  let cursorPrefs = {}; // nick de quem transmite -> true/false
  let showCursors = true; // você (transmitindo pelo app) vê o mouse de quem assiste
  let activeStream = null; // a transmissão "ativa" (a última que você clicou)
  try {
    cursorDefault = localStorage.getItem('wss-cursor') !== '0';
    showCursors = localStorage.getItem('wss-show-cursors') !== '0';
    const saved = JSON.parse(localStorage.getItem('wss-cursor-streams') || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [name, on] of Object.entries(saved)) if (typeof on === 'boolean') cursorPrefs[name] = on;
    }
  } catch {}
  const TILE_CONTROLS = '.tile-tools, .tile-audio, .tile-stats, .cursor-hint, button, select, input';
  const cursorOnFor = (s) => (typeof cursorPrefs[s.name] === 'boolean' ? cursorPrefs[s.name] : cursorDefault);
  const cursorLive = (s) => activeStream === s.id && cursorOnFor(s) && controlling !== s.id && s.watching;


  function saveCursorPrefs() {
    try {
      localStorage.setItem('wss-cursor', cursorDefault ? '1' : '0');
      localStorage.setItem('wss-cursor-streams', JSON.stringify(cursorPrefs));
    } catch {}
  }

  // Liga/desliga o seu mouse numa transmissão só (o botão em cima dela).
  function setCursorFor(s, on) {
    cursorPrefs[s.name] = on;
    saveCursorPrefs();
    if (!on && activeStream === s.id) deactivateCursor();
    renderCursorToggle(s);
  }

  // O antigo "mostrar o meu mouse" (Configurações do app de antes): vale pra todas.
  function setCursorDefault(on) {
    cursorDefault = on;
    cursorPrefs = {};
    saveCursorPrefs();
    if (!on) deactivateCursor();
    for (const s of streams.values()) renderCursorToggle(s);
  }

  function activateCursor(s, e) {
    if (activeStream === s.id) return;
    deactivateCursor();
    activeStream = s.id;
    s.tile.classList.add('cursor-active');
    if (me) s.tile.style.setProperty('--cursor-c', markFill(toneOf(me.name)));
    hideCursorHint(s);
    renderCursorToggle(s);
    if (s.cursorShare && e) s.cursorShare.update(e);
  }

  function deactivateCursor() {
    const s = activeStream && streams.get(activeStream);
    activeStream = null;
    if (!s) return;
    s.tile.classList.remove('cursor-active');
    if (s.cursorShare) s.cursorShare.hide();
    renderCursorToggle(s);
  }

  // Clicou fora da transmissão ativa (os botões dela, como a barra de título de uma
  // janela, não contam), trocou de programa ou escondeu a página: fica inativa.
  document.addEventListener('pointerdown', (e) => {
    const s = activeStream && streams.get(activeStream);
    if (s && !s.tile.contains(e.target)) deactivateCursor();
  }, true);
  window.addEventListener('blur', () => deactivateCursor());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) deactivateCursor();
  });

  function renderCursorToggle(s) {
    if (!s.btnCursorShare) return;
    const on = cursorOnFor(s);
    const live = on && activeStream === s.id;
    setIcon(s.btnCursorShare, on ? 'pointer' : 'pointerOff', !on
      ? `O seu mouse está desligado nesta transmissão. Clique pra ligar (ele aparece quando você clica na transmissão de ${s.name}).`
      : live
        ? `O seu mouse aparece nesta transmissão agora. Clique fora dela pra ele sumir, ou aqui pra desligar só nesta.`
        : `O seu mouse aparece aqui quando você clica na transmissão de ${s.name}. Clique pra desligar só nesta.`);
    s.btnCursorShare.classList.toggle('cursor-off', !on);
    s.btnCursorShare.classList.toggle('active', live);
    s.btnCursorShare.setAttribute('aria-pressed', String(on));
  }

  // "Clique pra mostrar o seu mouse": aparece um pouquinho ao passar por uma transmissão
  // inativa (uma vez a cada entrada).
  function showCursorHint(s) {
    if (s.hintShown || cursorLive(s) || !cursorOnFor(s) || controlling === s.id || !s.watching) return;
    s.hintShown = true;
    clearTimeout(s.hintTimer);
    s.hintTimer = setTimeout(() => {
      if (!s.cursorHint) {
        s.cursorHint = el('div', 'cursor-hint');
        s.media.append(s.cursorHint);
      }
      s.cursorHint.textContent = 'Clique na transmissão pra mostrar o seu mouse';
      s.cursorHint.classList.add('show');
      s.hintTimer = setTimeout(() => hideCursorHint(s), 2200);
    }, 450);
  }
  function hideCursorHint(s) {
    clearTimeout(s.hintTimer);
    if (s.cursorHint) s.cursorHint.classList.remove('show');
  }

  // Passando o mouse por cima da transmissão ativa: a posição vai (no máximo ~20 vezes
  // por segundo) pra quem transmite, que vê uma setinha na sua cor, na tela dela.
  function enableCursorShare(s) {
    let inside = false;
    const live = () => Boolean(me && socket.connected && streams.get(s.id) === s && cursorLive(s));
    const positions = window.WssInputPacing.createLatest({ interval: 50, canSend: live,
      deliver(e) {
        const point = videoPoint(s.video, e.clientX, e.clientY);
        if (point) { inside = true; socket.emit('cursor', { stream: s.id, x: round4(point.x), y: round4(point.y) }); }
        else if (inside) { inside = false; socket.emit('cursor', { stream: s.id, gone: true }); }
      } });
    // O cursor nativo continua imediato. Só o enfeite visual acompanha o último
    // evento do frame; não depende dele o envio de posição/clique ou controle.
    const visuals = window.WssInputPacing.createFrameLatest({ canSend: live,
      deliver(e) {
        const point = videoPoint(s.video, e.clientX, e.clientY);
        mirrorCursor(s, point && !e.target.closest(TILE_CONTROLS) ? e : null);
      } });
    const hide = () => {
      positions.clear(); visuals.clear();
      mirrorCursor(s, null);
      if (!inside) return;
      inside = false;
      if (me && socket.connected) socket.emit('cursor', { stream: s.id, gone: true });
    };
    const update = (e, immediate = true) => {
      if (!live() || e.pointerType === 'touch') { hide(); return; }
      positions.offer(e); visuals.offer(e);
      if (immediate) visuals.flush(); // Ativação por clique mantém o cursor imediato.
    };
    s.cursorShare = { update, hide, close() { positions.clear(); visuals.clear(); } };
    s.media.addEventListener('pointermove', (e) => {
      update(e, false);
      if (e.pointerType !== 'touch' && !e.target.closest(TILE_CONTROLS)) showCursorHint(s);
    });
    s.media.addEventListener('pointerleave', () => {
      s.hintShown = false;
      hideCursorHint(s);
      hide();
    });
    s.media.addEventListener('pointercancel', hide);
    // Clique e rolagem viram a animaçãozinha no seu mouse, pros outros (e no seu, aqui).
    const sendClick = (e, click) => {
      if (!cursorLive(s) || e.pointerType === 'touch' || !me) return;
      if (e.target.closest(TILE_CONTROLS)) return;
      const point = videoPoint(s.video, e.clientX, e.clientY);
      if (!point) return;
      positions.clear(); visuals.clear(); // Movimento anterior não reaparece após o clique.
      mirrorCursor(s, e);
      socket.emit('cursor', { stream: s.id, x: round4(point.x), y: round4(point.y), click });
      showMyClick(s, e, click); // o mesmo efeito que os outros veem, mesmo sem a sua setinha desenhada aqui
    };
    s.media.addEventListener('pointerdown', (e) => {
      if (e.button > 2 || e.pointerType === 'touch' || e.target.closest(TILE_CONTROLS)) return;
      // O clique que ativa a transmissão já conta (como numa janela do Windows).
      if (cursorOnFor(s) && controlling !== s.id && s.watching) activateCursor(s, e);
      if (e.altKey) return; // Alt + clique é o "olha aqui"
      sendClick(e, e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left');
    });
    let lastWheel = 0;
    s.media.addEventListener('wheel', (e) => {
      const kind = Fx.scrollKind(e); // pra cima/baixo, ou pros lados (Shift + rodinha, touchpad)
      if (!kind || performance.now() - lastWheel < 150) return;
      lastWheel = performance.now();
      sendClick(e, kind);
    }, { passive: true });

    // O botão em cima da transmissão: o seu mouse nela (ligado/desligado).
    const btn = iconButton('pointer', '');
    btn.classList.add('cursor-share-btn');
    btn.addEventListener('click', () => setCursorFor(s, !cursorOnFor(s)));
    s.btnCursorShare = btn;
    const tools = s.btnStats.parentNode;
    tools.insertBefore(btn, s.btnStats);
    renderCursorToggle(s);
  }

  // O seu mouse em cima da transmissão vira a mesma setinha que os outros veem. A setinha
  // é o cursor de verdade do sistema (uma imagem no seu modelo e na sua cor, do
  // js/fx.js), sem atraso nenhum; antes ela era desenhada pela página, chegava um ou dois
  // quadros depois do mouse (ficava "pesado") e pulava quando a página engasgava. O
  // efeito e o rastro continuam desenhados pela página, seguindo o mouse com uma
  // folguinha; a sua foto, só os outros veem (aqui ela vinha atrasada). O Chromium só mostra cursor
  // personalizado que cabe inteiro na janela: colado na borda, volta o mouse normal.
  // frames: com imagem própria animada (GIF, .ani...), um cursor por quadro; troca de
  // quadro só enquanto o seu mouse está numa transmissão ativa.
  const myCursor = { key: '', css: null, frames: null, frame: 0, timer: null, load: 0 };

  function cursorCss(style, color, frame = null) {
    const scales = [1, 2];
    if (window.devicePixelRatio > 2) scales.push(3);
    let hot = null;
    const images = scales.map((scale) => {
      hot = Fx.cursorImage(style, color, scale, frame);
      return `url("${hot.url}") ${scale}x`;
    });
    return `image-set(${images.join(', ')}) ${hot.hotX} ${hot.hotY}, auto`;
  }

  function setMyCursorCss(css) {
    myCursor.css = css;
    for (const s of streams.values()) {
      if (!s.mirrorOn) continue;
      s.mirrorCss = css;
      s.media.style.cursor = css;
    }
  }

  function buildMyCursor() {
    if (!me) return;
    const style = myFull;
    const color = markFill(toneOf(me.name));
    const key = [color, style.skin, style.size, style.aura, style.outline, style.img || '', style.hx, style.hy].join('|');
    if (key === myCursor.key) return;
    myCursor.key = key;
    stopCursorFrames();
    if (style.skin !== 'custom') {
      setMyCursorCss(cursorCss(style, color));
      return;
    }
    // Imagem própria: enquanto ela carrega, a setinha clássica.
    if (!myCursor.css) setMyCursorCss(cursorCss({ ...style, skin: 'classic' }, color));
    const load = ++myCursor.load;
    loadCursorFrames(style.img).then((frames) => {
      if (load !== myCursor.load || !frames || !frames.length) return;
      myCursor.frames = frames.map((f) => ({ css: cursorCss(style, color, f.canvas), duration: f.duration }));
      myCursor.frame = 0;
      setMyCursorCss(myCursor.frames[0].css);
      tickCursorFrames();
    });
  }

  // Os quadros da sua imagem (onde o navegador sabe separar; senão, a imagem parada).
  async function loadCursorFrames(url) {
    try {
      const res = await fetch(url);
      const type = (res.headers.get('content-type') || 'image/png').split(';')[0];
      const bytes = new Uint8Array(await res.arrayBuffer());
      const frames = window.WssFxImage && type !== 'image/jpeg' ? await window.WssFxImage.decodeFrames(bytes, type) : null;
      if (frames && frames.length) return frames;
      const src = URL.createObjectURL(new Blob([bytes], { type }));
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1;
      canvas.height = img.naturalHeight || 1;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(src);
      return [{ canvas, duration: 0 }];
    } catch {
      return null;
    }
  }

  function tickCursorFrames() {
    clearTimeout(myCursor.timer);
    myCursor.timer = null;
    const frames = myCursor.frames;
    if (document.hidden || !frames || frames.length < 2 || ![...streams.values()].some((s) => s.mirrorOn)) return;
    myCursor.timer = setTimeout(() => {
      myCursor.frame = (myCursor.frame + 1) % frames.length;
      setMyCursorCss(frames[myCursor.frame].css);
      tickCursorFrames();
    }, Math.max(20, frames[myCursor.frame].duration || 100));
  }

  function stopCursorFrames() {
    clearTimeout(myCursor.timer);
    myCursor.timer = null;
    myCursor.frames = null;
  }
  document.addEventListener('visibilitychange', tickCursorFrames);

  // A bolinha com a foto (ou a letrinha), que segue o mouse.
  function myBadgeNode(s) {
    if (!s.myBadge) {
      s.myBadge = el('div', 'mouse-cursor my-badge');
      s.myBadge.append(el('span', 'cursor-badge'));
      s.myBadge.hidden = true;
      paintCursor(s.myBadge, me.name);
      s.media.append(s.myBadge);
    }
    return s.myBadge;
  }

  function mirrorCursor(s, e) {
    const on = Boolean(e && me);
    if (on) buildMyCursor();
    const css = on ? myCursor.css : null;
    if (css !== (s.mirrorCss || null)) {
      s.mirrorCss = css;
      s.mirrorOn = Boolean(css);
      s.media.classList.toggle('mirror-cursor', s.mirrorOn);
      s.media.style.cursor = css || '';
    }
    if (!s.mirrorOn) {
      if (s.myBadge) s.myBadge.hidden = true;
      return;
    }
    if (myCursor.frames && myCursor.frames.length > 1 && !myCursor.timer) tickCursorFrames();
    const badge = myBadgeNode(s);
    const rect = s.media.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Só transform: mexer a bolinha não refaz o layout nem redesenha nada.
    badge.style.transform = `translate(${x}px, ${y}px)`;
    badge.hidden = false;
    Fx.trail(s.media, s, x, y, myFull, markFill(toneOf(me.name)), 'px');
  }

  // O seu clique/rolagem: a animaçãozinha fica onde você clicou (como os outros veem). Não
  // depende da sua setinha estar desenhada por cima (antes, sem ela, o efeito sumia só aqui).
  function showMyClick(s, e, kind) {
    const rect = s.media.getBoundingClientRect();
    showClick(s.media, `${e.clientX - rect.left}px`, `${e.clientY - rect.top}px`, kind, me.name);
  }

  // A sua cor ou foto mudou (ou a de alguém): repinta as setinhas na tela.
  function renderMyCursors() {
    if (me) {
      buildMyCursor();
      const active = activeStream && streams.get(activeStream);
      if (active) active.tile.style.setProperty('--cursor-c', markFill(toneOf(me.name)));
      for (const s of streams.values()) {
        if (s.myBadge) paintCursor(s.myBadge, me.name);
      }
    }
    for (const c of peerCursors.values()) paintCursor(c.node, c.name);
  }

  // O mouse dos outros em cima das transmissões que você está vendo (e, transmitindo
  // pelo app, na sua tela de verdade).
  const peerCursors = new Map(); // `${transmissão}|${pessoa}` -> { node, name, timer }

  function removePeerCursor(key) {
    const c = peerCursors.get(key);
    if (!c) return;
    peerCursors.delete(key);
    clearTimeout(c.timer);
    c.node.remove();
  }

  function clearPeerCursors(match = () => true) {
    for (const key of [...peerCursors.keys()]) {
      if (match(key)) removePeerCursor(key);
    }
  }

  function showPeerCursor({ stream, id, name, x, y, gone, click }) {
    const key = `${stream}|${id}`;
    const target = gone ? null : fxTarget(stream);
    if (!target || !Number.isFinite(x) || !Number.isFinite(y)) {
      removePeerCursor(key);
      return;
    }
    const { fx, video } = target;
    const width = fx.clientWidth;
    const height = fx.clientHeight;
    if (!width || !height) return;
    let c = peerCursors.get(key);
    if (c && (c.node.parentNode !== fx || c.name !== name)) {
      removePeerCursor(key);
      c = null;
    }
    if (!c) {
      c = { node: cursorNode(), name, timer: null };
      c.node.classList.add('peer-cursor');
      paintCursor(c.node, name);
      fx.append(c.node);
      peerCursors.set(key, c);
    }
    const box = contentBox(video, width, height);
    const left = ((box.left + x * box.width) / width) * 100;
    const top = ((box.top + y * box.height) / height) * 100;
    c.node.style.left = `${left}%`;
    c.node.style.top = `${top}%`;
    Fx.trail(fx, c, left, top, styleOf(name), markFill(toneOf(name)), '%');
    if (click) showClick(fx, `${left}%`, `${top}%`, click, name);
    clearTimeout(c.timer);
    c.timer = setTimeout(() => removePeerCursor(key), 4000); // parou de chegar: some
  }

  socket.on('cursor', (msg) => {
    if (!showCursors || !msg || typeof msg.name !== 'string' || typeof msg.id !== 'string') return;
    const { stream, id, name, x, y, gone } = msg;
    const photo = profileAvatars.get(name);
    toDesktopOverlay(stream, {
      // color só de quem escolheu: a automática o app ainda separa das parecidas.
      type: 'cursor', id, x, y, gone: Boolean(gone), letter: [...name][0] || '?', hue: nameHue(name), color: toneOf(name).color,
      style: overlayStyle(name), name,
      avatar: photo ? new URL(photo, window.location.href).href : null, click: msg.click,
    });
    showPeerCursor(msg);
  });

  // ---- quem transmite: dar e tirar o controle

  const controlGrants = new Map(); // participante -> dispositivos autorizados
  const controlActivityAt = new Map();
  function acceptHostInput(msg) {
    const grant = controlGrants.get(msg?.from);
    if (!grant || (msg.session && msg.session !== grant.session)) return;
    const devices = { ...grant.devices, gamepad: grant.devices.gamepad && !sharingState.options.gamepadPaused };
    const input = window.WssControlWire.cleanInput(msg, devices);
    if (input) desktop?.control?.({ ...input, from: msg.from, session: grant.session });
  }
  let gamepadClient = null;
  const controlTransport = window.WssControlTransport.create({ socket, iceServers: getIceServers,
    ...transportExperiments.options,
    onFeedback: value => { if (controlling === value.stream) gamepadClient?.feedback(value); },
    onFeedbackStop: value => { if (controlling === value.stream) gamepadClient?.stopFeedback(); },
    onInput: acceptHostInput,
    onReset: (msg) => desktop?.controlReset?.(msg),
    onActivity: (msg) => {
      const time = performance.now();
      const last = controlActivityAt.get(msg.from) || { native: -Infinity, server: -Infinity };
      if (time - last.native >= 100) { last.native = time; desktop?.controlPulse?.(msg); }
      if (msg.gamepad && time - last.server >= 400) {
        last.server = time; socket.emit('control:activity', msg);
      }
      controlActivityAt.set(msg.from, last);
    },
  });
  desktop?.onGamepadFeedback?.(value => {
    const grant = controlGrants.get(value?.from);
    if (grant?.devices.gamepad && grant.session === value.session && !sharingState.options.gamepadPaused) controlTransport.feedback(value.from, value);
  });
  window.addEventListener('pagehide', () => controlTransport.destroy(), { once: true });
  let desktopCaps = null;
  const sharingDialog = $('sharing-dialog');
  let sharingState = { options: { gamepadPaused: false, maxGamepads: 4 }, people: [], counts: { connected: 0, receiving: 0, allowed: 0, physical: 0 } };
  const sharingDrafts = new Map();
  let sharingPeopleKey = '';
  let sharingOptionsDirty = false;
  const sharingNodes = new Map();
  let sharingRequest = null, sharingRevision = 0;

  function sharingStatus(person) {
    if (!person?.devices.gamepad) return 'Sem permissão de gamepad';
    if (sharingState.options.gamepadPaused) return 'Gamepads pausados pelo proprietário';
    if (!person.physicalConnected) return 'Aguardando conectar o controle físico';
    if (person.receiverError) return 'Falha ao conectar o controle virtual';
    if (!person.receiverConnected) return 'Controle físico conectado · aguardando o aplicativo receptor';
    return person.receiving ? 'Conectado · recebendo comandos' : 'Conectado · envio pausado';
  }
  function renderSharingDetails() {
    const counts = sharingState.counts;
    $('sharing-count').textContent = String(counts.connected);
    $('sharing-count').hidden = !counts.connected; // "0" no topo era só ruído
    $('sharing-connected').textContent = String(counts.connected);
    $('sharing-receiving').textContent = String(counts.receiving);
    $('sharing-allowed').textContent = `${counts.allowed} / ${sharingState.options.maxGamepads}`;
    if (!sharingDialog.open) return;
    const problem = !canGrantControl() ? 'Para liberar dispositivos, use o aplicativo Windows com as marcações habilitadas.'
      : !myControlStream() ? 'Inicie a transmissão de tela inteira para liberar dispositivos.' : '';
    $('sharing-note').textContent = problem || (sharingState.options.gamepadPaused ? 'Os gamepads estão pausados. As permissões foram mantidas.' : 'Contagem confirmada pelo aplicativo que recebe os controles.');
    $('sharing-physical').textContent = `${counts.physical} controle(s) físico(s) conectado(s) entre os participantes autorizados. Cada pessoa precisa clicar em Controlar na sua transmissão.`;
    if (!sharingOptionsDirty) {
      $('sharing-paused').checked = sharingState.options.gamepadPaused;
      $('sharing-limit').value = String(sharingState.options.maxGamepads);
    }
    const people = [...users.values()].filter((u) => me && u.id !== me.id && u.kind !== 'obs').sort((a, b) => a.name.localeCompare(b.name));
    const granted = new Map(sharingState.people.map((p) => [p.id, p]));
    const key = JSON.stringify(people.map((u) => [u.id, u.name, granted.get(u.id)?.devices, Boolean(problem), desktopCaps?.gamepad?.available]));
    if (key !== sharingPeopleKey) {
      sharingPeopleKey = key; sharingNodes.clear();
      $('sharing-people').replaceChildren(...people.map((user) => {
        const state = granted.get(user.id); const li = el('li', 'sharing-person');
        const heading = el('div', 'sharing-person-heading'); heading.append(avatar(user.name), el('strong', null, user.name));
        const status = el('p', 'sharing-person-status'); const device = el('p', 'sharing-device-name');
        const fields = {}; const choices = el('div', 'control-devices');
        const selected = sharingDrafts.get(user.id) || state?.devices || { keyboard: false, mouse: false, gamepad: false };
        for (const [kind, title] of [['keyboard', 'Teclado'], ['mouse', 'Mouse'], ['gamepad', 'Gamepad']]) {
          const label = el('label'); const field = el('input'); field.type = 'checkbox'; field.checked = selected[kind];
          field.disabled = Boolean(problem) || (kind === 'gamepad' && !desktopCaps?.gamepad?.available);
          field.setAttribute('aria-label', `${title} para ${user.name}`); fields[kind] = field;
          field.addEventListener('change', () => sharingDrafts.set(user.id, Object.fromEntries(Object.entries(fields).map(([k, input]) => [k, input.checked]))));
          label.append(field, document.createTextNode(title)); choices.append(label);
        }
        const actions = el('div', 'sharing-person-actions'); const apply = el('button', 'btn', state ? 'Aplicar permissões' : 'Permitir'); apply.type = 'button'; apply.disabled = Boolean(problem);
        apply.addEventListener('click', () => {
          apply.disabled = true;
          grantControl(user, (res) => { apply.disabled = Boolean(problem); if (!res.error) sharingDrafts.delete(user.id); $('sharing-feedback').textContent = res.error || `Permissões de ${user.name} aplicadas.`; refreshSharingDetails(); }, Object.fromEntries(Object.entries(fields).map(([k, input]) => [k, input.checked])));
        }); actions.append(apply);
        if (state) { const revoke = el('button', 'btn btn-danger', 'Revogar'); revoke.type = 'button'; revoke.title = 'Revogar todos os dispositivos desta pessoa'; revoke.addEventListener('click', () => { sharingDrafts.delete(user.id); revokeControl(user.id); }); actions.append(revoke); }
        li.append(heading, status, device, choices, actions); sharingNodes.set(user.id, { status, device }); return li;
      }));
      if (!people.length) $('sharing-people').append(el('li', 'control-empty', 'Nenhum outro participante na sala.'));
    }
    for (const person of people) {
      const state = granted.get(person.id); const nodes = sharingNodes.get(person.id);
      nodes.status.textContent = sharingStatus(state); nodes.status.classList.toggle('is-live', Boolean(state?.receiving && state?.receiverConnected));
      nodes.device.textContent = state?.deviceName || ''; nodes.device.hidden = !state?.deviceName;
    }
    $('sharing-revoke-all').disabled = !sharingState.people.length;
  }
  function acceptSharingDetails(state) {
    if (!state?.options || !Array.isArray(state.people) || !state.counts) return;
    sharingRevision++;
    const pausedChanged = sharingState.options.gamepadPaused !== state.options.gamepadPaused;
    sharingState = state;
    if (pausedChanged && state.options.gamepadPaused) {
      for (const grant of controlGrants.values()) if (grant.devices.gamepad) controlTransport.feedback(grant.to, { strong: 0, weak: 0, duration: 0 });
    }
    if (pausedChanged) syncHostControl();
    renderSharingDetails();
  }
  function refreshSharingDetails() {
    if (!me || !socket.connected || sharingRequest) return;
    const request = { revision: sharingRevision }; sharingRequest = request;
    socket.timeout(2500).emit('control:details', (error, state) => {
      if (sharingRequest !== request) return;
      sharingRequest = null;
      if (request.revision !== sharingRevision) return;
      if (error) { if (sharingDialog.open) $('sharing-feedback').textContent = 'Não foi possível consultar os detalhes. Verifique a conexão e atualize o servidor.'; return; }
      acceptSharingDetails(state);
    });
  }
  socket.on('control:sharing', acceptSharingDetails);
  $('btn-sharing-details').addEventListener('click', async () => {
    if (desktop?.caps) desktopCaps = await desktop.caps().catch(() => desktopCaps);
    if (!sharingDialog.open) sharingDialog.showModal();
    $('sharing-feedback').textContent = ''; sharingPeopleKey = ''; renderSharingDetails(); refreshSharingDetails();
    sharingTicker.sync();
  });
  $('sharing-close').addEventListener('click', () => sharingDialog.close());
  sharingDialog.addEventListener('click', (event) => { if (event.target === sharingDialog) sharingDialog.close(); });
  const sharingTabs = ['people', 'options'];
  function selectSharingTab(tab) {
    for (const name of sharingTabs) { $('sharing-tab-' + name).setAttribute('aria-selected', String(name === tab)); $('sharing-tab-' + name).tabIndex = name === tab ? 0 : -1; }
    $('sharing-people-panel').hidden = tab !== 'people'; $('sharing-options-panel').hidden = tab !== 'options';
  }
  for (const tab of sharingTabs) {
    $('sharing-tab-' + tab).addEventListener('click', () => selectSharingTab(tab));
    $('sharing-tab-' + tab).addEventListener('keydown', (event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const target = event.key === 'Home' ? 'people' : event.key === 'End' ? 'options' : sharingTabs.find((name) => name !== tab); selectSharingTab(target); $('sharing-tab-' + target).focus(); } });
  }
  for (const id of ['sharing-paused', 'sharing-limit']) $(id).addEventListener('change', () => { sharingOptionsDirty = true; });
  $('sharing-save-options').addEventListener('click', () => {
    socket.timeout(2500).emit('control:options', { gamepadPaused: $('sharing-paused').checked, maxGamepads: Number($('sharing-limit').value) }, (error, res) => {
      $('sharing-feedback').textContent = error ? 'Não foi possível salvar: verifique a conexão.' : res?.error || 'Configurações aplicadas.';
      if (!error && res?.ok) { sharingOptionsDirty = false; refreshSharingDetails(); }
    });
  });
  $('sharing-revoke-all').addEventListener('click', () => { sharingDrafts.clear(); revokeControl(); });
  const sharingTicker = createVisibleTicker({ document, interval: 2000, run: refreshSharingDetails,
    active: () => sharingDialog.open });
  sharingDialog.addEventListener('close', () => sharingTicker.sync());
  desktop?.onGamepadState?.((state) => {
    const grant = controlGrants.get(state?.id);
    if (grant) socket.emit('control:receiver', { from: state.id, stream: grant.stream, connected: state.connected === true, failed: state.failed === true });
  });

  // A sua transmissão que dá pra controlar: a tela inteira pelo app, ou o OBS com a
  // camada ligada (é ela que sabe em qual monitor cada ponto cai).
  function myControlStream() {
    if (desktopOverlay && localStream && me) return me.id;
    if (obsOverlay || localObsEndpoint) return myObsStreamId();
    return null;
  }

  function canGrantControl(){
    return Boolean(desktopCaps?.control || (localObsEndpoint && myObsStreamId() && desktopCaps?.gamepad?.available));
  }

  async function openControlPanel() {
    if (typeof desktop?.caps === 'function') desktopCaps = await desktop.caps().catch(() => desktopCaps);
    renderControlPanel();
    if (!controlDialog.open) controlDialog.showModal();
  }

  function renderControlPanel() {
    $('show-cursors').checked = showCursors;
    if (!desktop) return; // no navegador, só a chave do mouse dos outros
    const note = $('control-note');
    const list = $('control-list');
    const stream = myControlStream();
    let problem = '';
    if (typeof desktop.caps !== 'function') problem = 'Atualize o app de desktop pra usar o mouse de quem assiste e o controle.';
    else if (!canGrantControl()) problem = 'O controle remoto não funciona neste sistema (precisa do app no Windows).';
    else if (!stream) problem = 'Comece a transmitir a tela inteira pelo app (ou pelo OBS, com as marcações na sua tela ligadas) pra poder dar o controle.';
    note.hidden = !problem;
    note.textContent = problem || (desktopCaps?.gamepad?.available ? 'Até quatro gamepads. Teclado e mouse: uma pessoa por dispositivo.' : desktopCaps?.gamepad?.reason || 'Atualize o app para receber gamepads.');
    note.hidden = false;
    note.className = problem ? 'obs-check is-bad' : 'obs-check';
    const people = [...users.values()].filter((u) => u.kind !== 'obs' && me && u.id !== me.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(...people.map((u) => {
      const li = el('li', 'control-person');
      const active = controlGrants.has(u.id);
      li.classList.toggle('is-active', Boolean(active));
      li.append(avatar(u.name), el('span', 'control-name', u.name));
      const selected = controlGrants.get(u.id)?.devices || { keyboard: false, mouse: false, gamepad: false };
      const choices = el('div', 'control-devices');
      const fields = {};
      for (const [key, label] of [['keyboard', 'Teclado'], ['mouse', 'Mouse'], ['gamepad', 'Gamepad']]) {
        const wrap = el('label'); const input = el('input'); input.type = 'checkbox'; input.checked = selected[key];
        input.disabled = Boolean(problem) || (stream===myObsStreamId() && !obsOverlay && key!=='gamepad') || (key === 'gamepad' && !desktopCaps?.gamepad?.available);
        fields[key] = input; wrap.append(input, document.createTextNode(label)); choices.append(wrap);
      }
      li.append(choices);
      const btn = el('button', 'btn', active ? 'Aplicar' : 'Permitir'); btn.type = 'button'; btn.disabled = Boolean(problem);
      btn.addEventListener('click', () => grantControl(u, () => {}, Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.checked]))));
      li.append(btn);
      if (active) {
        const revoke = el('button', 'btn btn-danger', 'Revogar'); revoke.type = 'button';
        revoke.addEventListener('click', () => revokeControl(u.id)); li.append(revoke);
      }
      return li;
    }));
    if (!people.length) list.replaceChildren(el('li', 'control-empty', 'Ninguém mais na sala.'));
  }

  // Na lista da sala, em cada pessoa: deixar ela controlar o seu PC. Só aparece no app,
  // com a sua tela inteira no ar (pelo app ou pelo OBS com as marcações na sua tela).
  // O botão abre a seleção explícita de dispositivos antes de conceder acesso.
  let controlTargetsShown = null; // a transmissão controlável quando a lista foi desenhada

  function controlGrantButton(u) {
    if (!desktop || !me || u.id === me.id || u.kind === 'obs' || !roomSettings.control) return null;
    const active = controlGrants.has(u.id);
    if (!active && !(canGrantControl() && myControlStream())) return null;
    const btn = el('button', 'grant-btn' + (active ? ' active' : '')); btn.type = 'button'; btn.append(icon('gamepad'));
    btn.title = 'Escolher permissões de teclado, mouse e gamepad para ' + u.name; btn.setAttribute('aria-label', btn.title);
    // O 🎮 abre o painel de permissões (só existe no app, igual nos dois).
    btn.addEventListener('click', (e) => { e.stopPropagation(); openControlPanel(); });
    return btn;
  }

  // A sua transmissão passou a dar (ou deixou de dar) pra controlar: redesenha a lista.
  function checkControlTargets() {
    if (me && myControlStream() !== controlTargetsShown) renderUsers();
  }

  if (desktop && typeof desktop.caps === 'function') {
    desktop.caps().then((caps) => {
      desktopCaps = caps;
      if (me) renderUsers();
    }).catch(() => {});
  }

  $('show-cursors').addEventListener('change', (e) => {
    showCursors = e.target.checked;
    try { localStorage.setItem('wss-show-cursors', showCursors ? '1' : '0'); } catch {}
    if (!showCursors) clearPeerCursors();
  });
  controlDialog.addEventListener('click', (e) => {
    if (e.target === controlDialog) controlDialog.close();
  });

  function grantControl(user, done = () => {}, devices = { keyboard: true, mouse: true, gamepad: false }) {
    const stream = myControlStream();
    if (!stream) return done({ error: 'Não há transmissão disponível para controle.' });
    if(stream===myObsStreamId() && !obsOverlay && (devices.keyboard || devices.mouse))
      return done({error:'Ative as marcações para liberar teclado ou mouse. O gamepad pode ser liberado sozinho.'});
    const protocol = desktop?.controlReset && desktop?.controlPulse ? 1 : 0;
    socket.emit('control:grant', { stream, to: user.id, devices, protocol }, (res) => {
      if (!res || res.error) {
        showToast((res && res.error) || 'Não deu pra dar o controle.');
        done({ error: res?.error || 'Não deu pra dar o controle.' });
        return;
      }
      controlGrants.set(user.id, { to: user.id, name: user.name, stream, devices: res.devices || devices, session: res.session });
      syncHostControl();
      if (res.protocol === 1 && res.receiverToken && desktop?.hostControl) {
        const grant=controlGrants.get(user.id);grant.nativeReceiver=true;
        desktop.hostControl({owner:me.id,peer:user.id,session:res.session,stream,token:res.receiverToken,
          options:transportExperiments.options}).catch(error=>{
          if(controlGrants.get(user.id)?.session!==res.session)return;
          revokeControl(user.id);showToast(error.message||'Receptor de comandos indisponível.');
        });
      } else if (res.protocol === 1) controlTransport.host({ session: res.session, peer: user.id, stream, devices: res.devices || devices });
      chatNote(`${user.name} recebeu as permissões selecionadas (Ctrl+Shift+X revoga tudo)`);
      renderUsers(); // acende o 🎮 na lista (e atualiza o painel, se estiver aberto)
      done({ ok: true });
    });
  }

  function syncHostControl() {
    obsRoutes.sync();
    const people = [...controlGrants.values()];
    desktop?.controlState?.({ on: people.length > 0, name: people.map((p) => p.name).join(', '), hue: 200,
      people: people.map((p) => ({ id: p.to, session: p.session, devices: { ...p.devices, gamepad: p.devices.gamepad && !sharingState.options.gamepadPaused } })) });
  }
  function revokeControl(to) {
    controlTransport.revoke(typeof to === 'string' ? to : undefined);
    if (typeof to === 'string') controlActivityAt.delete(to); else controlActivityAt.clear();
    if (typeof to === 'string') controlGrants.delete(to); else controlGrants.clear();
    syncHostControl(); renderUsers();
    socket.emit('control:revoke', typeof to === 'string' ? { to } : {});
  }
  desktop?.onGamepadError?.((reason) => showToast(reason || 'Falha no gamepad virtual.'));
  desktop?.onInputError?.((reason) => {
    if (desktopCaps) desktopCaps = { ...desktopCaps, control: false };
    showToast(reason || 'Falha no teclado/mouse remoto.'); checkControlTargets();
  });

  if (desktop && typeof desktop.onControlRevoke === 'function') desktop.onControlRevoke(revokeControl);
  // O app repassando o OBS viu AV1 de 10 bits (ou 4:4:4): ninguém vai ver a imagem.
  desktop?.onObsWarning?.((value) => {
    if (value?.type === 'av1') showToast(`O OBS está mandando AV1 de ${value.bitDepth} bits${value.profile ? ' (4:4:4)' : ''}: ninguém vê a imagem. No OBS: Configurações > Avançado > Formato de cor: NV12.`, 20000);
    else if (value?.type === 'keyframe') showToast(`${value.seconds ? `O OBS manda quadro-chave a cada ${value.seconds} s` : 'O OBS passou mais de 10 s sem mandar quadro-chave'}: quem entra fica esse tempo sem imagem. No OBS: Saída > Intervalo de quadro-chave: 1.`, 20000);
  });
  desktop?.onControlBlocked?.(value => {
    const grant = controlGrants.get(value?.from);
    if (!grant || (grant.session || '') !== value.session) return;
    revokeControl(value.from);
    showToast('Controle revogado por excesso de comandos. Confira o participante antes de liberar novamente.');
  });

  // O que quem você deixou controlar fez em cima da sua transmissão (o servidor só manda
  // de quem tem a permissão): vira mouse e teclado de verdade, no app.
  socket.on('control:input', (msg) => {
    if (msg && controlTransport.legacyAllowed(msg.from)) acceptHostInput(msg);
  });
  // Um mouse só (app no Windows): quem controla entrou/saiu do modo controle; o formato do
  // seu mouse vai pra quem pode mexer nele.
  socket.on('control:mode', (msg) => {
    if (desktop && msg && controlGrants.has(msg.from) && typeof desktop.controlMode === 'function') desktop.controlMode({ from: msg.from, on: msg.on === true });
  });
  if (desktop && typeof desktop.onCursorShape === 'function') {
    desktop.onCursorShape((shape) => { if (me) socket.emit('control:cursor', { shape }); });
  }

  // ---- quem assiste: controlar o PC de quem deixou

  const controlAllowed = new Map(); // transmissão -> proprietário e dispositivos permitidos
  let controlling = null; // transmissão que você está controlando agora
  let controlHover = false; // o mouse está em cima dela (o teclado só vai pra lá assim)
  let hudHidden = false; // os botões de cima da transmissão controlada estão escondidos
  let hudKeyDown = false; // o H do Ctrl+Shift+H ainda apertado (a repetição não conta)
  const controlKeys = new Set();
  const controlButtons = new Set();

  // Caiu a conexão: o servidor cancela as permissões dos dois lados.
  function resetControl() {
    stopControlling();
    controlTransport.revoke(); controlActivityAt.clear();
    controlAllowed.clear();
    controlGrants.clear();obsRoutes.sync();
    sharingState = { options: { gamepadPaused: false, maxGamepads: 4 }, people: [], counts: { connected: 0, receiving: 0, allowed: 0, physical: 0 } };
    sharingDrafts.clear(); sharingPeopleKey = ''; sharingOptionsDirty = false; renderSharingDetails();
    for (const s of streams.values()) renderControlButton(s);
  }

  function renderControlButton(s) {
    if (!s.btnControl) return;
    const from = controlAllowed.get(s.id)?.from;
    s.btnControl.hidden = !from;
    s.btnControl.classList.toggle('active', controlling === s.id);
    setIcon(s.btnControl, 'gamepad', controlling === s.id ? 'Parar de controlar' : `Controlar os dispositivos permitidos por ${from || ''}`);
    s.tile.classList.toggle('is-controlling', controlling === s.id);
    const hud = controlling === s.id && hudHidden;
    s.tile.classList.toggle('hud-hidden', hud);
    s.btnHudHide.hidden = controlling !== s.id;
    s.btnHudShow.hidden = !hud;
  }

  // Esconde (ou mostra) tudo que fica por cima da transmissão que você controla: os
  // botões, o aviso, e em tela cheia a barra e o chat. Nada fica por cima do vídeo.
  function setHudHidden(hidden) {
    hudHidden = Boolean(hidden) && Boolean(controlling);
    const s = controlling && streams.get(controlling);
    if (s) renderControlButton(s);
  }

  // Ctrl+Shift+H: fica aqui (não vai pra lá, mesmo com o teclado inteiro indo).
  const hudKeys = () => ['ControlLeft', 'ControlRight'].some((k) => controlKeys.has(k))
    && ['ShiftLeft', 'ShiftRight'].some((k) => controlKeys.has(k))
    && !['AltLeft', 'AltRight'].some((k) => controlKeys.has(k));

  function sendControl(msg) {
    if (!controlling || !controlAllowed.get(controlling)?.devices[window.WssGamepad.kindDevice(msg.kind)]) return;
    if (!controlTransport.send(controlling, msg) && socket.connected) socket.emit('control:input', { stream: controlling, ...msg });
  }

  // Solta tudo que estava apertado do lado de lá (nada fica preso).
  function releaseControl() {
    if (controlling) streams.get(controlling)?.controlPointerReset?.();
    sendControl({ kind: 'gamepad', ...window.WssGamepad.neutral() });
    gamepadClient?.releaseKeys?.(); // as teclas dos botões do controle (ex.: A → Espaço)
    for (const code of controlKeys) sendControl({ kind: 'key', code, down: false });
    for (const button of controlButtons) sendControl({ kind: 'button', button, down: false });
    controlKeys.clear();
    controlButtons.clear();
    if (controlling) controlTransport.stop(controlling);
  }

  // Um mouse só: avisa quem transmite (o app dela esconde o mouse de lá da captura) e o
  // seu mouse em cima da transmissão fica com o formato do de lá.
  function sendControlMode(stream, on) {
    if (controlAllowed.get(stream)?.devices.mouse) socket.emit('control:mode', { stream, on });
  }
  const remoteCursors = new Map(); // transmissão -> formato do mouse de lá (cursor do CSS)
  const CSS_CURSORS = new Set(['default', 'text', 'wait', 'crosshair', 'nwse-resize', 'nesw-resize', 'ew-resize', 'ns-resize', 'move', 'not-allowed', 'pointer', 'progress', 'help', 'none']);
  function applyRemoteCursor(s) {
    const shape = remoteCursors.get(s.id);
    if (shape) s.media.style.setProperty('--remote-cursor', shape);
    else s.media.style.removeProperty('--remote-cursor');
  }
  socket.on('control:cursor', (msg) => {
    if (!msg || !controlAllowed.has(msg.stream) || !CSS_CURSORS.has(msg.shape)) return;
    remoteCursors.set(msg.stream, msg.shape);
    const s = streams.get(msg.stream);
    if (s) applyRemoteCursor(s);
  });

  function stopControlling() {
    if (!controlling) return;
    releaseControl();
    sendControlMode(controlling, false);
    const s = streams.get(controlling);
    controlling = null;
    controlHover = false;
    hudHidden = false;
    syncKeyCapture();
    if (s) renderControlButton(s);
  }

  function toggleControlling(s) {
    if (controlling === s.id) {
      stopControlling();
      return;
    }
    stopControlling();
    if (!controlAllowed.has(s.id)) return;
    controlling = s.id;
    hudHidden = false;
    sendControlMode(s.id, true);
    applyRemoteCursor(s);
    renderControlButton(s);
  }

  // Uma tecla sua indo pro PC de lá: da página ou, no app, do gancho que pega até as
  // teclas do Windows (Win, Alt+Tab, Alt+F4...).
  function forwardKey(code, down) {
    if (down) {
      if (!controlling || !controlHover || !controlAllowed.get(controlling)?.devices.keyboard) return false;
      if (code === 'KeyH' && (hudKeyDown || hudKeys())) {
        if (!hudKeyDown) setHudHidden(!hudHidden);
        hudKeyDown = true;
        return true;
      }
      controlKeys.add(code);
      sendControl({ kind: 'key', code, down: true });
      return true;
    }
    if (code === 'KeyH' && hudKeyDown) {
      hudKeyDown = false;
      return true;
    }
    if (!controlKeys.delete(code)) return false;
    sendControl({ kind: 'key', code, down: false });
    return true;
  }

  // Pegar o teclado inteiro: no app, o gancho do Windows; no navegador, em tela cheia, o
  // Keyboard Lock (só ele deixa a página receber Alt+Tab, a tecla do Windows...).
  let keysCaptured = false;
  const appKeys = () => Boolean(desktop) && typeof desktop.captureKeys === 'function';
  function syncKeyCapture() {
    const want = Boolean(controlling && controlHover && controlAllowed.get(controlling)?.devices.keyboard && document.hasFocus());
    if (want !== keysCaptured) {
      keysCaptured = want;
      if (appKeys()) desktop.captureKeys(want).catch(() => {});
    }
    if (!appKeys() && navigator.keyboard && typeof navigator.keyboard.lock === 'function') {
      if (want && document.fullscreenElement) navigator.keyboard.lock().catch(() => {});
      else navigator.keyboard.unlock();
    }
  }
  if (desktop && typeof desktop.onCapturedKey === 'function') {
    desktop.onCapturedKey((data) => {
      if (data && typeof data.code === 'string') forwardKey(data.code, Boolean(data.down));
    });
  }
  document.addEventListener('fullscreenchange', () => {
    if (controlling) streams.get(controlling)?.controlPointerReset?.();
    syncKeyCapture();
  });
  window.addEventListener('focus', () => syncKeyCapture());

  function enableControl(s) {
    const { media, video } = s;
    const point = (e) => {
      const p = videoPoint(video, e.clientX, e.clientY, true);
      return { x: round4(p.x), y: round4(p.y) };
    };
    const active = () => controlling === s.id;
    const mouseActive = () => active() && controlAllowed.get(s.id)?.devices.mouse;
    const moves = window.WssInputPacing.createLatest({ canSend: mouseActive,
      deliver: e => sendControl({ kind: 'move', ...point(e) }) });
    s.controlPointerReset = () => moves.clear();
    media.addEventListener('pointerenter', () => {
      if (!active()) return;
      controlHover = true;
      syncKeyCapture();
    });
    media.addEventListener('pointerleave', () => {
      moves.clear();
      if (!active()) return;
      controlHover = false;
      syncKeyCapture();
      for (const code of controlKeys) sendControl({ kind: 'key', code, down: false });
      controlKeys.clear();
    });
    media.addEventListener('pointermove', (e) => {
      if (!active()) return;
      if (!controlHover) {
        controlHover = true;
        syncKeyCapture();
      }
      if (!mouseActive()) return;
      // Só calcula geometria quando vai enviar; eventos de alta frequência
      // substituem a posição pendente sem forçar layout a cada callback.
      moves.offer({ clientX: e.clientX, clientY: e.clientY });
    });
    media.addEventListener('pointerdown', (e) => {
      if (!mouseActive() || e.target.closest('.tile-tools')) return;
      moves.clear();
      e.preventDefault();
      try { media.setPointerCapture(e.pointerId); } catch {}
      const button = e.button === 1 ? 1 : e.button === 2 ? 2 : 0;
      controlButtons.add(button);
      sendControl({ kind: 'button', button, down: true, ...point(e) });
    });
    media.addEventListener('pointerup', (e) => {
      moves.clear();
      if (!active()) return;
      const button = e.button === 1 ? 1 : e.button === 2 ? 2 : 0;
      if (!controlButtons.delete(button)) return;
      sendControl({ kind: 'button', button, down: false, ...point(e) });
    });
    media.addEventListener('pointercancel', () => {
      moves.clear();
      if (!active()) return;
      for (const button of controlButtons) sendControl({ kind: 'button', button, down: false });
      controlButtons.clear();
    });
    media.addEventListener('wheel', (e) => {
      if (!mouseActive()) return;
      moves.clear();
      e.preventDefault();
      // dx: rolagem pros lados (Shift + rodinha vira deltaX no navegador; touchpad).
      const notches = (d) => Math.round((e.deltaMode === 1 ? d / 3 : e.deltaMode === 2 ? d * 3 : d / 100) * 100) / 100;
      const dx = notches(e.deltaX || 0);
      sendControl({ kind: 'wheel', dy: notches(e.deltaY || 0), ...(dx ? { dx } : {}), ...point(e) });
    }, { passive: false });
    media.addEventListener('contextmenu', (e) => {
      if (mouseActive()) e.preventDefault();
    });
  }

  // Controlando e com o mouse em cima da transmissão, as teclas vão pro PC de lá (os
  // atalhos da sala ficam de fora).
  window.addEventListener('keydown', (e) => {
    // Com o mouse fora da transmissão, o Ctrl+Shift+H também esconde/mostra os botões.
    if (controlling && !controlHover && e.code === 'KeyH' && e.ctrlKey && e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) setHudHidden(!hudHidden);
      return;
    }
    if (!controlling || !controlHover || !controlAllowed.get(controlling)?.devices.keyboard || e.isComposing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code) forwardKey(e.code, true);
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyH' && hudKeyDown) {
      forwardKey('KeyH', false);
      return;
    }
    if (!controlling || !controlKeys.has(e.code)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    forwardKey(e.code, false);
  }, true);
  window.addEventListener('blur', () => {
    if (controlling) releaseControl();
    syncKeyCapture();
  });

  socket.on('control:granted', ({ stream, from, devices, session, owner, protocol }) => {
    if (controlling === stream) stopControlling();
    controlAllowed.set(stream, { from, owner, session, devices: devices ? window.WssGamepad.permissions(devices) : { keyboard: true, mouse: true, gamepad: false } });
    if (protocol === 1 && session && owner) controlTransport.guest({ session, peer: owner, stream, devices });
    const s = streams.get(stream);
    if(s?.obsDirect)obsRoutes.lost(s);
    if (s) {s.directCooldown=0;obsRoutes.watch(s);renderControlButton(s);}
    chatNote(`${from} liberou dispositivos para você na transmissão`);
    showToast(`${from} liberou controle: clique no 🎮 em cima da transmissão.`);
  });

  socket.on('control:revoked', ({ stream, mine, to }) => {
    if (mine) {
      if (to) controlGrants.delete(to); else controlGrants.clear();
      syncHostControl();
      renderUsers(); // apaga o 🎮 na lista (e atualiza o painel, se estiver aberto)
      return;
    }
    const from = controlAllowed.get(stream)?.from;
    if (controlling === stream) stopControlling();
    controlAllowed.delete(stream);
    const tile=streams.get(stream);if(tile)obsRoutes.lost(tile);
    remoteCursors.delete(stream);
    const s = streams.get(stream);
    if (s) renderControlButton(s);
    if (from) chatNote(`${from} tirou o seu controle`);
  });

  window.WssGamepadClient.start({
    canSend: () => Boolean(controlling && document.hasFocus() && !document.hidden && !controlDialog.open && !sharingDialog.open && !captureDialog.open && controlAllowed.get(controlling)?.devices.gamepad),
    send: (state) => sendControl({ kind: 'gamepad', ...state }),
    // Botões do controle como teclas: precisa do gamepad e do teclado liberados.
    canSendKeys: () => Boolean(controlling && controlAllowed.get(controlling)?.devices.keyboard),
    sendKey: (code, down) => sendControl({ kind: 'key', code, down }),
    panel: $('gamepad-config'),
    onStatus: (status) => { for (const [stream, grant] of controlAllowed) if (grant.devices.gamepad) socket.emit('control:presence', { stream, ...status, sending: status.sending && controlling === stream }); },
  }).then(client => { gamepadClient = client; });

  // Contrato usado pelo app local. O adaptador de DOM fica apenas como compatibilidade
  // com servidores antigos; estas operações trabalham sobre o estado real da sala.
  window.wssRoomSettings = Object.freeze({
    version: 1,
    async read(section) {
      if (!me) return { available: false, reason: 'Entre na sala para acessar estas configurações.' };
      if(section==='obs-publication' && desktop?.obsLocal){
        const p=await getObsPublication();return {path:p.path,token:p.token,expiresAt:p.expiresAt-serverOffset};
      }
      if (section === 'diagnostics') return { available: true, diagnostics: diagOutput.textContent, running: diagRunning };
      if (section === 'media') return { available: true, capture: captureSnapshot(), overlay: { share: desktopOverlay, obs: obsOverlay }, controls: [...controlTransport.snapshot(),...await desktop?.receiverSnapshot?.()||[]], streams: [...streams.values()].map((s) => ({ id: s.id, watching: s.watching, state: s.pc?.connectionState, health: s.healthStats, metrics: s.videoMetrics || null, receiverTargets: Object.values(s.receiverTargets || {}), latencyRecoveries: s.latencyRecoveries || 0 })) };
      if (section === 'obs' || section === 'obs-overlay') {
        const info = await desktop?.displays?.();
        if (section === 'obs-overlay') return {available:true, displays:info?.displays || [],
          overlaySupported:Boolean(info?.overlay), obsDisplay:info?.obsDisplay || 'off'};
        const publication = serverStatus.obs ? await getObsPublication() : null;
        const local=desktop?.obsLocal && publication?.individual ? await configureLocalObs() : null;
        return { available: true, supported: Boolean(serverStatus.obs), name: me.name,local:Boolean(local),
          authRequired: Boolean(publication?.individual || serverStatus.obsAuthRequired),
          individual: Boolean(publication?.individual),
          token: local?.token || publication?.token || null,
          url: local?.url || publication?.url || `${location.origin}/obs/${encodeURIComponent(me.name)}`,
          certificateWarning: !local && location.protocol === 'https:' && !serverStatus.certificate,
          overlaySupported: Boolean(info?.overlay), displays: info?.displays || [], obsDisplay: info?.obsDisplay || 'off' };
      }
      const photo = profileAvatars.get(me.name) || null;
      const photoColors = await window.WssColor.loadPalette(photo);
      const problem = !desktopCaps?.control ? 'O controle remoto está indisponível ou as marcações estão desligadas.'
        : !myControlStream() ? 'Transmita a tela inteira para permitir controle remoto.' : '';
      return { available: true, name: me.name, photo: photo ? new URL(photo, location.href).href : null, photoColors, color: myColor, legacyHue: myHue, style: absoluteStyle(myFull), styleImages: true,
        look: myLookSettings, autoFill: `hsl(${autoHue(me.name)} 45% 42%)`, markColor: markFill(toneOf(me.name)), recent: recentColors(),
        // shareCursor: o padrão das transmissões (o seu mouse agora liga em cada uma).
        shareCursor: cursorDefault, cursorPerStream: true, showCursors, sounds: sounds.enabled, presets: [...COLOR_PRESETS], controlsAvailable: true,
        experiments: transportExperiments.snapshot(),
        gamepad: desktopCaps?.gamepad, gamepadOnly:Boolean(myControlStream() && myControlStream()===myObsStreamId() && !obsOverlay), controlNote: problem, controlPeople: [...users.values()].filter((u) => u.kind !== 'obs' && u.id !== me.id)
          .map((u) => ({ name: u.name, active: controlGrants.has(u.id), devices: controlGrants.get(u.id)?.devices || { keyboard: false, mouse: false, gamepad: false }, disabled: Boolean(problem) })),
        // Com contas: o nick e se ela abre a administração.
        account: accountsMode && account ? { nick: account.nick, admin: Boolean(account.admin) } : null,
        diagnostics: diagOutput.textContent, serverVersion: sidebarVersionEl.textContent,
        shortcuts: [...keysDialog.querySelectorAll('dt')].filter((node) => !node.hidden && !node.nextElementSibling?.hidden)
          .map((node) => ({ keys: node.textContent.trim(), action: node.nextElementSibling?.textContent.trim() || '' })) };
    },
    async action(command) {
      if (!me) throw new Error('Entre na sala para usar esta configuração.');
      if (command.type === 'report-preview') return reporting.preview();
      if (command.type === 'profile-look') {
        myLookSettings = window.WssProfileLook.normalize(command.look);
        try { localStorage.setItem('wss-profile-look', JSON.stringify(myLookSettings)); } catch {}
        socket.emit('profile', {look:myLookSettings});
        renderUsers();
        return {ok:true};
      }
      if (command.type === 'report-consent') return reporting.setConsent(command.enabled);
      if (command.type === 'report-send') return reporting.submit(command.id, command.description);
      if (command.type === 'experiment') return { ok: true, experiments: transportExperiments.set(command.key, command.enabled) };
      if (command.type === 'color') {
        if (command.color) pickerFrom(command.color);
        setMyColor(command.color, command.commit ? 'now' : undefined);
      } else if (command.type === 'cursor') {
        if (command.field === 'share') setCursorDefault(command.enabled);
        else {
          showCursors = command.enabled;
          localStorage.setItem('wss-show-cursors', showCursors ? '1' : '0');
          if (!showCursors) clearPeerCursors();
        }
        if (controlDialog.open) renderControlPanel();
      } else if (command.type === 'sounds') { sounds.enabled = command.enabled; }
      else if (command.type === 'style') { setMyStyle(command.style); }
      else if (command.type === 'fx-image') {
        const bytes = Uint8Array.from(atob(command.data), (c) => c.charCodeAt(0));
        const res = await uploadFxImage(command.kind, new File([bytes], command.name, { type: command.mime }));
        if (res.error) throw new Error(res.error);
        return { ok: true, url: new URL(res.url, location.href).href, hx: res.hx, hy: res.hy };
      } else if (command.type === 'fx-image-remove') {
        const res = await removeFxImage(command.kind);
        if (res.error) throw new Error(res.error);
      }
      else if (command.type === 'photo' || command.type === 'photo-remove') {
        const blob = command.type === 'photo' ? await preparePhoto(new File([Uint8Array.from(atob(command.data), (c) => c.charCodeAt(0))], command.name, { type: command.mime })) : null;
        const response = await sendPhoto(blob);
        if (response.error) throw new Error(response.error);
        if (!(await photoStore.set(blob))) showToast('A foto foi aplicada, mas não foi possível salvá-la neste PC.');
        renderProfileDialog();
      } else if (command.type === 'account-nick') {
        const res = await changeNick(command.nick);
        if (res.error) throw new Error(res.error);
        return { ok: true, nick: res.nick };
      } else if (command.type === 'account-password') {
        const res = await changePassword(command.current, command.next);
        if (res.error) throw new Error(res.error);
      } else if (command.type === 'admin-open') {
        if (!account || !account.admin) throw new Error('Só contas com administração.');
        openAdmin();
      } else if (command.type === 'performance-report') return { ok: true, report: await performanceReport() };
      else if (command.type === 'diagnostics') { runDiagnostics(); }
      else if (command.type === 'obs-check') return { ok: true, check: await obsPortCheck() };
      else if (command.type === 'check-updates') return { ok: true, message: await checkUpdatesNow() };
      else if (command.type === 'obs-display') {
        const info = await desktop?.displays?.();
        if (!info?.overlay || (command.value !== 'off' && !info.displays.some((d) => String(d.id) === command.value))) throw new Error('O monitor selecionado não está mais conectado.');
        const result = await desktop.setObsDisplay(command.value);
        if (result.error) throw new Error(result.error);
        obsOverlay = obsOverlayWanted && Boolean(result.overlay); renderObsOverlayTag(); checkControlTargets();
      } else if (command.type === 'control') {
        if (!command.grant) { const target = [...users.values()].find((u) => u.name === command.name); if (target) revokeControl(target.id); return { ok: true }; }
        if (typeof desktop?.caps === 'function') desktopCaps = await desktop.caps().catch(() => desktopCaps);
        const user = [...users.values()].find((u) => u.name === command.name && u.id !== me.id && u.kind !== 'obs');
        if (!user || !canGrantControl() || !myControlStream()) throw new Error('Controle remoto indisponível para essa pessoa.');
        const result = await new Promise((resolve) => grantControl(user, resolve, command.devices));
        if (result.error) throw new Error(result.error);
      } else throw new Error('Comando não reconhecido.');
      return { ok: true };
    },
  });

  renderShareButton();
  const reporting = window.WssDiagnosticClient({ socket, member: () => me, desktop,
    capture: () => ({ ...captureOptions, nativeCapture: Boolean(localNative), experiments: transportExperiments.snapshot().active }),
    streams: () => [
      ...[...outgoing].map(([peer,s]) => ({ peer, direction:'envio', state:s.pc?.connectionState, route:s.diagnosticRoute, metrics:s.metrics })),
      ...[...streams.values()].filter(s=>s.watching).map(s=>({ peer:s.id, direction:'recepção', state:s.pc?.connectionState, route:s.diagnosticRoute, metrics:s.videoMetrics }))
    ], version: () => desktop?.version || pageVersion });
  // ---------- compartilhamento de dados: a pergunta da primeira vez ----------
  // Começa desligado. Com o painel /admin ligado (alguém vê os dados), na primeira vez que
  // a pessoa entra na sala por este servidor (neste navegador ou app), a sala pergunta com
  // destaque. Só os botões decidem; Esc fecha e pergunta de novo da próxima vez que abrir.
  const consentDialog = $('consent-dialog');
  function maybeAskConsent() {
    if (!serverStatus.adminPanel || reporting.decided() || consentDialog.open) return;
    try {
      if (sessionStorage.getItem('wss-consent-asked')) return;
      sessionStorage.setItem('wss-consent-asked', '1');
    } catch {}
    consentDialog.showModal();
  }
  function decideConsent(yes) {
    reporting.setConsent(yes);
    consentDialog.close();
    if (yes) showToast('Obrigado! O compartilhamento de dados está ligado.');
  }
  $('consent-yes').addEventListener('click', () => decideConsent(true));
  $('consent-no').addEventListener('click', () => decideConsent(false));
  // Escolheu em outra aba: esta fecha também.
  window.addEventListener('storage', () => { if (consentDialog.open && reporting.decided()) consentDialog.close(); });
  const obsRoutes=window.createObsRoutes({socket,desktop,streams,grants:controlGrants,allowed:controlAllowed,getIce:getIceServers,iceDone:iceGatheringDone,
    activate(s,r,media){
      s.obsDirect=null;closeIncoming(s);s.obsDirect=r;r.active=true;
      s.pc=r.pc;s.tile.dataset.obsRoute='direta';s.video.srcObject=media;s.hasAudio=media.getAudioTracks().length>0;
      playVideo(s);renderAudio(s);setStatus(s,'');startVideoHealth(s,r.pc);
    },fallback:requestWatch});
  socket.connect();
  loadServerStatus();
})();
