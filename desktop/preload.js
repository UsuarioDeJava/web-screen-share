// Ponte entre a página aberta na janela principal e o app. Na sala (página do
// servidor): `window.wssDesktop`. Na tela de configurar o servidor: `window.setupBridge`.
const { contextBridge, ipcRenderer } = require('electron');
const nativeCommands = createNativeCommandQueue(ipcRenderer);
const receiverPage = process.argv.includes('--wss-control-receiver');
ipcRenderer.on('desktop:visual-mode', (_event, mode) => {
  const value = ['normal', 'economy', 'auto'].includes(mode) ? mode : 'normal';
  const root = document.documentElement;
  if (root && root.getAttribute('data-wss-visual-mode') !== value) {
    root.setAttribute('data-wss-visual-mode', value);
    root.toggleAttribute('data-wss-economy', value === 'economy');
  }
});
// Também mantém as etiquetas coerentes em servidores antigos que ainda não
// assinam onOverlayState. O estado nativo é a referência para a camada visível.
ipcRenderer.on('desktop:overlay-state', (_event, state) => {
  document.documentElement.setAttribute('data-wss-overlay-owner', state.share ? 'share' : state.obs ? 'obs' : 'none');
  document.documentElement.toggleAttribute('data-wss-overlays-off', !state.enabled);
});

window.addEventListener('DOMContentLoaded', () => {
  if (receiverPage) return;
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    const changeServer = document.createElement('button');
    changeServer.type = 'button';
    changeServer.className = 'link-btn';
    changeServer.textContent = 'Voltar e trocar servidor';
    changeServer.addEventListener('click', () => ipcRenderer.send('desktop:change-server'));
    loginForm.append(changeServer);
  }
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

if (receiverPage) {
  contextBridge.exposeInMainWorld('wssReceiver', {
    ready: () => ipcRenderer.invoke('desktop:receiver-ready'),
    onState: callback => ipcRenderer.on('desktop:receiver-state', (_event, value) => {
      nativeCommands.retain(value.grants.map(grant=>({id:grant.peer,session:grant.session})));callback(value);
    }),
    onEvent: callback => ipcRenderer.on('desktop:receiver-event', (_event, value) => callback(value)),
    input: value => { const clean = projectNativeCommand(value); if (clean) nativeCommands.push('input', clean); },
    pulse: value => { const clean = projectPeerIdentity(value, true); if (clean) nativeCommands.push('pulse', clean); },
    reset: value => { const clean = projectPeerIdentity(value, true); if (clean) nativeCommands.push('reset', clean); },
    fault: value => { const clean = projectPeerIdentity(value, true); if (clean) nativeCommands.fail(clean); },
    report: value => {
      const clean=projectPeerIdentity({from:value?.peer,session:value?.session},true);if(!clean)return;
      clean.transport=value.transport==='webrtc'?'webrtc':'socket';
      for(const key of ['binaryFastPacketsReceived','droppedIncomingPackets','peerPacketsSent','socketPacketsSent','analogPacketsSent','networkRttMs'])
        if(Number.isFinite(value[key])&&value[key]>=0)clean[key]=value[key];
      if(JSON.stringify(clean).length<=1024)nativeCommands.push('report',clean);
    },
  });
} else if (location.protocol === 'https:' || location.protocol === 'http:') {
  try {
    contextBridge.executeInMainWorld({ func: installRoomObserver, args: [(entry) => ipcRenderer.send('desktop:activity', entry)] });
  } catch (error) {
    ipcRenderer.send('desktop:activity', { category: 'error', level: 'warn', message: `Observador da sala indisponível: ${error.message}` });
  }
  contextBridge.exposeInMainWorld('wssDesktop', {
    version: ipcRenderer.sendSync('desktop:version'),
    platform: process.platform,
    obsLocal: value=>ipcRenderer.invoke('desktop:obs-local',value),
    obsDirect: value=>ipcRenderer.invoke('desktop:obs-direct',value),
    nativeVideoCaps: () => ipcRenderer.invoke('desktop:native-video-caps'),
    nativeVideoPrepare: () => ipcRenderer.invoke('desktop:native-video-prepare'),
    nativeVideoCommand: value => ipcRenderer.invoke('desktop:native-video-command', value),
    onNativeVideo: callback => ipcRenderer.on('desktop:native-video', (_event, value) => callback(value)),
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
    diagnosticFault: enabled => ipcRenderer.invoke('desktop:diagnostic-fault', enabled === true),
    // As Configurações do app, numa aba (perfil, OBS, atalhos...): a sala abre elas no
    // lugar dos diálogos dela, pra ficar igual no navegador e no app.
    openSettings: (section) => ipcRenderer.send('desktop:settings-open', typeof section === 'string' ? section : 'profile'),
    // Transmissão pelo OBS: os monitores, ligar/desligar a camada e em qual monitor.
    displays: () => ipcRenderer.invoke('desktop:displays'),
    obs: (on) => ipcRenderer.invoke('desktop:obs', Boolean(on)),
    setObsDisplay: (value) => ipcRenderer.invoke('desktop:obs-display', String(value)),
    // Modo desenho (Ctrl+Shift+D): a sua cor e o que você rabiscou na sua tela.
    identity: (data) => ipcRenderer.send('desktop:identity', {
      hue: Number(data && data.hue),
      color: String((data && data.color) || ''),
      style: data && data.style && typeof data.style === 'object' ? JSON.parse(JSON.stringify(data.style)) : null,
    }),
    onLocalDraw: (callback) => { ipcRenderer.on('desktop:local-draw', (_event, data) => callback(data)); },
    // Mouse de quem assiste e controle remoto.
    readGamepadProfiles: () => ipcRenderer.invoke('desktop:gamepad-profiles'),
    onGamepadProfiles: (callback) => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('desktop:gamepad-profiles', listener);
      return () => ipcRenderer.removeListener('desktop:gamepad-profiles', listener);
    },
    saveGamepadProfile: (value) => ipcRenderer.invoke('desktop:gamepad-profile-save', value),
    caps: () => ipcRenderer.invoke('desktop:caps'),
    networkDiagnostics: () => ipcRenderer.invoke('desktop:network-diagnostics'),
    mediaCapabilities: () => ipcRenderer.invoke('desktop:media-capabilities'),
    controlState: (data) => { const clean=projectControlState(data);nativeCommands.retain(clean.people||[]);ipcRenderer.send('desktop:control-state',clean); },
    hostControl: value => {
      if (!value || !['owner','peer','session','stream','token'].every(key => typeof value[key] === 'string' && value[key].length <= 128)
        || !/^[a-f0-9]{64}$/.test(value.token)) return Promise.reject(Error('Receptor inválido.'));
      return ipcRenderer.invoke('desktop:receiver-host', {...Object.fromEntries(['owner','peer','session','stream','token'].map(key => [key,value[key]])),
        options:{binaryFast:value.options?.binaryFast!==false,maxFastBufferedBytes:[0,512,2048,16384].includes(value.options?.maxFastBufferedBytes)?value.options.maxFastBufferedBytes:16384,
          fastPacketLifeTimeMs:Number.isInteger(value.options?.fastPacketLifeTimeMs)&&value.options.fastPacketLifeTimeMs>0&&value.options.fastPacketLifeTimeMs<=1000?value.options.fastPacketLifeTimeMs:null}});
    },
    receiverSnapshot: () => ipcRenderer.invoke('desktop:receiver-snapshot'),
    onGamepadError: (callback) => { ipcRenderer.on('desktop:gamepad-error', (_event, reason) => callback(reason)); },
    onInputError: (callback) => { ipcRenderer.on('desktop:input-error', (_event, reason) => callback(reason)); },
    onGamepadState: (callback) => { ipcRenderer.on('desktop:gamepad-state', (_event, state) => callback(state)); },
    onGamepadFeedback: (callback) => { ipcRenderer.on('desktop:gamepad-feedback', (_event, state) => callback(state)); },
    control: (msg) => { const projected = projectNativeCommand(msg); if (projected) nativeCommands.push('input', projected); },
    controlPulse: (msg) => { const projected = projectPeerIdentity(msg, true); if (projected) nativeCommands.push('pulse', projected); },
    controlReset: (msg) => { const projected = projectPeerIdentity(msg, true); if (projected) nativeCommands.push('reset', projected); },
    // "Só o som deste programa": se está vindo ({ wanted, ok, rate, channels } ou { error }),
    // o som (PCM 16 bits intercalado) e parar.
    windowAudio: () => ipcRenderer.invoke('desktop:window-audio'),
    windowAudioStop: () => ipcRenderer.send('desktop:window-audio-stop'),
    onWindowAudio: (callback) => {
      const listener = (_event, pcm) => callback(pcm);
      ipcRenderer.on('desktop:window-audio-pcm', listener);
      return () => ipcRenderer.removeListener('desktop:window-audio-pcm', listener);
    },
    // Um mouse só: quem controla entrou/saiu do modo controle; o formato do seu mouse.
    controlMode: (data) => ipcRenderer.send('desktop:control-mode', { from: String((data && data.from) || ''), on: Boolean(data && data.on === true) }),
    onCursorShape: (callback) => { ipcRenderer.on('desktop:cursor-shape', (_event, shape) => callback(String(shape))); },
    onControlRevoke: (callback) => { ipcRenderer.on('desktop:control-revoke', () => callback()); },
    onControlBlocked: (callback) => { ipcRenderer.on('desktop:control-blocked', (_event, value) => callback(value)); },
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

// Um lote em voo, até 64 pendentes, 16 faults e prazo de 100 ms. O ACK pertence
// ao processo principal; nenhuma confirmação depende da janela da sala.
function createNativeCommandQueue(ipc) {
  const queue = [], faults = new Map(), blocked = new Set();
  let known=null;
  const encoder=new TextEncoder();
  let flight = null, flightItems = [], serial = 0, closed = false, disposed=false, timer = null;
  const key = value => value.from + ':' + (value.session || '');
  function stop() {
    if (closed) return;
    const identities=values=>[...new Map(values.filter(value=>!known||known.has(key(value))).map(value=>[key(value),{from:value.from,session:value.session}])).values()].slice(0,16);
    const peers=identities(flightItems.map(item=>item.value));
    const pending=identities([...queue.map(item=>item.value),...faults.values()]);
    for(const value of pending)if(blocked.size<32)blocked.add(key(value));
    closed = true; clearTimeout(timer); queue.length = 0; faults.clear();
    ipc.send('desktop:input-stalled',{id:flight,peers,pending});
  }
  function flush() {
    if (closed || flight || !queue.length && !faults.size) return;
    const items=[];let bytes=256;
    const add=entry=>{
      const item={type:entry.type,value:entry.value,...(entry.at===undefined?{}:{at:entry.at})};
      const size=encoder.encode(JSON.stringify(item)).byteLength+1;
      if(items.length>=32||bytes+size>16384)return false;
      bytes+=size;items.push(item);return true;
    };
    for(const [id,value]of faults){if(!add({type:'fault',value}))break;faults.delete(id);}
    while(queue.length&&add(queue[0]))queue.shift();
    flight = ++serial;
    flightItems=items;
    timer = setTimeout(stop, 250);
    ipc.send('desktop:input-batch', { id: flight, at: Date.now(), items });
  }
  function fail(value, defer=false) {
    const id = key(value);
    if (closed || blocked.has(id)) return;
    if (blocked.size >= 32 || faults.size >= 16) { stop(); return; }
    blocked.add(id); faults.set(id, {from:value.from,session:value.session});
    for (let i=queue.length-1;i>=0;i--) if (key(queue[i].value)===id) queue.splice(i,1);
    if(!defer)flush();
  }
  ipc.on('desktop:input-ack', (_event, ack) => {
    if (disposed || ack?.id !== flight) return;
    clearTimeout(timer); timer = null; flight = null; flightItems=[];closed=false;
    for (const item of queue.slice()) if (Date.now()-item.at > 100) fail(item.value,true);
    flush();
  });
  window.addEventListener('pagehide', () => { disposed=true;closed=true;clearTimeout(timer);queue.length=0;faults.clear();flightItems=[]; }, { once:true });
  return { fail, retain(people) {
    const ids=new Set(people.map(p=>key({from:p.id,session:p.session})));
    known=ids;
    for(const id of blocked)if(!ids.has(id))blocked.delete(id);
    for(const id of faults.keys())if(!ids.has(id))faults.delete(id);
    for(let i=queue.length-1;i>=0;i--)if(!ids.has(key(queue[i].value)))queue.splice(i,1);
  }, push(type, value) {
    if (closed || blocked.has(key(value))) return false;
    if (type==='reset') for(let i=queue.length-1;i>=0;i--)if(key(queue[i].value)===key(value))queue.splice(i,1);
    const last=queue.at(-1);
    const replace = last && key(last.value)===key(value) && last.type===type && (type==='pulse'||type==='report'
      || type==='input' && last.value.kind===value.kind && (value.kind==='move' || value.kind==='gamepad'
        && value.buttons.every((v,i)=>i===6||i===7||v===last.value.buttons[i])));
    const entry={type,value,at:Date.now()};
    if(encoder.encode(JSON.stringify(entry)).byteLength>4096){fail(value);return false;}
    if(replace)queue[queue.length-1]=entry;
    else if(queue.length>=64){fail(value);return false;}
    else queue.push(entry);
    flush(); return true;
  } };
}

// Sandbox de preload não permite require de módulos locais. Esta projeção fica
// aqui para limitar a segunda serialização (IPC), sem habilitar Node na página.
// contextBridge já recebeu o argumento: isso não limita o custo da primeira cópia.
function projectPeerIdentity(value, requireSession = false) {
  if (!value) return null;
  const from = value.from, session = value.session;
  if (typeof from !== 'string' || !from || from.length > 128) return null;
  if (session !== undefined && (typeof session !== 'string' || session.length > 128)) return null;
  if (requireSession && typeof session !== 'string') return null;
  const out = { from };
  if (session !== undefined) out.session = session;
  return out;
}
function nativePoint(v) { return Number.isFinite(v) && v >= 0 && v <= 1; }
function projectNativeCommand(value) {
  const out = projectPeerIdentity(value);
  if (!out) return null;
  const kind = value.kind;
  out.kind = kind;
  if (kind === 'gamepad') {
    const axes = value.axes, buttons = value.buttons;
    if (!Array.isArray(axes) || axes.length !== 4 || !Array.isArray(buttons) || buttons.length !== 17) return null;
    out.axes = []; out.buttons = [];
    // Não chamar slice/iteradores fornecidos junto de arrays da página.
    for (let i = 0; i < 4; i++) { const v = axes[i]; if (!Number.isFinite(v) || v < -1 || v > 1) return null; out.axes.push(v); }
    for (let i = 0; i < 17; i++) { const v = buttons[i]; if (!nativePoint(v)) return null; out.buttons.push(v); }
  } else if (kind === 'key') {
    const code = value.code, down = value.down;
    if (typeof code !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(code) || typeof down !== 'boolean') return null;
    out.code = code; out.down = down;
  } else if (kind === 'move' || kind === 'button' || kind === 'wheel') {
    const x = value.x, y = value.y;
    if (nativePoint(x) && nativePoint(y)) { out.x = x; out.y = y; }
    if (kind === 'move' && out.x === undefined) return null;
    if (kind === 'button') {
      const button = value.button, down = value.down;
      if ((button !== 0 && button !== 1 && button !== 2) || typeof down !== 'boolean') return null;
      out.button = button; out.down = down;
    } else if (kind === 'wheel') {
      const dy = value.dy, dx = value.dx;
      if (!Number.isFinite(dy)) return null;
      out.dy = Math.max(-10, Math.min(10, dy));
      if (Number.isFinite(dx) && dx) out.dx = Math.max(-10, Math.min(10, dx));
    }
  } else return null;
  return out;
}
function projectControlState(value) {
  if (!value?.on) return { on: false };
  const people = [];
  const source = value.people;
  if (Array.isArray(source)) for (let i = 0; i < Math.min(source.length, 16); i++) {
    const p = source[i]; if (!p) continue;
    const id = p.id, session = p.session, devices = p.devices;
    if (typeof id !== 'string' || !id || id.length > 128
      || session !== undefined && (typeof session !== 'string' || session.length > 128)) continue;
    people.push({ id, session: session || '', devices: {
      keyboard: devices?.keyboard === true, mouse: devices?.mouse === true, gamepad: devices?.gamepad === true,
    } });
  }
  const name = value.name, hue = value.hue;
  return { on: true, name: typeof name === 'string' ? name.slice(0, 40) : '',
    hue: Number.isFinite(hue) ? hue : 0, people };
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
