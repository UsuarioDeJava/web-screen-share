// Aviso de atualização do app, pelas releases do GitHub.
// - Instalado (Setup no Windows, AppImage no Linux): "Atualizar" baixa a versão nova,
//   instala e reabre o app (electron-updater; confere o arquivo pelo sha512 da release).
//   Com as atualizações automáticas ligadas, baixa sozinho em segundo plano e avisa que
//   está pronta: aplica ao reiniciar (botão do aviso) ou ao fechar o app.
// - Portátil: só avisa, com o link pra baixar a versão nova.
// Procura ao abrir, a cada 15 minutos e ao voltar pro app; se falhar (sem internet),
// tenta de novo em 1 minuto. Rodando do código-fonte (sem empacotar), não procura nada.
const { app, net, shell, Notification } = require('electron');

const RELEASES = 'https://github.com/UsuarioDeJava/web-screen-share/releases';
const FIRST_CHECK = 8000;
const CHECK_EVERY = 15 * 60 * 1000;
const FOCUS_GAP = 5 * 60 * 1000; // ao voltar pro app, procura se a última foi há mais que isso
const RETRY = 60 * 1000;

function detectMode() {
  if (process.env.WSS_UPDATE_MODE) return process.env.WSS_UPDATE_MODE; // testes
  if (!app.isPackaged) return null;
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_DIR ? 'link' : 'install';
  if (process.platform === 'linux') return process.env.APPIMAGE ? 'install' : 'link';
  return 'link';
}

// 1.10.0 > 1.9.3; o que vier depois de "-" (pré-lançamento) não conta.
function isNewer(candidate, current) {
  const parts = (v) => String(v).split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// getAuto: as atualizações automáticas estão ligadas (Configurações > Aplicativo).
function createUpdates({ getWindow, send, icon, getAuto = () => false, loadUpdater = () => require('electron-updater').autoUpdater }) {
  const mode = detectMode();
  // Testes: um servidor local no lugar das releases do GitHub.
  const feed = process.env.WSS_UPDATE_FEED ? process.env.WSS_UPDATE_FEED.replace(/\/+$/, '') : null;
  let state = { state: 'idle' };
  let updater = null;
  let listening = false; // a sala aberta mostra o aviso (servidor de antes disto: não)
  let notified = null;
  let timer = null;
  let retry = null;
  let running = null; // a procura em andamento (uma por vez)
  let lastCheck = 0;
  let background = false; // baixando sozinho: a sala só fica sabendo quando estiver pronta

  const auto = () => mode === 'install' && getAuto() === true;
  const publicState = () => ({ ...state, mode, current: app.getVersion(), auto: auto() });

  function set(next) {
    state = next;
    send(publicState());
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      if (state.state === 'downloading' && !state.background) win.setProgressBar(Math.max(0.01, (state.percent || 0) / 100));
      else if (state.state === 'installing') win.setProgressBar(2); // indeterminado
      else win.setProgressBar(-1);
    }
    if ((state.state === 'available' || state.state === 'ready') && !listening && notified !== `${state.state}:${state.version}`) notify();
  }

  // Sala de um servidor que ainda não sabe mostrar o aviso: avisa pelo sistema.
  function notify() {
    notified = `${state.state}:${state.version}`;
    if (!Notification.isSupported()) return;
    const ready = state.state === 'ready';
    const note = new Notification({
      title: ready ? `Versão ${state.version} do app pronta` : `Versão nova do app: ${state.version}`,
      body: ready ? 'Clique aqui pra reiniciar e aplicar.' : mode === 'install' ? 'Clique aqui pra atualizar. O app baixa a versão nova e abre de novo sozinho.' : 'Clique aqui pra baixar.',
      icon,
    });
    note.on('click', () => act());
    note.show();
  }

  function downloadInBackground(version) {
    background = true;
    set({ state: 'downloading', version, percent: 0, background: true });
    getUpdater().downloadUpdate().catch(() => {}); // o erro chega pelo evento 'error'
  }

  function getUpdater() {
    if (updater) return updater;
    const autoUpdater = loadUpdater();
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true; // baixada e não aplicada: instala ao fechar o app
    autoUpdater.logger = null;
    if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    autoUpdater.on('update-available', (info) => {
      if (state.state === 'downloading' || state.state === 'installing') return;
      if (state.state === 'ready' && state.version === info.version) return;
      if (!isNewer(info.version, app.getVersion())) return;
      if (auto()) downloadInBackground(info.version);
      else if (state.state !== 'available' || state.version !== info.version) set({ state: 'available', version: info.version });
    });
    autoUpdater.on('download-progress', (progress) => {
      set({ state: 'downloading', version: state.version, percent: Math.floor(progress.percent || 0), ...(background ? { background: true } : {}) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      const version = info.version || state.version;
      if (background) {
        background = false;
        set({ state: 'ready', version });
        return;
      }
      set({ state: 'installing', version });
      // Um respiro pra página mostrar "instalando"; depois fecha, instala e reabre.
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
    });
    autoUpdater.on('error', (err) => {
      console.error('Atualização:', err && err.message);
      // Sem internet na hora de procurar: fica quieto. Falhou baixando sozinho: mostra o
      // aviso normal (Atualizar). Falhou baixando pelo botão: avisa e oferece o link.
      if (state.state === 'downloading' && background) {
        background = false;
        set({ state: 'available', version: state.version });
      } else if (state.state === 'downloading' || state.state === 'installing') {
        set({ state: 'error', version: state.version });
      }
    });
    updater = autoUpdater;
    return updater;
  }

  // Portátil: só lê a versão da release mais nova (o latest.yml que o build publica).
  async function latestVersion() {
    const file = process.platform === 'linux' ? 'latest-linux.yml' : process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
    const res = await net.fetch(`${feed || `${RELEASES}/latest/download`}/${file}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const match = /^version:\s*['"]?([0-9][^\s'"]*)/m.exec(await res.text());
    return match ? match[1] : null;
  }

  // Procura versão nova. Devolve o que achou (pro botão "Verificar atualização"):
  // available (o aviso já está no topo), ready (já baixada: falta reiniciar), current,
  // busy (baixando), error ou off (sem atualização automática: rodando do código-fonte).
  function check() {
    if (!running) running = search().finally(() => { running = null; });
    return running;
  }

  async function search() {
    const current = app.getVersion();
    if (!mode) return { result: 'off', current };
    if (state.state === 'downloading' || state.state === 'installing') return { result: 'busy', version: state.version, current };
    lastCheck = Date.now();
    clearTimeout(retry); retry = null;
    try {
      let version = null;
      if (mode === 'install') {
        const found = await getUpdater().checkForUpdates();
        version = found && found.updateInfo ? found.updateInfo.version : null;
      } else {
        version = await latestVersion();
        if (version && isNewer(version, current) && (state.state !== 'available' || version !== state.version)) set({ state: 'available', version });
      }
      if (state.state === 'ready') return { result: 'ready', version: state.version, current };
      if (state.state === 'downloading') return { result: 'busy', version: state.version, current };
      return version && isNewer(version, current) ? { result: 'available', version, current } : { result: 'current', current };
    } catch (err) {
      console.error('Procurar atualização:', err && err.message);
      if (timer) retry = setTimeout(check, RETRY);
      return { result: 'error', current };
    }
  }

  function openReleases() {
    shell.openExternal(`${RELEASES}/latest`);
  }

  // O botão do aviso: reinicia com a versão já baixada, instala (versão instalada) ou abre
  // a página pra baixar.
  function act() {
    if (state.state === 'ready') {
      set({ state: 'installing', version: state.version });
      setTimeout(() => getUpdater().quitAndInstall(true, true), 800);
      return true;
    }
    if (state.state === 'available' && mode === 'install') {
      background = false;
      set({ state: 'downloading', version: state.version, percent: 0 });
      getUpdater().downloadUpdate().catch(() => {}); // o erro chega pelo evento 'error'
      return true;
    }
    if (state.state === 'available' || state.state === 'error') {
      openReleases();
      return true;
    }
    return false;
  }

  return {
    mode,
    start() {
      if (!mode || timer) return;
      setTimeout(check, FIRST_CHECK);
      timer = setInterval(check, CHECK_EVERY);
      app.on('browser-window-focus', () => { if (Date.now() - lastCheck > FOCUS_GAP) check(); });
    },
    check,
    // Ligou as atualizações automáticas com uma versão nova já avisada: baixa agora.
    autoChanged() {
      if (auto() && state.state === 'available') downloadInBackground(state.version);
      else send(publicState());
    },
    listen() {
      listening = true;
      return publicState();
    },
    // A janela principal vai abrir outra página: até ela pedir o aviso, avisa pelo sistema.
    pageGone() {
      listening = false;
    },
    act,
  };
}

module.exports = { createUpdates, isNewer };
