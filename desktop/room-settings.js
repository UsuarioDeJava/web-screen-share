// Adaptador para os controles da página já conectada. Usa os mesmos eventos e
// armazenamento do perfil da sala, sem criar outra conexão ou alterar o servidor.
async function readRoomSettings(section) {
  if (window.wssRoomSettings?.version === 1) return window.wssRoomSettings.read(section);
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
  const adapterRoot = document.documentElement;
  adapterRoot.setAttribute('data-wss-settings-adapter', String(Number(adapterRoot.getAttribute('data-wss-settings-adapter') || 0) + 1));
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
    const nativeCaps = await window.wssDesktop?.caps?.();
    if (nativeCaps && !nativeCaps.control) for (const person of controlPeople) if (!person.active) person.disabled = true;
    if (controls?.open && !controlWasOpen) controls.close();
    // Cor: a escolhida (#rrggbb), a de antes da cor livre (só o tom), a automática do nick,
    // a que aparece agora no mouse/marcações, as recentes e as que mais aparecem na foto.
    const name = $('me-name').textContent.trim();
    const hslHex = (h, s, l) => {
      const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
      const f = (n) => { const k = (n + h / 30) % 12; return Math.round((l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0'); };
      return `#${f(0)}${f(8)}${f(4)}`;
    };
    let autoHue = 0;
    for (const ch of name) autoHue = (autoHue * 31 + ch.codePointAt(0)) >>> 0;
    autoHue %= 360;
    const savedColor = String(localStorage.getItem('wss-color') || '').toLowerCase();
    const color = /^#[0-9a-f]{6}$/.test(savedColor) ? savedColor : null;
    const savedHue = parseInt(localStorage.getItem('wss-hue'), 10);
    const legacyHue = !color && savedHue >= 0 && savedHue < 360 ? savedHue : null;
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('wss-color-recent') || '[]').filter((c) => /^#[0-9a-f]{6}$/.test(c)).slice(0, 8); } catch {}
    const cached = window.__wssLegacyPalette;
    let photoColors = cached?.url === photo ? cached.colors : [];
    if (photo && cached?.url !== photo) {
      try {
        const image = new Image();
        image.src = photo;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 48;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 48, 48);
        const { data } = ctx.getImageData(0, 0, 48, 48);
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue;
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
          const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          b.n += 1; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
          buckets.set(key, b);
        }
        const ranked = [...buckets.values()].map((b) => {
          const rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
          const max = Math.max(...rgb) / 255;
          const sat = max ? (max - Math.min(...rgb) / 255) / max : 0;
          return { rgb, score: b.n * (0.3 + sat) * (max < 0.15 ? 0.15 : 1) };
        }).sort((a, b) => b.score - a.score);
        const picked = [];
        for (const { rgb } of ranked) {
          if (picked.every((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) > 64)) picked.push(rgb);
          if (picked.length === 6) break;
        }
        photoColors = picked.map((rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`);
      } catch {}
      window.__wssLegacyPalette = { url: photo, colors: photoColors };
    }
    return {
      available: true, name, photo,
      color, legacyHue, recent, photoColors,
      autoFill: `hsl(${autoHue} 45% 42%)`,
      markColor: color || hslHex(legacyHue === null ? autoHue : legacyHue, 95, 64),
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
  } finally {
    const remaining = Number(adapterRoot.getAttribute('data-wss-settings-adapter') || 1) - 1;
    if (remaining > 0) adapterRoot.setAttribute('data-wss-settings-adapter', String(remaining));
    else adapterRoot.removeAttribute('data-wss-settings-adapter');
  }
}

async function applyRoomAction(command) {
  if (window.wssRoomSettings?.version === 1) return window.wssRoomSettings.action(command);
  const $ = (id) => document.getElementById(id);
  if (!$('app') || $('app').hidden) throw new Error('Entre na sala para usar esta configuração.');
  const adapterRoot = document.documentElement;
  adapterRoot.setAttribute('data-wss-settings-adapter', String(Number(adapterRoot.getAttribute('data-wss-settings-adapter') || 0) + 1));
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
        // commit: confirmar (manda na hora e entra nas recentes). Sem, é a cor "ao vivo"
        // enquanto você arrasta no seletor (a sala manda depois de 300 ms parada).
        if (command.commit) field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
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
      if (command.grant && !(await window.wssDesktop?.caps?.())?.control) throw new Error('O controle remoto está indisponível ou as marcações estão desligadas.');
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
  } finally {
    const remaining = Number(adapterRoot.getAttribute('data-wss-settings-adapter') || 1) - 1;
    if (remaining > 0) adapterRoot.setAttribute('data-wss-settings-adapter', String(remaining));
    else adapterRoot.removeAttribute('data-wss-settings-adapter');
  }
}

function validateRoomAction(value) {
  if (!value || typeof value !== 'object') throw new Error('Configuração inválida.');
  if (value.type === 'cursor' && ['share', 'show'].includes(value.field) && typeof value.enabled === 'boolean') return { type: value.type, field: value.field, enabled: value.enabled };
  if (value.type === 'sounds' && typeof value.enabled === 'boolean') return { type: value.type, enabled: value.enabled };
  if (value.type === 'obs-display' && typeof value.value === 'string' && (value.value === 'off' || /^-?\d{1,20}$/.test(value.value))) return { type: value.type, value: value.value };
  if (value.type === 'control' && typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 80 && typeof value.grant === 'boolean') return { type: value.type, name: value.name, grant: value.grant };
  if (value.type === 'color' && (value.color === null || /^#[0-9a-f]{6}$/i.test(value.color))) {
    return { type: value.type, color: value.color === null ? null : value.color.toLowerCase(), commit: value.commit !== false };
  }
  if (['photo-remove', 'diagnostics', 'check-updates'].includes(value.type)) return { type: value.type };
  if (value.type === 'photo' && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.mime)
    && typeof value.data === 'string' && value.data.length <= 6990510 && /^[A-Za-z0-9+/]*={0,2}$/.test(value.data)
    && Buffer.from(value.data, 'base64').length > 0 && Buffer.from(value.data, 'base64').length <= 5 * 1024 * 1024) {
    return { type: value.type, data: value.data, name: String(value.name || 'foto').slice(0, 120), mime: value.mime };
  }
  throw new Error('Configuração inválida. Fotos devem ser PNG, JPG, WebP ou GIF com até 5 MB.');
}

function createRoomSettings({ getContents, isServer }) {
  const lanes = new Map();
  const waiting = new Set();
  let generation = 0;
  const execute = (fn, argument) => {
    const contents = getContents();
    if (!contents || contents.isDestroyed() || !isServer(contents.getURL())) throw new Error('Conecte-se ao servidor para acessar as configurações da sala.');
    return contents.executeJavaScript(`(${fn.toString()})(${JSON.stringify(argument)})`, true);
  };
  const run = (fn, argument, lane) => {
    const current = generation;
    const previous = lanes.get(lane) || Promise.resolve();
    const task = previous.then(() => {
      if (current !== generation) throw new Error('Operação cancelada: a página da sala mudou.');
      return execute(fn, argument);
    });
    let cancel, timer;
    const result = Promise.race([task, new Promise((_, reject) => {
      cancel = () => reject(new Error('Operação cancelada.'));
      waiting.add(cancel);
      timer = setTimeout(() => reject(new Error('A operação demorou demais. Tente novamente.')), lane === 'photo' ? 70000 : 25000);
    })]).finally(() => { clearTimeout(timer); waiting.delete(cancel); });
    if (lane) {
      const tail = result.catch(() => {});
      lanes.set(lane, tail);
      tail.then(() => { if (lanes.get(lane) === tail) lanes.delete(lane); });
    }
    return result;
  };
  return {
    read: (section) => run(readRoomSettings, ['diagnostics', 'obs', 'media'].includes(section) ? section : undefined),
    action(value) {
      const command = validateRoomAction(value);
      const lane = command.type.startsWith('photo') ? 'photo' : command.type === 'color' ? 'color' : command.type === 'control' ? undefined : command.type;
      return run(applyRoomAction, command, lane);
    },
    cancel() { generation++; for (const cancel of waiting) cancel(); lanes.clear(); },
  };
}

module.exports = { createRoomSettings, validateRoomAction };
