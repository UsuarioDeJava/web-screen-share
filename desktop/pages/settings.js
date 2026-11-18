const api = window.desktopSettings;
const $ = (id) => document.getElementById(id);
let snapshot = { rows: [], omitted: 0, enabled: true, limit: 2000 };
let paused = false;
let initialized = false;
let pendingRestart = false;
let dirty = false;
const tabs = ['profile', 'pointer', 'settings', 'connection', 'obs', 'log', 'shortcuts'];
let activeTab = 'profile';
let diagnosticTimer;
let diagnosticsRunning = false;
let roomState = { available: false };
const categories = { people: 'Pessoas', stream: 'Transmissões', connection: 'Conexões', error: 'Erros', system: 'Aplicativo' };
const directions = { in: 'Recebido', out: 'Enviado', local: 'Local' };
const levels = { info: 'Info', warn: 'Aviso', error: 'Erro' };
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }

function renderLog() {
  const query = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const rows = snapshot.rows.filter((row) => (!$('category').value || row.category === $('category').value)
    && (!$('level').value || row.level === $('level').value)
    && (!$('direction').value || row.direction === $('direction').value)
    && (!query || row.message.toLocaleLowerCase('pt-BR').includes(query)));
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.dataset.level = row.level;
    for (const value of [new Date(row.at).toLocaleTimeString('pt-BR', { hour12: false }), directions[row.direction], categories[row.category], levels[row.level], row.message]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    fragment.append(tr);
  }
  $('log-rows').replaceChildren(fragment);
  $('log-empty').hidden = rows.length > 0;
  $('log-count').textContent = snapshot.rows.length;
  $('log-status').textContent = `${paused ? 'Visualização pausada. ' : ''}${snapshot.enabled ? 'Registro ativo' : 'Registro desativado'} · ${rows.length} exibidos de ${snapshot.rows.length} · limite ${snapshot.limit}${snapshot.omitted ? ` · ${snapshot.omitted} eventos omitidos por excesso de frequência` : ''}`;
  if ($('follow').checked && !paused) $('log-wrap').scrollTop = $('log-wrap').scrollHeight;
}

function selectTab(name, focus = false) {
  if (!tabs.includes(name)) name = 'profile';
  activeTab = name;
  clearTimeout(diagnosticTimer);
  for (const id of tabs) {
    const active = id === name;
    $(`tab-${id}`).setAttribute('aria-selected', active);
    $(`tab-${id}`).tabIndex = active ? 0 : -1;
    $(`panel-${id}`).hidden = !active;
  }
  if (name === 'log') renderLog();
  if (['profile', 'pointer', 'shortcuts'].includes(name)) refreshRoom();
  if (name === 'connection') pollDiagnostics();
  if (name === 'obs') refreshObs();
  if (focus) $(`tab-${name}`).focus();
}
for (const name of tabs) {
  $(`tab-${name}`).addEventListener('click', () => selectTab(name));
  $(`tab-${name}`).addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      event.preventDefault(); selectTab(event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(tabs.indexOf(name) + step + tabs.length) % tabs.length], true);
    }
  });
}

api.onLog((value) => {
  if (paused) return;
  snapshot = value;
  $('log-count').textContent = snapshot.rows.length;
  if (!$('panel-log').hidden) renderLog();
});

async function load() {
  const value = await api.read();
  if (!initialized || !dirty) {
    $('server').value = value.server || '';
    $('fullscreen').value = value.preferences.fullscreen;
    $('hardware').checked = value.preferences.hardwareAcceleration;
    $('overlay').checked = value.preferences.overlay;
    $('logging').checked = value.preferences.logging;
    $('log-limit').value = value.preferences.logLimit;
  }
  pendingRestart = value.restartRequired;
  $('restart').hidden = !pendingRestart;
  $('version').textContent = `App ${value.environment.app}`;
  $('environment').textContent = `Electron ${value.environment.electron} · Chromium ${value.environment.chrome}\n${value.environment.platform}\nModo ativo: ${value.active.fullscreen} · aceleração ${value.active.hardwareAcceleration ? 'habilitada' : 'desabilitada'}\nServidor ativo: ${value.activeServer || 'não configurado'}\n${value.environment.displays.join('\n')}`;
  snapshot = value.log;
  renderLog();
  initialized = true;
}
$('settings-form').addEventListener('input', () => { dirty = true; });
$('server').addEventListener('input', () => { dirty = true; });
$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api.save({ server: $('server').value, preferences: {
      fullscreen: $('fullscreen').value, hardwareAcceleration: $('hardware').checked,
      overlay: $('overlay').checked, logging: $('logging').checked, logLimit: Number($('log-limit').value),
    } });
    if (!result.ok) throw new Error(result.error);
    dirty = false;
    await load();
    status(pendingRestart ? 'Salvo. Reinicie o app para aplicar as mudanças de conexão ou vídeo.' : 'Configurações salvas e aplicadas.');
  } catch (error) { status(error.message, true); }
});
$('restart').addEventListener('click', async () => {
  try { await api.restart(); } catch (error) { status(error.message, true); }
});
for (const id of ['search', 'category', 'level', 'direction']) $(id).addEventListener('input', renderLog);
$('pause').addEventListener('click', async () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Retomar visualização' : 'Pausar visualização';
  $('pause').setAttribute('aria-pressed', paused);
  if (!paused) { snapshot = (await api.read()).log; }
  renderLog();
});
$('clear').addEventListener('click', async () => { await api.clearLog(); snapshot = (await api.read()).log; renderLog(); });
$('export').addEventListener('click', async () => {
  try { const result = await api.exportLog(); if (result.saved) status('Log exportado.'); }
  catch (error) { status(error.message, true); }
});
$('check-update').addEventListener('click', async () => {
  try { const value = await api.checkUpdate(); $('update-status').textContent = value.message; }
  catch (error) { status(error.message, true); }
});
async function refreshRoom() {
  try { roomState = await api.readRoom(); }
  catch (error) { roomState = { available: false, reason: error.message }; }
  for (const node of document.querySelectorAll('.room-unavailable')) {
    node.hidden = roomState.available;
    node.textContent = roomState.reason || 'Entre na sala para acessar estas configurações.';
  }
  for (const node of document.querySelectorAll('.room-control')) node.disabled = !roomState.available;
  if (!roomState.available) return;
  $('profile-name').textContent = roomState.name;
  $('profile-initial').textContent = [...roomState.name][0] || '?';
  $('profile-initial').style.backgroundColor = roomState.color || '#5363ae';
  $('profile-initial').hidden = Boolean(roomState.photo);
  $('profile-photo').hidden = !roomState.photo;
  if (roomState.photo) $('profile-photo').src = roomState.photo;
  else $('profile-photo').removeAttribute('src');
  $('remove-photo').disabled = !roomState.photo;
  $('profile-color').value = roomState.color || '#8590ff';
  $('profile-color-label').textContent = roomState.color ? `Cor atual: ${roomState.color.toUpperCase()}` : 'Cor automática do seu nome.';
  $('share-cursor').checked = roomState.shareCursor;
  $('show-cursors').checked = roomState.showCursors;
  $('room-sounds').checked = roomState.sounds;
  $('share-cursor').disabled = $('show-cursors').disabled = !roomState.controlsAvailable;
  const colors = document.createDocumentFragment();
  for (const color of roomState.presets || []) {
    const button = document.createElement('button'); button.type = 'button';
    button.style.backgroundColor = color; button.title = color.toUpperCase();
    button.setAttribute('aria-label', `Usar cor ${color}`);
    button.setAttribute('aria-pressed', color === roomState.color);
    button.addEventListener('click', () => roomAction({ type: 'color', color }));
    colors.append(button);
  }
  $('color-presets').replaceChildren(colors);
  $('control-note').textContent = roomState.controlNote || 'Escolha quem pode controlar seu mouse e teclado.';
  const people = document.createDocumentFragment();
  for (const person of roomState.controlPeople || []) {
    const row = document.createElement('div'); row.className = 'control-person';
    const label = document.createElement('span'); label.textContent = `${person.name}${person.active ? ' · controlando' : ''}`;
    if (person.active) label.className = 'active';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn';
    button.textContent = person.active ? 'Revogar controle' : 'Permitir controle'; button.disabled = person.disabled;
    button.addEventListener('click', () => roomAction({ type: 'control', name: person.name, grant: !person.active }));
    row.append(label, button); people.append(row);
  }
  $('control-people').replaceChildren(people);
  const keys = document.createDocumentFragment();
  for (const shortcut of roomState.shortcuts || []) {
    const dt = document.createElement('dt'); dt.textContent = shortcut.keys;
    const dd = document.createElement('dd'); dd.textContent = shortcut.action;
    keys.append(dt, dd);
  }
  $('room-shortcuts').replaceChildren(keys);
}

async function roomAction(command) {
  try {
    await api.roomAction(command);
    await refreshRoom();
    status('Configuração da sala aplicada.');
  } catch (error) { status(error.message, true); }
}
$('share-cursor').addEventListener('change', () => roomAction({ type: 'cursor', field: 'share', enabled: $('share-cursor').checked }));
$('show-cursors').addEventListener('change', () => roomAction({ type: 'cursor', field: 'show', enabled: $('show-cursors').checked }));
$('room-sounds').addEventListener('change', () => roomAction({ type: 'sounds', enabled: $('room-sounds').checked }));
$('apply-color').addEventListener('click', () => roomAction({ type: 'color', color: $('profile-color').value }));
$('auto-color').addEventListener('click', () => roomAction({ type: 'color', color: null }));
$('choose-photo').addEventListener('click', () => $('profile-file').click());
$('remove-photo').addEventListener('click', () => roomAction({ type: 'photo-remove' }));
$('profile-file').addEventListener('change', async (event) => {
  const file = event.target.files[0]; event.target.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return status('A foto deve ter até 5 MB.', true);
  $('choose-photo').disabled = true; status('Enviando foto…');
  try {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Não foi possível ler a foto.')); reader.readAsDataURL(file);
    });
    await roomAction({ type: 'photo', data, mime: file.type, name: file.name });
  } catch (error) { status(error.message, true); }
  finally { $('choose-photo').disabled = !roomState.available; }
});

async function pollDiagnostics() {
  clearTimeout(diagnosticTimer);
  if (activeTab !== 'connection' || document.hidden) return;
  let available = false;
  try {
    const data = await api.readRoom('diagnostics');
    available = data.available;
    $('run-diagnostics').disabled = !data.available || diagnosticsRunning;
    $('diagnostic-output').textContent = data.diagnostics || data.reason || 'Nenhum teste executado nesta sessão.';
    if (data.diagnostics?.trim().endsWith('Fim do teste.')) diagnosticsRunning = false;
  } catch (error) { $('diagnostic-output').textContent = error.message; diagnosticsRunning = false; }
  $('run-diagnostics').disabled = !available || diagnosticsRunning;
  if (diagnosticsRunning) diagnosticTimer = setTimeout(pollDiagnostics, 500);
}
$('run-diagnostics').addEventListener('click', async () => {
  $('run-diagnostics').disabled = true;
  try { await api.roomAction({ type: 'diagnostics' }); diagnosticsRunning = true; await pollDiagnostics(); }
  catch (error) { status(error.message, true); $('run-diagnostics').disabled = false; }
});
$('copy-diagnostics').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('diagnostic-output').textContent); status('Resultado copiado.'); }
  catch (error) { status(error.message, true); }
});
document.addEventListener('visibilitychange', () => { if (activeTab === 'connection') pollDiagnostics(); });
api.onSection((name) => selectTab(name));

async function refreshObs() {
  $('obs-monitor').disabled = true;
  $('copy-obs-url').disabled = true;
  try {
    const data = await api.readRoom('obs');
    $('obs-status').textContent = !data.available ? data.reason : data.supported ? `Transmissão OBS para ${data.name}.` : 'O servidor atual não está com a integração OBS habilitada. Você ainda pode configurar o monitor das marcações.';
    $('obs-url').value = data.url || '';
    $('copy-obs-url').disabled = !data.available || !data.supported;
    $('obs-certificate').hidden = !data.certificateWarning;
    const options = (data.displays || []).map((display) => {
      const option = document.createElement('option'); option.value = String(display.id); option.textContent = display.label; return option;
    });
    const off = document.createElement('option'); off.value = 'off'; off.textContent = 'Desligado';
    $('obs-monitor').replaceChildren(...options, off);
    $('obs-monitor').value = data.obsDisplay || 'off';
    $('obs-monitor').disabled = !data.overlaySupported;
    if (data.available && !data.overlaySupported) $('obs-status').textContent += ' As marcações não estão disponíveis neste sistema.';
  } catch (error) { $('obs-status').textContent = error.message; }
}
$('obs-monitor').addEventListener('change', async () => {
  const value = $('obs-monitor').value;
  $('obs-monitor').disabled = true;
  try { await api.roomAction({ type: 'obs-display', value }); status('Monitor das marcações salvo e aplicado.'); }
  catch (error) { status(error.message, true); }
  await refreshObs();
});
$('copy-obs-url').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('obs-url').value); status('Endereço do OBS copiado.'); }
  catch (error) { status(error.message, true); }
});
load().catch((error) => status(error.message, true));
refreshRoom();
