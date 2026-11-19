const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createControl } = require('../../server/control');
const model = require('../shared/gamepad');
const { createGamepads, report } = require('../gamepad');

function room() {
  const sent = [], users = new Map();
  const service = createControl({ io: { to: (id) => ({ emit: (event, value) => sent.push({ id, event, value }) }) }, users, ownsStream: (u, id) => id === u.id, allow: () => true, logEvent: () => {} });
  function add(id) {
    users.set(id, { id, name: id }); const handlers = {};
    service.attach({ id, on: (event, handler) => { handlers[event] = handler; } });
    return { emit(event, value) { let reply; handlers[event](value, (v) => { reply = v; }); return reply; } };
  }
  return { sent, users, service, add };
}
test('proprietário autoriza por dispositivo, limita slots e revoga só o participante escolhido', () => {
  const r = room(), owner = r.add('host'), a = r.add('a'), b = r.add('b');
  const grant = (to, devices) => owner.emit('control:grant', { to, stream: 'host', devices });
  assert.equal(grant('a', { gamepad: true }).ok, true);
  assert.equal(grant('b', { keyboard: true }).ok, true);
  let count = r.sent.length;
  a.emit('control:input', { stream: 'host', kind: 'key', code: 'KeyA', down: true });
  b.emit('control:input', { stream: 'host', kind: 'gamepad', ...model.neutral() });
  assert.equal(r.sent.length, count);
  a.emit('control:input', { stream: 'host', kind: 'gamepad', ...model.neutral() });
  b.emit('control:input', { stream: 'host', kind: 'key', code: 'KeyA', down: true, x: 1, y: 1 });
  assert.equal(r.sent.length, count + 2);
  assert.equal(r.sent.at(-1).value.x, undefined);
  assert.ok(grant('a', { keyboard: true }).error);
  assert.ok(a.emit('control:grant', { to: 'b', stream: 'host', devices: { gamepad: true } }).error);
  for (const id of ['c', 'd', 'e', 'f']) r.add(id);
  for (const id of ['c', 'd', 'e']) assert.equal(grant(id, { gamepad: true }).ok, true);
  assert.ok(grant('f', { gamepad: true }).error);
  owner.emit('control:revoke', { to: 'a' });
  assert.equal(r.users.get('host').controls.has('a'), false);
  assert.equal(r.users.get('host').controls.has('b'), true);
  assert.equal(grant('f', { gamepad: true }).ok, true);
  r.service.revokeFor('b');
  assert.equal(r.users.get('host').controls.has('b'), false);
  r.service.revokeStream('host');
  assert.equal(r.users.get('host').controls.size, 0);
});
test('estados inválidos e dispositivos não autorizados não chegam ao proprietário', () => {
  const r = room(), host = r.add('host'), player = r.add('player');
  assert.ok(host.emit('control:grant', { stream: 'host', to: 'player', devices: {} }).error);
  host.emit('control:grant', { stream: 'host', to: 'player', devices: { gamepad: true } });
  const count = r.sent.length;
  player.emit('control:input', { stream: 'host', kind: 'gamepad', axes: Array(4), buttons: Array(17) });
  for (const state of [{ axes: [NaN, 0, 0, 0], buttons: Array(17).fill(0) }, { axes: [2, 0, 0, 0], buttons: Array(17).fill(0) }, { axes: [0, 0, 0, 0], buttons: Array(18).fill(0) }, { axes: [0, 0, 0, 0], buttons: Array(17).fill(-1) }]) player.emit('control:input', { stream: 'host', kind: 'gamepad', ...state });
  player.emit('control:input', { stream: 'other', kind: 'gamepad', ...model.neutral() });
  player.emit('control:input', { stream: 'host', kind: 'button', button: 0, down: true });
  assert.equal(r.sent.length, count);
  host.emit('control:revoke');
  player.emit('control:input', { stream: 'host', kind: 'gamepad', ...model.neutral() });
  assert.equal(r.sent.filter((v) => v.event === 'control:input').length, 0);
});
test('perfil local remapeia botões, gatilhos e eixos antes da conversão XInput', () => {
  const p = model.profile({ buttons: [1, 0], axes: [2, 3, 0, 1], invert: [true], deadzone: 0.2 });
  const pad = { buttons: Array.from({ length: 17 }, (_, i) => ({ value: i === 1 ? 1 : i === 6 ? 0.5 : 0 })), axes: [0.1, 0, 1, -1] };
  const state = model.sample(pad, p);
  assert.equal(state.buttons[0], 1); assert.equal(state.buttons[1], 0);
  assert.deepEqual(state.axes, [-1, -1, 0, 0]);
  const out = report(state);
  assert.equal(out.wButtons, 0x1000); assert.equal(out.bLeftTrigger, 128);
  assert.equal(out.sThumbLX, -32768); assert.equal(out.sThumbLY, 32767);
  assert.equal(model.profile(null).deadzone, 0.12);
});
test('gamepads nativos são isolados; watchdog neutraliza, revogação remove e falha libera recursos', () => {
  let clock = 0, next = 0; const calls = [];
  const api = { alloc: () => 1, connect: () => 0x20000000, target: () => ++next, add: () => 0x20000000,
    update: (client, target, state) => { calls.push(['update', target, state]); return 0x20000000; }, remove: (_, target) => calls.push(['remove', target]),
    targetFree: (target) => calls.push(['freeTarget', target]), disconnect: () => calls.push(['disconnect']), free: () => calls.push(['free']) };
  const pads = createGamepads({ directory: '.', platform: 'win32', load: () => api, now: () => clock, schedule: false });
  assert.equal(pads.status().available, true);
  const state = model.neutral(); state.buttons[0] = 1;
  assert.equal(pads.update('a', state), true); assert.equal(pads.update('b', state), true);
  clock = 1001; pads.expire(); assert.equal(calls.at(-1)[2].wButtons, 0);
  pads.retain(new Set(['b'])); assert.ok(calls.some((c) => c[0] === 'remove' && c[1] === 1));
  pads.update('b', state); assert.equal(calls.at(-1)[1], 2);
  pads.close(); assert.deepEqual(calls.slice(-2), [['disconnect'], ['free']]);
  const failed = createGamepads({ directory: '.', platform: 'win32', load: () => ({ ...api, connect: () => 0 }), schedule: false });
  assert.equal(failed.status().available, false); assert.match(failed.status().reason, /Driver/); failed.close();
});
