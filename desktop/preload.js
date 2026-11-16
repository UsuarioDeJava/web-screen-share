// Ponte entre a página aberta na janela principal e o app. Na sala (página do
// servidor): `window.wssDesktop`. Na tela de configurar o servidor: `window.setupBridge`.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'https:' || location.protocol === 'http:') {
  contextBridge.exposeInMainWorld('wssDesktop', {
    version: ipcRenderer.sendSync('desktop:version'),
    platform: process.platform,
    // Começou/parou de transmitir: abre/fecha a camada de marcações na tela escolhida.
    sharing: (on) => ipcRenderer.invoke('desktop:sharing', Boolean(on)),
    // Algo aconteceu na sua transmissão (apontar, desenhar, reagir): mostra na tela real.
    overlay: (event) => ipcRenderer.send('desktop:overlay', event),
    // Mensagem nova com a janela sem foco: pisca na barra de tarefas.
    attention: () => ipcRenderer.send('desktop:attention'),
    changeServer: () => ipcRenderer.send('desktop:change-server'),
    // Transmissão pelo OBS: os monitores, ligar/desligar a camada e em qual monitor.
    displays: () => ipcRenderer.invoke('desktop:displays'),
    obs: (on) => ipcRenderer.invoke('desktop:obs', Boolean(on)),
    setObsDisplay: (value) => ipcRenderer.invoke('desktop:obs-display', String(value)),
  });
} else {
  contextBridge.exposeInMainWorld('setupBridge', {
    connect: (address) => ipcRenderer.invoke('setup:connect', String(address || '')),
    retry: () => ipcRenderer.send('setup:retry'),
  });
}
