// Configurações no navegador: esta mesma página, aberta pela sala num popup (iframe da
// mesma origem). Faz o papel do settings-preload.js do app: lê e muda a sala pelo
// window.wssRoomSettings dela, e esconde o que só existe no app (Aplicativo, log,
// servidor, overlays, driver do gamepad, controle remoto, atalhos do app).
// No app, o preload já criou window.desktopSettings e este arquivo não faz nada.
(() => {
  if (window.desktopSettings) return;
  document.documentElement.setAttribute('data-web', '');
  for (const node of document.querySelectorAll('[data-app-only]')) node.hidden = true;
  const hint = document.getElementById('settings-hint');
  if (hint) hint.textContent = 'Seu perfil e a sala em um só lugar.';
  const saved = document.getElementById('profile-saved-hint');
  if (saved) saved.textContent = 'PNG, JPG, WebP ou GIF animado, até 5 MB. O perfil é salvo nesta sala, neste navegador.';

  const room = window.parent !== window ? window.parent : null;
  const roomApi = () => {
    const api = room && room.wssRoomSettings;
    if (!api) throw new Error('Abra as configurações pela sala.');
    return api;
  };
  // Como o IPC do app: só dados vão e voltam (cópias, sem objetos da outra página).
  const copy = (value) => (value === undefined ? value : structuredClone(value));
  const onlyInApp = () => Promise.reject(new Error('Isso só existe no aplicativo.'));

  let sectionHandler = null;
  let pendingSection = null;
  // A sala chama ao abrir o popup (com a aba pedida: perfil, OBS, atalhos...).
  window.wssSettingsSection = (name) => {
    if (sectionHandler) sectionHandler(name);
    else pendingSection = name;
  };

  window.desktopSettings = {
    web: true,
    read: async () => ({ web: true, version: (room && room.wssServerVersion) || '' }),
    readRoom: async (section) => copy(await roomApi().read(section)),
    roomAction: async (value) => copy(await roomApi().action(copy(value))),
    close: async () => { if (room && room.WssSettings) room.WssSettings.close(); },
    onSection: (callback) => {
      sectionHandler = callback;
      if (pendingSection) { const name = pendingSection; pendingSection = null; callback(name); }
    },
    onLog: () => {},
    subscribeLog: async () => null,
    // Atalhos globais (do sistema) só existem no app; os da sala a página já lista.
    onShortcuts: () => {},
    readShortcuts: async () => null,
    shortcutAction: onlyInApp,
    save: onlyInApp,
    restart: onlyInApp,
    clearLog: onlyInApp,
    exportLog: onlyInApp,
    checkUpdate: onlyInApp,
    prepareGamepad: onlyInApp,
    // Sem readGamepadProfiles: o mapeamento do gamepad fica no localStorage, o mesmo da sala.
  };
})();
