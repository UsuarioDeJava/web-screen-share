// Ponte entre a página aberta na janela principal e o app. Na sala (página do
// servidor): `window.wssDesktop`. Na tela de configurar o servidor: `window.setupBridge`.
const { contextBridge, ipcRenderer } = require('electron');
// Também mantém as etiquetas coerentes em servidores antigos que ainda não
// assinam onOverlayState. O estado nativo é a referência para a camada visível.
ipcRenderer.on('desktop:overlay-state', (_event, state) => {
  document.documentElement.setAttribute('data-wss-overlay-owner', state.share ? 'share' : state.obs ? 'obs' : 'none');
  document.documentElement.toggleAttribute('data-wss-overlays-off', !state.enabled);
});

window.addEventListener('DOMContentLoaded', () => {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'wss-settings-open'; button.title = 'Configurações (Ctrl+,)';
  button.setAttribute('aria-label', 'Configurações');
  button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.5 2-2 .9-1.9-.6-2 3.4L4.5 10v2l-1.4 1.3 2 3.4 1.9-.6 2 .9.5 2h4l.5-2 2-.9 1.9.6 2-3.4-1.4-1.3v-2l1.4-1.3-2-3.4-1.9.6-2-.9-.5-2z" transform="translate(.5 1)"/><circle cx="12" cy="12" r="3"/></svg>';
  button.addEventListener('click', () => ipcRenderer.send('desktop:settings-open'));
  const me = document.querySelector('.me');
  if (me) {
    button.className = 'icon-btn';
    me.insertBefore(button, document.getElementById('btn-leave'));
    document.documentElement.setAttribute('data-wss-settings-unified', '');
    for (const avatar of [document.getElementById('me-avatar'), document.getElementById('me-name')].filter(Boolean)) {
      const open = (event) => {
        if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        ipcRenderer.send('desktop:settings-open', 'profile');
      };
      avatar.addEventListener('click', open, true);
      avatar.addEventListener('keydown', open, true);
    }
  } else { button.className = 'wss-settings-fallback'; button.append(' Configurações'); document.body.append(button); }
  document.addEventListener('keydown', (event) => {
    if (event.key !== '?' || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    ipcRenderer.send('desktop:settings-open', 'shortcuts');
  }, true);
});

if (process.argv.includes('--wss-borderless-window')) {
  window.addEventListener('DOMContentLoaded', () => {
    document.documentElement.setAttribute('data-wss-borderless', '');
    const bar = document.createElement('div');
    bar.id = 'wss-window-bar';
    const title = document.createElement('span');
    title.textContent = 'Web Screen Share';
    bar.append(title);
    title.addEventListener('dblclick', () => ipcRenderer.send('desktop:window-action', 'maximize'));
    let maximize;
    for (const [action, label, symbol] of [
      ['minimize', 'Minimizar', '−'], ['maximize', 'Maximizar', '□'], ['close', 'Fechar', '×'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.textContent = symbol;
      button.addEventListener('click', () => ipcRenderer.send('desktop:window-action', action));
      bar.append(button);
      if (action === 'maximize') maximize = button;
    }
    document.body.append(bar);
    ipcRenderer.on('desktop:window-state', (_event, state) => {
      document.documentElement.toggleAttribute('data-wss-fullscreen', state.fullscreen);
      maximize.title = state.maximized ? 'Restaurar' : 'Maximizar';
      maximize.setAttribute('aria-label', maximize.title);
    });
  });
}

if (location.protocol === 'https:' || location.protocol === 'http:') {
  try {
    contextBridge.executeInMainWorld({ func: installRoomObserver, args: [(entry) => ipcRenderer.send('desktop:activity', entry)] });
  } catch (error) {
    ipcRenderer.send('desktop:activity', { category: 'error', level: 'warn', message: `Observador da sala indisponível: ${error.message}` });
  }
  contextBridge.exposeInMainWorld('wssDesktop', {
    version: ipcRenderer.sendSync('desktop:version'),
    platform: process.platform,
    // Começou/parou de transmitir: abre/fecha a camada de marcações na tela escolhida.
    sharing: (on) => ipcRenderer.invoke('desktop:sharing', Boolean(on)),
    onOverlayState: (callback) => {
      ipcRenderer.on('desktop:overlay-state', (_event, state) => callback(state));
      ipcRenderer.invoke('desktop:overlay-state').then((state) => { if (state) callback(state); }, () => {});
    },
    // Algo aconteceu na sua transmissão (apontar, desenhar, reagir): mostra na tela real.
    overlay: (event) => ipcRenderer.send('desktop:overlay', event),
    // Mensagem nova com a janela sem foco: pisca na barra de tarefas.
    attention: () => ipcRenderer.send('desktop:attention'),
    changeServer: () => ipcRenderer.send('desktop:change-server'),
    // Transmissão pelo OBS: os monitores, ligar/desligar a camada e em qual monitor.
    displays: () => ipcRenderer.invoke('desktop:displays'),
    obs: (on) => ipcRenderer.invoke('desktop:obs', Boolean(on)),
    setObsDisplay: (value) => ipcRenderer.invoke('desktop:obs-display', String(value)),
    // Modo desenho (Ctrl+Shift+D): a sua cor e o que você rabiscou na sua tela.
    identity: (data) => ipcRenderer.send('desktop:identity', { hue: Number(data && data.hue), color: String((data && data.color) || '') }),
    onLocalDraw: (callback) => { ipcRenderer.on('desktop:local-draw', (_event, data) => callback(data)); },
    // Mouse de quem assiste e controle remoto.
    readGamepadProfiles: () => ipcRenderer.invoke('desktop:gamepad-profiles'),
    saveGamepadProfile: (value) => ipcRenderer.invoke('desktop:gamepad-profile-save', value),
    caps: () => ipcRenderer.invoke('desktop:caps'),
    controlState: (data) => ipcRenderer.send('desktop:control-state', data && data.on
      ? { on: true, name: String(data.name || ''), hue: Number(data.hue) || 0, people: Array.isArray(data.people) ? data.people.slice(0, 16).map((p) => ({ id: String(p.id), devices: p.devices })) : [] } : { on: false }),
    onGamepadError: (callback) => { ipcRenderer.on('desktop:gamepad-error', (_event, reason) => callback(reason)); },
    onGamepadState: (callback) => { ipcRenderer.on('desktop:gamepad-state', (_event, state) => callback(state)); },
    control: (msg) => ipcRenderer.send('desktop:control', msg),
    onControlRevoke: (callback) => { ipcRenderer.on('desktop:control-revoke', () => callback()); },
    // Controlando alguém: o app pega todas as teclas (Win, Alt+Tab...) e manda pra cá.
    captureKeys: (on) => ipcRenderer.invoke('desktop:capture-keys', Boolean(on)),
    onCapturedKey: (callback) => { ipcRenderer.on('desktop:captured-key', (_event, data) => callback(data)); },
    // Versão nova do app: o estado agora e as mudanças; update() é o botão do aviso.
    onUpdate: (callback) => {
      ipcRenderer.on('desktop:update', (_event, data) => callback(data));
      ipcRenderer.invoke('desktop:update-listen').then((data) => { if (data) callback(data); }, () => {});
    },
    update: () => ipcRenderer.invoke('desktop:update'),
    // "Verificar atualização": procura agora e diz o que achou.
    checkUpdate: () => ipcRenderer.invoke('desktop:update-check'),
  });
} else {
  contextBridge.exposeInMainWorld('setupBridge', {
    connect: (address) => ipcRenderer.invoke('setup:connect', String(address || '')),
    retry: () => ipcRenderer.send('setup:retry'),
  });
}

// Executado antes dos scripts da sala no mundo principal. Observa os eventos do
// Socket.IO e os estados WebRTC sem copiar conteúdo de chat, SDP ou ICE para o log.
function installRoomObserver(report) {
  const send = (category, message, direction = 'local', level = 'info') => {
    try { report({ category, message: String(message).slice(0, 1600), direction, level }); } catch {}
  };
  const watched = new WeakSet();
  function observe(socket) {
    if (!socket || watched.has(socket) || typeof socket.on !== 'function') return socket;
    watched.add(socket);
    const on = (event, callback) => socket.on(event, (...args) => { try { callback(...args); } catch {} });
    const people = new Map();
    let self = null;
    const name = (user) => String(user && user.name || 'Pessoa desconhecida').slice(0, 80);
    on('connect', () => send('connection', 'Socket conectado ao servidor.', 'in'));
    on('disconnect', (reason) => { send('connection', `Socket desconectado: ${reason}.`, 'in', 'warn'); people.clear(); });
    on('connect_error', (error) => send('error', `Erro de conexão: ${error && error.message || error}.`, 'in', 'error'));
    if (socket.io && typeof socket.io.on === 'function') {
      socket.io.on('reconnect_attempt', (attempt) => send('connection', `Tentativa de reconexão ${attempt}.`, 'out', 'warn'));
      socket.io.on('reconnect', () => send('connection', 'Conexão com o servidor restabelecida.', 'in'));
    }
    on('user:joined', (user) => {
      people.set(user.id, { name: name(user), sharing: Boolean(user.sharing), voice: Boolean(user.voice) });
      send('people', `${name(user)} entrou na sala.`, 'in');
      if (user.sharing) send('stream', `${name(user)} está transmitindo${user.kind === 'obs' ? ' pelo OBS' : ''}.`, 'in');
    });
    on('user:left', ({ id }) => {
      const user = people.get(id);
      if (user && user.sharing) send('stream', `Transmissão de ${user.name} encerrada ao sair da sala.`, 'in');
      send('people', `${user ? user.name : 'Pessoa desconhecida'} saiu da sala.`, 'in');
      people.delete(id);
    });
    on('user:updated', (user) => {
      const before = people.get(user.id);
      if (before) {
        if (Boolean(user.sharing) !== before.sharing) send('stream', `${name(user)} ${user.sharing ? 'iniciou' : 'encerrou'} a transmissão.`, 'in');
        if (Boolean(user.voice) !== before.voice) send('people', `${name(user)} ${user.voice ? 'entrou na' : 'saiu da'} voz.`, 'in');
      }
      people.set(user.id, { name: name(user), sharing: Boolean(user.sharing), voice: Boolean(user.voice) });
    });
    on('signal', (message) => {
      const data = message && message.data;
      if (!data || !['watch', 'unwatch', 'quality'].includes(data.type)) return;
      const peer = people.get(message.from);
      send('stream', `${peer ? peer.name : 'Um participante'} ${data.type === 'watch' ? 'solicitou assistir à sua transmissão' : data.type === 'unwatch' ? 'encerrou a visualização da sua transmissão' : 'solicitou mudança de qualidade'}.`, 'in');
    });
    const emit = socket.emit;
    socket.emit = function (event, ...args) {
      if (event === 'join' && typeof args[args.length - 1] === 'function') {
        const ack = args[args.length - 1];
        args[args.length - 1] = function (result, ...rest) {
          try {
            if (result && result.error) send('error', `Entrada na sala recusada: ${result.error}`, 'in', 'error');
            else if (result && result.me) {
              self = result.me;
              people.clear();
              for (const user of result.users || []) people.set(user.id, { name: name(user), sharing: Boolean(user.sharing), voice: Boolean(user.voice) });
              send('people', `Você entrou na sala como ${name(self)}. ${people.size} participantes na lista recebida.`, 'in');
              for (const [id, user] of people) {
                if (id !== self.id) send('people', `${user.name} já estava na sala${user.sharing ? ', transmitindo' : ''}.`, 'in');
              }
            }
          } catch {}
          return Reflect.apply(ack, this, [result, ...rest]);
        };
      }
      try {
        if (event === 'join') send('people', 'Solicitada entrada na sala.', 'out');
        else if (event === 'leave') { send('people', 'Você saiu da sala.', 'out'); people.clear(); self = null; }
        else if (event === 'share') send('stream', args[0] ? 'Início de transmissão informado ao servidor.' : 'Fim de transmissão informado ao servidor.', 'out');
        else if (event === 'voice:join' || event === 'voice:leave') send('people', event === 'voice:join' ? 'Entrada na voz informada ao servidor.' : 'Saída da voz informada ao servidor.', 'out');
        else if (event === 'signal') {
          const data = args[0] && args[0].data;
          if (data && ['watch', 'unwatch', 'quality'].includes(data.type)) {
            const peer = people.get(args[0].to);
            send('stream', `${data.type === 'watch' ? 'Solicitado assistir a' : data.type === 'unwatch' ? 'Encerrada visualização de' : 'Solicitada mudança de qualidade para'} ${peer ? peer.name : 'uma transmissão'}${data.quality ? ` (${String(data.quality).slice(0, 20)})` : ''}.`, 'out');
          }
        }
      } catch {}
      return Reflect.apply(emit, this, [event, ...args]);
    };
    return socket;
  }
  let originalIo = window.io;
  let wrappedIo;
  const wrap = (value) => typeof value === 'function' ? new Proxy(value, { apply(target, receiver, args) { return observe(Reflect.apply(target, receiver, args)); } }) : value;
  try {
    wrappedIo = wrap(originalIo);
    Object.defineProperty(window, 'io', {
      configurable: true, enumerable: true,
      get: () => wrappedIo, set: (value) => { originalIo = value; wrappedIo = wrap(value); },
    });
  } catch { send('error', 'Não foi possível observar os eventos da sala nesta página.', 'local', 'warn'); }
  if (window.RTCPeerConnection) {
    let counter = 0;
    window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
      construct(target, args, newTarget) {
        const pc = Reflect.construct(target, args, newTarget);
        const id = ++counter;
        send('connection', `Conexão WebRTC #${id} criada.`);
        pc.addEventListener('connectionstatechange', () => send('connection', `WebRTC #${id}: ${pc.connectionState}.`, 'local', pc.connectionState === 'failed' ? 'error' : pc.connectionState === 'disconnected' ? 'warn' : 'info'));
        pc.addEventListener('iceconnectionstatechange', () => {
          if (['failed', 'disconnected'].includes(pc.iceConnectionState)) send('error', `ICE #${id}: ${pc.iceConnectionState}.`, 'local', 'warn');
        });
        pc.addEventListener('icecandidateerror', (event) => send('error', `Servidor ICE da conexão #${id}: erro ${event.errorCode}.`, 'local', 'warn'));
        const close = pc.close;
        pc.close = function (...params) {
          const wasClosed = this.connectionState === 'closed';
          const result = Reflect.apply(close, this, params);
          if (!wasClosed) send('connection', `Conexão WebRTC #${id} encerrada.`);
          return result;
        };
        return pc;
      },
    });
  }
  window.addEventListener('error', (event) => send('error', `Erro da interface: ${event.message || 'falha ao carregar recurso'}.`, 'local', 'error'));
  window.addEventListener('unhandledrejection', (event) => send('error', `Operação rejeitada: ${event.reason && event.reason.message || event.reason}.`, 'local', 'error'));
}
