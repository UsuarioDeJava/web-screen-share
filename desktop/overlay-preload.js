// Ponte da camada de marcações por cima da tela.
const { contextBridge, ipcRenderer } = require('electron');
ipcRenderer.on('desktop:visual-mode', (_event, mode) => {
  const value = ['normal', 'economy', 'auto'].includes(mode) ? mode : 'normal';
  const root = document.documentElement;
  if (root && root.getAttribute('data-wss-visual-mode') !== value) {
    root.setAttribute('data-wss-visual-mode', value);
    root.toggleAttribute('data-wss-economy', value === 'economy');
  }
});

contextBridge.exposeInMainWorld('overlayBridge', {
  onEvent: (callback) => ipcRenderer.on('overlay:event', (_event, data) => callback(data)),
  // Modo desenho: o que você rabiscou aqui vai pra quem assiste.
  draw: (data) => ipcRenderer.send('overlay:draw', data),
  undo: (id) => ipcRenderer.send('overlay:undo', id),
  clear: () => ipcRenderer.send('overlay:clear'),
  exit: () => ipcRenderer.send('overlay:exit'),
});
