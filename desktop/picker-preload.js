// Ponte do seletor de tela/janela.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('picker', {
  info: () => ipcRenderer.invoke('picker:info'),
  sources: () => ipcRenderer.invoke('picker:sources'),
  // windowAudio: "só o som deste programa" (transmitindo uma janela).
  choose: (id, audio, windowAudio) => ipcRenderer.send('picker:choose', { id: String(id), audio: Boolean(audio), windowAudio: Boolean(windowAudio) }),
  cancel: () => ipcRenderer.send('picker:cancel'),
});
