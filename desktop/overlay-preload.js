// Ponte da camada de marcações por cima da tela.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayBridge', {
  onEvent: (callback) => ipcRenderer.on('overlay:event', (_event, data) => callback(data)),
});
