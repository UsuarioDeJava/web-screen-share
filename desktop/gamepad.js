const path = require('node:path');
const { validState, neutral } = require('./shared/gamepad');

const SUCCESS = 0x20000000;
const BUTTONS = [0x1000, 0x2000, 0x4000, 0x8000, 0x100, 0x200, 0, 0, 0x20, 0x10, 0x40, 0x80, 1, 2, 4, 8, 0x400];
const REPORT_FIELDS = ['wButtons', 'bLeftTrigger', 'bRightTrigger', 'sThumbLX', 'sThumbLY', 'sThumbRX', 'sThumbRY'];
function report(state) {
  let wButtons = 0;
  state.buttons.forEach((value, i) => { if (value >= 0.5) wButtons |= BUTTONS[i]; });
  const axis = (value) => Math.round(value * (value < 0 ? 32768 : 32767));
  return { wButtons, bLeftTrigger: Math.round(state.buttons[6] * 255), bRightTrigger: Math.round(state.buttons[7] * 255),
    sThumbLX: axis(state.axes[0]), sThumbLY: axis(-state.axes[1]), sThumbRX: axis(state.axes[2]), sThumbRY: axis(-state.axes[3]) };
}

// Somente um caminho absoluto controlado pelo aplicativo; nunca carrega DLL da página/sala.
let loadedVigem = null;
function loadVigem(file) {
  if (loadedVigem) {
    if (loadedVigem.file !== file) throw new Error('O processo já carregou outro cliente ViGEm.');
    return loadedVigem.api;
  }
  const koffi = require('koffi');
  const lib = koffi.load(file);
  const Report = koffi.struct('WssXusbReport', { wButtons: 'uint16', bLeftTrigger: 'uint8', bRightTrigger: 'uint8', sThumbLX: 'int16', sThumbLY: 'int16', sThumbRX: 'int16', sThumbRY: 'int16' });
  const api = {
    alloc: lib.func('void *vigem_alloc()'), free: lib.func('void vigem_free(void *client)'),
    connect: lib.func('uint32 vigem_connect(void *client)'), disconnect: lib.func('void vigem_disconnect(void *client)'),
    target: lib.func('void *vigem_target_x360_alloc()'), targetFree: lib.func('void vigem_target_free(void *target)'),
    add: lib.func('uint32 vigem_target_add(void *client, void *target)'), remove: lib.func('uint32 vigem_target_remove(void *client, void *target)'),
    update: lib.func('vigem_target_x360_update', 'uint32', ['void *', 'void *', Report]),
  };
  try {
    const Notify = koffi.proto('__stdcall', 'WssX360Feedback', 'void', ['void *', 'void *', 'uint8', 'uint8', 'uint8', 'void *']);
    const register = lib.func('vigem_target_x360_register_notification', 'uint32', ['void *', 'void *', koffi.pointer(Notify), 'void *']);
    const unregister = lib.func('void vigem_target_x360_unregister_notification(void *target)');
    const callbacks = new Map(); let nextToken = 0n, callback = null;
    api.subscribeFeedback = (client, target, handler) => {
      // Um callback por processo, mantido até a saída. Nunca invalida um ponteiro
      // que uma thread nativa já possa ter colocado na fila da Koffi.
      callback ||= koffi.register((_client, _target, large, small, _led, token) => {
        try { callbacks.get(token)?.(large, small); } catch {}
      }, koffi.pointer(Notify));
      const token = ++nextToken;
      if (token >= (process.arch === 'ia32' ? 0xffffffffn : 0xffffffffffffffffn)) return null;
      callbacks.set(token, handler);
      try {
        if (register(client, target, callback, token) !== SUCCESS) { callbacks.delete(token); return null; }
      } catch (error) { callbacks.delete(token); throw error; }
      return () => { callbacks.delete(token); unregister(target); };
    };
  } catch { /* DLL antiga ainda pode receber comandos sem retorno de vibração. */ }
  loadedVigem = { file, api }; return api;
}

function createGamepads({ directory, platform = process.platform, load = loadVigem, now = Date.now, schedule = true, onFeedback = null } = {}) {
  let api, client, error = '', attempted = false;
  let feedbackTimer = null;
  const targets = new Map();
  function emitFeedback(value) { try { onFeedback?.(value); } catch {} }
  function manageFeedbackTimer() {
    const active = [...targets.values()].some(entry => entry.large || entry.small);
    if (!active && feedbackTimer) { clearInterval(feedbackTimer); feedbackTimer = null; }
    if (active && schedule && !feedbackTimer) { feedbackTimer = setInterval(flushFeedback, 50); feedbackTimer.unref(); }
  }
  function stopFeedback(id, entry) {
    entry.large = entry.small = 0;
    if (entry.feedbackSent) { entry.feedbackSent = false; emitFeedback({ id, strong: 0, weak: 0, duration: 0 }); }
    manageFeedbackTimer();
  }
  function flushFeedback() {
    const time = now();
    for (const [id, entry] of targets) {
      if (entry.stale || time - entry.at > 750) { stopFeedback(id, entry); continue; }
      if (!(entry.large || entry.small) || time - entry.feedbackAt < 50) continue;
      entry.feedbackAt = time; entry.feedbackSent = true;
      emitFeedback({ id, strong: entry.large / 255, weak: entry.small / 255, duration: 150 });
    }
  }
  function init() {
    if (attempted) return Boolean(client);
    attempted = true;
    if (platform !== 'win32') { error = 'Receber gamepad virtual exige Windows.'; return false; }
    try {
      api = load(path.join(directory, process.arch, 'ViGEmClient.dll'));
      client = api.alloc();
      if (!client) throw new Error('Não foi possível criar o cliente ViGEm.');
      if (api.connect(client) !== SUCCESS) throw new Error('Driver ViGEmBus indisponível ou incompatível.');
      return true;
    } catch (e) {
      if (client) { api.free(client); client = null; }
      error = `Gamepad virtual indisponível: ${e.message}`;
      return false;
    }
  }
  function remove(id, sendNeutral = true) {
    const entry = targets.get(id);
    if (!entry) return;
    stopFeedback(id, entry); entry.stale = true;
    try { entry.unsubscribeFeedback?.(); } catch {}
    try {
      try { if (sendNeutral) api.update(client, entry.target, report(neutral())); }
      finally { api.remove(client, entry.target); }
    }
    finally { api.targetFree(entry.target); targets.delete(id); }
  }
  function update(id, state) {
    if (!validState(state) || typeof id !== 'string' || !init()) return false;
    let entry = targets.get(id);
    if (!entry) {
      if (targets.size >= 4) return false;
      const target = api.target();
      if (!target) { error = 'Falha ao alocar gamepad virtual.'; return false; }
      if (api.add(client, target) !== SUCCESS) { api.targetFree(target); error = 'Falha ao conectar gamepad virtual (verifique os slots XInput).'; return false; }
      entry = { target, at: now(), stale: false, large: 0, small: 0, feedbackAt: -Infinity, feedbackSent: false }; targets.set(id, entry);
      if (onFeedback && api.subscribeFeedback) {
        try {
          const current = entry;
          entry.unsubscribeFeedback = api.subscribeFeedback(client, target, (large, small) => {
            if (targets.get(id) !== current || current.stale || now() - current.at > 750
              || !Number.isInteger(large) || large < 0 || large > 255 || !Number.isInteger(small) || small < 0 || small > 255) return;
            current.large = large; current.small = small;
            if (!large && !small) stopFeedback(id, current); else flushFeedback();
            manageFeedbackTimer();
          });
        } catch { entry.unsubscribeFeedback = null; }
      }
    }
    entry.at = now();
    const nextReport = report(state);
    // Snapshots mantêm o watchdog vivo, mas um estado XInput idêntico não exige FFI.
    if (!entry.stale && entry.report && REPORT_FIELDS.every(key => entry.report[key] === nextReport[key])) return true;
    if (api.update(client, entry.target, nextReport) !== SUCCESS) { remove(id); error = 'Falha ao enviar estado do gamepad.'; return false; }
    entry.report = nextReport; entry.stale = false;
    error = '';
    return true;
  }
  function neutralize(id) {
    const entry = targets.get(id);
    if (!entry) return;
    try {
      if (api.update(client, entry.target, report(neutral())) === SUCCESS) {
        entry.stale = true;
        stopFeedback(id, entry);
        return;
      }
    } catch { /* Remover o dispositivo também libera seu estado no host. */ }
    remove(id, false);
  }
  function expire() {
    for (const [id, entry] of targets) {
      // Mantém o mesmo slot, mas solta tudo se os pacotes pararem.
      if (!entry.stale && now() - entry.at > 1000) neutralize(id);
    }
  }
  const timer = schedule ? setInterval(expire, 250) : null;
  timer?.unref();
  return {
    status() { const available = init(); return { available, reason: error, max: 4, feedback: available && Boolean(api.subscribeFeedback) }; },
    update, remove, expire, flushFeedback,
    neutralize,
    retain(ids) { for (const id of targets.keys()) if (!ids.has(id)) remove(id); },
    close() { clearInterval(timer); for (const id of targets.keys()) remove(id); clearInterval(feedbackTimer); feedbackTimer = null; if (client) { api.disconnect(client); api.free(client); client = null; } },
  };
}
module.exports = { createGamepads, report, loadVigem };
