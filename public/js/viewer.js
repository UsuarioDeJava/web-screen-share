(() => {
  const socket = io();

  const video = document.getElementById('remote-video');
  const placeholder = document.getElementById('placeholder');
  const connDot = document.getElementById('conn-dot');
  const connText = document.getElementById('conn-text');
  const btnMute = document.getElementById('btn-mute');
  const qualitySelect = document.getElementById('quality-select');

  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  let pc = null;
  let hostId = null;
  let currentQuality = window.DEFAULT_QUALITY;

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
      pc = createPeerConnection();
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: hostId, data: { type: 'answer', sdp: pc.localDescription } });
      // Garante que a qualidade escolhida seja aplicada nesta nova conexão.
      socket.emit('quality:change', { quality: currentQuality });
    } else if (data.type === 'candidate' && data.candidate && pc) {
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

  function createPeerConnection() {
    const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    conn.ontrack = (event) => {
      video.srcObject = event.streams[0];
      showVideo();
      connText.textContent = 'transmissão ativa';
    };

    conn.onicecandidate = (event) => {
      if (event.candidate && hostId) {
        socket.emit('signal', { to: hostId, data: { type: 'candidate', candidate: event.candidate } });
      }
    };

    conn.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(conn.connectionState)) {
        connText.textContent = 'conexão perdida';
      }
    };

    return conn;
  }

  function closePeer() {
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
