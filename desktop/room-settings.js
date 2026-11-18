// Adaptador para os controles da página já conectada. Usa os mesmos eventos e
// armazenamento do perfil da sala, sem criar outra conexão ou alterar o servidor.
async function readRoomSettings(section) {
  const $ = (id) => document.getElementById(id);
  if (!$('app') || $('app').hidden || !$('me-name')?.textContent.trim()) {
    return { available: false, reason: 'Entre na sala para configurar seu perfil e ponteiro.' };
  }
  if (section === 'diagnostics') return { available: true, diagnostics: $('diag-output')?.textContent || '' };
  if (section === 'obs') {
    const displays = await window.wssDesktop?.displays?.();
    const response = await fetch('/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível consultar o suporte OBS do servidor.');
    const status = await response.json();
    return {
      available: true, supported: Boolean(status.obs), name: $('me-name').textContent.trim(),
      url: `${location.origin}/obs/${encodeURIComponent($('me-name').textContent.trim())}`,
      certificateWarning: location.protocol === 'https:' && !status.certificate,
      overlaySupported: Boolean(displays?.overlay), displays: displays?.displays || [],
      obsDisplay: displays?.obsDisplay || 'off',
    };
  }
  document.documentElement.setAttribute('data-wss-settings-adapter', '');
  try {
    const profile = $('profile-dialog');
    if (profile && !profile.open) {
      $('btn-profile')?.click();
      if (profile.open) profile.close();
    }
    const img = $('profile-avatar')?.querySelector('img');
    const photoSource = img?.src || $('profile-avatar')?.style.backgroundImage.match(/^url\((["']?)(.*?)\1\)$/)?.[2];
    let photo = null;
    if (photoSource) {
      const url = new URL(photoSource, location.href);
      if (url.origin === location.origin && url.pathname.startsWith('/avatar/')) photo = url.href;
    }
    const shortcuts = [...document.querySelectorAll('#keys-dialog dt')].filter((node) => !node.hidden && !node.nextElementSibling?.hidden)
      .map((node) => ({ keys: node.textContent.trim(), action: node.nextElementSibling?.textContent.trim() || '' }));
    const controls = $('control-dialog');
    const controlWasOpen = Boolean(controls?.open);
    if (controls && !controlWasOpen) {
      $('btn-cursor')?.click();
      const end = Date.now() + 1000;
      while (!controls.open && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const controlPeople = [...document.querySelectorAll('#control-list .control-person')].map((node) => ({
      name: node.querySelector('.control-name')?.textContent || '',
      active: node.classList.contains('is-active'), disabled: Boolean(node.querySelector('button')?.disabled),
    }));
    const controlNote = $('control-note') && !$('control-note').hidden ? $('control-note').textContent : '';
    if (controls?.open && !controlWasOpen) controls.close();
    return {
      available: true, name: $('me-name').textContent.trim(), photo,
      color: localStorage.getItem('wss-color') || null,
      shareCursor: localStorage.getItem('wss-cursor') !== '0',
      showCursors: localStorage.getItem('wss-show-cursors') !== '0',
      sounds: window.RoomSounds ? window.RoomSounds.enabled : localStorage.getItem('wss-sounds') !== '0',
      presets: [...document.querySelectorAll('#color-presets [data-color]')].map((node) => node.dataset.color),
      photoError: $('photo-error') && !$('photo-error').hidden ? $('photo-error').textContent : '',
      diagnostics: $('diag-output')?.textContent || '',
      serverVersion: $('sidebar-version')?.textContent || '', shortcuts,
      controlPeople, controlNote,
      controlsAvailable: Boolean($('share-cursor') && $('show-cursors')),
    };
  } finally { document.documentElement.removeAttribute('data-wss-settings-adapter'); }
}

async function applyRoomAction(command) {
  const $ = (id) => document.getElementById(id);
  if (!$('app') || $('app').hidden) throw new Error('Entre na sala para usar esta configuração.');
  document.documentElement.setAttribute('data-wss-settings-adapter', '');
  try {
    const click = (id) => { const node = $(id); if (!node) throw new Error('Esta função não está disponível na versão do servidor.'); node.click(); return node; };
    const wait = async (check, timeout = 20000) => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
      if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('A operação demorou demais. Verifique a conexão e tente novamente.');
    };
    if (command.type === 'cursor' || command.type === 'sounds') {
      if (command.type === 'sounds') {
        if (Boolean(window.RoomSounds?.enabled) !== command.enabled) click('btn-sounds');
      } else {
        const field = $(command.field === 'share' ? 'share-cursor' : 'show-cursors');
        if (!field) throw new Error('Opção de ponteiro indisponível.');
        field.checked = command.enabled;
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (command.type === 'color') {
      if (command.color === null) click('color-auto');
      else {
        const field = $('cp-hex');
        if (!field) throw new Error('Cor personalizada indisponível nesta versão do servidor.');
        field.value = command.color;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }
    } else if (command.type === 'photo' || command.type === 'photo-remove') {
      const profile = $('profile-dialog');
      // Mantém o diálogo original aberto só durante o processamento, para que a
      // página atualize o avatar e os erros; a folha de estilo local o oculta.
      const wasOpen = Boolean(profile?.open);
      if (!wasOpen) click('btn-profile');
      try {
        if (command.type === 'photo') {
          const field = $('photo-input');
          if (!field) throw new Error('Envio de foto indisponível.');
          const bytes = Uint8Array.from(atob(command.data), (c) => c.charCodeAt(0));
          const transfer = new DataTransfer();
          transfer.items.add(new File([bytes], command.name, { type: command.mime }));
          field.files = transfer.files;
          field.dispatchEvent(new Event('change', { bubbles: true }));
          await wait(() => !$('btn-photo').disabled, 65000);
        } else {
          const photoValue = () => $('profile-avatar')?.style.backgroundImage || $('profile-avatar')?.querySelector('img')?.src || '';
          const before = photoValue();
          click('btn-photo-remove');
          await wait(() => photoValue() !== before || !$('photo-error').hidden);
        }
        if ($('photo-error') && !$('photo-error').hidden) throw new Error($('photo-error').textContent);
      } finally { if (profile?.open && !wasOpen) profile.close(); }
    } else if (command.type === 'diagnostics') {
      const diag = $('diag-dialog');
      if (!diag) throw new Error('Diagnóstico indisponível nesta versão do servidor.');
      if (!diag.open) { click('btn-diag'); if (diag.open) diag.close(); }
      else click('diag-again');
    } else if (command.type === 'obs-display') {
      const desktop = window.wssDesktop;
      const info = await desktop?.displays?.();
      if (!info?.overlay) throw new Error('Overlays não estão disponíveis neste sistema.');
      if (command.value !== 'off' && !info.displays.some((display) => String(display.id) === command.value)) throw new Error('O monitor selecionado não está mais conectado.');
      const select = $('obs-overlay-display');
      if (!select) throw new Error('Atualize a página do servidor para selecionar o monitor das marcações.');
      select.replaceChildren(...[...info.displays, { id: 'off', label: 'Desligado' }].map((display) => {
        const option = document.createElement('option'); option.value = String(display.id); option.textContent = display.label; return option;
      }));
      select.value = command.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(async () => (await desktop.displays())?.obsDisplay === command.value);
    } else if (command.type === 'check-updates') {
      const button = click('btn-check-update');
      await wait(() => !button.disabled);
      return { ok: true, message: $('toast')?.textContent || 'Verificação concluída.' };
    } else if (command.type === 'control') {
      const panel = $('control-dialog');
      const wasOpen = Boolean(panel?.open);
      if (!wasOpen) click('btn-cursor');
      try {
        await wait(() => panel?.open, 3000);
        const row = [...document.querySelectorAll('#control-list .control-person')].find((node) => node.querySelector('.control-name')?.textContent === command.name);
        if (!row) throw new Error('Essa pessoa não está mais disponível na sala.');
        if (row.classList.contains('is-active') !== command.grant) {
          const button = row.querySelector('button');
          if (!button || button.disabled) throw new Error($('control-note')?.textContent || 'Controle indisponível.');
          button.click();
          await wait(() => {
            const current = [...document.querySelectorAll('#control-list .control-person')].find((node) => node.querySelector('.control-name')?.textContent === command.name);
            return current && current.classList.contains('is-active') === command.grant;
          });
        }
      } finally { if (panel?.open && !wasOpen) panel.close(); }
    } else throw new Error('Configuração não reconhecida.');
    return { ok: true };
  } finally { document.documentElement.removeAttribute('data-wss-settings-adapter'); }
}

function validateRoomAction(value) {
  if (!value || typeof value !== 'object') throw new Error('Configuração inválida.');
  if (value.type === 'cursor' && ['share', 'show'].includes(value.field) && typeof value.enabled === 'boolean') return { type: value.type, field: value.field, enabled: value.enabled };
  if (value.type === 'sounds' && typeof value.enabled === 'boolean') return { type: value.type, enabled: value.enabled };
  if (value.type === 'obs-display' && typeof value.value === 'string' && (value.value === 'off' || /^-?\d{1,20}$/.test(value.value))) return { type: value.type, value: value.value };
  if (value.type === 'control' && typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 80 && typeof value.grant === 'boolean') return { type: value.type, name: value.name, grant: value.grant };
  if (value.type === 'color' && (value.color === null || /^#[0-9a-f]{6}$/i.test(value.color))) return { type: value.type, color: value.color };
  if (['photo-remove', 'diagnostics', 'check-updates'].includes(value.type)) return { type: value.type };
  if (value.type === 'photo' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.mime)
    && typeof value.data === 'string' && value.data.length <= 6990510 && /^[A-Za-z0-9+/]*={0,2}$/.test(value.data)
    && Buffer.from(value.data, 'base64').length > 0 && Buffer.from(value.data, 'base64').length <= 5 * 1024 * 1024) {
    return { type: value.type, data: value.data, name: String(value.name || 'foto').slice(0, 120), mime: value.mime };
  }
  throw new Error('Configuração inválida. Fotos devem ser PNG, JPG, WebP ou GIF com até 5 MB.');
}

function createRoomSettings({ getContents, isServer }) {
  let pending = Promise.resolve();
  const execute = (fn, argument) => {
    const contents = getContents();
    if (!contents || contents.isDestroyed() || !isServer(contents.getURL())) throw new Error('Conecte-se ao servidor para acessar as configurações da sala.');
    return contents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(argument)})`, true);
  };
  const run = (fn, argument) => {
    const result = pending.then(() => execute(fn, argument));
    pending = result.catch(() => {});
    return result;
  };
  return { read: (section) => run(readRoomSettings, ['diagnostics', 'obs'].includes(section) ? section : undefined), action: (value) => run(applyRoomAction, validateRoomAction(value)) };
}

module.exports = { createRoomSettings, validateRoomAction };
