// Aviso de atualização do app, pelas releases do GitHub.
// - Instalado (Setup no Windows, AppImage no Linux): "Atualizar" baixa a versão nova,
//   instala e reabre o app (electron-updater; confere o arquivo pelo sha512 da release).
// - Portátil: só avisa, com o link pra baixar a versão nova.
// Procura ao abrir e depois a cada 6 horas. Rodando do código-fonte (sem empacotar),
// não procura nada.
const { app, net, shell, Notification } = require('electron');

const RELEASES = 'https://github.com/UsuarioDeJava/web-screen-share/releases';
const FIRST_CHECK = 8000;
const CHECK_EVERY = 6 * 60 * 60 * 1000;

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

function createUpdates({ getWindow, send, icon }) {
  const mode = detectMode();
  // Testes: um servidor local no lugar das releases do GitHub.
  const feed = process.env.WSS_UPDATE_FEED ? process.env.WSS_UPDATE_FEED.replace(/\/+$/, '') : null;
  let state = { state: 'idle' };
  let updater = null;
  let listening = false; // a sala aberta mostra o aviso (servidor de antes disto: não)
  let notified = null;
  let timer = null;

  const publicState = () => ({ ...state, mode, current: app.getVersion() });

  function set(next) {
    state = next;
    send(publicState());
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      if (state.state === 'downloading') win.setProgressBar(Math.max(0.01, (state.percent || 0) / 100));
      else if (state.state === 'installing') win.setProgressBar(2); // indeterminado
      else win.setProgressBar(-1);
    }
    if (state.state === 'available' && !listening && notified !== state.version) notify();
  }

  // Sala de um servidor que ainda não sabe mostrar o aviso: avisa pelo sistema.
  function notify() {
    notified = state.version;
    if (!Notification.isSupported()) return;
    const note = new Notification({
      title: `Versão nova do app: ${state.version}`,
      body: mode === 'install' ? 'Clique aqui pra atualizar. O app baixa a versão nova e abre de novo sozinho.' : 'Clique aqui pra baixar.',
      icon,
    });
    note.on('click', () => act());
    note.show();
  }

  function getUpdater() {
    if (updater) return updater;
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;
    if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed });
    autoUpdater.on('update-available', (info) => {
      if (state.state === 'downloading' || state.state === 'installing') return;
      if (isNewer(info.version, app.getVersion())) set({ state: 'available', version: info.version });
    });
    autoUpdater.on('download-progress', (progress) => {
      set({ state: 'downloading', version: state.version, percent: Math.floor(progress.percent || 0) });
    });
    autoUpdater.on('update-downloaded', (info) => {
      set({ state: 'installing', version: info.version || state.version });
      // Um respiro pra página mostrar "instalando"; depois fecha, instala e reabre.
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
    });
    autoUpdater.on('error', (err) => {
      console.error('Atualização:', err && err.message);
      // Sem internet na hora de procurar: fica quieto. Falhou baixando: avisa e oferece o link.
      if (state.state === 'downloading' || state.state === 'installing') {
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

  async function check() {
    if (!mode || state.state === 'downloading' || state.state === 'installing') return;
    try {
      if (mode === 'install') {
        await getUpdater().checkForUpdates();
      } else {
        const version = await latestVersion();
        if (version && isNewer(version, app.getVersion()) && version !== state.version) set({ state: 'available', version });
      }
    } catch (err) {
      console.error('Procurar atualização:', err && err.message);
    }
  }

  function openReleases() {
    shell.openExternal(`${RELEASES}/latest`);
  }

  // O botão do aviso: instala (versão instalada) ou abre a página pra baixar.
  function act() {
    if (state.state === 'available' && mode === 'install') {
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
    },
    check,
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
