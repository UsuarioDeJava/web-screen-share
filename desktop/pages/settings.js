const api = window.desktopSettings;
const $ = (id) => document.getElementById(id);
let snapshot = { rows: [], omitted: 0, enabled: true, limit: 2000 };
let paused = false;
let initialized = false;
let pendingRestart = false;
let dirty = false;
const tabs = ['profile', 'fx', 'pointer', 'settings', 'connection', 'obs', 'log', 'shortcuts'];
let activeTab = 'profile';
let diagnosticTimer;
let diagnosticsRunning = false;
let roomState = { available: false };
const categories = { people: 'Pessoas', stream: 'Transmissões', connection: 'Conexões', error: 'Erros', system: 'Aplicativo' };
const directions = { in: 'Recebido', out: 'Enviado', local: 'Local' };
const levels = { info: 'Info', warn: 'Aviso', error: 'Erro' };
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }

const logNodes = new Map();
function renderLog(reset = false) {
  const query = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const rows = snapshot.rows.filter((row) => (!$('category').value || row.category === $('category').value)
    && (!$('level').value || row.level === $('level').value)
    && (!$('direction').value || row.direction === $('direction').value)
    && (!query || row.message.toLocaleLowerCase('pt-BR').includes(query)));
  const fragment = document.createDocumentFragment();
  const visibleIds = new Set(rows.map((row) => row.id));
  if (reset) { logNodes.clear(); $('log-rows').replaceChildren(); }
  for (const [id, node] of logNodes) if (!visibleIds.has(id)) { node.remove(); logNodes.delete(id); }
  for (const row of rows) {
    if (logNodes.has(row.id)) continue;
    const tr = document.createElement('tr');
    tr.dataset.level = row.level;
    for (const value of [new Date(row.at).toLocaleTimeString('pt-BR', { hour12: false }), directions[row.direction], categories[row.category], levels[row.level], row.message]) {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    }
    fragment.append(tr);
    logNodes.set(row.id, tr);
  }
  $('log-rows').append(fragment);
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
  if (['profile', 'fx', 'pointer', 'shortcuts'].includes(name)) refreshRoom();
  if (name === 'connection') pollDiagnostics();
  if (name === 'obs') refreshObs();
  updateLogSubscription();
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

function acceptLog(value) {
  if (!value) return;
  if (value.epoch < snapshot.epoch || (value.epoch === snapshot.epoch && value.lastId < snapshot.lastId)) return;
  const rows = value.reset ? value.rows : [...snapshot.rows, ...value.rows.filter((row) => row.id > (snapshot.lastId ?? 0))].filter((row) => row.id >= value.firstId).slice(-value.limit);
  snapshot = { ...value, rows };
  $('log-count').textContent = snapshot.total;
  if (activeTab === 'log') renderLog(value.reset);
}
let subscriptionGeneration = 0;
async function updateLogSubscription() {
  const generation = ++subscriptionGeneration;
  const live = activeTab === 'log' && !paused && !document.hidden;
  try {
    const packet = await api.subscribeLog({ live, cursor: { epoch: snapshot.epoch, lastId: snapshot.lastId } });
    if (live && generation === subscriptionGeneration) acceptLog(packet);
  } catch (error) { status(error.message, true); }
}
api.onLog((value) => {
  if (paused) return;
  acceptLog(value);
});

async function load() {
  const value = await api.read();
  $('gamepad-client-path').textContent = `Componente para receber gamepads: ${value.gamepadClientPath || 'indisponível'}. Reinicie o aplicativo após configurar o driver e a DLL.`;
  if (!initialized || !dirty) {
    $('server').value = value.server || '';
    $('fullscreen').value = value.preferences.fullscreen;
    $('hardware').checked = value.preferences.hardwareAcceleration;
    $('overlay').checked = value.preferences.overlay;
    $('logging').checked = value.preferences.logging;
    $('log-limit').value = value.preferences.logLimit;
  }
  // Os modos "sem bordas" e "vídeo ampliado na janela" só existem no Windows.
  const windows = /^win32/.test(value.environment.platform);
  $('gamepad-install').hidden = value.environment.platform !== 'win32 x64';
  for (const option of $('fullscreen').options) option.hidden = option.disabled = !windows && option.value !== 'native';
  pendingRestart = value.restartRequired;
  $('restart').hidden = !pendingRestart;
  $('version').textContent = `App ${value.environment.app}`;
  $('environment').textContent = `Electron ${value.environment.electron} · Chromium ${value.environment.chrome}\n${value.environment.platform}\nModo ativo: ${value.active.fullscreen} · aceleração ${value.active.hardwareAcceleration ? 'habilitada' : 'desabilitada'}\nServidor ativo: ${value.activeServer || 'não configurado'}\n${value.environment.displays.join('\n')}`;
  snapshot = value.log;
  $('log-count').textContent = snapshot.total;
  if (activeTab === 'log') renderLog(true);
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
$('gamepad-install').addEventListener('click', async () => {
  const button = $('gamepad-install'), message = $('gamepad-setup-status');
  button.disabled = true; $('gamepad-setup-restart').hidden = true;
  message.textContent = 'Preparando componentes oficiais. Confirme o pedido de administrador do Windows, se aparecer, e aguarde.';
  try {
    const result = await api.prepareGamepad();
    message.textContent = result.message;
    $('gamepad-setup-restart').hidden = !result.restartRequired || result.rebootRequired;
  } catch (error) { message.textContent = 'Não foi possível preparar o gamepad: ' + error.message; }
  finally { button.disabled = false; }
});
$('gamepad-setup-restart').addEventListener('click', async () => {
  try { await api.restart(); } catch (error) { $('gamepad-setup-status').textContent = error.message; }
});
for (const id of ['search', 'category', 'level', 'direction']) $(id).addEventListener('input', () => renderLog(true));
$('pause').addEventListener('click', async () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Retomar visualização' : 'Pausar visualização';
  $('pause').setAttribute('aria-pressed', paused);
  await updateLogSubscription();
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
  renderFx();
  if (!roomState.available) return;
  $('profile-name').textContent = roomState.name;
  // Conta (servidor com contas): nick e senha; com administração, o botão do painel.
  $('account-card').hidden = !roomState.account;
  if (roomState.account) {
    if (document.activeElement !== $('account-nick')) $('account-nick').value = roomState.account.nick;
    $('account-admin').hidden = !roomState.account.admin;
  }
  $('profile-initial').textContent = [...roomState.name][0] || '?';
  const fill = roomState.color || (roomState.legacyHue !== null && roomState.legacyHue !== undefined ? `hsl(${roomState.legacyHue} 45% 42%)` : roomState.autoFill) || '#5363ae';
  $('profile-initial').style.backgroundColor = fill;
  $('profile-initial').style.color = roomState.color ? inkFor(roomState.color) : '#fff';
  $('profile-initial').hidden = Boolean(roomState.photo);
  $('profile-photo').hidden = !roomState.photo;
  if (roomState.photo) $('profile-photo').src = roomState.photo;
  else $('profile-photo').removeAttribute('src');
  $('remove-photo').disabled = !roomState.photo;
  $('show-cursors').checked = roomState.showCursors;
  $('room-sounds').checked = roomState.sounds;
  $('show-cursors').disabled = !roomState.controlsAvailable;
  renderColor();
  $('gamepad-native-status').textContent = roomState.gamepad?.available ? 'Gamepad virtual disponível. Até quatro participantes com gamepad.' : roomState.gamepad?.reason || 'Atualize o aplicativo e o servidor para receber gamepads.';
  $('control-note').textContent = roomState.controlNote || 'Escolha quem pode controlar seu mouse e teclado.';
  const people = document.createDocumentFragment();
  for (const person of roomState.controlPeople || []) {
    const row = document.createElement('div'); row.className = 'control-person';
    const label = document.createElement('span'); label.textContent = `${person.name}${person.active ? ' · controlando' : ''}`;
    if (person.active) label.className = 'active';
    const devices = {};
    row.append(label);
    for (const [key, title] of [['keyboard', 'Teclado'], ['mouse', 'Mouse'], ['gamepad', 'Gamepad']]) {
      const field = document.createElement('label'); field.textContent = title + ' '; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = person.devices?.[key] === true;
      input.disabled = person.disabled || (key === 'gamepad' && !roomState.gamepad?.available); devices[key] = input; field.append(input); row.append(field);
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn';
    button.textContent = person.active ? 'Aplicar permissões' : 'Permitir'; button.disabled = person.disabled;
    button.addEventListener('click', () => roomAction({ type: 'control', name: person.name, grant: true, devices: Object.fromEntries(Object.entries(devices).map(([k, input]) => [k, input.checked])) }));
    row.append(button);
    if (person.active) { const revoke = document.createElement('button'); revoke.type = 'button'; revoke.className = 'btn'; revoke.textContent = 'Revogar'; revoke.addEventListener('click', () => roomAction({ type: 'control', name: person.name, grant: false })); row.append(revoke); }
    people.append(row);
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

function accountMessage(id, text, ok = false) {
  $(id).textContent = text;
  $(id).classList.toggle('is-bad', Boolean(text) && !ok);
  $(id).classList.toggle('is-ok', Boolean(text) && ok);
}
// Nick repetido: o aviso vermelho vem do servidor, na hora de salvar.
$('account-nick-save').addEventListener('click', async () => {
  const nick = $('account-nick').value.replace(/\s+/g, ' ').trim();
  if (!nick) return accountMessage('account-nick-msg', 'Digite um nick.');
  $('account-nick-save').disabled = true;
  try {
    const res = await api.roomAction({ type: 'account-nick', nick });
    accountMessage('account-nick-msg', `Pronto: agora você é ${res && res.nick ? res.nick : nick}.`, true);
    setTimeout(refreshRoom, 1500); // a sala entra de novo com o nick novo
  } catch (error) { accountMessage('account-nick-msg', error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  $('account-nick-save').disabled = false;
});
$('account-pass-save').addEventListener('click', async () => {
  const next = $('account-pass-new').value;
  if (next.length < 6) return accountMessage('account-pass-msg', 'A senha nova precisa de pelo menos 6 caracteres.');
  if (next !== $('account-pass-new2').value) return accountMessage('account-pass-msg', 'As duas senhas novas não estão iguais.');
  $('account-pass-save').disabled = true;
  try {
    await api.roomAction({ type: 'account-password', current: $('account-pass-current').value, next });
    for (const id of ['account-pass-current', 'account-pass-new', 'account-pass-new2']) $(id).value = '';
    accountMessage('account-pass-msg', 'Senha trocada. As outras sessões da sua conta foram desconectadas.', true);
  } catch (error) { accountMessage('account-pass-msg', error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  $('account-pass-save').disabled = false;
});
// O painel de administração abre na sala (no lugar dela): as Configurações fecham.
$('account-admin').addEventListener('click', async () => {
  try {
    await api.roomAction({ type: 'admin-open' });
    if (typeof api.close === 'function') api.close();
  } catch (error) { status(error.message, true); }
});

async function roomAction(command) {
  try {
    await api.roomAction(command);
    await refreshRoom();
    status('Configuração da sala aplicada.');
  } catch (error) { status(error.message, true); }
}
$('show-cursors').addEventListener('change', () => roomAction({ type: 'cursor', field: 'show', enabled: $('show-cursors').checked }));
$('room-sounds').addEventListener('change', () => roomAction({ type: 'sounds', enabled: $('room-sounds').checked }));
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
document.addEventListener('visibilitychange', () => { if (activeTab === 'connection') pollDiagnostics(); updateLogSubscription(); });
api.onSection((name) => { document.body.classList.remove('closing'); selectTab(name); });

// Popup: fecha no X, no Esc ou clicando fora do painel (o clique tem que começar e
// terminar fora, pra não fechar ao soltar um arrasto que saiu do painel).
let closing = false;
function closePanel() {
  if (closing) return;
  closing = true;
  document.body.classList.add('closing');
  const done = () => api.close().catch(() => {}).finally(() => { closing = false; document.body.classList.remove('closing'); });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
  else setTimeout(done, 130);
}
$('close').addEventListener('click', closePanel);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.defaultPrevented && !event.repeat) { event.preventDefault(); closePanel(); }
});
let downOutside = false;
document.addEventListener('pointerdown', (event) => { downOutside = event.target === document.body; });
document.addEventListener('click', (event) => {
  if (downOutside && event.target === document.body) closePanel();
  downOutside = false;
});

async function refreshObs() {
  $('obs-monitor').disabled = true;
  $('copy-obs-url').disabled = true;
  try {
    const data = await api.readRoom('obs');
    $('obs-status').textContent = !data.available ? data.reason : data.supported ? `Transmissão OBS para ${data.name}.` : 'O servidor atual não está com a integração OBS habilitada. Você ainda pode configurar o monitor das marcações.';
    $('obs-url').value = data.url || '';
    // Com contas: a chave da conta vai no Bearer Token do OBS.
    $('obs-token-box').hidden = !data.token;
    $('obs-token-free').hidden = Boolean(data.token);
    $('obs-token').value = data.token || '';
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
$('copy-obs-token').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('obs-token').value); status('Chave do OBS copiada.'); }
  catch (error) { status(error.message, true); }
});
$('copy-obs-url').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('obs-url').value); status('Endereço do OBS copiado.'); }
  catch (error) { status(error.message, true); }
});
load().catch((error) => status(error.message, true));
refreshRoom();

// ---------- cor: o mesmo seletor da sala (estilo Discord) ----------
// Quadrado de saturação × brilho, faixa do tom, HEX e RGB, conta-gotas, cores prontas, da
// sua foto e recentes. A cor vai pra sala pelo adaptador: "ao vivo" enquanto você arrasta
// (a sala espera 300 ms parada pra mandar) e confirmada ao soltar (entra nas recentes).
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const { clampByte, hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, normalizeHex, inkFor } = window.WssColor;
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

const picker = { h: 0, s: 1, v: 1 }; // o tom fica guardado mesmo no cinza/preto
const pickerHex = () => rgbToHex(...hsvToRgb(picker.h, picker.s, picker.v));
function pickerFrom(hex) {
  const hsv = rgbToHsv(...hexToRgb(hex));
  if (hsv.s > 0.001 && hsv.v > 0.001) picker.h = hsv.h;
  picker.s = hsv.s;
  picker.v = hsv.v;
}

function renderPicker(force = false) {
  if ($('color-picker').hidden) return;
  const hex = pickerHex();
  $('cp-area').style.setProperty('--hue', `hsl(${picker.h} 100% 50%)`);
  $('cp-area').style.setProperty('--c', hex);
  $('cp-hue').style.setProperty('--c', `hsl(${picker.h} 100% 50%)`);
  $('cp-area').firstElementChild.style.left = `${picker.s * 100}%`;
  $('cp-area').firstElementChild.style.top = `${(1 - picker.v) * 100}%`;
  $('cp-hue').firstElementChild.style.left = `${(picker.h / 360) * 100}%`;
  $('cp-area').setAttribute('aria-valuetext', `saturação ${Math.round(picker.s * 100)}%, brilho ${Math.round(picker.v * 100)}%`);
  $('cp-hue').setAttribute('aria-valuenow', String(Math.round(picker.h)));
  $('cp-preview').style.background = hex;
  const typing = force ? null : document.activeElement; // não mexe no campo que você está digitando
  if (typing !== $('cp-hex')) $('cp-hex').value = hex.toUpperCase();
  hexToRgb(hex).forEach((v, i) => { const field = $(['cp-r', 'cp-g', 'cp-b'][i]); if (typing !== field) field.value = String(v); });
}

function renderChips(row, colors) {
  row.hidden = !colors.length;
  row.querySelector('.cp-chips').replaceChildren(...colors.map((color) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cp-chip room-control';
    chip.style.setProperty('--sw', color);
    chip.title = color.toUpperCase();
    chip.setAttribute('aria-label', `Usar a cor ${color.toUpperCase()}`);
    chip.classList.toggle('active', color === roomState.color);
    chip.addEventListener('click', () => { pickerFrom(color); sendColor(color, true); });
    return chip;
  }));
}

function renderColor() {
  if (!roomState.available) return;
  const color = HEX_COLOR.test(roomState.color || '') ? roomState.color : null;
  const presets = roomState.presets || [];
  const isAuto = !color && (roomState.legacyHue === null || roomState.legacyHue === undefined);
  const isPreset = Boolean(color) && presets.includes(color);
  const auto = $('color-auto');
  auto.style.setProperty('--sw', roomState.autoFill || '#5363ae');
  auto.classList.toggle('active', isAuto);
  auto.setAttribute('aria-pressed', String(isAuto));
  const custom = $('color-custom');
  const customOn = !isAuto && !isPreset;
  const mark = roomState.markColor || color;
  custom.classList.toggle('active', customOn);
  custom.classList.toggle('has-color', customOn && Boolean(mark));
  custom.setAttribute('aria-pressed', String(customOn));
  custom.style.setProperty('--sw', customOn && mark ? mark : 'transparent');
  custom.style.setProperty('--ink', customOn && mark ? inkFor(mark) : '#9ca6bf');
  const known = [...$('color-presets').children].map((b) => b.dataset.color).join();
  if (known !== presets.join()) {
    $('color-presets').replaceChildren(...presets.map((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'room-control';
      button.dataset.color = preset;
      button.title = preset.toUpperCase();
      button.setAttribute('aria-label', `Cor ${preset.toUpperCase()}`);
      button.style.setProperty('--sw', preset);
      button.style.setProperty('--ink', inkFor(preset));
      button.innerHTML = CHECK;
      button.addEventListener('click', () => { pickerFrom(preset); sendColor(preset, true); });
      return button;
    }));
  }
  for (const button of $('color-presets').children) button.setAttribute('aria-pressed', String(button.dataset.color === color));
  renderChips($('cp-photo'), roomState.photo ? roomState.photoColors || [] : []);
  renderChips($('cp-recent'), roomState.recent || []);
  $('profile-color-label').textContent = color ? `Cor atual: ${color.toUpperCase()}`
    : isAuto ? 'Cor automática do seu nick.' : 'Cor escolhida antes (só o tom). Escolha outra pra trocar.';
  renderPicker();
}

function setPickerOpen(open) {
  $('color-picker').hidden = !open;
  $('color-custom').setAttribute('aria-expanded', String(open));
  if (open) pickerFrom(roomState.markColor || roomState.color || '#4d8dff');
  renderPicker(true);
}

// Manda a cor pra sala. commit: confirmar (na hora; entra nas recentes). Sem, "ao vivo":
// só a última de cada ~120 ms vai, uma de cada vez.
let liveTimer = null;
let livePending = null;
let liveBusy = false;
async function flushLive() {
  liveTimer = null;
  if (liveBusy) { liveTimer = setTimeout(flushLive, 60); return; }
  const color = livePending;
  livePending = null;
  if (!color) return;
  liveBusy = true;
  try { await api.roomAction({ type: 'color', color, commit: false }); } catch {}
  liveBusy = false;
}
async function sendColor(color, commit) {
  if (color) { roomState.color = color; roomState.markColor = color; roomState.legacyHue = null; }
  renderColor();
  if (!commit) {
    livePending = color;
    if (!liveTimer) liveTimer = setTimeout(flushLive, 120);
    return;
  }
  clearTimeout(liveTimer);
  liveTimer = null;
  livePending = null;
  while (liveBusy) await new Promise((resolve) => setTimeout(resolve, 30));
  await roomAction({ type: 'color', color, commit: true });
}

$('color-auto').addEventListener('click', () => roomAction({ type: 'color', color: null }));
$('color-custom').addEventListener('click', () => setPickerOpen($('color-picker').hidden));

function dragSlider(node, apply) {
  const move = (e) => {
    const r = node.getBoundingClientRect();
    apply(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    sendColor(pickerHex(), false);
  };
  node.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !roomState.available) return;
    e.preventDefault();
    node.focus();
    node.setPointerCapture(e.pointerId);
    move(e);
  });
  node.addEventListener('pointermove', (e) => { if (node.hasPointerCapture(e.pointerId)) move(e); });
  const done = (e) => {
    if (!node.hasPointerCapture(e.pointerId)) return;
    node.releasePointerCapture(e.pointerId);
    sendColor(pickerHex(), true);
  };
  node.addEventListener('pointerup', done);
  node.addEventListener('pointercancel', done);
}
dragSlider($('cp-area'), (x, y) => { picker.s = x; picker.v = 1 - y; });
dragSlider($('cp-hue'), (x) => { picker.h = Math.min(359.9, x * 360); });

let keyCommit = null;
function arrowKeys(node, apply) {
  node.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!delta || !roomState.available) return;
    e.preventDefault();
    apply(...delta);
    sendColor(pickerHex(), false);
    clearTimeout(keyCommit);
    keyCommit = setTimeout(() => sendColor(pickerHex(), true), 800); // entra nas recentes só onde parou
  });
}
arrowKeys($('cp-area'), (dx, dy) => {
  picker.s = Math.min(1, Math.max(0, picker.s + dx / 100));
  picker.v = Math.min(1, Math.max(0, picker.v + dy / 100));
});
arrowKeys($('cp-hue'), (dx, dy) => { picker.h = (picker.h + dx + dy + 360) % 360; });

// Digitando: vale assim que o código fica completo; Enter (ou sair do grupo) confirma.
const typedColor = () => normalizeHex($('cp-hex').value);
function rgbColor() {
  const values = ['cp-r', 'cp-g', 'cp-b'].map((id) => $(id).value.trim());
  if (!values.every((v) => /^\d{1,3}$/.test(v) && Number(v) <= 255)) return null;
  return rgbToHex(...values.map(Number));
}
for (const [ids, read] of [[['cp-hex'], typedColor], [['cp-r', 'cp-g', 'cp-b'], rgbColor]]) {
  let dirty = false;
  const commit = () => {
    const color = read();
    if (dirty && color) { pickerFrom(color); sendColor(color, true); }
    dirty = false;
    renderPicker(true);
  };
  for (const id of ids) {
    const field = $(id);
    field.addEventListener('input', () => {
      dirty = true;
      const color = read();
      if (!color || color === roomState.color) return;
      pickerFrom(color);
      sendColor(color, false);
    });
    field.addEventListener('focusout', (e) => { if (!ids.some((other) => $(other) === e.relatedTarget)) commit(); });
    field.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      commit();
      field.select();
    });
  }
}

// Conta-gotas: a cor de qualquer pixel da tela.
$('cp-eyedropper').hidden = typeof window.EyeDropper !== 'function';
$('cp-eyedropper').addEventListener('click', async () => {
  try {
    const { sRGBHex } = await new window.EyeDropper().open();
    const color = normalizeHex(sRGBHex);
    if (!color) return;
    pickerFrom(color);
    sendColor(color, true);
  } catch {} // Esc: desistiu
});

window.WssGamepadClient.start({ panel: $('gamepad-config'), canSend: () => false, send: () => {} });
// ---------- mouse e efeitos: o mesmo editor da sala (../shared/fx.js) ----------
// Setinha, tamanho, efeito, rastro, clique, ping, som do ping, pincel e
// espessura, com a prévia ao vivo. Cada escolha vai pra sala na hora.
let fxEditor = null;
function fxLook() {
  const name = roomState.name || '';
  const color = roomState.markColor || '#4d8dff';
  return { color, ink: inkFor(color), letter: [...name][0] || '?', photo: roomState.photo || null, name };
}
function renderFx() {
  const supported = roomState.available && roomState.style !== undefined;
  $('fx-editor').hidden = !supported;
  $('fx-status').textContent = roomState.available && !supported ? 'Atualize o servidor da sala pra escolher o estilo do mouse e das marcações.' : '';
  if (!supported) return;
  if (!fxEditor) {
    fxEditor = window.WssFx.editor($('fx-editor'), {
      get: () => roomState.style,
      look: fxLook,
      change: async (style) => {
        roomState.style = style;
        try {
          await api.roomAction({ type: 'style', style });
          status('Estilo do mouse aplicado na sala.');
        } catch (error) { status(error.message, true); }
      },
      // Imagens próprias (setinha e ping): a sala lê o arquivo e manda pro servidor.
      images: roomState.styleImages ? {
        upload: async (kind, file) => {
          if (file.size > 8 * 1024 * 1024) return { error: 'Esse arquivo é grande demais (até 8 MB).' };
          try {
            const data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
              reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
              reader.readAsDataURL(file);
            });
            const res = await api.roomAction({ type: 'fx-image', kind, data, name: file.name, mime: file.type });
            if (res && res.url) roomState.style = { ...roomState.style, [kind === 'cursor' ? 'img' : 'pingImg']: res.url };
            return res;
          } catch (error) { return { error: error.message }; }
        },
        remove: async (kind) => {
          try {
            await api.roomAction({ type: 'fx-image-remove', kind });
            const next = { ...roomState.style };
            delete next[kind === 'cursor' ? 'img' : 'pingImg'];
            roomState.style = next;
          } catch (error) { status(error.message, true); }
        },
      } : null,
    });
  } else fxEditor.refresh();
}
