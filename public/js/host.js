(() => {
  const socket = io();

  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const chkAudio = document.getElementById('chk-audio');
  const audioHint = document.getElementById('audio-hint');
  const preview = document.getElementById('preview');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');
  const urlsEl = document.getElementById('urls');
  const viewerCountEl = document.getElementById('viewer-count');
  const viewerListEl = document.getElementById('viewer-list');

  let iceServersPromise = fetchIceServers();

  async function fetchIceServers() {
    try {
      const res = await fetch('/ice-servers');
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn('Falha ao obter configuração de ICE servers, usando STUN padrão.', err);
    }
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }

  let localStream = null;
  /** @type {Map<string, RTCPeerConnection>} */
  const peers = new Map();

  function setUrls() {
    const port = window.location.port ? `:${window.location.port}` : '';
    urlsEl.innerHTML = `<code>http://${window.location.hostname}${port}/</code>`;
  }
  setUrls();

  function renderViewerList() {
    viewerCountEl.textContent = peers.size;
    viewerListEl.innerHTML = '';
    for (const id of peers.keys()) {
      const li = document.createElement('li');
      li.textContent = id;
      viewerListEl.appendChild(li);
    }
  }

  socket.on('connect', () => {
    connDot.className = 'dot ok';
    connText.textContent = 'conectado ao servidor';
    socket.emit('role:host');
  });

  socket.on('disconnect', () => {
    connDot.className = 'dot err';
    connText.textContent = 'desconectado do servidor';
  });

  socket.on('host:replaced', () => {
    alert('Outra aba/janela assumiu como transmissor. Esta aba vai parar.');
    stopSharing();
  });

  socket.on('viewer:joined', ({ viewerId }) => {
    if (!localStream) return; // ainda não começou a transmitir
    createPeerForViewer(viewerId);
  });

  socket.on('viewer:left', ({ viewerId }) => {
    const pc = peers.get(viewerId);
    if (pc) {
      pc.close();
      peers.delete(viewerId);
      renderViewerList();
    }
  });

  socket.on('signal', async ({ from, data }) => {
    const pc = peers.get(from);
    if (!pc) return;
    if (data.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } else if (data.type === 'candidate' && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.warn('Falha ao adicionar ICE candidate', err);
      }
    }
  });

  socket.on('quality:change', ({ viewerId, quality }) => {
    const pc = peers.get(viewerId);
    if (!pc) return;
    const preset = window.QUALITY_PRESETS[quality];
    if (!preset) return;
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].scaleResolutionDownBy = preset.scaleResolutionDownBy;
    params.encodings[0].maxBitrate = preset.maxBitrate;
    params.encodings[0].maxFramerate = preset.maxFramerate;
    sender.setParameters(params).catch((err) => console.warn('setParameters falhou', err));
  });

  async function createPeerForViewer(viewerId) {
    const existing = peers.get(viewerId);
    if (existing) existing.close();

    const pc = new RTCPeerConnection({ iceServers: await iceServersPromise });
    peers.set(viewerId, pc);
    renderViewerList();

    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal', { to: viewerId, data: { type: 'candidate', candidate: event.candidate } });
      }
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        if (peers.get(viewerId) === pc) {
          peers.delete(viewerId);
          renderViewerList();
        }
      }
    };

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit('signal', { to: viewerId, data: { type: 'offer', sdp: pc.localDescription } });
      })
      .catch((err) => console.error('Erro ao criar oferta', err));

    return pc;
  }

  async function startSharing() {
    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: chkAudio.checked,
      });
    } catch (err) {
      console.error(err);
      alert('Não foi possível iniciar a captura de tela: ' + err.message);
      return;
    }

    const hasAudio = localStream.getAudioTracks().length > 0;
    audioHint.textContent = chkAudio.checked
      ? (hasAudio ? 'Áudio do sistema sendo capturado.' : 'O navegador/sistema não permitiu capturar áudio; a transmissão seguirá sem som.')
      : 'Captura de áudio desativada.';

    preview.srcObject = localStream;
    btnStart.disabled = true;
    btnStop.disabled = false;
    chkAudio.disabled = true;

    // Se o usuário parar a captura pelo controle nativo do navegador.
    localStream.getVideoTracks()[0].addEventListener('ended', stopSharing);

    socket.emit('role:host');
  }

  function stopSharing() {
    for (const [viewerId, pc] of peers.entries()) {
      socket.emit('signal', { to: viewerId, data: { type: 'stop' } });
      pc.close();
    }
    peers.clear();
    renderViewerList();

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    preview.srcObject = null;

    btnStart.disabled = false;
    btnStop.disabled = true;
    chkAudio.disabled = false;
  }

  btnStart.addEventListener('click', startSharing);
  btnStop.addEventListener('click', stopSharing);
})();
