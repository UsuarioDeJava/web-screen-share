const { contextBridge, ipcRenderer } = require('electron');
ipcRenderer.on('desktop:visual-mode', (_event, mode) => {
  const value = ['normal', 'economy', 'auto'].includes(mode) ? mode : 'normal';
  const root = document.documentElement;
  if (root && root.getAttribute('data-wss-visual-mode') !== value) {
    root.setAttribute('data-wss-visual-mode', value);
    root.toggleAttribute('data-wss-economy', value === 'economy');
  }
});
contextBridge.exposeInMainWorld('desktopSettings', {
  readGamepadProfiles: () => ipcRenderer.invoke('settings:gamepad-profiles'),
  onGamepadProfiles: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('desktop:gamepad-profiles', listener);
    return () => ipcRenderer.removeListener('desktop:gamepad-profiles', listener);
  },
  prepareGamepad: () => ipcRenderer.invoke('settings:gamepad-setup'),
  saveGamepadProfile: (value) => ipcRenderer.invoke('settings:gamepad-profile-save', value),
  read: () => ipcRenderer.invoke('settings:read'),
  readShortcuts: () => ipcRenderer.invoke('settings:shortcuts-read'),
  shortcutAction: (action) => ipcRenderer.invoke('settings:shortcuts-action', action),
  onShortcuts: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('settings:shortcuts', listener);
    return () => ipcRenderer.removeListener('settings:shortcuts', listener);
  },
  save: (value) => ipcRenderer.invoke('settings:save', value),
  restart: () => ipcRenderer.invoke('settings:restart'),
  clearLog: () => ipcRenderer.invoke('settings:clear-log'),
  subscribeLog: (value) => ipcRenderer.invoke('settings:log-subscribe', value),
  exportLog: () => ipcRenderer.invoke('settings:export-log'),
  checkUpdate: () => ipcRenderer.invoke('settings:check-update'),
  setAutoUpdate: (value) => ipcRenderer.invoke('settings:auto-update', value === true),
  cameraPairing: () => ipcRenderer.invoke('settings:camera-pairing'),
  cameraDevices: () => ipcRenderer.invoke('settings:camera-devices'),
  cameraRemove: (id) => ipcRenderer.invoke('settings:camera-remove', String(id || '')),
  onCameraChanged: (callback) => { ipcRenderer.on('settings:camera-changed', () => callback()); },
  readRoom: (section) => ipcRenderer.invoke('settings:room-read', section),
  roomAction: (value) => ipcRenderer.invoke('settings:room-action', value),
  close: () => ipcRenderer.invoke('settings:close'),
  copyText: (text) => ipcRenderer.invoke('settings:copy', String(text ?? '')),
  onSection: (callback) => { ipcRenderer.on('settings:section', (_event, value) => callback(value)); },
  onLog: (callback) => { ipcRenderer.on('settings:log', (_event, data) => callback(data)); },
});
