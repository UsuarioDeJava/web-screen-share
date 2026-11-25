(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gamepad'));
  else root.WssControlWire = factory(root.WssGamepad);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (model) {
  const MAX_BYTES = 4096;
  const FAST_MAX_BYTES = 68;
  const point = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
  const axes = value => Array.isArray(value) && value.length === 4 && Array.from(value).every(v => Number.isFinite(v) && v >= -1 && v <= 1);
  const triggers = value => Array.isArray(value) && value.length === 2 && Array.from(value).every(point);
  const code = (v) => typeof v === 'string' && /^[A-Za-z0-9]{1,24}$/.test(v);
  function cleanFeedback(p, session) {
    if (!p || p.v !== 1 || p.session !== session || !Number.isSafeInteger(p.epoch) || p.epoch < 1
      || !Number.isSafeInteger(p.seq) || p.seq < 1 || !point(p.strong) || !point(p.weak)
      || !Number.isInteger(p.duration) || p.duration < 0 || p.duration > 200
      || ((p.strong || p.weak) && p.duration < 20)) return null;
    return { v: 1, session, epoch: p.epoch, seq: p.seq, strong: p.strong, weak: p.weak,
      duration: p.strong || p.weak ? p.duration : 0 };
  }
  function cleanInput(value, devices) {
    if (!value || !devices?.[model.kindDevice(value.kind)]) return null;
    const out = { kind: value.kind };
    if (value.kind === 'gamepad') {
      if (!model.validState(value)) return null;
      out.axes = value.axes.slice(); out.buttons = value.buttons.slice();
    } else if (value.kind === 'key') {
      if (!code(value.code) || typeof value.down !== 'boolean') return null;
      out.code = value.code; out.down = value.down;
    } else {
      if (point(value.x) && point(value.y)) { out.x = value.x; out.y = value.y; }
      if (value.kind === 'move' && out.x === undefined) return null;
      if (value.kind === 'button') {
        if (![0, 1, 2].includes(value.button) || typeof value.down !== 'boolean') return null;
        out.button = value.button; out.down = value.down;
      } else if (value.kind === 'wheel') {
        if (!Number.isFinite(value.dy)) return null;
        out.dy = Math.max(-10, Math.min(10, value.dy));
        if (Number.isFinite(value.dx) && value.dx) out.dx = Math.max(-10, Math.min(10, value.dx));
      }
    }
    return out;
  }
  function cleanNativeInput(value, devices, session) {
    if (!value) return null;
    // Concessões modernas exigem a sessão mesmo quando o remetente omite o campo.
    // Servidores antigos não fornecem sessão; só nesse caso aceita o formato legado.
    if (session ? value.session !== session : value.session !== undefined && value.session !== '') return null;
    return cleanInput(value, devices);
  }
  function cleanPacket(p, devices, session) {
    if (!p || p.v !== 1 || p.session !== session || !Number.isSafeInteger(p.epoch) || p.epoch < 1
      || !Number.isSafeInteger(p.seq) || p.seq < 1) return null;
    if (p.lane === 'analog') {
      if (!devices.gamepad || p.input?.kind !== 'analog' || !axes(p.input.axes) || !triggers(p.input.triggers)) return null;
      return { v: 1, session, epoch: p.epoch, seq: p.seq, lane: 'analog', input: {
        kind: 'analog', axes: p.input.axes.slice(), triggers: p.input.triggers.slice() } };
    }
    const input = p.input == null ? null : cleanInput(p.input, devices);
    if (p.input != null && !input) return null;
    if (p.lane === 'move') return input?.kind === 'move' ? { v: 1, session, epoch: p.epoch, seq: p.seq, lane: 'move', input } : null;
    if (p.lane !== 'event' || !p.held || !Array.isArray(p.held.keys) || p.held.keys.length > 32
      || !p.held.keys.every(code) || !Array.isArray(p.held.buttons) || p.held.buttons.length > 3
      || !p.held.buttons.every(b => [0, 1, 2].includes(b))) return null;
    if ((!devices.keyboard && p.held.keys.length) || (!devices.mouse && p.held.buttons.length)) return null;
    if (p.held.pad != null && (!devices.gamepad || !model.validState(p.held.pad))) return null;
    return { v: 1, session, epoch: p.epoch, seq: p.seq, lane: 'event', input,
      held: { keys: [...new Set(p.held.keys)], buttons: [...new Set(p.held.buttons)],
        pad: p.held.pad == null ? null : { axes: p.held.pad.axes.slice(), buttons: p.held.pad.buttons.slice() } } };
  }
  // Identidade vem do DataChannel de uma única concessão, nunca dos bytes.
  // WS, versão 1, tipo 1=mouse/2=analógico; Float64 preserva valores e seq uint53.
  function encodeFast(p) {
    const analog = p?.lane === 'analog' && p.input?.kind === 'analog';
    const move = p?.lane === 'move' && p.input?.kind === 'move';
    if ((!analog && !move) || p.v !== 1 || typeof p.session !== 'string' || !p.session
      || !Number.isSafeInteger(p.epoch) || p.epoch < 1 || !Number.isSafeInteger(p.seq) || p.seq < 1
      || (analog ? !axes(p.input.axes) || !triggers(p.input.triggers) : !point(p.input.x) || !point(p.input.y))) return null;
    const data = new ArrayBuffer(analog ? FAST_MAX_BYTES : 36), view = new DataView(data);
    view.setUint32(0, 0x57530100 | (analog ? 2 : 1));
    view.setFloat64(4, p.epoch, true); view.setFloat64(12, p.seq, true);
    if (analog) {
      for (let i = 0; i < 4; i++) view.setFloat64(20 + i * 8, p.input.axes[i], true);
      for (let i = 0; i < 2; i++) view.setFloat64(52 + i * 8, p.input.triggers[i], true);
    } else {
      view.setFloat64(20, p.input.x, true); view.setFloat64(28, p.input.y, true);
    }
    return data;
  }
  function decodeFast(data, devices, session) {
    if (!(data instanceof ArrayBuffer) || ![36, FAST_MAX_BYTES].includes(data.byteLength)
      || typeof session !== 'string' || !session) return null;
    const view = new DataView(data), header = view.getUint32(0), analog = header === 0x57530102;
    if ((!analog && header !== 0x57530101) || data.byteLength !== (analog ? FAST_MAX_BYTES : 36)) return null;
    const p = { v: 1, session, epoch: view.getFloat64(4, true), seq: view.getFloat64(12, true),
      lane: analog ? 'analog' : 'move', input: analog ? {
        kind: 'analog', axes: Array.from({ length: 4 }, (_, i) => view.getFloat64(20 + i * 8, true)),
        triggers: [view.getFloat64(52, true), view.getFloat64(60, true)],
      } : { kind: 'move', x: view.getFloat64(20, true), y: view.getFloat64(28, true) } };
    return cleanPacket(p, devices, session);
  }
  // Reserva capacidade para eventos confiáveis: mouse/eixos compartilham uma
  // cota rápida menor que a total. Sem janela fixa, fila ou timer adicional.
  function createReceiveBudget({ now = Date.now, totalRate = 400, fastRate = 280 } = {}) {
    let at = now(), total = 256, fast = 64;
    return { accept(isFast, time = now()) {
      if (!Number.isFinite(time) || time < at || !Number.isFinite(at)) return false;
      const elapsed = (time - at) / 1000; at = time;
      total = Math.min(256, total + elapsed * totalRate);
      fast = Math.min(64, fast + elapsed * fastRate);
      if (total < 1 || isFast && fast < 1) return false;
      total--; if (isFast) fast--;
      return true;
    } };
  }
  function createReceiver({ session, devices, deliver, reset = () => {}, now = Date.now, timeout = 750 }) {
    let epoch = 0, eventSeq = 0, positionSeq = 0, analogSeq = 0, lastAt = null, modern = false;
    let pad = null;
    let keys = new Set(), buttons = new Set();
    const budget = createReceiveBudget({ now });
    function neutralize() {
      keys.clear(); buttons.clear(); pad = null; lastAt = null; reset();
    }
    function accept(raw) {
      const p = cleanPacket(raw, devices, session);
      const time = now();
      if (!p || !budget.accept(p.lane !== 'event', time) || p.epoch < epoch) return false;
      if (lastAt != null && time - lastAt > timeout) neutralize();
      if (p.lane === 'move') {
        // Só o canal confiável pode iniciar uma geração; movimentos não ressuscitam sessões.
        if (p.epoch !== epoch || lastAt == null || p.seq <= positionSeq) return false;
        positionSeq = p.seq; deliver(p.input); return true;
      }
      if (p.lane === 'analog') {
        // Eixos/gatilhos nunca alteram botões digitais e não inicializam sessão.
        if (p.epoch !== epoch || lastAt == null || !pad || p.seq <= analogSeq) return false;
        analogSeq = p.seq;
        pad = { axes: p.input.axes.slice(), buttons: pad.buttons.slice() };
        [pad.buttons[6], pad.buttons[7]] = p.input.triggers;
        deliver({ kind: 'gamepad', ...pad }); return true;
      }
      if (p.epoch === epoch && p.seq <= eventSeq) return false;
      if (p.epoch > epoch) { neutralize(); epoch = p.epoch; eventSeq = positionSeq = analogSeq = 0; }
      modern = true; eventSeq = p.seq; lastAt = time;
      const input = p.input;
      if (input?.x !== undefined && p.seq > positionSeq) {
        positionSeq = p.seq; deliver({ kind: 'move', x: input.x, y: input.y });
      }
      positionSeq = Math.max(positionSeq, p.seq);
      const nextKeys = new Set(p.held.keys), nextButtons = new Set(p.held.buttons);
      for (const key of keys) if (!nextKeys.has(key)) deliver({ kind: 'key', code: key, down: false });
      for (const button of buttons) if (!nextButtons.has(button)) deliver({ kind: 'button', button, down: false });
      for (const key of nextKeys) if (!keys.has(key)) deliver({ kind: 'key', code: key, down: true });
      for (const button of nextButtons) if (!buttons.has(button)) deliver({ kind: 'button', button, down: true });
      if (input?.kind === 'key' && input.down && keys.has(input.code) && nextKeys.has(input.code)) deliver(input);
      keys = nextKeys; buttons = nextButtons;
      if (p.held.pad) {
        const previous = pad;
        pad = { axes: p.held.pad.axes.slice(), buttons: p.held.pad.buttons.slice() };
        // Snapshots confiáveis mais antigos atualizam digitais, mas não voltam eixos.
        if (previous && p.seq < analogSeq) {
          pad.axes = previous.axes;
          pad.buttons[6] = previous.buttons[6]; pad.buttons[7] = previous.buttons[7];
        }
        analogSeq = Math.max(analogSeq, p.seq);
        deliver({ kind: 'gamepad', ...pad });
      } else if (pad) {
        pad = null; analogSeq = Math.max(analogSeq, p.seq);
        deliver({ kind: 'gamepad', ...model.neutral() });
      }
      if (input?.kind === 'wheel') deliver({ ...input, x: undefined, y: undefined });
      return true;
    }
    return { accept, neutralize, get modern() { return modern; },
      expire() { if (lastAt != null && now() - lastAt > timeout) { neutralize(); return true; } return false; } };
  }
  return { MAX_BYTES, FAST_MAX_BYTES, encodeFast, decodeFast, cleanInput, cleanNativeInput, cleanPacket, cleanFeedback, createReceiveBudget, createReceiver };
});
