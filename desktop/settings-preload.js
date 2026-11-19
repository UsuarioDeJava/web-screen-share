const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktopSettings', {
  readGamepadProfiles: () => ipcRenderer.invoke('settings:gamepad-profiles'),
  saveGamepadProfile: (value) => ipcRenderer.invoke('settings:gamepad-profile-save', value),
  read: () => ipcRenderer.invoke('settings:read'),
  save: (value) => ipcRenderer.invoke('settings:save', value),
  restart: () => ipcRenderer.invoke('settings:restart'),
  clearLog: () => ipcRenderer.invoke('settings:clear-log'),
  subscribeLog: (value) => ipcRenderer.invoke('settings:log-subscribe', value),
  exportLog: () => ipcRenderer.invoke('settings:export-log'),
  checkUpdate: () => ipcRenderer.invoke('settings:check-update'),
  readRoom: (section) => ipcRenderer.invoke('settings:room-read', section),
  roomAction: (value) => ipcRenderer.invoke('settings:room-action', value),
  onSection: (callback) => { ipcRenderer.on('settings:section', (_event, value) => callback(value)); },
  onLog: (callback) => { ipcRenderer.on('settings:log', (_event, data) => callback(data)); },
});
