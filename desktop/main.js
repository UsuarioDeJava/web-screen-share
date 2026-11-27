// App de desktop do Web Screen Share. Abre a sala do seu servidor (a mesma página do
// navegador, então ela se atualiza junto com o servidor) e acrescenta o que o navegador
// não faz sozinho:
// - um seletor próprio de tela/janela, com o som do PC no Windows;
// - uma camada transparente por cima da tela que você está transmitindo (pelo app ou
//   pelo OBS), que não pega cliques e fica de fora da captura: quando alguém aponta,
//   desenha ou reage na sua transmissão, aparece ali, na sua tela de verdade;
// - o modo desenho (Ctrl+Shift+D): você rabisca direto na sua tela, e quem assiste vê
//   o traço na transmissão, ao vivo;
// - o mouse de quem assiste aparecendo na sua tela, e o controle remoto: quem você
//   deixar mexe no seu mouse e teclado (Ctrl+Shift+X tira o controle na hora);
// - o aviso de versão nova do app (instalado: botão de atualizar; portátil: link).
const { app, BrowserWindow, Menu, Notification, desktopCapturer, dialog, globalShortcut, ipcMain, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { createInput } = require('./input');
const { createSystemCursor } = require('./system-cursor');
const { createWindowAudio } = require('./window-audio');
const { createGamepads } = require('./gamepad');
const { createGamepadSetup } = require('./gamepad-setup');
const gamepadModel = require('./shared/gamepad');
const controlWire = require('./shared/control-wire');
const { createNativeInputBudget } = require('./shared/native-input-budget');
const { createControlReceiver } = require('./control-receiver');
const { createNativeVideo } = require('./native-video');
const commandBatch = require('./shared/native-command-batch');
const { installNativeRoomAssets } = require('./shared/native-room-assets');
const { pathToFileURL } = require('node:url');
const networkDiagnostics = require('./shared/network-diagnostics').createNetworkDiagnostics();
const gpuTelemetry = require('./gpu-telemetry').createGpuTelemetry();
const { createUpdates } = require('./updates');
const { createKeyHook } = require('./keyhook');
const { createBorderlessFullscreen } = require('./borderless-fullscreen');
const { resolveCaptureDisplay, findSelectedDisplay, snapshotInputDisplay } = require('./capture-display');
const { normalizePreferences, startupPreferences } = require('./preferences');
const { createActivityLog } = require('./activity-log');
const { createSettingsPanel } = require('./settings-panel');
const { createShortcuts } = require('./shortcuts');
const { createRoomSettings } = require('./room-settings');
const { readConfig, writeConfig } = require('./config-store');
const { normalize: normalizeStyle } = require('./shared/fx');

// Perfil e opções gráficas precisam estar definidos antes de app.ready.
if (process.env.WSS_USER_DATA) app.setPath('userData', process.env.WSS_USER_DATA);

let config = { server: null, trusted: {}, bounds: null, maximized: false, obsDisplay: null, desktop: normalizePreferences() };
const startupWarnings = [];
loadConfig();
const activePreferences = startupPreferences(config.desktop);
if (!activePreferences.hardwareAcceleration) app.disableHardwareAcceleration();
const activity = createActivityLog({ enabled: activePreferences.logging, limit: activePreferences.logLimit });
const log = (category, message, level = 'info', direction = 'local') => activity.add({ category, message, level, direction });
for (const warning of startupWarnings) log('error', warning, 'warn');

const PAGES = path.join(__dirname, 'pages');
const ICON = path.join(PAGES, 'icon.png');
const SELF_TEST = process.argv.includes('--self-test');
// Diagnóstico no Windows: ampliar o vídeo dentro da janela, sem entrar no
// fullscreen nativo. Mantém a aceleração de hardware no seu estado normal.
const WINDOWED_FULLSCREEN_TEST = process.platform === 'win32' && activePreferences.fullscreen === 'windowed';
const BORDERLESS_FULLSCREEN = process.platform === 'win32' && activePreferences.fullscreen === 'borderless';
// A camada por cima da tela só existe onde dá pra tirá-la da captura (senão quem
// assiste veria as marcações duas vezes): Windows 10 2004 ou mais novo, e macOS.
const OVERLAY_SUPPORTED = process.platform === 'win32' || process.platform === 'darwin' || process.env.WSS_FORCE_OVERLAY === '1';
// Som do PC junto com a tela: o Chromium só sabe capturar no Windows.
const SYSTEM_AUDIO = process.platform === 'win32';
const DRAW_SHORTCUT = 'CommandOrControl+Shift+D';
const REVOKE_SHORTCUT = 'CommandOrControl+Shift+X';
const PERMISSIONS = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'notifications']);

let mainWindow = null;
let borderlessFullscreen = null;
let overlay = null;
let overlayOwner = null; // de quem é a camada aberta: 'share' (tela escolhida no app) ou 'obs'
let obsWanted = false; // a sua transmissão do OBS está no ar (com você na sala pelo app)
let drawMode = false; // você está rabiscando a sua tela (a camada pega o mouse)
let identity = { hue: 200, color: null, style: null }; // a sua cor (color: #rrggbb) e o seu estilo (pincel) na sala
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
let input; // mouse e teclado de verdade (criado na primeira vez que alguém controla)
const gamepads = createGamepads({ directory: path.join(app.getPath('userData'), 'gamepad'), onFeedback(value) {
  const session = controlSessions.get(value.id);
  if (controller && ((overlay && !overlay.isDestroyed()) || obsLocal.active()) && controlPeople.get(value.id)?.gamepad && session && !nativeInputBudget.blocked(value.id)) {
    toPage('desktop:gamepad-feedback', { from: value.id, session, strong: value.strong, weak: value.weak, duration: value.duration });
    commandReceiver.event('feedback',{from:value.id,session,strong:value.strong,weak:value.weak,duration:value.duration});
  }
} });
const gamepadSetup = createGamepadSetup({ directory: path.join(app.getPath('userData'), 'gamepad') });
let controlPeople = new Map();
let controlSessions = new Map();
const controlPulses = new Map();
const nativeInputBudget = createNativeInputBudget({ onBlock(id, session) {
  resetPeerInput(id);
  controlPulses.delete(id);
  toPage('desktop:control-blocked', { from: id, session });
  commandReceiver.event('blocked',{from:id,session});
  log('control', 'Concessão de controle bloqueada por excesso de comandos.', 'warn');
} });
const gamepadReceivers = new Map();
let controller = null; // quem está controlando agora: { name }
// Um mouse só: enquanto alguém com o mouse liberado está no modo controle (o 🎮 ligado em
// cima da sua transmissão), o seu mouse some da captura (fica transparente no Windows) e
// a camada, que fica fora da captura, desenha um no lugar só pra você. Quem controla vê o
// mouse dele com o formato do seu (seta, texto, mãozinha...).
let systemCursor; // undefined até a primeira vez; null fora do Windows
const controlModes = new Set(); // quem está no modo controle agora (ids da sala)
let remoteCursorTimer = null;
let localCursorDrawn = ''; // o que a camada está desenhando agora ('' = nada)
let lastCursorShape = null;
const REMOTE_CURSOR_MS = 16;
const commandReceiver=createControlReceiver({getServer:()=>config.server,getMain:()=>mainWindow?.webContents,
  allowed:(peer,grant)=>controlSessions.get(peer)===grant&&controlPeople.has(peer)&&!nativeInputBudget.blocked(peer),
  fault:value=>nativeInputBudget.block(value.from,value.session)});
let picker = null; // seletor de tela aberto: { win, finish }
const windowAudio = createWindowAudio({
  send: (pcm) => toPage('desktop:window-audio-pcm', pcm),
  log: (message) => log('error', message, 'warn'),
});
let keyHook; // gancho de teclado (Windows): undefined até a primeira vez, null se não tem
let keysWanted = false; // você está controlando alguém, com o mouse em cima da transmissão
const updates = createUpdates({
  getWindow: () => mainWindow,
  send: (state) => toPage('desktop:update', state),
  icon: ICON,
  getAuto: () => autoUpdateOn(),
});
// Atualizações automáticas (Configurações > Aplicativo): ligadas se nunca mexeram.
function autoUpdateOn() { return config.autoUpdate !== false; }
function setAutoUpdate(value) {
  const previous = config.autoUpdate;
  config.autoUpdate = value === true;
  if (!saveConfig()) { config.autoUpdate = previous; return { ok: false, auto: autoUpdateOn(), error: 'Não foi possível salvar.' }; }
  updates.autoChanged();
  return { ok: true, auto: autoUpdateOn() };
}
const UPDATE_MESSAGES = {
  off: () => 'Rodando do código-fonte: aqui não tem atualização automática.',
  available: (r) => `Saiu a versão ${r.version}: o aviso está no topo da sala.`,
  ready: (r) => `A versão ${r.version} está pronta: reinicie pelo aviso da sala pra aplicar.`,
  busy: (r) => `Baixando a versão ${r.version}…`,
  current: (r) => `O app está atualizado (versão ${r.current}).`,
  error: () => 'Não deu pra verificar agora (sem internet?).',
};
let lastSources = new Map(); // id -> fonte do desktopCapturer mostrada no seletor
let picked = null; // última escolha do seletor: { kind, displayId }
let shareWanted = false;
let serverLoadFailed = false; // a última tentativa de abrir o servidor falhou
// Usuário de testes: a tela/janela que um administrador escolheu pela sala. A próxima
// transmissão (logo em seguida) usa ela no lugar de abrir o seletor.
let testerChoice = null; // { choice, at }
let diagnosticOrigin = null;
let pendingDiagnosticFault = null;
ipcMain.handle('desktop:diagnostic-fault', (event, enabled) => {
  if (!fromServer(event)) return null;
  if (enabled !== true || diagnosticOrigin !== config.server) pendingDiagnosticFault = null;
  diagnosticOrigin = enabled === true ? config.server : null;
  const result = pendingDiagnosticFault;
  pendingDiagnosticFault = null;
  return result;
});
let failure = null; // { message, timer }: aviso de falha esperando a página de erro carregar
const declined = new Set(); // certificados recusados nesta sessão
let pendingPreferences = { ...activePreferences };
let settingsPanel;
let roomSettings;

// ---------- configuração ----------

function configFile() { return path.join(app.getPath('userData'), 'config.json'); }

function loadConfig() {
  config = { ...config, ...readConfig(configFile(), (message) => startupWarnings.push(message)) };
  if (!config.trusted || typeof config.trusted !== 'object') config.trusted = {};
  config.desktop = normalizePreferences(config.desktop);
  if (config.pendingServer) { config.server = config.pendingServer; delete config.pendingServer; }
  if (process.env.WSS_SERVER) config.server = normalizeServer(process.env.WSS_SERVER);
}

function saveConfig() {
  try {
    writeConfig(configFile(), config);
    return true;
  } catch (err) {
    console.error('Não deu pra salvar a configuração:', err.message);
    return false;
  }
}

// "nas.tail1234.ts.net:3100" -> "https://nas.tail1234.ts.net:3100"
function normalizeServer(raw) {
  let text = String(raw || '').trim();
  if (!text) return null;
  if (!/^[a-z]+:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

function isServerUrl(url) {
  if (!config.server || !url) return false;
  try {
    return new URL(url).origin === config.server;
  } catch {
    return false;
  }
}

// Mensagens só valem vindas da página do servidor aberta na janela principal.
const fromServer = (event) => Boolean(mainWindow) && event.sender === mainWindow.webContents
  && isServerUrl(event.senderFrame ? event.senderFrame.url : mainWindow.webContents.getURL());
const fromSetup = (event) => Boolean(mainWindow) && event.sender === mainWindow.webContents
  && mainWindow.webContents.getURL().startsWith('file:');

// ---------- janela principal ----------

function visibleBounds(bounds) {
  if (!bounds) return null;
  const fits = screen.getAllDisplays().some(({ workArea: a }) =>
    bounds.x < a.x + a.width - 80 && bounds.x + bounds.width > a.x + 80 && bounds.y >= a.y - 10 && bounds.y < a.y + a.height - 80);
  return fits ? bounds : null;
}

function showSetup(error) {
  mainWindow.loadFile(path.join(PAGES, 'setup.html'), { query: { server: config.server || '', error: error || '' } });
}

function showFailure() {
  if (!failure || !mainWindow) return;
  const { message } = failure;
  failure = null;
  showSetup(message);
}

function openServer() {
  serverLoadFailed = false;
  if (failure) clearTimeout(failure.timer);
  failure = null;
  if (!config.server) showSetup();
  else mainWindow.loadURL(`${config.server}/`);
}

function createMainWindow() {
  const bounds = visibleBounds(config.bounds) || { width: 1280, height: 800 };
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 420,
    minHeight: 480,
    show: false,
    title: 'Web Screen Share',
    icon: ICON,
    backgroundColor: '#07080d',
    autoHideMenuBar: true,
    frame: !BORDERLESS_FULLSCREEN,
    thickFrame: !BORDERLESS_FULLSCREEN,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: false,
      // Transmissão e voz continuam firmes com a janela minimizada ou atrás de outras.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      disableHtmlFullscreenWindowResize: WINDOWED_FULLSCREEN_TEST || BORDERLESS_FULLSCREEN,
      additionalArguments: BORDERLESS_FULLSCREEN ? ['--wss-borderless-window'] : [],
    },
  });
  if (config.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => {
    if (!SELF_TEST) {
      mainWindow.show();
      if (process.argv.includes('--settings')) openSettings();
    }
  });

  const { webContents } = mainWindow;
  if (BORDERLESS_FULLSCREEN) {
    borderlessFullscreen = createBorderlessFullscreen(mainWindow, screen,
      (state) => { toPage('desktop:window-state', state); settingsPanel?.layout(); log('system', state.fullscreen ? 'Tela cheia sem bordas ativada.' : 'Janela restaurada.'); });
    mainWindow.on('enter-html-full-screen', () => borderlessFullscreen.set('html', true));
    mainWindow.on('leave-html-full-screen', () => borderlessFullscreen.set('html', false));
    mainWindow.on('focus', () => borderlessFullscreen.focus(true));
    mainWindow.on('blur', () => borderlessFullscreen.focus(false));
    mainWindow.on('maximize', () => borderlessFullscreen.publish());
    mainWindow.on('unmaximize', () => borderlessFullscreen.publish());
  }
  // Links (do chat, do README...) abrem no navegador; nada sai do servidor aqui dentro.
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (isServerUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  webContents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    obsLocal.stop();nativeVideo.stop();
    lastInputBatch.delete(webContents);
    updates.pageGone();
    roomSettings?.cancel();
    windowAudio.stop();
    shareWanted = false;
    obsWanted = false;
    closeOverlay();
    if (borderlessFullscreen) borderlessFullscreen.exit();
    setKeyCapture(false); // a sala vai recarregar: o teclado volta a ser seu
  });
  webContents.on('render-process-gone', () => { obsLocal.stop();nativeVideo.stop(); setKeyCapture(false); setController(null); });
  webContents.on('did-fail-load', (event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isServerUrl(url)) return; // -3: carregamento interrompido
    serverLoadFailed = true;
    log('error', `Falha ao carregar o servidor: ${description} (${code}).`, 'error');
    // Trocar de página enquanto o Chromium ainda monta a página de erro deixa a janela
    // sem desenhar: espera ela terminar de carregar (ou um tempo, se não vier).
    if (failure) clearTimeout(failure.timer);
    failure = {
      message: `Não deu pra abrir ${config.server} (${description}). Veja se o servidor está ligado e se este PC alcança ele (mesma rede ou Tailscale).`,
      timer: setTimeout(showFailure, 1500),
    };
  });
  webContents.on('did-finish-load', async () => {
    await webContents.insertCSS(fs.readFileSync(path.join(PAGES, 'window.css'), 'utf8'));
    if (borderlessFullscreen) borderlessFullscreen.publish();
    publishOverlayState();
    publishVisualMode();
    log('connection', isServerUrl(webContents.getURL()) ? 'Página da sala carregada.' : 'Tela de configuração carregada.');
    if (SELF_TEST) {
      const keys = await selfTestKeys();
      console.log(`SELF-TEST ${keys === 'ok' ? 'OK' : `TECLADO: ${keys}`}: ${webContents.getURL().split('?')[0]}`);
      // 3: o gancho de teclado nem instala (erro de verdade); 4: instalou, mas a tecla de
      // teste não chegou (pode ser a máquina do teste, que não deixa simular tecla).
      app.exit(keys === 'ok' ? 0 : keys === 'no-hook' ? 3 : 4);
      return;
    }
    if (failure) {
      clearTimeout(failure.timer);
      setTimeout(showFailure, 50);
      return;
    }
    if (serverLoadFailed || !isServerUrl(webContents.getURL())) return;
    const ok = await webContents.executeJavaScript('Boolean(document.getElementById("login-form") && document.getElementById("grid"))').catch(() => false);
    if (!ok) showSetup('Esse endereço abriu, mas não é um servidor do Web Screen Share.');
  });
  webContents.on('render-process-gone', (event, details) => {
    if (diagnosticOrigin === config.server && ['crashed','oom','abnormal-exit'].includes(details.reason))
      pendingDiagnosticFault = { code:'renderer_crash', at:Date.now(), detail:`Motivo: ${details.reason}, código ${details.exitCode}.` };
    shareWanted = false;
    log('error', `Processo da interface encerrado: ${details.reason}, código ${details.exitCode}.`, 'error');
    if (borderlessFullscreen) borderlessFullscreen.exit();
    obsWanted = false;
    closeOverlay();
    if (details.reason !== 'clean-exit') openServer();
  });
  webContents.on('before-input-event', (event, input) => handleShortcut(event, input));
  mainWindow.on('unresponsive', () => {
    if (diagnosticOrigin === config.server && isServerUrl(webContents.getURL()))
      pendingDiagnosticFault = { code:'interface_stalled', at:Date.now(), detail:'O Electron avisou que a janela parou de responder.' };
    log('error', 'A interface deixou de responder.', 'warn');
  });
  mainWindow.on('responsive', () => log('system', 'A interface voltou a responder.'));
  webContents.on('console-message', (event) => {
    if (event.level === 'warning' || event.level === 'error') {
      log('error', event.message || 'Aviso da interface.', event.level === 'error' ? 'error' : 'warn');
    }
  });

  mainWindow.on('focus', () => mainWindow.flashFrame(false));
  mainWindow.on('close', () => {
    const restore = borderlessFullscreen && borderlessFullscreen.restoreState;
    config.maximized = restore ? restore.maximized : mainWindow.isMaximized();
    if (restore) config.bounds = restore.bounds;
    else if (!config.maximized && !mainWindow.isMinimized()) config.bounds = mainWindow.getBounds();
    saveConfig();
  });
  mainWindow.on('closed', () => {
    obsLocal.stop();
    if (settingsPanel) settingsPanel.close();
    mainWindow = null;
    borderlessFullscreen = null;
    closeOverlay();
    app.quit();
  });
  openServer();
}

// Sem menu (a tecla Alt é do "apontar/desenhar" na sala), os atalhos do navegador vêm daqui.
function handleShortcut(event, input) {
  if (input.type !== 'keyDown') return;
  const key = input.key.toLowerCase();
  const ctrl = input.control || input.meta;
  const { webContents } = mainWindow;
  let handled = true;
  if (key === 'f5' || (ctrl && !input.shift && key === 'r')) webContents.reload();
  else if (ctrl && input.shift && key === 'r') webContents.reloadIgnoringCache();
  else if (key === 'f11') {
    if (borderlessFullscreen) {
      if (borderlessFullscreen.active) exitBorderlessFullscreen();
      else borderlessFullscreen.set('window', true);
    } else if (WINDOWED_FULLSCREEN_TEST) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
  else if (key === 'escape' && settingsPanel?.isOpen()) settingsPanel.close();
  else if (key === 'escape' && borderlessFullscreen && borderlessFullscreen.active) exitBorderlessFullscreen();
  else if (ctrl && (key === ',' || input.code === 'Comma')) openSettings();
  else if (key === 'f12' || (ctrl && input.shift && key === 'i')) webContents.toggleDevTools();
  else if (ctrl && (key === '=' || key === '+')) webContents.setZoomLevel(Math.min(webContents.getZoomLevel() + 0.5, 4));
  else if (ctrl && key === '-') webContents.setZoomLevel(Math.max(webContents.getZoomLevel() - 0.5, -3));
  else if (ctrl && key === '0') webContents.setZoomLevel(0);
  else handled = false;
  if (handled) event.preventDefault();
  if (handled && settingsPanel?.isOpen()) settingsPanel.layout(); // o zoom muda a barra de título
}

function exitBorderlessFullscreen() {
  if (!borderlessFullscreen) return;
  borderlessFullscreen.exit();
  mainWindow.webContents.executeJavaScript('document.fullscreenElement ? document.exitFullscreen() : undefined').catch(() => {});
}

ipcMain.on('desktop:window-action', (event, action) => {
  if (!BORDERLESS_FULLSCREEN || (!fromServer(event) && !fromSetup(event))) return;
  if (action === 'close') mainWindow.close();
  else if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize' && !borderlessFullscreen.active) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

function openSettings(section = 'profile') {
  if (borderlessFullscreen && borderlessFullscreen.active) exitBorderlessFullscreen();
  if (settingsPanel) settingsPanel.open(section);
}
ipcMain.on('desktop:settings-open', (event, section) => {
  if (fromServer(event) || fromSetup(event)) openSettings(section);
});
ipcMain.on('desktop:activity', (event, entry) => {
  if (fromServer(event)) activity.add(entry);
});

function settingsState() {
  const restartRequired = Boolean(config.pendingServer)
    || pendingPreferences.fullscreen !== activePreferences.fullscreen
    || pendingPreferences.hardwareAcceleration !== activePreferences.hardwareAcceleration;
  return {
    nativeVideo: nativeVideo.caps(),
    server: config.pendingServer || config.server, activeServer: config.server,
    gamepadClientPath: path.join(app.getPath('userData'), 'gamepad', process.arch, 'ViGEmClient.dll'),
    preferences: pendingPreferences, active: activePreferences, restartRequired, log: activity.snapshot(), shortcuts: shortcutState(),
    update: { mode: updates.mode, auto: autoUpdateOn() },
    environment: {
      app: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
      platform: `${process.platform} ${process.arch}`,
      displays: screen.getAllDisplays().map((d) => `${d.label || `Monitor ${d.id}`}: ${Math.round(d.size.width * d.scaleFactor)}×${Math.round(d.size.height * d.scaleFactor)} · ${Math.round(d.displayFrequency)} Hz · escala ${Math.round(d.scaleFactor * 100)}%`),
    },
  };
}

function saveSettings(value) {
  const server = normalizeServer(value && value.server);
  if (!server) return { ok: false, error: 'Informe um endereço HTTP ou HTTPS válido.' };
  const preferences = normalizePreferences(value.preferences);
  if (process.platform !== 'win32' && preferences.fullscreen !== 'native') return { ok: false, error: 'Este modo de tela cheia está disponível no Windows.' };
  const previous = { ...config };
  config.desktop = preferences;
  if (server === config.server) delete config.pendingServer;
  else config.pendingServer = server;
  if (!saveConfig()) { config = previous; return { ok: false, error: 'Não foi possível salvar as configurações.' }; }
  const overlayChanged = pendingPreferences.overlay !== preferences.overlay;
  pendingPreferences = preferences;
  activity.configure(preferences);
  publishVisualMode();
  if (overlayChanged) reconcileOverlays();
  log('system', 'Configurações do aplicativo salvas.');
  return { ok: true };
}

// ---------- seletor de tela/janela ----------
function obsPublication(value){
  if(!value || !/^pub_[a-f0-9]{32}$/.test(value.path) || !/^[a-f0-9]{64}$/.test(value.token))throw Error('Publicação OBS inválida.');
  return {path:value.path,token:value.token,url:config.server+'/obs-publish/'+value.path.slice(4),expiresAt:Number(value.expiresAt)||0};
}
const obsLocal=require('./obs-local').createObsLocal({
  fetch:(url,options)=>mainWindow.webContents.session.fetch(url,options),
  renew:async()=>{
    const wc=mainWindow?.webContents;
    if(!wc || !isServerUrl(wc.getURL()))return null;
    return obsPublication(await wc.executeJavaScript('window.wssRoomSettings.read("obs-publication")'));
  }
});
ipcMain.handle('desktop:obs-local',async(event,value)=>{
  if(!fromServer(event))throw Error('Origem não autorizada.');
  if(!value){obsLocal.stop();return null;}
  const publication=obsPublication(value);
  const crypto=require('node:crypto');
  if(!config.obsLocalSecret){config.obsLocalSecret=crypto.randomBytes(32).toString('hex');saveConfig();}
  const localToken=crypto.createHmac('sha256',config.obsLocalSecret).update(config.server).digest('hex');
  return obsLocal.configure({...publication,localToken});
});
ipcMain.handle('desktop:obs-direct',(event,value)=>{
  if(!fromServer(event))throw Error('Origem não autorizada.');
  return obsLocal.direct(value);
});
const nativeVideo = createNativeVideo({ pickSource, enabled: () => pendingPreferences.nativeVideo,
  notify: value => { if(mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('desktop:native-video',value); } });
ipcMain.handle('desktop:native-video-caps', event => fromServer(event) ? nativeVideo.caps() : {available:false,enabled:false});
ipcMain.handle('desktop:native-video-prepare', event => { if(!fromServer(event))throw Error('Origem não autorizada.');return nativeVideo.prepare(); });
ipcMain.handle('desktop:native-video-command', (event,value) => { if(!fromServer(event))throw Error('Origem não autorizada.');return nativeVideo.command(value); });

function pickSource(options = {}) {
  const preset = testerChoice && Date.now() - testerChoice.at < 20000 ? testerChoice.choice : null;
  testerChoice = null;
  if (preset) return Promise.resolve(options.nativeWindow && preset.kind !== 'window' ? null : preset);
  if (picker) {
    picker.win.focus();
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      parent: mainWindow,
      modal: true,
      width: 880,
      height: 640,
      minWidth: 560,
      minHeight: 440,
      show: false,
      title: 'Escolha o que compartilhar',
      icon: ICON,
      backgroundColor: '#0b0d15',
      autoHideMenuBar: true,
      minimizable: false,
      maximizable: false,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, sandbox: true },
    });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      picker = null;
      resolve(result);
      if (!win.isDestroyed()) win.close();
    };
    picker = { win, finish, nativeWindow: options.nativeWindow === true };
    win.on('closed', () => finish(null));
    win.once('ready-to-show', () => win.show());
    win.loadFile(path.join(PAGES, 'picker.html'));
  });
}

// "Tela 2 (2560×1440, principal)", em pixels de verdade (sem a escala do Windows).
function displayLabel(display, displays) {
  const width = Math.round(display.size.width * display.scaleFactor);
  const height = Math.round(display.size.height * display.scaleFactor);
  const primary = display.id === screen.getPrimaryDisplay().id ? ', principal' : '';
  return `Tela ${displays.indexOf(display) + 1} (${width}×${height}${primary})`;
}

function screenLabel(source, displays) {
  if (displays.length <= 1) return 'Tela inteira';
  const display = displays.find((d) => String(d.id) === String(source.display_id));
  return display ? displayLabel(display, displays) : 'Tela';
}

ipcMain.handle('picker:info', () => ({ systemAudio: SYSTEM_AUDIO && !picker?.nativeWindow, windowAudio: windowAudio.supported && !picker?.nativeWindow,
  overlay: OVERLAY_SUPPORTED, nativeWindow: !!picker?.nativeWindow }));

ipcMain.handle('picker:sources', async (event) => {
  if (!picker || event.sender !== picker.win.webContents) return [];
  const currentPicker = picker;
  const sources = await desktopCapturer.getSources({
    types: picker.nativeWindow ? ['window'] : ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true,
  });
  if(picker !== currentPicker) return [];
  // As janelas do próprio app ficam de fora.
  const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
  const displays = screen.getAllDisplays();
  lastSources = new Map();
  return sources.filter((s) => !own.has(s.id)).map((s) => {
    lastSources.set(s.id, s);
    const kind = s.id.startsWith('screen:') ? 'screen' : 'window';
    return {
      id: s.id,
      kind,
      name: kind === 'screen' ? screenLabel(s, displays) : s.name,
      thumbnail: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : null,
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    };
  });
});

// Usuário de testes: as telas e janelas só pelo nome (sem prévia), e a escolhida.
// (às vezes a busca volta vazia, como no seletor: tenta mais umas vezes)
async function testerSources(wanted = null) {
  for (let i = 0; ; i += 1) {
    const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
    const sources = (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false }))
      .filter((s) => !own.has(s.id));
    if (i >= 5 || (sources.length && (!wanted || sources.some((s) => s.id === wanted)))) return sources;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
ipcMain.handle('desktop:tester-sources', async (event) => {
  if (!fromServer(event)) return [];
  const displays = screen.getAllDisplays();
  return (await testerSources()).map((s) => {
    const kind = s.id.startsWith('screen:') ? 'screen' : 'window';
    return { id: s.id, kind, name: kind === 'screen' ? screenLabel(s, displays) : s.name };
  });
});
ipcMain.handle('desktop:tester-preselect', async (event, choice) => {
  if (!fromServer(event) || !choice || typeof choice.id !== 'string') return { error: 'Origem não autorizada.' };
  const source = (await testerSources(choice.id)).find((s) => s.id === choice.id);
  if (!source) return { error: 'Essa tela ou janela não existe mais. Atualize a lista.' };
  const kind = source.id.startsWith('screen:') ? 'screen' : 'window';
  testerChoice = { at: Date.now(), choice: { source, kind, displayId: source.display_id, audio: Boolean(choice.audio),
    windowAudio: kind === 'window' && choice.windowAudio === true && windowAudio.supported } };
  return { ok: true, kind, name: source.name };
});
ipcMain.on('desktop:tester-log', (event, message, level) => {
  if (fromServer(event) && typeof message === 'string') log('test', message.slice(0, 400), level === 'warn' ? 'warn' : 'info', 'in');
});

ipcMain.on('picker:choose', (event, choice) => {
  if (!picker || event.sender !== picker.win.webContents || !choice) return;
  const source = lastSources.get(choice.id);
  if (!source) return;
  const kind = source.id.startsWith('screen:') ? 'screen' : 'window';
  if(picker.nativeWindow && kind!=='window') return;
  picker.finish({ source, kind, displayId: source.display_id, audio: Boolean(choice.audio), windowAudio: kind === 'window' && choice.windowAudio === true && !picker.nativeWindow });
});

ipcMain.on('picker:cancel', (event) => {
  if (picker && event.sender === picker.win.webContents) picker.finish(null);
});

// ---------- camada por cima da tela transmitida ----------

// Tela escolhida no seletor do app (só tela inteira: numa janela não dá pra saber onde
// cada ponto cai).
function shareDisplay() {
  if (!picked || picked.kind !== 'screen') return null;
  return findSelectedDisplay(picked.displayId, screen.getAllDisplays());
}

// Monitor que o OBS está capturando: o escolhido na janela do OBS da sala, ou o principal.
function obsDisplay() {
  if (config.obsDisplay === 'off') return null;
  if (config.obsDisplay == null || config.obsDisplay === '') return screen.getPrimaryDisplay();
  return screen.getAllDisplays().find((d) => String(d.id) === String(config.obsDisplay)) || null;
}

function openObsOverlay() {
  if (overlayOwner === 'share' && overlay) return false; // a tela compartilhada pelo app tem prioridade
  return openOverlay(obsDisplay(), 'obs');
}

function overlayState() {
  const active = Boolean(overlay && !overlay.isDestroyed());
  return { enabled: pendingPreferences.overlay, share: active && overlayOwner === 'share', obs: active && overlayOwner === 'obs' };
}

function publishOverlayState() {
  toPage('desktop:overlay-state', overlayState());
  shortcuts.setActive(['draw'], Boolean(OVERLAY_SUPPORTED && overlay && !overlay.isDestroyed()));
  publishShortcutState();
}
function publishVisualMode() {
  toPage('desktop:visual-mode', pendingPreferences.visualMode);
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('desktop:visual-mode', pendingPreferences.visualMode);
  settingsPanel?.visualModeChanged(pendingPreferences.visualMode);
}

function reconcileOverlays() {
  if (!pendingPreferences.overlay) closeOverlay();
  else if (shareWanted && shareDisplay()) openOverlay(shareDisplay(), 'share');
  else if (obsWanted) openObsOverlay();
  else closeOverlay();
  publishOverlayState();
}

function openOverlay(display, owner) {
  if (!OVERLAY_SUPPORTED || !display || !pendingPreferences.overlay) return false;
  const inputDisplay = snapshotInputDisplay(display);
  if (!inputDisplay) { closeOverlay(); return false; }
  closeOverlay();
  overlay = new BrowserWindow({
    ...inputDisplay.bounds,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    title: 'Web Screen Share (marcações)',
    webPreferences: { preload: path.join(__dirname, 'overlay-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  overlay.displayId = inputDisplay.id;
  overlay.inputDisplay = inputDisplay;
  overlayOwner = owner;
  overlay.setIgnoreMouseEvents(true);
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Fora da captura: quem assiste já vê as marcações por cima do vídeo, no navegador.
  overlay.setContentProtection(true);
  const self = overlay;
  self.webContents.once('did-finish-load', () => {
    if (!self.isDestroyed() && overlay === self) {
      self.webContents.send('desktop:visual-mode', pendingPreferences.visualMode);
      toOverlay({ type: 'draw-mode', on: drawMode, hue: identity.hue, color: identity.color, style: identity.style });
      publishShortcutState(true); renderControlBanner();
    }
  });
  overlay.on('closed', () => {
    if (overlay !== self) return;
    if (controller) {
      setController(null);
      toPage('desktop:control-revoke');
    }
    setDrawMode(false);
    overlay = null;
    overlayOwner = null;
    publishOverlayState();
  });
  overlay.once('ready-to-show', () => {
    if (overlay) overlay.showInactive();
  });
  // O endereço do servidor: as fotos de perfil no mouse só podem vir dele.
  overlay.loadFile(path.join(PAGES, 'overlay.html'), { query: { server: config.server || '' } });
  publishOverlayState();
  return true;
}

// Sem dono: fecha qualquer uma. Com dono: só se a camada aberta for dele.
function closeOverlay(owner) {
  if (owner && overlayOwner !== owner) return;
  setDrawMode(false);
  if (controller) {
    setController(null);
    toPage('desktop:control-revoke');
  }
  const current = overlay;
  overlay = null;
  overlayOwner = null;
  if (current && !current.isDestroyed()) current.destroy();
  publishOverlayState();
}

// ---------- modo desenho: rabiscar a sua tela, ao vivo pra quem assiste ----------

// Enquanto ele está ligado, estas teclas valem em qualquer programa (a camada não pega
// o foco, pra não tirar o jogo da frente).
const DRAW_KEYS = [
  { id: 'drawExit', accelerator: 'Escape', keys: 'Esc', label: 'Sair do desenho', context: 'draw', action: () => setDrawMode(false) },
  { id: 'drawUndo', accelerator: 'CommandOrControl+Z', keys: process.platform === 'darwin' ? '⌘+Z' : 'Ctrl+Z', label: 'Desfazer desenho', context: 'draw', action: () => toOverlay({ type: 'draw-undo' }) },
  { id: 'drawClear', accelerator: 'Delete', keys: 'Del', label: 'Limpar desenho', context: 'draw', action: () => toOverlay({ type: 'draw-clear' }) },
];
const shortcutStatuses = new Map();
let shortcutRevision = 0, shortcutSerialized = '', shortcutPublished = 0;
const shortcuts = createShortcuts({ api: globalShortcut, definitions: [
  { id: 'draw', accelerator: DRAW_SHORTCUT, keys: process.platform === 'darwin' ? '⌘+Shift+D' : 'Ctrl+Shift+D', label: 'Alternar desenho na tela', context: 'share', action: toggleDrawMode },
  { id: 'revoke', accelerator: REVOKE_SHORTCUT, keys: process.platform === 'darwin' ? '⌘+Shift+X' : 'Ctrl+Shift+X', label: 'Revogar controle remoto', context: 'control', action: revokeByShortcut },
  ...DRAW_KEYS,
], onChange(rows) {
  for (const row of rows) {
    if (['unavailable', 'release-failed'].includes(row.status) && shortcutStatuses.get(row.id) !== row.status)
      log('system', `Atalho ${row.keys}: ${row.status === 'release-failed' ? 'não foi possível liberar' : 'não foi possível registrar; verifique conflitos com outros programas'}.`, 'warn');
    shortcutStatuses.set(row.id, row.status);
  }
  publishShortcutState();
} });
function shortcutState() {
  const value = { entries: shortcuts.snapshot(), drawing: drawMode, drawAvailable: Boolean(overlay && !overlay.isDestroyed()),
    controlling: Boolean(controller), emergencyPolling: Boolean(controller && input?.revokeKeysDown), overlaySupported: OVERLAY_SUPPORTED };
  const serialized = JSON.stringify(value);
  if (serialized !== shortcutSerialized) { shortcutSerialized = serialized; shortcutRevision++; }
  return { ...value, revision: shortcutRevision };
}
function publishShortcutState(force = false) {
  const state = shortcutState();
  if (!force && state.revision === shortcutPublished) return;
  shortcutPublished = state.revision;
  settingsPanel?.shortcutsChanged(state);
  toOverlay({ type: 'draw-shortcuts', availability: Object.fromEntries(state.entries.map(row => [row.id, row.status === 'registered'])) });
}
function shortcutAction(action) {
  if (action === 'retry') { shortcuts.retry(); renderControlBanner(); }
  else if (action === 'draw-toggle') {
    if (!overlay || overlay.isDestroyed()) throw new Error('Inicie uma transmissão com marcações para desenhar.');
    toggleDrawMode();
  } else if (action === 'revoke') revokeByShortcut();
  else throw new Error('Ação de atalho inválida.');
  publishShortcutState(); return shortcutState();
}

function toOverlay(event) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('overlay:event', event);
}

// O que você rabiscou vai pra página da sala, que manda pra quem assiste a transmissão
// dona da camada (a tela compartilhada pelo app ou a do OBS).
function toRoom(message) {
  if (mainWindow && !mainWindow.isDestroyed() && overlayOwner) {
    mainWindow.webContents.send('desktop:local-draw', { ...message, owner: overlayOwner });
  }
}

function setDrawMode(on) {
  const next = Boolean(on) && Boolean(overlay) && !overlay.isDestroyed();
  if (next === drawMode) return;
  drawMode = next;
  if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!drawMode);
  shortcuts.setActive(DRAW_KEYS.map(key => key.id), drawMode);
  toOverlay({ type: 'draw-mode', on: drawMode, hue: identity.hue, color: identity.color, style: identity.style });
  if (!drawMode) toRoom({ type: 'clear' }); // saindo, os rabiscos somem pra todo mundo
  publishShortcutState();
}

function toggleDrawMode() {
  if (overlay && !overlay.isDestroyed()) {
    setDrawMode(!drawMode);
    return;
  }
  if (Notification.isSupported()) {
    new Notification({
      title: 'Web Screen Share',
      body: OVERLAY_SUPPORTED
        ? 'Pra desenhar na sua tela, transmita a tela inteira pelo app (ou pelo OBS, com o app aberto na sala).'
        : 'Desenhar na tela não funciona neste sistema.',
      icon: ICON,
    }).show();
  }
}

const fromOverlay = (event) => Boolean(overlay) && !overlay.isDestroyed() && event.sender === overlay.webContents;

ipcMain.on('overlay:draw', (event, data) => {
  if (!fromOverlay(event) || !drawMode || !data || !Array.isArray(data.points)) return;
  const points = data.points.filter((v) => Number.isFinite(v)).map((v) => Math.min(1, Math.max(0, v)));
  toRoom({
    type: 'draw', id: Number(data.id) || 0, points, end: Boolean(data.end),
    hue: Number.isInteger(data.hue) ? data.hue : identity.hue,
    color: HEX_COLOR.test(data.color || '') ? data.color : undefined,
    arrow: data.arrow === true, // Shift + arrastar: termina numa flecha
  });
});
ipcMain.on('overlay:undo', (event, id) => {
  if (fromOverlay(event)) toRoom({ type: 'undo', id: Number(id) || 0 });
});
ipcMain.on('overlay:clear', (event) => {
  if (fromOverlay(event)) toRoom({ type: 'clear' });
});
ipcMain.on('overlay:exit', (event) => {
  if (fromOverlay(event)) setDrawMode(false);
});

// ---------- controle remoto ----------

let inputGeneration = 0, inputRecoveryReady = false, inputFailedAt = -Infinity, inputQuitting = false;
const getInput = (retry = false) => {
  if (inputQuitting) return null;
  if (input?.available?.() === false) {
    if (!retry || controller || !inputRecoveryReady || performance.now() - inputFailedAt < 1000) return null;
    input = undefined;
  }
  if (input === undefined) {
    const generation = ++inputGeneration;
    inputRecoveryReady = false;
    input = createInput({ onFailure(reason) {
      if (generation !== inputGeneration) return;
      inputFailedAt = performance.now();
      setController(null); toPage('desktop:control-revoke');
      toPage('desktop:input-error', reason + ' Controle interrompido; abra Controle na sala para tentar novamente após a neutralização.');
    } });
    input?.settled?.then(ok => {
      if (generation !== inputGeneration) return;
      inputRecoveryReady = ok === true;
      if (!ok) toPage('desktop:input-error', 'A neutralização não foi confirmada. O controle permanece bloqueado; verifique as teclas/botões localmente e reinicie o app.');
    });
  }
  return input;
};

// Ponto da tela transmitida (0 a 1) em pixels de verdade do monitor.
// Ponto da tela (em DIP, como o Electron conta) pra uma posição de 0 a 1 no monitor.
function toScreen(display, x, y) {
  const b = display.bounds;
  return {
    x: b.x + Math.min(1, Math.max(0, Number(x) || 0)) * (b.width - 1),
    y: b.y + Math.min(1, Math.max(0, Number(y) || 0)) * (b.height - 1),
  };
}

// O mouse do Windows anda em pixels de verdade (com escala de tela, DIP ≠ pixel).
const toDevice = (point) => (process.platform === 'win32' ? screen.dipToScreenPoint(point) : point);

// ---- você tem prioridade no seu mouse
// Mexeu no seu mouse de verdade enquanto alguém controla: o controle pausa até 1,5 s
// depois do seu último movimento (e solta o que a pessoa estava apertando). Dá pra saber
// que foi você porque o mouse sai de onde o controle (ou a última olhada) deixou.
const LOCAL_PRIORITY_MS = 1500;
const CONTROL_TICK_MS = 50;
const NEAR = 3; // DIP (arredondamento da escala de tela)
let recentMoves = []; // onde o controle pôs o mouse nos últimos instantes: { x, y, at } (DIP)
let lastCursor = null; // onde o mouse estava na última olhada
let localUntil = 0;
let localPaused = false;
let controlTimer = null;
let revokeKeysWereDown = false;

function localActive() {
  const now = Date.now();
  const p = screen.getCursorScreenPoint();
  recentMoves = recentMoves.filter((m) => now - m.at < 600);
  const near = (a) => Math.abs(p.x - a.x) <= NEAR && Math.abs(p.y - a.y) <= NEAR;
  if (recentMoves.some(near)) {
    lastCursor = p; // onde o controle pôs
  } else if (lastCursor && near(lastCursor)) {
    // parado (ou tremidinha): continua comparando com o mesmo ponto
  } else if (lastCursor || recentMoves.length) {
    lastCursor = p;
    localUntil = now + LOCAL_PRIORITY_MS;
    if (!localPaused) {
      localPaused = true;
      if (input) input.releaseAll(); // nada da pessoa fica apertado enquanto você mexe
      renderControlBanner();
    }
  } else {
    lastCursor = p;
  }
  return now < localUntil;
}

function controlTick() {
  if (!controller) return;
  for (const [id, at] of controlPulses) if (Date.now() - at > 750) {
    resetPeerInput(id); controlPulses.delete(id);
  }
  localActive();
  if (localPaused && Date.now() >= localUntil) {
    localPaused = false;
    renderControlBanner();
  }
  // Ctrl+Shift+X lido direto do teclado (Windows), além do atalho registrado.
  const down = Boolean(input && input.revokeKeysDown && input.revokeKeysDown());
  if (down && !revokeKeysWereDown) revokeByShortcut();
  revokeKeysWereDown = down;
}

// Ctrl+Shift+X: para na hora, aqui mesmo, e avisa a sala (a pessoa perde o botão).
function revokeByShortcut() {
  if (!controller) return;
  setController(null);
  toPage('desktop:control-revoke');
}

function renderControlBanner() {
  toOverlay({
    type: 'control',
    on: Boolean(controller),
    name: controller && controller.name,
    hue: controller && controller.hue,
    paused: localPaused,
    shortcut: shortcuts.registered('revoke') || Boolean(input && input.revokeKeysDown),
  });
}

function setController(next) {
  const wasOn = Boolean(controller);
  const previousPeople = controlPeople;
  const people = Array.isArray(next?.people) ? next.people.slice(0, 16) : [];
  for (const [id, devices] of previousPeople) {
    const replacement = people.find(p => p.id === id);
    const changedSession = !replacement || (replacement.session || '') !== (controlSessions.get(id) || '');
    const revoked = { keyboard: devices.keyboard && (changedSession || !replacement.devices?.keyboard),
      mouse: devices.mouse && (changedSession || !replacement.devices?.mouse) };
    input?.releaseDevices?.(revoked);
    if (devices.gamepad && (changedSession || !replacement.devices?.gamepad)) gamepads.neutralize?.(id);
    if (changedSession) controlPulses.delete(id);
  }
  nativeInputBudget.retain(people);
  controlPeople = new Map(people.filter((p) => typeof p.id === 'string').map((p) => [p.id, gamepadModel.permissions(p.devices)]));
  controlSessions = new Map(people.filter((p) => typeof p.id === 'string' && typeof p.session === 'string').map((p) => [p.id, p.session]));
  commandReceiver.sync(people);
  for (const id of controlPulses.keys()) if (!controlPeople.has(id)) controlPulses.delete(id);
  gamepads.retain(new Set([...controlPeople].filter(([, devices]) => devices.gamepad).map(([id]) => id)));
  for (const id of gamepadReceivers.keys()) if (!controlPeople.get(id)?.gamepad) {
    gamepadReceivers.delete(id); toPage('desktop:gamepad-state', { id, connected: false });
  }
  controller = next && next.name ? { name: String(next.name).slice(0, 40), hue: Number(next.hue) || 0 } : null;
  if (wasOn && !controller && input) input.releaseAll(); // nada fica apertado
  if (controller && !wasOn) {
    recentMoves = [];
    lastCursor = null;
    localUntil = 0;
    localPaused = false;
    revokeKeysWereDown = false;
    getInput();
    shortcuts.setActive(['revoke'], true);
    clearInterval(controlTimer);
    controlTimer = setInterval(controlTick, CONTROL_TICK_MS);
  } else if (!controller && wasOn) {
    clearInterval(controlTimer);
    controlTimer = null;
    localPaused = false;
    shortcuts.setActive(['revoke'], false);
  }
  for (const id of [...controlModes]) if (!controller || !controlPeople.get(id)?.mouse) controlModes.delete(id);
  updateRemoteCursorTimer();
  renderControlBanner();
  publishShortcutState();
}

// ---- um mouse só (veja controlModes)
function getSystemCursor() {
  if (systemCursor === undefined) {
    try { systemCursor = createSystemCursor({ markerFile: path.join(app.getPath('userData'), 'cursor-hidden') }); } catch { systemCursor = null; }
  }
  return systemCursor;
}
const mouseControllers = () => [...controlModes].filter((id) => controlPeople.get(id)?.mouse);
function sharedDisplay() {
  if (overlayOwner !== 'share' || !overlay || overlay.isDestroyed()) return null;
  return screen.getAllDisplays().find((d) => d.id === overlay.displayId) || null;
}
function syncRemoteCursor() {
  const cursor = getSystemCursor();
  const p = screen.getCursorScreenPoint();
  const display = sharedDisplay();
  const b = display && display.bounds;
  const inside = Boolean(b) && p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height;
  // Você mexendo no mouse (prioridade) ou ele fora da tela transmitida: o seu volta na hora.
  const hide = Boolean(cursor) && Boolean(controller) && !localPaused && inside && mouseControllers().length > 0;
  try {
    if (hide) cursor.hide();
    else if (cursor) cursor.restore();
  } catch (err) {
    console.error('Cursor do sistema:', err.message);
  }
  // O formato agora, pra quem controla (só manda quando muda).
  if (cursor && controller && mouseControllers().length) {
    let shape = null;
    try { shape = cursor.shape(); } catch {}
    if (shape && shape !== lastCursorShape) {
      lastCursorShape = shape;
      toPage('desktop:cursor-shape', shape);
    }
  }
  // Na camada (fora da captura): o mouse, pra você ver onde ele está.
  const drawn = hide ? `${Math.round(p.x)}|${Math.round(p.y)}|${lastCursorShape}` : '';
  if (drawn === localCursorDrawn) return;
  localCursorDrawn = drawn;
  if (hide) toOverlay({ type: 'local-cursor', x: (p.x - b.x) / b.width, y: (p.y - b.y) / b.height, shape: lastCursorShape || 'default' });
  else toOverlay({ type: 'local-cursor', gone: true });
}
function updateRemoteCursorTimer() {
  const on = Boolean(controller) && mouseControllers().length > 0;
  if (on && !remoteCursorTimer) {
    remoteCursorTimer = setInterval(syncRemoteCursor, REMOTE_CURSOR_MS);
    syncRemoteCursor();
  } else if (!on && remoteCursorTimer) {
    clearInterval(remoteCursorTimer);
    remoteCursorTimer = null;
    syncRemoteCursor(); // devolve o mouse e apaga o da camada
  }
}
function restoreSystemCursor() {
  try { if (systemCursor) systemCursor.restore(); } catch {}
}
process.on('exit', restoreSystemCursor); // nunca fica escondido depois que o app fecha

function toPage(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
}

function readGamepadProfiles() { return Object.fromEntries(Object.entries(config.gamepadProfiles || {}).slice(0, 32).map(([id, p]) => [id, gamepadModel.profile(p)])); }
function saveGamepadProfile(value) {
  if (typeof value?.id !== 'string' || !value.id || value.id.length > 512) throw new Error('Controle inválido.');
  const previous = config.gamepadProfiles;
  const profiles = readGamepadProfiles(); delete profiles[value.id];
  config.gamepadProfiles = Object.fromEntries([...Object.entries(profiles).slice(-31), [value.id, gamepadModel.profile(value.profile)]]);
  if (!saveConfig()) { config.gamepadProfiles = previous; throw new Error('Não foi possível salvar o gamepad.'); }
  const updated = readGamepadProfiles();
  toPage('desktop:gamepad-profiles', updated);
  settingsPanel?.gamepadProfilesChanged?.(updated);
  return { ok: true };
}
ipcMain.handle('desktop:gamepad-profiles', (event) => fromServer(event) ? readGamepadProfiles() : {});
ipcMain.handle('desktop:gamepad-profile-save', (event, value) => { if (!fromServer(event)) throw new Error('Não permitido.'); return saveGamepadProfile(value); });

ipcMain.handle('desktop:network-diagnostics', (event) => {
  if (!fromServer(event)) return { available: false, reason: 'Origem não autorizada.' };
  return networkDiagnostics.inspect(config.server);
});
let mediaCapabilities = null;
let mediaCapabilitiesAt = 0;
ipcMain.handle('desktop:media-capabilities', async (event) => {
  if (!fromServer(event)) return null;
  if (Date.now() - mediaCapabilitiesAt > 60000) mediaCapabilities = null;
  if (!mediaCapabilities) mediaCapabilities = (async () => {
    mediaCapabilitiesAt = Date.now();
    const features = app.getGPUFeatureStatus();
    let info, timer;
    // O modo basic pode listar todos os adaptadores como inativos. Complete
    // identifica o adaptador do renderer; ausência não autoriza adivinhá-lo.
    try { info = await Promise.race([app.getGPUInfo('complete'), new Promise(resolve => { timer = setTimeout(resolve, 3000); })]); }
    catch {}
    finally { clearTimeout(timer); }
    return { features: { video_encode: features.video_encode || null, video_decode: features.video_decode || null,
      gpu_compositing: features.gpu_compositing || null }, devices: (info?.gpuDevice || []).slice(0, 4).map(d => ({
      vendorId: d.vendorId, deviceId: d.deviceId, active: d.active === true })) };
  })();
  const basic = await mediaCapabilities;
  const telemetry = await gpuTelemetry.read();
  const active = basic.devices.filter(d => d.active && d.vendorId === 0x10de);
  for (const device of telemetry.devices) device.active = active.length === 1 && active[0].deviceId === device.deviceId
    && telemetry.devices.filter(d => d.deviceId === device.deviceId).length === 1;
  return { ...basic, telemetry };
});
ipcMain.handle('desktop:caps', (event) => {
  if (!fromServer(event)) return {};
  return { gamepad: gamepads.status(), overlay: OVERLAY_SUPPORTED, control: OVERLAY_SUPPORTED && pendingPreferences.overlay && Boolean(getInput(true)) };
});
ipcMain.handle('desktop:overlay-state', (event) => fromServer(event) ? overlayState() : null);

ipcMain.on('desktop:control-state', (event, data) => {
  if(!fromServer(event))return;
  if(data?.on && pendingPreferences.overlay && overlay) return setController(data);
  if(data?.on && obsLocal.active() && Array.isArray(data.people)) {
    const people=data.people.filter(p=>p.devices?.gamepad).map(p=>({...p,devices:{gamepad:true,keyboard:false,mouse:false}}));
    if(people.length)return setController({...data,people});
  }
  setController(null);
});
// "Só o som deste programa": a página pergunta se ele está vindo (e para no fim).
ipcMain.handle('desktop:window-audio', (event) => (fromServer(event) ? windowAudio.status() : { wanted: false }));
ipcMain.on('desktop:window-audio-stop', (event) => { if (fromServer(event)) windowAudio.stop(); });

// Quem controla ligou/desligou o modo controle em cima da sua transmissão.
ipcMain.on('desktop:control-mode', (event, data) => {
  if (!fromServer(event) || !data || typeof data.from !== 'string') return;
  if (data.on === true && controller && controlPeople.get(data.from)?.mouse) {
    controlModes.add(data.from);
    lastCursorShape = null; // manda o formato de novo pra quem entrou
  } else controlModes.delete(data.from);
  updateRemoteCursorTimer();
});

// A permissão e o formato são conferidos aqui também: o DataChannel não passa
// pela validação do servidor e a página não pode fornecer coordenadas arbitrárias.
function resetPeerInput(id) {
  const devices = controlPeople.get(id);
  if (!devices) return;
  input?.releaseDevices?.(devices);
  if (devices.gamepad) gamepads.neutralize?.(id);
}
function validPeerSession(msg, allowLegacy=false) {
  return msg && typeof msg.from === 'string' && controlPeople.has(msg.from)
    && commandBatch.matchesSession(msg,controlSessions.get(msg.from),allowLegacy);
}
function receiveControlPulse(msg) {
  if (controller && validPeerSession(msg)
    && nativeInputBudget.accept(msg.from, msg.session, 'metadata')) controlPulses.set(msg.from, Date.now());
}
function receiveControlReset(msg) {
  if (validPeerSession(msg) && nativeInputBudget.accept(msg.from, msg.session, 'metadata')) {
    resetPeerInput(msg.from); controlPulses.delete(msg.from);
  }
}
let lastGamepadError = 0;
function receiveControl(msg) {
  if (!controller || !msg) return;
  if ((!overlay || overlay.isDestroyed()) && !(msg.kind==='gamepad' && obsLocal.active())) return;
  const allowed = controlPeople.get(msg.from);
  const kind = gamepadModel.kindDevice(msg.kind);
  if (!allowed || !kind || !allowed[kind]) return;
  const clean = controlWire.cleanNativeInput(msg, allowed, controlSessions.get(msg.from));
  if (!clean) return;
  if (!nativeInputBudget.accept(msg.from, msg.session)) return;
  msg = { ...clean, from: msg.from, session: msg.session };
  if (msg.kind === 'gamepad') {
    const connected = gamepads.update(msg.from, msg);
    if (gamepadReceivers.get(msg.from) !== connected) {
      gamepadReceivers.set(msg.from, connected); toPage('desktop:gamepad-state', { id: msg.from, connected, failed: !connected });
      commandReceiver.event('gamepad-state',{id:msg.from,connected,failed:!connected});
    }
    if (!connected && Date.now() - lastGamepadError > 3000) {
      lastGamepadError = Date.now();
      toPage('desktop:gamepad-error', gamepads.status().reason);
    }
    return;
  }
  const device = getInput();
  const display = overlay.inputDisplay;
  if (!device || !display) return;
  // Você mexendo no seu mouse: o da pessoa espera (só soltar tecla/botão passa).
  const release = (msg.kind === 'button' || msg.kind === 'key') && !msg.down;
  if (localActive() && !release) return;
  if (kind === 'mouse' && Number.isFinite(msg.x) && Number.isFinite(msg.y) && !release) {
    const point = toScreen(display, msg.x, msg.y);
    const target = toDevice(point);
    device.move(target.x, target.y);
    recentMoves.push({ x: point.x, y: point.y, at: Date.now() });
    if (recentMoves.length > 64) recentMoves.shift();
  }
  if (msg.kind === 'button') device.button(Number(msg.button), Boolean(msg.down));
  else if (msg.kind === 'wheel') {
    if (Number.isFinite(msg.dy) && msg.dy) device.wheel(msg.dy);
    if (Number.isFinite(msg.dx) && msg.dx) device.hwheel(msg.dx); // pros lados
  }
  else if (msg.kind === 'key' && typeof msg.code === 'string') device.key(msg.code, Boolean(msg.down));
}

ipcMain.handle('desktop:receiver-host',(event,value)=>{
  if(!fromServer(event))throw Error('Origem não autorizada.');
  return commandReceiver.host(value);
});
ipcMain.handle('desktop:receiver-ready',event=>{
  if(!commandReceiver.trusted(event))throw Error('Origem não autorizada.');
  return commandReceiver.state();
});
ipcMain.handle('desktop:receiver-snapshot',event=>fromServer(event)?commandReceiver.snapshot():[]);
function inputSource(event){return fromServer(event)||commandReceiver.trusted(event);}
const lastInputBatch=new WeakMap();
ipcMain.on('desktop:input-stalled',(event,value)=>{
  if(!inputSource(event))return;
  // ACK já produzido não é perda de entrada: a UI pode estar bloqueada enquanto
  // seu preload aguarda a resposta. Não derrube o receptor independente nesse caso.
  if(Array.isArray(value?.pending))for(const peer of value.pending.slice(0,16))if(validPeerSession(peer,true))nativeInputBudget.block(peer.from,peer.session);
  if(Number.isSafeInteger(value?.id)&&(lastInputBatch.get(event.sender)||0)>=value.id)return;
  if(Array.isArray(value?.peers))for(const peer of value.peers.slice(0,16))if(validPeerSession(peer,true))nativeInputBudget.block(peer.from,peer.session);
});
ipcMain.on('desktop:input-batch',(event,batch)=>{
  if(!inputSource(event))return;
  if(!commandBatch.validBatch(batch,lastInputBatch.get(event.sender)||0)){
    for(const [from,grant]of controlSessions)nativeInputBudget.block(from,grant);
  }else for(const item of batch.items){
    const value=item?.value;
    if(!validPeerSession(value,item.type==='input'||item.type==='fault'))continue;
    const at=item.at??batch.at;
    if(!commandBatch.fresh(at,Date.now())){nativeInputBudget.block(value.from,value.session);continue;}
    if(item.type==='fault')nativeInputBudget.block(value.from,value.session);
    else if(item.type==='input')receiveControl(value);
    else if(item.type==='pulse')receiveControlPulse(value);
    else if(item.type==='reset')receiveControlReset(value);
    else if(item.type==='report'&&commandReceiver.trusted(event))commandReceiver.report(value);
  }
  if(Number.isSafeInteger(batch?.id))lastInputBatch.set(event.sender,Math.max(lastInputBatch.get(event.sender)||0,batch.id));
  if(!event.sender.isDestroyed())event.sender.send('desktop:input-ack',{id:batch?.id});
});

// ---------- o que a página do servidor pede ----------

ipcMain.on('desktop:version', (event) => { event.returnValue = app.getVersion(); });

// Controlando alguém, com o mouse em cima da transmissão e o app na frente: TODAS as
// teclas (Win, Alt+Tab, Alt+F4...) vão pra lá, pelo gancho de teclado (Windows). Tirou o
// mouse de cima ou foi pra outra janela, o teclado volta a ser seu.
function setKeyCapture(on) {
  keysWanted = Boolean(on);
  if (keysWanted && keyHook === undefined) {
    keyHook = createKeyHook({
      shouldCapture: () => keysWanted && Boolean(mainWindow) && !mainWindow.isDestroyed() && mainWindow.isFocused(),
      onKey: (code, down) => toPage('desktop:captured-key', { code, down }),
    });
  }
  if (!keyHook) return false;
  if (keysWanted) return keyHook.start();
  keyHook.stop();
  return false;
}

ipcMain.handle('desktop:capture-keys', (event, on) => (fromServer(event) ? setKeyCapture(on) : false));

// Autoteste (Windows): instala o gancho, "aperta" uma tecla e vê se ele pega, com o código
// certo. Assim um erro no gancho aparece no build, não no meio do controle.
async function selfTestKeys() {
  if (process.platform !== 'win32') return 'ok';
  const seen = [];
  const hook = createKeyHook({ shouldCapture: () => true, onKey: (code, down) => seen.push(`${down ? 'down' : 'up'}:${code}`), acceptInjected: true });
  if (!hook || !hook.start()) return 'no-hook';
  const device = createInput();
  if (device) {
    device.key('KeyQ', true);
    device.key('KeyQ', false);
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  hook.stop();
  if (device) device.close();
  return seen.includes('down:KeyQ') && seen.includes('up:KeyQ') ? 'ok' : `sem-tecla ${JSON.stringify(seen)}`;
}

// Aviso de atualização: a sala pede o estado atual (e passa a receber as mudanças) e
// o botão do aviso instala ou abre a página pra baixar.
ipcMain.handle('desktop:update-listen', (event) => (fromServer(event) ? updates.listen() : null));
ipcMain.handle('desktop:update', (event) => fromServer(event) && updates.act());
ipcMain.handle('desktop:update-check', (event) => (fromServer(event) ? updates.check() : null));

ipcMain.on('desktop:identity', (event, data) => {
  if (!fromServer(event) || !data || !Number.isInteger(data.hue)) return;
  identity = {
    hue: data.hue,
    color: HEX_COLOR.test(data.color || '') ? data.color.toLowerCase() : null,
    style: data.style && typeof data.style === 'object' ? normalizeStyle(data.style) : null,
  };
  if (drawMode) toOverlay({ type: 'draw-mode', on: true, hue: identity.hue, color: identity.color, style: identity.style });
});

ipcMain.handle('desktop:sharing', (event, on) => {
  if (!fromServer(event)) return { overlay: false };
  shareWanted = Boolean(on);
  log('stream', on ? 'Captura local iniciada.' : 'Captura local encerrada.');
  if (!on) {
    closeOverlay('share');
    if (obsWanted && !overlay) openObsOverlay();
    return { overlay: false };
  }
  const display = shareDisplay();
  return { overlay: display ? openOverlay(display, 'share') : false, kind: picked ? picked.kind : null };
});

// A sua transmissão do OBS entrou no ar (ou saiu): abre/fecha a camada no monitor dele.
ipcMain.handle('desktop:obs', (event, on) => {
  if (!fromServer(event)) return { overlay: false };
  obsWanted = Boolean(on);
  if (!obsWanted) {
    closeOverlay('obs');
    return { overlay: false };
  }
  if (overlay && overlayOwner === 'obs') return { overlay: true };
  return { overlay: openObsOverlay() };
});

ipcMain.handle('desktop:obs-display', (event, value) => {
  if (!fromServer(event)) return { overlay: false };
  const previous = config.obsDisplay;
  config.obsDisplay = value === 'off' ? 'off' : String(value);
  if (!saveConfig()) { config.obsDisplay = previous; return { overlay: overlayState().obs, error: 'Não foi possível salvar o monitor das marcações.' }; }
  if (!obsWanted) return { overlay: false };
  closeOverlay('obs');
  return { overlay: openObsOverlay() };
});

ipcMain.handle('desktop:displays', (event) => {
  if (!fromServer(event)) return null;
  const displays = screen.getAllDisplays();
  const current = obsDisplay();
  return {
    overlay: OVERLAY_SUPPORTED,
    obsDisplay: current ? String(current.id) : 'off',
    displays: displays.map((d) => ({ id: String(d.id), label: displayLabel(d, displays) })),
  };
});

ipcMain.on('desktop:overlay', (event, data) => {
  if (fromServer(event) && overlay && !overlay.isDestroyed() && data && typeof data === 'object') {
    overlay.webContents.send('overlay:event', data);
  }
});

ipcMain.on('desktop:attention', (event) => {
  if (fromServer(event) && !mainWindow.isFocused()) mainWindow.flashFrame(true);
});

ipcMain.on('desktop:change-server', (event) => {
  if (!fromServer(event)) return;
  obsWanted = false;
  closeOverlay();
  showSetup();
});

ipcMain.handle('setup:connect', (event, raw) => {
  if (!fromSetup(event)) return { error: 'Não permitido.' };
  const origin = normalizeServer(raw);
  if (!origin) return { error: 'Endereço inválido. Exemplo: https://meu-nas.tail1234.ts.net:3100' };
  config.server = origin;
  delete config.pendingServer;
  saveConfig();
  openServer();
  return { ok: true };
});

ipcMain.on('setup:retry', (event) => {
  if (fromSetup(event)) openServer();
});

// ---------- app ----------

// Certificado autoassinado (o que a imagem Docker gera sem o do Tailscale): pergunta uma
// vez e lembra deste servidor.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (!isServerUrl(url)) {
    callback(false);
    return;
  }
  event.preventDefault();
  const host = new URL(url).host;
  if (config.trusted[host] === certificate.fingerprint) {
    callback(true);
    return;
  }
  if (declined.has(certificate.fingerprint)) {
    callback(false);
    return;
  }
  // The first HTTPS load may request trust before ready-to-show fires.
  // Keep the parent visible so the certificate dialog can be reached.
  if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    buttons: ['Confiar neste servidor', 'Cancelar'],
    defaultId: 1,
    cancelId: 1,
    title: 'Certificado não reconhecido',
    message: `O certificado HTTPS de ${host} não é reconhecido (${error}).`,
    detail: 'Se este é o seu servidor, com o certificado autoassinado do app, pode confiar. '
      + `Impressão digital:\n${certificate.fingerprint}`,
  });
  if (choice === 0) {
    config.trusted[host] = certificate.fingerprint;
    saveConfig();
    callback(true);
  } else {
    declined.add(certificate.fingerprint);
    callback(false);
  }
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    // Fechou (ou caiu) da última vez com o mouse escondido por um controle: devolve já.
    if (fs.existsSync(path.join(app.getPath('userData'), 'cursor-hidden'))) getSystemCursor();
    if (process.platform === 'win32') app.setAppUserModelId('com.webscreenshare.desktop');
    Menu.setApplicationMenu(null);
    roomSettings = createRoomSettings({ getContents: () => mainWindow?.webContents, isServer: isServerUrl });
    settingsPanel = createSettingsPanel({
      readGamepadProfiles, saveGamepadProfile,
      prepareGamepad: () => gamepadSetup.prepare(),
      getParent: () => mainWindow, getState: settingsState, save: saveSettings, activity, getShortcuts: shortcutState, shortcutAction,
      // A barra de título própria (janela sem bordas) fica de fora do popup.
      getInset: () => (BORDERLESS_FULLSCREEN && mainWindow && !borderlessFullscreen?.active
        ? 32 * mainWindow.webContents.getZoomFactor() : 0),
      room: roomSettings,
      restart: () => {
        for (const name of ['WSS_SERVER', 'WSS_DISABLE_HARDWARE_ACCELERATION', 'WSS_WINDOWED_FULLSCREEN', 'WSS_BORDERLESS_FULLSCREEN']) delete process.env[name];
        setImmediate(() => { app.relaunch(); app.quit(); });
        return { ok: true };
      },
      // Procura direto (o aviso chega na sala sozinho) e responde aqui mesmo.
      checkUpdate: async () => {
        const found = await updates.check();
        return { message: (UPDATE_MESSAGES[found.result] || UPDATE_MESSAGES.error)(found) };
      },
      setAutoUpdate,
    });
    log('system', `App ${app.getVersion()} iniciado · Electron ${process.versions.electron} · tela cheia ${activePreferences.fullscreen} · aceleração ${activePreferences.hardwareAcceleration ? 'ativada' : 'desativada'}.`);
    if (SELF_TEST) {
      setTimeout(() => {
        console.log('SELF-TEST FAIL: a janela não carregou');
        app.exit(1);
      }, 30000);
    }

    const ses = session.defaultSession;
    const removeAssetBridge = installNativeRoomAssets({ session: ses, getServer: () => config.server,
      getContents: id => BrowserWindow.getAllWindows().find(win => win.webContents.id === id)?.webContents,
      pages: ['settings.html', 'overlay.html'].map(file => pathToFileURL(path.join(PAGES, file)).href) });
    app.once('will-quit', removeAssetBridge);
    ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
      callback(PERMISSIONS.has(permission) && isServerUrl(details.requestingUrl || webContents.getURL()));
    });
    ses.setPermissionCheckHandler((webContents, permission, origin) => PERMISSIONS.has(permission) && isServerUrl(origin));
    // "Compartilhar tela" na sala abre o seletor do app.
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
      const origin = request.securityOrigin || (request.frame ? request.frame.url : '');
      const choice = isServerUrl(origin) ? await pickSource() : null;
      if (!choice || !mainWindow) {
        callback({});
        return;
      }
      const display = resolveCaptureDisplay(choice, screen.getAllDisplays());
      picked = { kind: choice.kind, displayId: display ? String(display.id) : choice.displayId || null };
      const streams = { video: choice.source };
      if (choice.audio && SYSTEM_AUDIO) streams.audio = 'loopback';
      // "Só o som deste programa": o app pega o som do programa da janela e a sala troca o
      // som do PC por ele (se não der, fica o do PC).
      if (choice.windowAudio) windowAudio.start(choice.source.id);
      else windowAudio.stop();
      callback(streams);
    });

    screen.on('display-metrics-changed', (event, display) => {
      if (borderlessFullscreen) borderlessFullscreen.position();
      if (overlay && overlay.displayId === display.id) {
        const inputDisplay = snapshotInputDisplay(display);
        if (!inputDisplay) { closeOverlay(); return; }
        overlay.inputDisplay = inputDisplay;
        overlay.setBounds(inputDisplay.bounds);
      }
    });
    screen.on('display-removed', (event, display) => {
      if (borderlessFullscreen) borderlessFullscreen.position();
      if (overlay && overlay.displayId === display.id) closeOverlay();
    });

    createMainWindow();
    if (!SELF_TEST) updates.start();
  });

  let inputQuitReady = false;
  app.on('before-quit', event => {
    obsLocal.stop();nativeVideo.stop();
    if (process.platform !== 'linux' || !input?.settled || inputQuitReady) return;
    event.preventDefault();
    inputQuitting = true;
    if (controller) setController(null);
    input.close();
    input.settled.finally(() => { inputQuitReady = true; app.quit(); });
  });
  app.on('will-quit', () => {
    // O WebRTC nativo do OBS local (node-datachannel) tem threads próprias: sem o
    // cleanup(), depois da primeira transmissão do OBS pelo app o processo não termina.
    try { require('node-datachannel').cleanup(); } catch {}
    restoreSystemCursor();
    windowAudio.stop();
    shortcuts.dispose();
    gamepads.close();
    if (input) input.close();
    if (keyHook) keyHook.stop();
  });
  app.on('child-process-gone', (_event, details) => log('error', `Processo ${details.type}: ${details.reason}, código ${details.exitCode}.`, 'error'));
  app.on('window-all-closed', () => app.quit());
}
