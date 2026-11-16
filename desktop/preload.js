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
    // Modo desenho (Ctrl+Shift+D): a sua cor e o que você rabiscou na sua tela.
    identity: (data) => ipcRenderer.send('desktop:identity', { hue: Number(data && data.hue) }),
    onLocalDraw: (callback) => ipcRenderer.on('desktop:local-draw', (_event, data) => callback(data)),
    // Mouse de quem assiste e controle remoto.
    caps: () => ipcRenderer.invoke('desktop:caps'),
    controlState: (data) => ipcRenderer.send('desktop:control-state', data && data.on
      ? { on: true, name: String(data.name || ''), hue: Number(data.hue) || 0 } : { on: false }),
    control: (msg) => ipcRenderer.send('desktop:control', msg),
    onControlRevoke: (callback) => ipcRenderer.on('desktop:control-revoke', () => callback()),
    // Versão nova do app: o estado agora e as mudanças; update() é o botão do aviso.
    onUpdate: (callback) => {
      ipcRenderer.on('desktop:update', (_event, data) => callback(data));
      ipcRenderer.invoke('desktop:update-listen').then((data) => { if (data) callback(data); }, () => {});
    },
    update: () => ipcRenderer.invoke('desktop:update'),
  });
} else {
  contextBridge.exposeInMainWorld('setupBridge', {
    connect: (address) => ipcRenderer.invoke('setup:connect', String(address || '')),
    retry: () => ipcRenderer.send('setup:retry'),
  });
}
