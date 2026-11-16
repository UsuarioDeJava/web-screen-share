// Ponte da camada de marcações por cima da tela.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayBridge', {
  onEvent: (callback) => ipcRenderer.on('overlay:event', (_event, data) => callback(data)),
  // Modo desenho: o que você rabiscou aqui vai pra quem assiste.
  draw: (data) => ipcRenderer.send('overlay:draw', data),
  undo: (id) => ipcRenderer.send('overlay:undo', id),
  clear: () => ipcRenderer.send('overlay:clear'),
  exit: () => ipcRenderer.send('overlay:exit'),
});
