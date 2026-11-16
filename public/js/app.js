(() => {
  const PRESETS = window.QUALITY_PRESETS;
  const DEFAULT_QUALITY = window.DEFAULT_QUALITY;
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
  const obsDialog = $('obs-dialog');
  const obsUrlInput = $('obs-url');
  const obsCopyBtn = $('obs-copy');
  const obsNickEl = $('obs-nick');
  const obsCheckEl = $('obs-check');
  const obsCertEl = $('obs-cert');
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
  const btnSounds = $('btn-sounds');
  const keysDialog = $('keys-dialog');
  const btnVoice = $('btn-voice');
  const voiceControls = $('voice-controls');
  const voicePeople = $('voice-people');
  const btnMic = $('btn-mic');
  const btnDeafen = $('btn-deafen');
  const btnVoiceLeave = $('btn-voice-leave');
  const voiceSection = $('voice-section');
  const voiceCountEl = $('voice-count');
  const voiceListEl = $('voice-list');
  const sounds = window.RoomSounds;

  const socket = io();
  // Identifica esta aba entre reconexões do socket, pro servidor derrubar o
  // socket antigo ("fantasma") em vez de duplicar a pessoa na sala.
  const clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const iceServersPromise = fetch('/ice-servers')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))))
    .catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]);
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
  let selfTile = null;
  const outgoing = new Map(); // viewerId -> { pc, sid, quality, pending }
  const streams = new Map(); // broadcasterId -> estado do tile de quem está transmitindo
  let sidCounter = 0;
  let signalQueue = Promise.resolve();
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

  // Cor de cada pessoa (avatar, nome no chat, marcação na tela), sempre a mesma pro nick.
  function nameHue(name) {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return hash % 360;
  }

  function paintAvatar(node, name) {
    node.textContent = [...name][0] || '?';
    node.style.setProperty('--avatar', `hsl(${nameHue(name)} 45% 42%)`);
    return node;
  }

  function avatar(name) {
    return paintAvatar(el('span', 'avatar'), name);
  }

  function exitFullscreen() {
    const result = document.exitFullscreen && document.exitFullscreen();
    if (result && result.catch) result.catch(() => {});
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
  }

  // ---------- login / sala ----------

  try { nickInput.value = localStorage.getItem('wss-nick') || ''; } catch {}

  function setPageVersion(version) {
    if (pageVersion || !version) return;
    pageVersion = version;
    const label = version === 'dev' ? 'versão de desenvolvimento' : `versão ${version}`;
    loginVersionEl.textContent = label;
    sidebarVersionEl.textContent = label;
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

  fetch('/status', { cache: 'no-store' })
    .then((res) => res.json())
    .then((status) => {
      serverStatus = status;
      setPageVersion(status.version);
      showCertificateWarning(status.certificate);
      btnObs.hidden = !status.obs;
      if (status.proxy) {
        proxyBanner.textContent = proxyWarningText(status.proxy.port);
        proxyBanner.hidden = false;
      }
    })
    .catch(() => {});

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
    loginBtn.disabled = false;
    loginBtn.textContent = 'Entrar';
    loginError.textContent = error || '';
    nickInput.focus();
  }

  function showApp() {
    loginEl.hidden = true;
    appEl.hidden = false;
    meNameEl.textContent = me.name;
    paintAvatar(meAvatarEl, me.name);
    renderAll();
  }

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nickInput.value.replace(/\s+/g, ' ').trim();
    if (!name) {
      loginError.textContent = 'Digite um nick.';
      return;
    }
    wantedName = name;
    try { localStorage.setItem('wss-nick', name); } catch {}
    sounds.unlock(); // o navegador só libera som depois de um clique
    loginBtn.disabled = true;
    loginBtn.textContent = socket.connected ? 'Entrando…' : 'Conectando ao servidor…';
    loginError.textContent = '';
    if (socket.connected) join();
  });

  function join() {
    socket.emit('join', { name: wantedName, clientId }, (res) => {
      if (!res || res.error) {
        wantedName = null;
        stopSharing();
        showLogin((res && res.error) || 'Não foi possível entrar na sala.');
        return;
      }
      me = { id: res.me.id, name: res.me.name };
      if (Number.isFinite(res.now)) serverOffset = res.now - Date.now();
      // Voltando de uma queda (ou do app atualizando), os outros reconectam junto com
      // você: isso não vira aviso de "entrou" nem de "começou a transmitir".
      if (joinedBefore) quietUntil = Date.now() + 8000;
      joinedBefore = true;
      setPageVersion(res.version);
      // O container reinicia ao atualizar e o socket reconecta sozinho, mas esta
      // página continua com o código antigo até ser recarregada.
      updateBanner.hidden = !res.version || res.version === pageVersion;
      users.clear();
      for (const u of res.users) users.set(u.id, u);
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

  function prefsFor(key) {
    const saved = streamPrefs.get(key);
    if (saved && (saved.endedAt == null || Date.now() - saved.endedAt < RESUME_WINDOW_MS)) {
      saved.endedAt = null;
      return saved;
    }
    if (pinnedKey === key) pinnedKey = null;
    const prefs = { watching: true, muted: true, volume: 1, quality: DEFAULT_QUALITY, endedAt: null };
    streamPrefs.set(key, prefs);
    return prefs;
  }

  function leaveRoomLocally() {
    me = null;
    // Continua "na voz": ao reconectar, as conexões de voz são refeitas.
    for (const id of [...voicePeers.keys()]) closeVoicePeer(id);
    for (const id of [...outgoing.keys()]) closeOutgoing(id);
    for (const id of [...streams.keys()]) removeStreamTile(id);
    users.clear();
    renderAll();
  }

  btnLeave.addEventListener('click', () => {
    leaveVoice();
    streamPrefs.clear();
    pinnedKey = null;
    chatSeenId = null;
    joinedBefore = false;
    stopSharing();
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
    if (wantedName) join();
  });

  socket.on('disconnect', () => {
    setConnection(false);
    if (me) leaveRoomLocally();
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
    const gone = users.get(id);
    if (gone && gone.kind !== 'obs') announceLeave(gone.name);
    closeVoicePeer(id);
    users.delete(id);
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

  // Uma linha por pessoa. A transmissão do OBS de quem está na sala (mesmo nick) entra
  // na linha dessa pessoa; a de quem só está no OBS, sem a página aberta, fica sozinha.
  function roomEntries() {
    const myId = me && me.id;
    const entries = [];
    const byName = new Map();
    for (const u of users.values()) {
      if (u.kind === 'obs') continue;
      const entry = { user: u, live: Boolean(u.sharing), obs: false, streamIds: u.sharing && u.id !== myId ? [u.id] : [] };
      entries.push(entry);
      if (!byName.has(u.name)) byName.set(u.name, entry);
    }
    for (const u of users.values()) {
      if (u.kind !== 'obs') continue;
      const entry = byName.get(u.name);
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
    const myId = me && me.id;
    const list = roomEntries().sort((a, b) =>
      (b.user.id === myId) - (a.user.id === myId) || b.live - a.live || a.user.name.localeCompare(b.user.name));
    userCountEl.textContent = list.length;
    userListEl.replaceChildren(...list.map((entry) => {
      const u = entry.user;
      const li = el('li', entry.live ? 'user is-live' : 'user');
      const face = avatar(u.name);
      if (u.voice) face.dataset.voiceId = u.id;
      li.append(face, el('span', 'user-name', u.name));
      if (u.voice) li.append(voiceStateIcon(u.voice, 'user-voice'));
      if (u.id === myId) li.append(el('span', 'user-you', 'você'));
      if (entry.obs) li.append(el('span', 'tag tag-obs', 'OBS'));
      const tiles = entry.streamIds.map((id) => streams.get(id)).filter(Boolean);
      const watched = tiles.find((s) => s.watching);
      const unwatched = tiles.filter((s) => !s.watching);
      const resume = () => unwatched.forEach(resumeWatching);
      if (unwatched.length) {
        const btn = el('button', 'watch-btn');
        btn.type = 'button';
        btn.title = `Assistir a tela de ${u.name}`;
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
        li.title = watched ? `Ir para a tela de ${u.name}` : `Assistir a tela de ${u.name}`;
        const go = () => (watched ? focusTile(watched.id) : resume());
        li.addEventListener('click', go);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      }
      return li;
    }));
    const live = list.filter((entry) => entry.live).length;
    liveCountEl.textContent = live ? `${live} ao vivo` : '';
    peopleCountEl.textContent = list.length;
    const unwatched = [...streams.values()].some((s) => !s.watching);
    btnPeople.classList.toggle('has-unwatched', unwatched);
    btnPeople.title = unwatched
      ? 'Pessoas na sala (tem transmissão que você parou de assistir)'
      : 'Pessoas na sala';
    renderVoice();
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
    btnShare.disabled = !me;
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
    if ([...streams.values()].some((s) => !s.watching)) {
      emptyTitle.textContent = 'Você não está assistindo nenhuma transmissão';
      emptyHint.textContent = 'Tem transmissão no ar: abra a lista de pessoas e clique em Assistir.';
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
    tile.append(media, bar);
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
      base.video.srcObject = localStream;
      const meta = el('div', 'tile-meta');
      const viewers = el('span', 'tile-viewers');
      meta.append(viewers);
      if (!localStream.getAudioTracks().length) meta.append(el('span', 'tag', 'sem áudio'));
      base.bar.append(meta);
      selfTile = { ...base, viewers };
      // Quem transmite também pode apontar na própria tela, pra quem está assistindo.
      enableMarkup(base, () => me && me.id);
      gridInner.prepend(base.tile);
      layoutGrid();
      renderUptimes();
    }
    const names = [...outgoing.entries()]
      .filter(([, o]) => o.pc.connectionState === 'connected')
      .map(([id]) => users.get(id))
      .filter(Boolean)
      .map((u) => u.name);
    selfTile.viewers.replaceChildren(icon('eye'), String(names.length));
    selfTile.viewers.title = names.length ? `Assistindo: ${names.join(', ')}` : 'Ninguém assistindo ainda';
  }

  // ---------- transmitir ----------

  btnShare.addEventListener('click', () => {
    if (localStream) stopSharing();
    else startSharing();
  });

  async function startSharing() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        // Sem isso, o áudio do sistema leva junto a voz dos outros e o som das outras
        // transmissões que tocam nesta página (eco pra quem assiste). Navegador antigo
        // ignora.
        audio: { restrictOwnAudio: true },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
      });
    } catch (err) {
      if (err.name !== 'NotAllowedError') showToast(`Não foi possível compartilhar a tela: ${err.message}`);
      return;
    }
    if (!me || localStream) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    localStream = stream;
    shareStartedAt = Date.now();
    // Botão nativo "Parar de compartilhar" do navegador.
    stream.getVideoTracks()[0].addEventListener('ended', stopSharing);
    users.get(me.id).sharing = true;
    socket.emit('share', true, shareStartedAt + serverOffset);
    renderSelfTile();
    renderAll();
  }

  function stopSharing() {
    if (!localStream) return;
    if (me) {
      socket.emit('share', false);
      users.get(me.id).sharing = false;
    }
    for (const id of [...outgoing.keys()]) closeOutgoing(id);
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    shareStartedAt = null;
    renderSelfTile();
    renderAll();
  }

  function send(to, data) {
    socket.emit('signal', { to, data });
  }

  async function startOutgoing(viewerId, quality) {
    closeOutgoing(viewerId);
    const iceServers = await iceServersPromise;
    if (!localStream || !users.has(viewerId)) return;
    const pc = new RTCPeerConnection({ iceServers });
    const o = { pc, sid: ++sidCounter, quality: PRESETS[quality] ? quality : DEFAULT_QUALITY, pending: [] };
    outgoing.set(viewerId, o);
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

    pc.onicecandidate = (e) => {
      if (e.candidate) send(viewerId, { stream: me.id, sid: o.sid, type: 'candidate', candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && outgoing.get(viewerId) === o) closeOutgoing(viewerId);
      renderSelfTile();
    };

    const offer = await pc.createOffer();
    if (outgoing.get(viewerId) !== o) return;
    await pc.setLocalDescription(offer);
    send(viewerId, { stream: me.id, sid: o.sid, type: 'offer', sdp: pc.localDescription });
  }

  function closeOutgoing(viewerId) {
    const o = outgoing.get(viewerId);
    if (!o) return;
    outgoing.delete(viewerId);
    o.pc.close();
    renderSelfTile();
  }

  function applyQuality(o) {
    if (!o.pc.remoteDescription) return;
    const preset = PRESETS[o.quality];
    const sender = o.pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].scaleResolutionDownBy = preset.scaleResolutionDownBy;
    params.encodings[0].maxBitrate = preset.maxBitrate;
    params.encodings[0].maxFramerate = preset.maxFramerate;
    sender.setParameters(params).catch((err) => console.warn('setParameters falhou', err));
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
    if (!candidate) return;
    if (!entry.pc.remoteDescription) {
      entry.pending.push({ candidate, address });
      return;
    }
    for (const c of [candidate, withPeerAddress(candidate, address)]) {
      if (!c) continue;
      try {
        await entry.pc.addIceCandidate(c);
      } catch (err) {
        console.warn('Falha ao adicionar ICE candidate', err);
      }
    }
  }

  async function flushPending(entry) {
    for (const { candidate, address } of entry.pending.splice(0)) await addCandidate(entry, candidate, address);
  }

  // ---------- sinalização ----------

  // Processa em ordem: um candidate não pode ser aplicado antes do offer/answer
  // da mesma conexão terminar de ser processado.
  socket.on('signal', ({ from, address, data }) => {
    signalQueue = signalQueue
      .then(() => handleSignal(from, data, address))
      .catch((err) => console.warn('Erro de sinalização', err));
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
      if (localStream) await startOutgoing(viewerId, data.quality);
      return;
    }
    if (data.type === 'unwatch') {
      closeOutgoing(viewerId);
      return;
    }
    const o = outgoing.get(viewerId);
    if (!o) return;
    if (data.type === 'quality' && PRESETS[data.quality]) {
      o.quality = data.quality;
      applyQuality(o);
    }
    if (data.sid !== o.sid) return;
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
    if (data.type === 'offer') {
      closeIncoming(s);
      const iceServers = await iceServersPromise;
      if (!s.watching || streams.get(broadcasterId) !== s) return;
      const pc = new RTCPeerConnection({ iceServers });
      s.pc = pc;
      s.sid = data.sid;

      pc.ontrack = (e) => {
        if (s.pc !== pc) return;
        const stream = e.streams[0];
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
      await flushPending(s);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
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
  }

  // ---------- assistir uma transmissão do OBS (WHEP) ----------

  const NO_H264_TEXT = 'Este navegador não decodifica H.264, o formato de vídeo do OBS. '
    + 'No Firefox (e no Zen), ative o plugin OpenH264 em about:addons > Plugins e reinicie o navegador; '
    + 'ou assista pelo Chrome ou pelo Edge.';

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

  async function startWhep(s) {
    const attempt = s.attempt;
    const current = () => s.attempt === attempt && s.watching && streams.get(s.id) === s;
    const iceServers = await iceServersPromise;
    if (!current()) return;
    const pc = new RTCPeerConnection({ iceServers });
    s.pc = pc;
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const media = new MediaStream();
    pc.ontrack = (e) => {
      if (s.pc !== pc) return;
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
        headers: { 'Content-Type': 'application/sdp' },
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
          setStatus(s, NO_H264_TEXT, false);
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

  btnObs.addEventListener('click', () => {
    if (!me) return;
    obsUrlInput.value = `${window.location.origin}/obs/${encodeURIComponent(me.name)}`;
    obsNickEl.textContent = me.name;
    obsCopyBtn.textContent = 'Copiar';
    // O OBS confere o certificado e recusa o autoassinado.
    obsCertEl.hidden = window.location.protocol !== 'https:' || Boolean(serverStatus.certificate);
    obsDialog.showModal();
    checkObsPort();
  });

  obsCopyBtn.addEventListener('click', async () => {
    obsUrlInput.select();
    try {
      await navigator.clipboard.writeText(obsUrlInput.value);
    } catch {
      document.execCommand('copy');
    }
    obsCopyBtn.textContent = 'Copiado!';
  });

  obsDialog.addEventListener('click', (e) => {
    if (e.target === obsDialog) obsDialog.close(); // clique fora do cartão
  });

  // O OBS manda o vídeo pelo TURN em UDP (não sabe usar TURN por TCP). Testa daqui se
  // essa porta está publicada, que é o passo que mais fica pra trás no CasaOS.
  async function checkObsPort() {
    const servers = await iceServersPromise;
    let server = null;
    let url = null;
    for (const candidate of servers) {
      url = [].concat(candidate.urls).find((u) => /^turn:.*transport=udp/.test(u));
      if (url) {
        server = candidate;
        break;
      }
    }
    if (!server) {
      obsCheckEl.hidden = true;
      return;
    }
    if (serverStatus.proxy) {
      obsCheckEl.hidden = false;
      obsCheckEl.className = 'obs-check is-bad';
      obsCheckEl.textContent = proxyWarningText(serverStatus.proxy.port);
      return;
    }
    const port = (url.match(/:(\d+)\?/) || [])[1] || '3000';
    obsCheckEl.hidden = false;
    obsCheckEl.className = 'obs-check';
    obsCheckEl.textContent = `Testando a porta ${port}/UDP do servidor…`;
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
    if (!obsDialog.open) return;
    obsCheckEl.className = ok ? 'obs-check is-ok' : 'obs-check is-bad';
    obsCheckEl.textContent = ok
      ? `Porta ${port}/UDP do servidor respondendo: é por ela que o OBS manda o vídeo.`
      : `A porta ${port}/UDP do servidor não respondeu daqui, e o OBS precisa dela pra mandar o vídeo. No CasaOS, edite o app e adicione a porta ${port} → 3478 com protocolo UDP (veja o README).`;
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
        headers: { 'Content-Type': 'application/sdp' },
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
      const servers = await iceServersPromise;
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
      print(`${mark(h264)} Decodifica H.264 (o codec do OBS): ${h264 ? 'sim' : 'não'} (codecs: ${codecs.join(', ') || 'desconhecidos'})`);
      if (!h264) print(`  ${NO_H264_TEXT}`);
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

  $('btn-diag').addEventListener('click', () => {
    diagDialog.showModal();
    runDiagnostics();
  });
  $('diag-again').addEventListener('click', runDiagnostics);
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
    const isMine = isObs && me && user.name === me.name;
    const base = createTile(user.name, isMine ? 'Você' : user.name, user.kind);
    const key = streamKey(user);
    // Toda transmissão nova começa tocando sem som (inclusive a sua do OBS, cujo som
    // voltaria pro OBS pelo áudio do PC); uma que voltou fica como você deixou.
    const prefs = prefsFor(key);
    const s = {
      ...base,
      id: user.id,
      key,
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
      quality: PRESETS[prefs.quality] ? prefs.quality : DEFAULT_QUALITY,
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
    Object.assign(s, { qualitySelect, btnStats, btnPin, btnPip, stats, audio, btnMute, slider, btnReact, reactPop });

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
    base.video.addEventListener('dblclick', () => toggleFullscreen(s));
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

    streams.set(user.id, s);
    gridInner.append(s.tile);
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
    streams.delete(id);
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
    if (s.kind === 'obs') startWhep(s);
    else send(s.id, { stream: s.id, type: 'watch', quality: s.quality });
  }

  // Parar de assistir tira o quadro da tela (pra sobrar espaço pras outras
  // transmissões); pra voltar, é o botão Assistir na lista de pessoas.
  function stopWatching(s) {
    s.watching = false;
    s.prefs.watching = false;
    if (pinnedKey === s.key) pinnedKey = null;
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
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
    s.attempt += 1;
    if (s.whepUrl) {
      fetch(s.whepUrl, { method: 'DELETE', keepalive: true }).catch(() => {});
      s.whepUrl = null;
    }
    if (s.pc) {
      s.pc.close();
      s.pc = null;
    }
    s.sid = null;
    s.pending = [];
    s.video.srcObject = null;
  }

  function scheduleRetry(s) {
    if (s.retryTimer) return;
    s.retryTimer = setTimeout(() => {
      s.retryTimer = null;
      if (s.watching && streams.get(s.id) === s) requestWatch(s);
    }, 3000);
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
  // deixa aberta até clicar fora, apertar Esc ou no botão de novo.
  const desktopLayout = window.matchMedia('(min-width: 761px)');
  const SIDEBAR_EDGE_PX = 8;
  const SIDEBAR_HIDE_MS = 400;
  let sidebarPinned = false;
  let sidebarTimer = null;

  function setSidebar(open, pinned = false) {
    clearTimeout(sidebarTimer);
    sidebarTimer = null;
    sidebarPinned = open && pinned;
    appEl.classList.toggle('show-sidebar', open);
    btnPeople.setAttribute('aria-expanded', String(open));
  }

  btnPeople.addEventListener('click', () => {
    setSidebar(!(appEl.classList.contains('show-sidebar') && sidebarPinned), true);
  });
  $('btn-sidebar-close').addEventListener('click', () => setSidebar(false));

  document.addEventListener('pointermove', (e) => {
    if (!desktopLayout.matches || appEl.hidden || document.fullscreenElement || e.pointerType === 'touch') return;
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
    if (s.statsTimer) {
      stopStats(s);
      return;
    }
    s.stats.hidden = false;
    s.btnStats.classList.add('active');
    s.lastBytes = null;
    s.lastObs = null;
    const tick = async () => {
      s.stats.textContent = await describeStats(s).catch(() => 'Estatísticas indisponíveis.');
    };
    tick();
    s.statsTimer = setInterval(tick, 1000);
  }

  function stopStats(s) {
    clearInterval(s.statsTimer);
    s.statsTimer = null;
    s.stats.hidden = true;
    s.btnStats.classList.remove('active');
  }

  async function describeStats(s) {
    const pc = s.pc;
    if (!pc) return 'Sem conexão.';
    const report = await pc.getStats();
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
    let route = '—';
    if (local) {
      if (local.candidateType === 'relay') route = 'via servidor TURN (relay)';
      else if (local.candidateType === 'host') route = 'direta (rede local)';
      else route = 'direta (P2P)';
      const remoteAddress = remote && (remote.address || remote.ip);
      if (remoteAddress) route += `, ${remoteAddress}`;
    }
    const lines = [
      `Conexão: ${CONNECTION_LABELS[pc.connectionState] || pc.connectionState}`,
      `Rota: ${route}`,
    ];
    if (video) {
      const codec = video.codecId && report.get(video.codecId);
      if (codec && codec.mimeType) lines.push(`Codec: ${codec.mimeType.replace(/^video\//, '')}`);
      if (video.frameWidth) lines.push(`Resolução: ${video.frameWidth}×${video.frameHeight}`);
      if (video.framesPerSecond != null) lines.push(`Quadros: ${Math.round(video.framesPerSecond)} fps`);
      if (s.lastBytes && video.bytesReceived >= s.lastBytes.bytes && video.timestamp > s.lastBytes.ts) {
        const kbps = ((video.bytesReceived - s.lastBytes.bytes) * 8) / (video.timestamp - s.lastBytes.ts);
        lines.push(`Taxa: ${(kbps / 1000).toFixed(1)} Mbps`);
      }
      s.lastBytes = { bytes: video.bytesReceived, ts: video.timestamp };
    }
    if (pair && pair.currentRoundTripTime != null) {
      lines.push(`Latência: ${Math.round(pair.currentRoundTripTime * 1000)} ms`);
    }
    if (s.kind === 'obs') lines.push(...(await describeObsSource(s)));
    return lines.join('\n');
  }

  // Trecho do OBS até o servidor. Pacote perdido ali vira imagem "derretida" pra todo
  // mundo até o próximo quadro-chave do OBS, e não aparece nas estatísticas acima.
  async function describeObsSource(s) {
    let st;
    try {
      const res = await fetch(`/mtx/${encodeURIComponent(s.stream)}/stats`, { cache: 'no-store' });
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
    const now = Date.now();
    if (selfTile && shareStartedAt) selfTile.uptime.textContent = formatUptime(now - shareStartedAt);
    for (const s of streams.values()) {
      if (!s.tile.hidden) s.uptime.textContent = formatUptime(now + serverOffset - s.since);
    }
  }

  setInterval(renderUptimes, 1000);

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
    const target = fxTarget(stream);
    if (!target || !REACTIONS.includes(emoji)) return;
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
  function createStrokeView(target, hue) {
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
    svg.style.setProperty('--ping', `hsl(${hue} 95% 64%)`);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path);
    fx.append(svg);
    return { svg, path, points: [], expire: null };
  }

  function drawStroke(view) {
    view.path.setAttribute('d', strokePath(view.points));
  }

  // Terminado, o traço fica uns segundos na tela e some devagar.
  function finishStroke(view) {
    clearTimeout(view.expire);
    view.svg.classList.add('fading');
    view.svg.addEventListener('animationend', () => view.svg.remove());
  }

  function startStroke(target, streamId, clientX, clientY) {
    const stroke = {
      id: (++strokeCounter).toString(36),
      stream: streamId,
      target,
      pending: [],
      timer: null,
      view: createStrokeView(target, nameHue(me.name)),
    };
    addStrokePoint(stroke, clientX, clientY);
    return stroke;
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
    const message = (points, last) => ({ stream: stroke.stream, id: stroke.id, points, end: last });
    while (stroke.pending.length > 128) socket.emit('draw', message(stroke.pending.splice(0, 128), false));
    if (stroke.pending.length || end) socket.emit('draw', message(stroke.pending.splice(0), end));
  }

  function endStroke(stroke) {
    flushStroke(stroke, true);
    finishStroke(stroke.view);
  }

  const remoteStrokes = new Map(); // "transmissão|nome|id" -> traço

  socket.on('draw', ({ stream, id, points, end, name }) => {
    const target = fxTarget(stream);
    if (!target || !Array.isArray(points)) return;
    const key = `${stream}|${name}|${id}`;
    let view = remoteStrokes.get(key);
    if (!view) {
      if (!points.length) return;
      view = createStrokeView(target, nameHue(name));
      remoteStrokes.set(key, view);
    }
    view.points.push(...points);
    drawStroke(view);
    clearTimeout(view.expire);
    const done = () => {
      remoteStrokes.delete(key);
      finishStroke(view);
    };
    if (end) done();
    else view.expire = setTimeout(done, 5000); // quem desenhava caiu no meio do traço
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
      if (point && id && me) socket.emit('ping', { stream: id, x: point.x, y: point.y });
    };
    const finish = (g, cancelled) => {
      clearTimeout(g.timer);
      if (gesture === g) gesture = null;
      if (g.stroke) endStroke(g.stroke);
      else if (g.armed && !cancelled) ping(g.x, g.y);
    };
    media.addEventListener('pointerdown', (e) => {
      if (!me || outside(e.target)) return;
      if (gesture) finish(gesture, true);
      const g = { id: e.pointerId, touch: e.pointerType === 'touch', x: e.clientX, y: e.clientY, armed: false, stroke: null, timer: null };
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
      if (!g.stroke) {
        const id = streamId();
        if (dist < 6 || !id) return;
        g.stroke = startStroke(target, id, g.x, g.y);
      }
      const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of coalesced.length ? coalesced : [e]) addStrokePoint(g.stroke, ev.clientX, ev.clientY);
    });
    media.addEventListener('pointerup', (e) => {
      if (gesture && e.pointerId === gesture.id) finish(gesture, false);
    });
    media.addEventListener('pointercancel', (e) => {
      if (gesture && e.pointerId === gesture.id) finish(gesture, true);
    });
    // Segurando o dedo pra desenhar, a tela não rola nem abre o menu do navegador.
    media.addEventListener('touchmove', (e) => {
      if (gesture && gesture.armed) e.preventDefault();
    }, { passive: false });
    media.addEventListener('contextmenu', (e) => {
      if (gesture && gesture.touch) e.preventDefault();
    });
  }

  // Com o Alt apertado, o cursor vira uma mira em cima dos vídeos.
  const setAltDown = (on) => document.body.classList.toggle('alt-down', on);
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
    const target = fxTarget(stream);
    if (!target) return;
    const { fx, video } = target;
    const width = fx.clientWidth;
    const height = fx.clientHeight;
    if (!width || !height) return;
    const box = contentBox(video, width, height);
    const mark = el('span', 'fx-ping');
    mark.style.left = `${((box.left + x * box.width) / width) * 100}%`;
    mark.style.top = `${((box.top + y * box.height) / height) * 100}%`;
    mark.style.setProperty('--ping', `hsl(${nameHue(name)} 95% 64%)`);
    mark.classList.toggle('flip', x > 0.75); // nome do lado esquerdo perto da borda direita
    mark.append(el('span', 'fx-ping-ring'), el('span', 'fx-ping-ring'), el('span', 'fx-ping-dot'), el('span', 'fx-ping-name', name));
    mark.addEventListener('animationend', (e) => {
      if (e.target === mark) mark.remove();
    });
    fx.append(mark);
    sounds.play('ping');
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
      name.style.setProperty('--name', `hsl(${nameHue(msg.name)} 75% 72%)`);
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
    who.style.setProperty('--name', `hsl(${nameHue(msg.name)} 80% 72%)`);
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
      keysDialog.showModal();
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

  $('btn-keys').addEventListener('click', () => keysDialog.showModal());
  keysDialog.addEventListener('click', (e) => {
    if (e.target === keysDialog) keysDialog.close();
  });

  // ---------- sons ----------

  function renderSoundsButton() {
    const on = sounds.enabled;
    setIcon(btnSounds, on ? 'bell' : 'bellOff', on ? 'Sons da sala ligados (clique pra desligar)' : 'Sons da sala desligados (clique pra ligar)');
    btnSounds.setAttribute('aria-pressed', String(on));
  }

  btnSounds.addEventListener('click', () => {
    sounds.enabled = !sounds.enabled;
    renderSoundsButton();
    if (sounds.enabled) {
      sounds.unlock();
      setTimeout(() => sounds.play('message'), 50);
    }
  });
  renderSoundsButton();

  // ---------- chat de voz ----------

  // O áudio vai direto entre cada par de pessoas na voz (pelo TURN do servidor quando
  // precisa), com o mesmo relay de sinalização das transmissões. Em cada par, quem tem
  // o id menor faz a oferta, pra os dois não ligarem um pro outro ao mesmo tempo.
  const voice = { joined: false, joining: false, stream: null, muted: false, deafened: false, noMic: false, meter: null, speakingAt: 0 };
  const voicePeers = new Map(); // id -> { pc, sid, pending, audio, speakingAt, retryTimer }
  const voiceRows = new Map(); // id -> linha da pessoa na lista "Na voz"
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

  function setVoiceVolume(name, value, slider) {
    voiceVolumes[name] = value;
    try { localStorage.setItem('wss-voice-volumes', JSON.stringify(voiceVolumes)); } catch {}
    slider.style.setProperty('--fill', `${Math.round(value * 100)}%`);
    slider.title = `Volume: ${Math.round(value * 100)}%`;
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
    const iceServers = await iceServersPromise;
    if (!voice.joined || !me || !users.has(id) || voicePeers.has(id)) return;
    const peer = createVoicePeer(id, ++sidCounter, iceServers);
    const track = micTrack();
    if (track) peer.pc.addTransceiver(track, { direction: 'sendrecv', streams: [voice.stream] });
    else peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
    const offer = await peer.pc.createOffer();
    if (voicePeers.get(id) !== peer) return;
    await peer.pc.setLocalDescription(offer);
    send(id, { voice: true, sid: peer.sid, type: 'offer', sdp: peer.pc.localDescription });
  }

  async function handleVoiceSignal(from, data, address) {
    if (!voice.joined) return;
    if (data.type === 'offer') {
      const iceServers = await iceServersPromise;
      if (!voice.joined) return;
      closeVoicePeer(from);
      const peer = createVoicePeer(from, data.sid, iceServers);
      await peer.pc.setRemoteDescription(data.sdp);
      const track = micTrack();
      if (track) peer.pc.addTrack(track, voice.stream);
      await flushPending(peer);
      const answer = await peer.pc.createAnswer();
      if (voicePeers.get(from) !== peer) return;
      await peer.pc.setLocalDescription(answer);
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

  function pollSpeaking() {
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
  }

  setInterval(pollSpeaking, 120);

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

  function voiceRow(u) {
    let row = voiceRows.get(u.id);
    if (!row || row.name !== u.name) {
      const li = el('li', 'voice-member');
      const face = avatar(u.name);
      face.dataset.voiceId = u.id;
      const state = el('span', 'voice-member-state');
      li.append(face, el('span', 'voice-member-name', u.name), state);
      row = { li, state, name: u.name, slider: null };
      voiceRows.set(u.id, row);
    }
    row.state.replaceChildren(voiceStateIcon(u.voice, 'voice-member-icon'));
    // Volume da voz de cada pessoa, só pra você (no iPhone o navegador não deixa).
    const wantSlider = voice.joined && me && u.id !== me.id && canSetVolume;
    if (wantSlider && !row.slider) {
      const slider = el('input', 'volume voice-volume');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.setAttribute('aria-label', `Volume da voz de ${u.name}`);
      slider.addEventListener('input', () => setVoiceVolume(u.name, Number(slider.value) / 100, slider));
      row.slider = slider;
      row.li.append(slider);
    } else if (!wantSlider && row.slider) {
      row.slider.remove();
      row.slider = null;
    }
    if (row.slider && document.activeElement !== row.slider) {
      const volume = Number.isFinite(voiceVolumes[u.name]) ? voiceVolumes[u.name] : 1;
      row.slider.value = String(Math.round(volume * 100));
      row.slider.style.setProperty('--fill', `${row.slider.value}%`);
      row.slider.title = `Volume: ${row.slider.value}%`;
    }
    return row.li;
  }

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

    voiceSection.hidden = !members.length;
    voiceCountEl.textContent = members.length;
    for (const id of [...voiceRows.keys()]) {
      if (!members.some((u) => u.id === id)) voiceRows.delete(id);
    }
    const rows = members.map(voiceRow);
    // Só reordena se mudou (mexer nas linhas soltaria o volume no meio do arrasto).
    const same = rows.length === voiceListEl.children.length && rows.every((li, i) => voiceListEl.children[i] === li);
    if (!same) voiceListEl.replaceChildren(...rows);
  }

  btnVoice.addEventListener('click', joinVoice);
  btnMic.addEventListener('click', toggleMic);
  btnDeafen.addEventListener('click', toggleDeafen);
  btnVoiceLeave.addEventListener('click', leaveVoice);
  voicePeople.addEventListener('click', () => setSidebar(true, true));
  renderVoice();

  renderShareButton();
})();
