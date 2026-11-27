const api = window.desktopSettings;
const $ = (id) => document.getElementById(id);
let snapshot = { rows: [], omitted: 0, enabled: true, limit: 2000 };
let paused = false;
let initialized = false;
let pendingRestart = false;
let dirty = false;
let savedForm, runtime, saving=false;
const preferenceFields=['server','fullscreen','hardware','overlay','visual-mode','native-video','logging','log-limit'];
function formValues(){
  return Object.fromEntries(preferenceFields.map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));
}
function needsRestart(values){
  let origin;
  try {origin=new URL(values.server.includes('://')?values.server:'https://'+values.server).origin;} catch {origin=values.server;}
  return origin!==runtime.activeServer || values.fullscreen!==runtime.active.fullscreen || values.hardware!==runtime.active.hardwareAcceleration;
}
function updateSaveActions(){
  if(!savedForm)return;
  const values=formValues(), changed=preferenceFields.filter(id=>values[id]!==savedForm[id]);
  dirty=changed.length>0;
  for(const [id,show] of [['app-save',dirty],['server-save',changed.includes('server')],['log-save',changed.some(k=>k==='logging'||k==='log-limit')],['native-video-save',changed.includes('native-video')]]){
    const button=$(id);
    button.hidden=!show;button.disabled=saving;
    button.textContent=needsRestart(values)?'Salvar e reiniciar':'Salvar';
    button.title=needsRestart(values)?'Salvar as configurações e reiniciar o aplicativo. A transmissão atual será encerrada.':'Aplicar as configurações agora.';
  }
  updateRestartButton();
}
// No navegador (settings-web.js), as abas só do app vêm escondidas e saem da navegação.
const tabs = ['profile', 'settings', 'connection', 'experimental', 'log', 'shortcuts'].filter((name) => !document.getElementById(`tab-${name}`).hidden);
let activeTab = 'profile';
let diagnosticTimer;
let diagnosticsRunning = false;
let diagnosticRead = null;
let diagnosticGeneration = 0;
let roomState = { available: false };
const categories = { people: 'Pessoas', stream: 'Transmissões', connection: 'Conexões', error: 'Erros', system: 'Aplicativo' };
const directions = { in: 'Recebido', out: 'Enviado', local: 'Local' };
const levels = { info: 'Info', warn: 'Aviso', error: 'Erro' };
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function updateRestartButton() { $('restart').hidden = dirty || !(pendingRestart || roomState.experiments?.pendingReload); }

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

// Copiar: no app quem copia é o próprio app (a página não tem a permissão do navegador).
const copyText = (text) => (typeof api.copyText === 'function' ? api.copyText(text) : navigator.clipboard.writeText(text));

// Fileira de abas maior que a janela: esmaece a borda do lado que ainda tem aba.
const tabNav = document.querySelector('nav');
function markTabOverflow() {
  const left = tabNav.scrollLeft > 1;
  const right = tabNav.scrollLeft + tabNav.clientWidth < tabNav.scrollWidth - 1;
  tabNav.dataset.more = left && right ? 'both' : left ? 'left' : right ? 'right' : '';
}
tabNav.addEventListener('scroll', markTabOverflow, { passive: true });
window.addEventListener('resize', markTabOverflow);
// Rodinha em cima das abas: rola a fileira de lado.
tabNav.addEventListener('wheel', (event) => {
  if (tabNav.scrollWidth <= tabNav.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  event.preventDefault();
  tabNav.scrollLeft += event.deltaY;
}, { passive: false });
requestAnimationFrame(markTabOverflow);

function selectTab(name, focus = false) {
  name = ({fx:'profile', pointer:'settings', obs:'connection'})[name] || name;
  if (!tabs.includes(name)) name = 'profile';
  activeTab = name;
  diagnosticGeneration++;
  clearTimeout(diagnosticTimer);
  for (const id of tabs) {
    const active = id === name;
    $(`tab-${id}`).setAttribute('aria-selected', active);
    $(`tab-${id}`).tabIndex = active ? 0 : -1;
    $(`panel-${id}`).hidden = !active;
  }
  // Janela estreita: a fileira de abas rola até a escolhida.
  $(`tab-${name}`).scrollIntoView({ block: 'nearest', inline: 'nearest' });
  markTabOverflow();
  if (name === 'log') renderLog();
  if (['profile', 'settings', 'shortcuts', 'experimental'].includes(name)) refreshRoom();
  if (name === 'shortcuts') api.readShortcuts().then(renderShortcuts).catch(error => status(error.message, true));
  if (name === 'connection') refreshObs();
  if (name === 'log') {
    pollDiagnostics();
    if (!reportBusy) reportAction({type:'report-preview'});
  }
  if (name === 'settings' && !api.web) refreshOverlay();
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
  if (value.web) {
    // No navegador não há preferências do app: só a versão do servidor no topo.
    $('version').textContent = value.version ? `Servidor ${value.version}` : '';
    $('version').hidden = !value.version;
    initialized = true;
    return;
  }
  renderShortcuts(value.shortcuts);
  $('gamepad-client-path').textContent = `Componente para receber gamepads: ${value.gamepadClientPath || 'indisponível'}. Reinicie o aplicativo após configurar o driver e a DLL.`;
  runtime=value;
  if (!initialized || !dirty) {
    $('server').value = value.server || '';
    $('fullscreen').value = value.preferences.fullscreen;
    $('hardware').checked = value.preferences.hardwareAcceleration;
    $('overlay').checked = value.preferences.overlay;
    $('visual-mode').value = value.preferences.visualMode || 'normal';
    $('native-video').checked = value.preferences.nativeVideo === true;
    $('native-video').disabled = !value.nativeVideo?.available;
    $('logging').checked = value.preferences.logging;
    $('log-limit').value = value.preferences.logLimit;
    savedForm=formValues();
  }
  // Os modos "sem bordas" e "vídeo ampliado na janela" só existem no Windows.
  const windows = /^win32/.test(value.environment.platform);
  $('gamepad-install').hidden = value.environment.platform !== 'win32 x64';
  for (const option of $('fullscreen').options) option.hidden = option.disabled = !windows && option.value !== 'native';
  pendingRestart = value.restartRequired;
  updateSaveActions();
  $('version').textContent = `App ${value.environment.app}`;
  // Só a versão instalada se atualiza sozinha (a portátil e o código-fonte só avisam).
  if (value.update) {
    $('auto-update').checked = value.update.mode === 'install' && value.update.auto;
    $('auto-update').disabled = value.update.mode !== 'install';
    $('auto-update').closest('.switch').title = value.update.mode === 'install' ? '' : 'Só na versão instalada';
  }
  $('environment').textContent = `Electron ${value.environment.electron} · Chromium ${value.environment.chrome}\n${value.environment.platform}\nModo ativo: ${value.active.fullscreen} · aceleração ${value.active.hardwareAcceleration ? 'habilitada' : 'desabilitada'}\nServidor ativo: ${value.activeServer || 'não configurado'}\n${value.environment.displays.join('\n')}`;
  snapshot = value.log;
  $('log-count').textContent = snapshot.total;
  if (activeTab === 'log') renderLog(true);
  initialized = true;
}
let shortcutRevision = -1;
function renderShortcuts(value) {
  if (!value || !Number.isFinite(value.revision) || value.revision < shortcutRevision) return;
  shortcutRevision = value.revision;
  const fragment = document.createDocumentFragment();
  let conflicts = 0;
  for (const entry of value.entries || []) {
    const key = document.createElement('dt'); key.textContent = entry.keys;
    const description = document.createElement('dd'); description.dataset.shortcutId = entry.id; description.dataset.status = entry.status;
    const state = entry.status === 'registered' ? 'Ativo'
      : entry.status === 'release-failed' ? 'Não foi possível liberar; tente novamente'
        : entry.status === 'unavailable' ? 'Indisponível; verifique conflitos com outros programas'
          : entry.context === 'draw' ? 'Ativado somente durante o desenho'
            : entry.context === 'control' ? 'Ativado somente durante o controle remoto'
              : value.overlaySupported ? 'Ativado durante transmissão com marcações' : 'Marcações indisponíveis nesta plataforma';
    description.textContent = `${entry.label} — ${state}${entry.id === 'revoke' && entry.status === 'unavailable' && value.emergencyPolling ? '. Verificação local de emergência disponível no Windows' : ''}.`;
    if (['unavailable', 'release-failed'].includes(entry.status)) { conflicts++; description.classList.add('error'); }
    fragment.append(key, description);
  }
  $('global-shortcuts').replaceChildren(fragment);
  $('shortcut-status').textContent = conflicts ? `${conflicts} atalho(s) precisam de atenção. Você pode usar os botões sem o atalho global.` : 'Nenhum conflito nos atalhos do contexto ativo.';
  $('shortcut-draw').disabled = !value.drawAvailable;
  $('shortcut-draw').textContent = value.drawing ? 'Encerrar desenho' : 'Ativar desenho';
  $('shortcut-revoke').disabled = !value.controlling;
}
api.onShortcuts(renderShortcuts);
for (const [id, action] of [['shortcut-retry', 'retry'], ['shortcut-draw', 'draw-toggle'], ['shortcut-revoke', 'revoke']]) {
  $(id).addEventListener('click', async () => {
    $(id).disabled = true;
    try { renderShortcuts(await api.shortcutAction(action)); }
    catch (error) { status(error.message, true); }
    finally {
      if (id === 'shortcut-retry') $(id).disabled = false;
      else try { renderShortcuts(await api.readShortcuts()); } catch {}
    }
  });
}
for(const id of preferenceFields) $(id).addEventListener('input',updateSaveActions);
$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if(!dirty || saving)return;
  saving=true;updateSaveActions();
  try {
    const result = await api.save({ server: $('server').value, preferences: {
      fullscreen: $('fullscreen').value, hardwareAcceleration: $('hardware').checked,
      overlay: $('overlay').checked, logging: $('logging').checked, logLimit: Number($('log-limit').value),
      visualMode: $('visual-mode').value,
      nativeVideo: $('native-video').checked,
    } });
    if (!result.ok) throw new Error(result.error);
    dirty = false;
    await load();
    if(pendingRestart) await api.restart();
    else status('Configurações salvas e aplicadas.');
  } catch (error) { status(error.message, true); } finally {saving=false;updateSaveActions();}
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
  const button = $('check-update'); button.disabled = true; $('update-status').textContent = 'Verificando…';
  try { const value = await api.checkUpdate(); $('update-status').textContent = value.message; }
  catch (error) { $('update-status').textContent = error.message; }
  finally { button.disabled = false; }
});
// Atualizações automáticas: salva na hora (não entra no "Salvar" do formulário).
$('auto-update').addEventListener('change', async () => {
  const input = $('auto-update'); input.disabled = true;
  try { const value = await api.setAutoUpdate(input.checked); input.checked = value.auto; if (value.error) $('update-status').textContent = value.error; }
  catch (error) { $('update-status').textContent = error.message; input.checked = !input.checked; }
  finally { input.disabled = runtime?.update?.mode !== 'install'; }
});
let roomReadGeneration = 0;
async function refreshRoom() {
  const request = ++roomReadGeneration;
  let value;
  try { value = await api.readRoom(); }
  catch (error) { value = { available: false, reason: error.message }; }
  if (request !== roomReadGeneration) return;
  roomState = value;
  for (const node of document.querySelectorAll('.room-unavailable')) {
    node.hidden = roomState.available;
    node.textContent = roomState.reason || 'Entre na sala para acessar estas configurações.';
  }
  for (const node of document.querySelectorAll('.room-control')) node.disabled = !roomState.available;
  renderExperiments();
  renderFx();
  if (!roomState.available) return;
  $('profile-name').textContent = roomState.name;
  // Conta (servidor com contas): nick e senha; com administração, o botão do /admin.
  $('account-card').hidden = !roomState.account;
  if (roomState.account) {
    if (document.activeElement !== $('account-nick')) $('account-nick').value = roomState.account.nick;
    $('account-admin').hidden = !roomState.account.admin;
  }
  const look = window.WssProfileLook.normalize(roomState.look);
  $('nick-style').value = $('profile-name').dataset.nickStyle = look.nick;
  $('photo-frame').value = look.frame;
  $('nick-style').disabled = $('photo-frame').disabled = !roomState.look;
  for (const node of [$('profile-initial'), $('profile-photo')]) {
    node.dataset.photoFrame = look.frame;
    node.style.setProperty('--frame-color', roomState.markColor || '#5363ae');
  }
  pickerFrom(roomState.markColor || '#4d8dff');
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
// A administração é a página /admin (no app, abre no navegador).
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
function renderExperiments() {
  const experiments = roomState.available ? roomState.experiments || null : null;
  updateRestartButton();
  let unsupported = false;
  for (const key of ['binaryFast', 'smallFastQueue', 'expireFastPackets', 'responsiveVideo', 'shortVideoBuffer', 'recoverDelayedVideo', 'relaySelection', 'gpuBudget']) {
    const input = $(`experiment-${key}`);
    input.disabled = !experiments || !Object.hasOwn(experiments.saved || {}, key);
    unsupported ||= input.disabled;
    input.checked = experiments?.saved?.[key] === true;
  }
  $('experimental-status').textContent = !experiments
    ? 'Entre na sala ou atualize o servidor para configurar estes experimentos.'
    : experiments.pendingReload ? 'Alterações salvas. Reinicie o app para aplicar.'
      : unsupported ? 'Atualize o servidor para disponibilizar todas as opções experimentais.' : 'As opções salvas estão em uso nesta sessão.';
}
for (const key of ['binaryFast', 'smallFastQueue', 'expireFastPackets', 'responsiveVideo', 'shortVideoBuffer', 'recoverDelayedVideo', 'relaySelection', 'gpuBudget']) {
  $(`experiment-${key}`).addEventListener('change', async () => {
    const input = $(`experiment-${key}`);
    input.disabled = true;
    try {
      await api.roomAction({ type: 'experiment', key, enabled: input.checked });
      await refreshRoom();
      status('Experimento salvo. Reinicie o app para aplicar.');
    } catch (error) { await refreshRoom(); status(error.message, true); }
  });
}
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

for (const id of ['nick-style','photo-frame']) {
  $(id).addEventListener('change', async()=>{
    const look={nick:$('nick-style').value,frame:$('photo-frame').value};
    $('profile-name').dataset.nickStyle=look.nick;
    for(const node of [$('profile-initial'),$('profile-photo')]) node.dataset.photoFrame=look.frame;
    await roomAction({type:'profile-look',look});
  });
}
let reportDraft = null;
let reportBusy = false;
function showReportDraft(result) {
  if (!result?.id || !result.data) throw Error('Atualize o app e o servidor para enviar relatos.');
  reportDraft = result.id;
  $('report-consent').checked = result.enabled;
  $('report-preview').textContent = JSON.stringify(result.data, null, 2);
}
async function reportAction(command) {
  reportBusy = true;
  $('report-send').disabled = $('report-consent').disabled = true;
  const status = $('report-status');
  status.textContent = '';
  try {
    showReportDraft(await api.roomAction(command));
    if (command.type === 'report-send') {
      $('report-description').value = '';
      status.textContent = 'Relato enviado ao administrador.';
    }
  } catch (error) {
    status.textContent = error.message;
    if (command.type !== 'report-send') reportDraft = null;
  } finally {
    reportBusy = false;
    $('report-send').disabled = $('report-consent').disabled = !reportDraft;
  }
}
$('report-consent').addEventListener('change', () => reportAction({ type:'report-consent', enabled:$('report-consent').checked }));
$('report-send').addEventListener('click', () => {
  const description = $('report-description').value.trim();
  if (description) return reportAction({ type:'report-send', id:reportDraft, description });
  $('report-status').textContent = 'Descreva o problema antes de enviar.';
  $('report-description').focus();
});

async function pollDiagnostics() {
  clearTimeout(diagnosticTimer);
  diagnosticTimer = null;
  if (activeTab !== 'log' || document.hidden) return;
  // Compartilha a consulta em voo, mas só a chamada mais recente pode pintar
  // ou agendar outra consulta após troca de aba/visibilidade.
  const request = ++diagnosticGeneration;
  if (!diagnosticRead) diagnosticRead = api.readRoom('diagnostics').finally(() => { diagnosticRead = null; });
  let available = false;
  try {
    const data = await diagnosticRead;
    if (request !== diagnosticGeneration || activeTab !== 'log' || document.hidden) return;
    available = data.available;
    $('run-diagnostics').disabled = !data.available || diagnosticsRunning;
    $('diagnostic-output').textContent = data.diagnostics || data.reason || 'Nenhum teste executado nesta sessão.';
    if (data.diagnostics?.trim().endsWith('Fim do teste.')) diagnosticsRunning = false;
  } catch (error) {
    if (request !== diagnosticGeneration || activeTab !== 'log' || document.hidden) return;
    $('diagnostic-output').textContent = error.message; diagnosticsRunning = false;
  }
  $('run-diagnostics').disabled = !available || diagnosticsRunning;
  if (diagnosticsRunning) diagnosticTimer = setTimeout(pollDiagnostics, 500);
}
$('run-diagnostics').addEventListener('click', async () => {
  $('run-diagnostics').disabled = true;
  try { await api.roomAction({ type: 'diagnostics' }); diagnosticsRunning = true; await pollDiagnostics(); }
  catch (error) { status(error.message, true); $('run-diagnostics').disabled = false; }
});
$('copy-diagnostics').addEventListener('click', async () => {
  try { await copyText($('diagnostic-output').textContent); status('Resultado copiado.'); }
  catch (error) { status(error.message, true); }
});
for (const id of ['copy-session-metrics', 'copy-trial-metrics']) {
  const button = $(id);
  const trial = id === 'copy-trial-metrics';
  button.addEventListener('click', async () => {
    button.disabled = true;
    const condition = trial ? $('trial-condition').value : null;
    try {
      const value = await api.roomAction({ type: 'performance-report' });
      if (!value?.report) throw Error('Atualize o servidor para copiar as métricas da sessão.');
      if (trial && !value.report.streams?.some(stream => stream.watching && stream.state === 'connected' && stream.metrics?.frames > 0 && Number.isFinite(stream.metrics.ageMs) && stream.metrics.ageMs <= 10000)) {
        throw Error('Assista à transmissão e aguarde a primeira amostra de vídeo.');
      }
      const payload = trial ? { condition, report: value.report } : value.report;
      await copyText(JSON.stringify(payload, null, 2));
      if (trial) $('trial-result').textContent = 'Amostra copiada para ' + condition + '.';
      else status('Métricas da sessão copiadas.');
    } catch (error) {
      if (trial) $('trial-result').textContent = error.message;
      else status(error.message, true);
    } finally { button.disabled = !roomState.available; }
  });
}
document.addEventListener('visibilitychange', () => { diagnosticGeneration++; if (activeTab === 'log') pollDiagnostics(); updateLogSubscription(); });
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

async function refreshOverlay() {
  try {
    const data = await api.readRoom('obs-overlay');
    const options = (data.displays || []).map((display) => {
      const option = document.createElement('option'); option.value = String(display.id); option.textContent = display.label; return option;
    });
    const off = document.createElement('option'); off.value = 'off'; off.textContent = 'Desligado';
    $('obs-monitor').replaceChildren(...options, off);
    $('obs-monitor').value = data.obsDisplay || 'off';
    $('obs-monitor').disabled = !data.overlaySupported;
  } catch (error) { $('obs-monitor').disabled = true; status(error.message,true); }
}

async function refreshObs() {
  $('obs-url').value = ''; $('obs-token').value = ''; $('obs-token-field').hidden = true;
  $('copy-obs-url').disabled = true;
  try {
    const data = await api.readRoom('obs');
    $('obs-status').textContent = !data.available ? data.reason : data.supported ? (data.local ? 'Fonte local do WSS. Cole no OBS o endereço deste PC e o token abaixo. Use AV1 ou H.264 para vídeo e Opus para áudio.' : `Transmissão OBS para ${data.name}.`) : 'O servidor atual não está com a integração OBS habilitada. Você ainda pode configurar o monitor das marcações.';
    $('obs-url').value = data.url || '';
    $('obs-token').value = data.token || '';
    $('obs-token-field').hidden = !data.token;
    $('obs-token-hint').textContent = !data.available || !data.supported
      ? 'Consulte a configuração do servidor antes de publicar pelo OBS.'
        : data.individual ? 'Cole o token privado abaixo no Bearer Token do OBS. Ele vincula a transmissão ao seu participante; não o compartilhe.'
        : data.authRequired ? 'Preencha o Bearer Token do OBS com o token de publicação fornecido pelo administrador.'
        : 'Este servidor não exige Bearer Token de publicação. O campo pode ficar em branco.';
    $('copy-obs-url').disabled = !data.available || !data.supported;
    $('obs-certificate').hidden = !data.certificateWarning;
    // As marcações na tela só existem no app (no navegador a opção nem aparece).
    if (data.available && !data.overlaySupported && !api.web) $('obs-status').textContent += ' As marcações não estão disponíveis neste sistema.';
    if (data.available && data.supported && !data.local) checkObsPort();
  } catch (error) { $('obs-status').textContent = error.message; }
}
// A porta UDP por onde o OBS manda o vídeo (o teste roda na sala, que tem o TURN).
let obsCheckRun = 0;
async function checkObsPort() {
  const run = ++obsCheckRun;
  const box = $('obs-check');
  box.hidden = false; box.className = 'obs-check'; box.textContent = 'Testando a porta UDP do servidor…';
  try {
    const result = await api.roomAction({ type: 'obs-check' });
    if (run !== obsCheckRun) return;
    if (!result || !result.check) { box.hidden = true; return; }
    box.className = `obs-check ${result.check.ok ? 'is-ok' : 'is-bad'}`;
    box.textContent = result.check.text;
  } catch { if (run === obsCheckRun) box.hidden = true; } // sala antiga, sem o teste
}
$('obs-monitor').addEventListener('change', async () => {
  const value = $('obs-monitor').value;
  $('obs-monitor').disabled = true;
  try { await api.roomAction({ type: 'obs-display', value }); status('Monitor das marcações salvo e aplicado.'); }
  catch (error) { status(error.message, true); }
  await refreshOverlay();
});
$('copy-obs-url').addEventListener('click', async () => {
  try { await copyText($('obs-url').value); status('Endereço do OBS copiado.'); }
  catch (error) { status(error.message, true); }
});
$('copy-obs-token').addEventListener('click', async () => {
  try { await copyText($('obs-token').value); status('Token OBS copiado.'); }
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
$('color-custom').addEventListener('click', () => $('cp-hex').focus());

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
