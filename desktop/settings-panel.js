const { BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function createSettingsPanel({ getParent, getState, save, restart, checkUpdate, room, activity }) {
  let win = null;
  let timer = null;
  let following = false;
  let cursor = null;
  const url = pathToFileURL(path.join(__dirname, 'pages', 'settings.html')).href;
  function allowed(event) {
    return win && !win.isDestroyed() && event.sender === win.webContents
      && event.senderFrame === win.webContents.mainFrame && event.senderFrame.url === url;
  }
  function queue() {
    if (!following || timer || !win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    timer = setTimeout(() => {
      timer = null;
      if (following && win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) {
        const packet = activity.changes(cursor);
        cursor = { epoch: packet.epoch, lastId: packet.lastId };
        win.webContents.send('settings:log', packet);
      }
    }, 250);
  }
  activity.subscribe(queue);
  for (const [channel, handler] of Object.entries({
    'settings:read': getState,
    'settings:log-subscribe': (value) => {
      following = value?.live === true;
      clearTimeout(timer); timer = null;
      if (!following) return null;
      const packet = activity.changes(value.cursor);
      cursor = { epoch: packet.epoch, lastId: packet.lastId };
      return packet;
    },
    'settings:save': save,
    'settings:restart': restart,
    'settings:clear-log': () => { activity.clear(); return { ok: true }; },
    'settings:check-update': checkUpdate,
    'settings:room-read': (section) => room.read(section),
    'settings:room-action': (value) => room.action(value),
    'settings:export-log': async () => {
      const result = await dialog.showSaveDialog(win, {
        title: 'Exportar log de atividade',
        defaultPath: `web-screen-share-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { saved: false };
      await fs.writeFile(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), ...activity.snapshot() }, null, 2), 'utf8');
      return { saved: true };
    },
  })) {
    ipcMain.handle(channel, (event, value) => {
      // Uma notificação de aba oculta pode já estar em trânsito ao fechar a janela.
      if (channel === 'settings:log-subscribe' && value?.live === false && (!win || win.isDestroyed())) return null;
      if (!allowed(event)) throw new Error('Não permitido.');
      return handler(value);
    });
  }
  return {
    open(section = 'profile') {
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore();
        win.show(); win.focus(); win.webContents.send('settings:section', section); return;
      }
      win = new BrowserWindow({
        parent: getParent(), width: 1050, height: 820, minWidth: 640, minHeight: 560,
        title: 'Configurações — Web Screen Share', backgroundColor: '#090b12', show: false,
        autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, sandbox: true },
      });
      win.setMenu(null);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', (event) => event.preventDefault());
      win.webContents.once('did-finish-load', () => win && win.webContents.send('settings:section', section));
      win.once('ready-to-show', () => win && win.show());
      win.on('restore', queue);
      win.on('show', queue);
      win.on('closed', () => { room.cancel(); clearTimeout(timer); timer = null; following = false; cursor = null; win = null; });
      win.loadURL(url);
    },
    close() { if (win && !win.isDestroyed()) win.close(); },
  };
}

module.exports = { createSettingsPanel };
