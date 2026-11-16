// Ponte do seletor de tela/janela.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  info: () => ipcRenderer.invoke('picker:info'),
  sources: () => ipcRenderer.invoke('picker:sources'),
  choose: (id, audio) => ipcRenderer.send('picker:choose', { id: String(id), audio: Boolean(audio) }),
  cancel: () => ipcRenderer.send('picker:cancel'),
});
