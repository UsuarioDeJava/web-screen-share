(() => {
  const PRESETS = window.QUALITY_PRESETS;
  const DEFAULT_QUALITY = window.DEFAULT_QUALITY;
  const TILE_BAR_HEIGHT = 48; // precisa bater com .tile-bar no CSS
  const TILE_GAP = 12;
  const MIN_TILE_WIDTH = 280;

  const ICONS = {
    share: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/>',
    stop: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9.5 7.5l5 5M14.5 7.5l-5 5"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    volumeX: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };

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
  const toastEl = $('toast');

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

  function paintAvatar(node, name) {
    node.textContent = [...name][0] || '?';
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    node.style.setProperty('--avatar', `hsl(${hash % 360} 45% 42%)`);
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
      users.clear();
      for (const u of res.users) users.set(u.id, u);
      // Reconexão no meio de uma transmissão: continua transmitindo.
      if (localStream) {
        users.get(me.id).sharing = true;
        socket.emit('share', true);
      }
      showApp();
      for (const u of users.values()) {
        if (u.sharing && u.id !== me.id) addStreamTile(u);
      }
    });
  }

  function leaveRoomLocally() {
    me = null;
    for (const id of [...outgoing.keys()]) closeOutgoing(id);
    for (const id of [...streams.keys()]) removeStreamTile(id);
    users.clear();
    renderAll();
  }

  btnLeave.addEventListener('click', () => {
    stopSharing();
    socket.emit('leave');
    wantedName = null;
    leaveRoomLocally();
    showLogin();
  });

  function setConnection(ok) {
    connDot.className = ok ? 'dot ok' : 'dot err';
    connText.textContent = ok ? 'Conectado' : 'Reconectando…';
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
    renderUsers();
  });

  socket.on('user:updated', (user) => {
    if (!me) return;
    const before = users.get(user.id);
    users.set(user.id, user);
    if (user.sharing && !(before && before.sharing)) addStreamTile(user);
    if (!user.sharing && before && before.sharing) removeStreamTile(user.id);
    renderUsers();
  });

  socket.on('user:left', ({ id }) => {
    if (!me || id === me.id) return;
    users.delete(id);
    removeStreamTile(id);
    closeOutgoing(id);
    renderUsers();
  });

  // ---------- renderização ----------

  function renderAll() {
    renderUsers();
    renderShareButton();
    layoutGrid();
  }

  function renderUsers() {
    const myId = me && me.id;
    const list = [...users.values()].sort((a, b) =>
      (b.id === myId) - (a.id === myId) || b.sharing - a.sharing || a.name.localeCompare(b.name));
    userCountEl.textContent = list.length;
    userListEl.replaceChildren(...list.map((u) => {
      const li = el('li', u.sharing ? 'user is-live' : 'user');
      li.append(avatar(u.name), el('span', 'user-name', u.name));
      if (u.id === myId) li.append(el('span', 'user-you', 'você'));
      if (u.sharing) li.append(el('span', 'live-badge', 'AO VIVO'));
      if (u.sharing && u.id !== myId) {
        li.tabIndex = 0;
        li.title = `Ir para a tela de ${u.name}`;
        const focus = () => focusTile(u.id);
        li.addEventListener('click', focus);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') focus(); });
      }
      return li;
    }));
    const live = list.filter((u) => u.sharing).length;
    liveCountEl.textContent = live ? `${live} ao vivo` : '';
  }

  function renderShareButton() {
    if (!canShare) {
      btnShare.hidden = true;
      shareHint.hidden = false;
      shareHint.textContent = window.isSecureContext
        ? 'Este navegador não permite compartilhar a tela, só assistir.'
        : 'Compartilhar a tela exige HTTPS (ou localhost). Você ainda pode assistir.';
      emptyHint.textContent = 'Assim que alguém começar a transmitir, a tela aparece aqui.';
      return;
    }
    btnShare.replaceChildren(icon(localStream ? 'stop' : 'share'), localStream ? 'Parar transmissão' : 'Compartilhar tela');
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
  function layoutGrid() {
    const count = gridInner.children.length;
    emptyEl.hidden = count > 0;
    if (!count) return;
    const width = gridEl.clientWidth;
    const height = gridEl.clientHeight;
    if (!width || !height) return;
    let best = 0;
    for (let cols = 1; cols <= count; cols += 1) {
      const rows = Math.ceil(count / cols);
      const byWidth = (width - TILE_GAP * (cols - 1)) / cols;
      const byHeight = ((height - TILE_GAP * (rows - 1)) / rows - TILE_BAR_HEIGHT) * (16 / 9);
      best = Math.max(best, Math.min(byWidth, byHeight));
    }
    if (best < MIN_TILE_WIDTH) best = width < MIN_TILE_WIDTH * 2 + TILE_GAP ? width : MIN_TILE_WIDTH;
    gridEl.style.setProperty('--tile-w', `${Math.floor(best) - 1}px`);
  }

  new ResizeObserver(layoutGrid).observe(gridEl);

  function createTile(name, label) {
    const tile = el('div', 'tile');
    const media = el('div', 'tile-media');
    const video = el('video');
    video.autoplay = true;
    video.playsInline = true;
    const status = el('div', 'tile-status');
    status.hidden = true;
    media.append(video, status);
    const bar = el('div', 'tile-bar');
    const who = el('div', 'tile-who');
    who.append(avatar(name), el('span', 'tile-name', label), el('span', 'live-badge', 'AO VIVO'));
    bar.append(who);
    tile.append(media, bar);
    return { tile, media, video, status, bar };
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
      gridInner.prepend(base.tile);
      layoutGrid();
    }
    const watching = [...outgoing.values()].filter((o) => o.pc.connectionState === 'connected').length;
    selfTile.viewers.replaceChildren(icon('eye'), String(watching));
    selfTile.viewers.title = watching === 1 ? '1 pessoa assistindo' : `${watching} pessoas assistindo`;
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
        audio: true,
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
    // Botão nativo "Parar de compartilhar" do navegador.
    stream.getVideoTracks()[0].addEventListener('ended', stopSharing);
    users.get(me.id).sharing = true;
    socket.emit('share', true);
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

  async function addCandidate(entry, candidate) {
    if (!candidate) return;
    if (!entry.pc.remoteDescription) {
      entry.pending.push(candidate);
      return;
    }
    try {
      await entry.pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn('Falha ao adicionar ICE candidate', err);
    }
  }

  async function flushPending(entry) {
    for (const candidate of entry.pending.splice(0)) await addCandidate(entry, candidate);
  }

  // ---------- sinalização ----------

  // Processa em ordem: um candidate não pode ser aplicado antes do offer/answer
  // da mesma conexão terminar de ser processado.
  socket.on('signal', ({ from, data }) => {
    signalQueue = signalQueue
      .then(() => handleSignal(from, data))
      .catch((err) => console.warn('Erro de sinalização', err));
  });

  async function handleSignal(from, data) {
    if (!me || !data) return;
    if (data.stream === me.id) await handleAsBroadcaster(from, data);
    else if (data.stream === from) await handleAsViewer(from, data);
  }

  async function handleAsBroadcaster(viewerId, data) {
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
      await addCandidate(o, data.candidate);
    }
  }

  async function handleAsViewer(broadcasterId, data) {
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
      pc.onconnectionstatechange = () => {
        if (s.pc !== pc) return;
        if (pc.connectionState === 'failed') {
          setStatus(s, 'A conexão falhou. Tentando de novo…', true);
          scheduleRetry(s);
        } else if (pc.connectionState === 'disconnected') {
          setStatus(s, 'Conexão instável…', true);
        } else if (pc.connectionState === 'connected' && !s.video.paused) {
          setStatus(s, '');
        }
      };

      await pc.setRemoteDescription(data.sdp);
      await flushPending(s);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send(broadcasterId, { stream: broadcasterId, sid: data.sid, type: 'answer', sdp: pc.localDescription });
    } else if (data.type === 'candidate' && s.pc && data.sid === s.sid) {
      await addCandidate(s, data.candidate);
    }
  }

  // ---------- assistir ----------

  function addStreamTile(user) {
    if (streams.has(user.id)) return;
    const base = createTile(user.name, user.name);
    const s = {
      ...base,
      id: user.id,
      pc: null,
      sid: null,
      pending: [],
      watching: true,
      quality: DEFAULT_QUALITY,
      volume: 1,
      muted: false,
      hasAudio: true,
      retryTimer: null,
      statsTimer: null,
      lastBytes: null,
    };

    const tools = el('div', 'tile-tools');
    const qualitySelect = el('select');
    qualitySelect.title = 'Qualidade (só pra você)';
    qualitySelect.setAttribute('aria-label', 'Qualidade');
    for (const [key, preset] of Object.entries(PRESETS)) {
      const opt = el('option', null, preset.label);
      opt.value = key;
      opt.selected = key === s.quality;
      qualitySelect.append(opt);
    }
    const btnStats = iconButton('info', 'Estatísticas da conexão');
    const btnFull = iconButton('maximize', 'Tela cheia');
    const btnClose = iconButton('close', 'Parar de assistir');
    tools.append(qualitySelect, btnStats, btnFull, btnClose);

    const stats = el('pre', 'tile-stats');
    stats.hidden = true;
    const paused = el('div', 'tile-paused');
    paused.hidden = true;
    const btnWatch = el('button', 'btn btn-primary');
    btnWatch.type = 'button';
    btnWatch.append(icon('eye'), 'Assistir');
    paused.append(el('span', null, `${user.name} está transmitindo`), btnWatch);
    base.media.append(tools, stats, paused);

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
    base.bar.append(audio);
    Object.assign(s, { qualitySelect, btnStats, stats, paused, audio, btnMute, slider });

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
    qualitySelect.addEventListener('change', () => {
      s.quality = qualitySelect.value;
      if (s.pc) send(s.id, { stream: s.id, type: 'quality', quality: s.quality });
    });
    btnStats.addEventListener('click', () => toggleStats(s));
    btnFull.addEventListener('click', () => toggleFullscreen(s));
    base.video.addEventListener('dblclick', () => toggleFullscreen(s));
    btnClose.addEventListener('click', () => stopWatching(s));
    btnWatch.addEventListener('click', () => requestWatch(s));
    base.video.addEventListener('playing', () => setStatus(s, ''));

    streams.set(user.id, s);
    gridInner.append(s.tile);
    renderAudio(s);
    requestWatch(s);
    layoutGrid();
  }

  function removeStreamTile(id) {
    const s = streams.get(id);
    if (!s) return;
    streams.delete(id);
    closeIncoming(s);
    stopStats(s);
    if (document.fullscreenElement === s.tile) exitFullscreen();
    s.tile.remove();
    layoutGrid();
  }

  function requestWatch(s) {
    closeIncoming(s);
    s.watching = true;
    s.paused.hidden = true;
    s.tile.classList.remove('is-paused');
    setStatus(s, 'Conectando…', true);
    send(s.id, { stream: s.id, type: 'watch', quality: s.quality });
  }

  function stopWatching(s) {
    s.watching = false;
    send(s.id, { stream: s.id, type: 'unwatch' });
    closeIncoming(s);
    stopStats(s);
    setStatus(s, '');
    s.paused.hidden = false;
    s.tile.classList.add('is-paused');
    if (document.fullscreenElement === s.tile) exitFullscreen();
  }

  function closeIncoming(s) {
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
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
    let route = '—';
    if (local) {
      if (local.candidateType === 'relay') route = 'via servidor TURN (relay)';
      else if (local.candidateType === 'host') route = 'direta (rede local)';
      else route = 'direta (P2P)';
    }
    const lines = [
      `Conexão: ${CONNECTION_LABELS[pc.connectionState] || pc.connectionState}`,
      `Rota: ${route}`,
    ];
    if (video) {
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
    return lines.join('\n');
  }

  renderShareButton();
})();
