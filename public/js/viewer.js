(() => {
  const socket = io();

  const video = document.getElementById('remote-video');
  const placeholder = document.getElementById('placeholder');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');
  const btnMute = document.getElementById('btn-mute');
  const qualitySelect = document.getElementById('quality-select');
  const diagContent = document.getElementById('diag-content');

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

  let pc = null;
  let hostId = null;
  let currentQuality = window.DEFAULT_QUALITY;
  let reconnectTimer = null;

  // Diagnóstico visível na própria página: mostra o que o ICE está
  // conseguindo negociar sem precisar abrir o DevTools/webrtc-internals.
  const diag = {
    iceConnectionState: '-',
    iceGatheringState: '-',
    connectionState: '-',
    local: { host: 0, srflx: 0, relay: 0, prflx: 0 },
    remote: { host: 0, srflx: 0, relay: 0, prflx: 0 },
  };

  function candidateType(candidateStr) {
    const match = /typ (\w+)/.exec(candidateStr || '');
    return match ? match[1] : 'unknown';
  }

  function renderDiag() {
    const fmt = (counts) => `host=${counts.host} srflx=${counts.srflx} relay=${counts.relay} prflx=${counts.prflx}`;
    diagContent.textContent =
      `Estado da conexão: ${diag.connectionState}\n` +
      `Estado ICE: ${diag.iceConnectionState}\n` +
      `Coleta de candidatos: ${diag.iceGatheringState}\n` +
      `Candidatos locais (deste dispositivo):  ${fmt(diag.local)}\n` +
      `Candidatos remotos (do transmissor):    ${fmt(diag.remote)}\n\n` +
      (diag.local.relay === 0
        ? 'Nenhum candidato "relay" (TURN) local ainda — se continuar em 0, o TURN não está sendo alcançado por este dispositivo.\n'
        : '') +
      (diag.remote.relay === 0
        ? 'Nenhum candidato "relay" (TURN) recebido do transmissor ainda.'
        : '');
  }
  renderDiag();

  // Só é "transmissão ativa" quando o vídeo realmente começa a renderizar
  // quadros. `ontrack` dispara assim que a negociação SDP é concluída, o que
  // pode acontecer mesmo que a conexão de mídia (ICE/UDP) nunca se estabeleça
  // — nesse caso a tela fica preta para sempre apesar do "sinal" ter chegado.
  video.addEventListener('playing', () => {
    connText.textContent = 'transmissão ativa';
  });

  for (const [key, preset] of Object.entries(window.QUALITY_PRESETS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = preset.label;
    if (key === currentQuality) opt.selected = true;
    qualitySelect.appendChild(opt);
  }

  function showPlaceholder(text) {
    placeholder.textContent = text;
    placeholder.style.display = 'block';
    video.style.display = 'none';
  }

  function showVideo() {
    placeholder.style.display = 'none';
    video.style.display = 'block';
  }

  showPlaceholder('Conectando ao servidor...');

  socket.on('connect', () => {
    connDot.className = 'dot ok';
    connText.textContent = 'conectado ao servidor';
    socket.emit('role:viewer');
  });

  socket.on('disconnect', () => {
    connDot.className = 'dot err';
    connText.textContent = 'desconectado do servidor';
    closePeer();
    showPlaceholder('Desconectado do servidor. Tentando reconectar...');
  });

  socket.on('host:unavailable', () => {
    showPlaceholder('Aguardando o PC iniciar a transmissão...');
  });

  socket.on('host:available', () => {
    connText.textContent = 'transmissor disponível, aguardando vídeo...';
  });

  socket.on('host:left', () => {
    closePeer();
    showPlaceholder('A transmissão foi encerrada. Aguardando o transmissor voltar...');
  });

  socket.on('signal', async ({ from, data }) => {
    if (data.type === 'offer') {
      hostId = from;
      closePeer();
      pc = await createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: hostId, data: { type: 'answer', sdp: pc.localDescription } });
      // Garante que a qualidade escolhida seja aplicada nesta nova conexão.
      socket.emit('quality:change', { quality: currentQuality });
    } else if (data.type === 'candidate' && data.candidate && pc) {
      diag.remote[candidateType(data.candidate.candidate)] = (diag.remote[candidateType(data.candidate.candidate)] || 0) + 1;
      renderDiag();
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.warn('Falha ao adicionar ICE candidate', err);
      }
    } else if (data.type === 'stop') {
      closePeer();
      showPlaceholder('A transmissão foi encerrada.');
    }
  });

  async function createPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers: await iceServersPromise });

    diag.local = { host: 0, srflx: 0, relay: 0, prflx: 0 };
    diag.remote = { host: 0, srflx: 0, relay: 0, prflx: 0 };
    diag.iceConnectionState = conn.iceConnectionState;
    diag.iceGatheringState = conn.iceGatheringState;
    diag.connectionState = conn.connectionState;
    renderDiag();

    conn.ontrack = (event) => {
      if (conn !== pc) return; // conexão antiga, já substituída
      video.srcObject = event.streams[0];
      showVideo();
      connText.textContent = 'sinal recebido, conectando mídia...';
    };

    conn.onicecandidate = (event) => {
      if (conn !== pc) return; // conexão antiga, já substituída
      if (event.candidate) {
        const type = candidateType(event.candidate.candidate);
        diag.local[type] = (diag.local[type] || 0) + 1;
        renderDiag();
        if (hostId) {
          socket.emit('signal', { to: hostId, data: { type: 'candidate', candidate: event.candidate } });
        }
      }
    };

    conn.onicegatheringstatechange = () => {
      if (conn !== pc) return;
      diag.iceGatheringState = conn.iceGatheringState;
      renderDiag();
    };

    conn.oniceconnectionstatechange = () => {
      if (conn !== pc) return;
      diag.iceConnectionState = conn.iceConnectionState;
      renderDiag();
    };

    conn.onconnectionstatechange = () => {
      if (conn !== pc) return; // conexão antiga, já substituída
      diag.connectionState = conn.connectionState;
      renderDiag();
      if (conn.connectionState === 'failed') {
        connText.textContent = 'falha na conexão de mídia — verifique firewall/antivírus, tentando novamente...';
        scheduleReconnect();
      } else if (conn.connectionState === 'disconnected') {
        connText.textContent = 'conexão instável...';
      }
    };

    return conn;
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      closePeer();
      socket.emit('role:viewer');
    }, 4000);
  }

  function closePeer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    video.srcObject = null;
  }

  btnMute.addEventListener('click', () => {
    video.muted = !video.muted;
    btnMute.textContent = video.muted ? '🔇 Ativar som' : '🔊 Desativar som';
  });

  qualitySelect.addEventListener('change', () => {
    currentQuality = qualitySelect.value;
    socket.emit('quality:change', { quality: currentQuality });
  });
})();
