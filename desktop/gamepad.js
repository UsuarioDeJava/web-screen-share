const path = require('node:path');
const { validState, neutral } = require('./shared/gamepad');

const SUCCESS = 0x20000000;
const BUTTONS = [0x1000, 0x2000, 0x4000, 0x8000, 0x100, 0x200, 0, 0, 0x20, 0x10, 0x40, 0x80, 1, 2, 4, 8, 0x400];
function report(state) {
  let wButtons = 0;
  state.buttons.forEach((value, i) => { if (value >= 0.5) wButtons |= BUTTONS[i]; });
  const axis = (value) => Math.round(value * (value < 0 ? 32768 : 32767));
  return { wButtons, bLeftTrigger: Math.round(state.buttons[6] * 255), bRightTrigger: Math.round(state.buttons[7] * 255),
    sThumbLX: axis(state.axes[0]), sThumbLY: axis(-state.axes[1]), sThumbRX: axis(state.axes[2]), sThumbRY: axis(-state.axes[3]) };
}

// Somente um caminho absoluto controlado pelo aplicativo; nunca carrega DLL da página/sala.
function loadVigem(file) {
  const koffi = require('koffi');
  const lib = koffi.load(file);
  const Report = koffi.struct('WssXusbReport', { wButtons: 'uint16', bLeftTrigger: 'uint8', bRightTrigger: 'uint8', sThumbLX: 'int16', sThumbLY: 'int16', sThumbRX: 'int16', sThumbRY: 'int16' });
  return {
    alloc: lib.func('void *vigem_alloc()'), free: lib.func('void vigem_free(void *client)'),
    connect: lib.func('uint32 vigem_connect(void *client)'), disconnect: lib.func('void vigem_disconnect(void *client)'),
    target: lib.func('void *vigem_target_x360_alloc()'), targetFree: lib.func('void vigem_target_free(void *target)'),
    add: lib.func('uint32 vigem_target_add(void *client, void *target)'), remove: lib.func('uint32 vigem_target_remove(void *client, void *target)'),
    update: lib.func('vigem_target_x360_update', 'uint32', ['void *', 'void *', Report]),
  };
}

function createGamepads({ directory, platform = process.platform, load = loadVigem, now = Date.now, schedule = true } = {}) {
  let api, client, error = '', attempted = false;
  const targets = new Map();
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
  function remove(id) {
    const entry = targets.get(id);
    if (!entry) return;
    try { api.update(client, entry.target, report(neutral())); api.remove(client, entry.target); }
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
      entry = { target, at: now(), stale: false }; targets.set(id, entry);
    }
    entry.at = now(); entry.stale = false;
    if (api.update(client, entry.target, report(state)) !== SUCCESS) { remove(id); error = 'Falha ao enviar estado do gamepad.'; return false; }
    error = '';
    return true;
  }
  function expire() {
    for (const [id, entry] of targets) {
      // Mantém o mesmo slot, mas solta tudo se os pacotes pararem.
      if (!entry.stale && now() - entry.at > 1000) { api.update(client, entry.target, report(neutral())); entry.stale = true; }
    }
  }
  const timer = schedule ? setInterval(expire, 250) : null;
  timer?.unref();
  return {
    status() { const available = init(); return { available, reason: error, max: 4 }; },
    update, remove, expire,
    retain(ids) { for (const id of targets.keys()) if (!ids.has(id)) remove(id); },
    close() { clearInterval(timer); for (const id of targets.keys()) remove(id); if (client) { api.disconnect(client); api.free(client); client = null; } },
  };
}
module.exports = { createGamepads, report };
