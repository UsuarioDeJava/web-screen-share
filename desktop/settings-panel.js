const { WebContentsView, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// As configurações abrem como um popup dentro da janela principal, não numa janela a
// mais: uma camada transparente do tamanho da janela, com o painel no meio (a página
// desenha o fundo escurecido e o cartão). Fecha no X, no Esc, clicando fora ou no Ctrl+,;
// minimiza, muda de tamanho e fecha junto com a janela. `getInset` é a altura da barra de
// título própria (janela sem bordas), que continua de fora pra minimizar e fechar.
function createSettingsPanel({ getParent, getInset = () => 0, getState, readGamepadProfiles, saveGamepadProfile, prepareGamepad, save, restart, checkUpdate, room, activity }) {
  let view = null;
  let parent = null;
  let timer = null;
  let following = false;
  let cursor = null;
  const url = pathToFileURL(path.join(__dirname, 'pages', 'settings.html')).href;
  const contents = () => (view && !view.webContents.isDestroyed() ? view.webContents : null);
  const parentAlive = () => Boolean(parent) && !parent.isDestroyed();
  function allowed(event) {
    const wc = contents();
    return Boolean(wc) && event.sender === wc && event.senderFrame === wc.mainFrame && event.senderFrame.url === url;
  }
  const showing = () => Boolean(contents()) && parentAlive() && parent.isVisible() && !parent.isMinimized();
  function queue() {
    if (!following || timer || !showing()) return;
    timer = setTimeout(() => {
      timer = null;
      if (following && showing()) {
        const packet = activity.changes(cursor);
        cursor = { epoch: packet.epoch, lastId: packet.lastId };
        contents().send('settings:log', packet);
      }
    }, 250);
  }
  activity.subscribe(queue);
  function layout() {
    if (!view || !parentAlive()) return;
    const [width, height] = parent.getContentSize();
    const top = Math.max(0, Math.min(Math.round(getInset() || 0), height));
    view.setBounds({ x: 0, y: top, width, height: height - top });
  }
  const parentEvents = { resize: layout, 'enter-full-screen': layout, 'leave-full-screen': layout, restore: queue, show: queue };

  function close() {
    if (!view) return;
    const closing = view;
    view = null;
    room.cancel(); clearTimeout(timer); timer = null; following = false; cursor = null;
    if (parentAlive()) {
      for (const [name, handler] of Object.entries(parentEvents)) parent.off(name, handler);
      parent.contentView.removeChildView(closing);
      if (parent.isFocused()) parent.webContents.focus();
    }
    parent = null;
    if (!closing.webContents.isDestroyed()) closing.webContents.close();
  }

  // Com o foco no popup, os atalhos da janela principal não chegam: os que fazem sentido
  // aqui são tratados aqui (o Esc fica com a página, pra fechar com a animação).
  function shortcut(event, input) {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const ctrl = input.control || input.meta;
    if (ctrl && (key === ',' || input.code === 'Comma')) close();
    else if (key === 'f12' || (ctrl && input.shift && key === 'i')) contents()?.toggleDevTools();
    else return;
    event.preventDefault();
  }

  for (const [channel, handler] of Object.entries({
    'settings:read': getState,
    'settings:gamepad-profiles': readGamepadProfiles,
    'settings:gamepad-profile-save': saveGamepadProfile,
    'settings:gamepad-setup': prepareGamepad,
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
      const result = await dialog.showSaveDialog(parentAlive() ? parent : undefined, {
        title: 'Exportar log de atividade',
        defaultPath: `web-screen-share-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { saved: false };
      await fs.writeFile(result.filePath, JSON.stringify({ exportedAt: new Date().toISOString(), ...activity.snapshot() }, null, 2), 'utf8');
      return { saved: true };
    },
    'settings:close': () => { setImmediate(close); return { ok: true }; },
  })) {
    ipcMain.handle(channel, (event, value) => {
      // Uma notificação de aba oculta pode já estar em trânsito ao fechar o popup.
      if (channel === 'settings:log-subscribe' && value?.live === false && !contents()) return null;
      if (!allowed(event)) throw new Error('Não permitido.');
      return handler(value);
    });
  }

  return {
    open(section = 'profile') {
      const current = contents();
      if (current && parentAlive()) {
        if (parent.isMinimized()) parent.restore();
        parent.show(); parent.focus(); current.focus();
        current.send('settings:section', section);
        return;
      }
      close();
      parent = getParent();
      if (!parentAlive()) { parent = null; return; }
      view = new WebContentsView({
        webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, sandbox: true, spellcheck: false },
      });
      view.setBackgroundColor('#00000000');
      const wc = view.webContents;
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (event) => event.preventDefault());
      wc.on('before-input-event', shortcut);
      wc.on('render-process-gone', () => { if (contents() === wc) close(); });
      wc.once('destroyed', () => { if (view && view.webContents === wc) close(); });
      wc.once('did-finish-load', () => {
        if (contents() !== wc) return;
        wc.send('settings:section', section);
        wc.focus();
        queue();
      });
      for (const [name, handler] of Object.entries(parentEvents)) parent.on(name, handler);
      layout();
      parent.contentView.addChildView(view);
      if (parent.isMinimized()) parent.restore();
      parent.focus();
      wc.loadURL(url);
    },
    close,
    layout,
    isOpen: () => Boolean(contents()),
  };
}

module.exports = { createSettingsPanel };
