const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createControl } = require('../../server/control');
const model = require('../shared/gamepad');
const { createGamepads, report } = require('../gamepad');

function room(settings = {}) {
  const sent = [], users = new Map();
  const service = createControl({ io: { to: (id) => ({ emit: (event, value) => sent.push({ id, event, value }) }) }, users, ownsStream: (u, id) => id === u.id, allow: () => true, logEvent: () => {}, schedule: false, ...settings });
  function add(id) {
    users.set(id, { id, name: id }); const handlers = {};
    service.attach({ id, on: (event, handler) => { handlers[event] = handler; } });
    return { emit(event, value) { let reply; const ack = (v) => { reply = v; }; if (event === 'control:details') handlers[event](ack); else handlers[event](value, ack); return reply; } };
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
test('transmissão pelo OBS também pode ser controlada (teclado, mouse e gamepad)', () => {
  // A transmissão "obs-host" é do OBS da mesma pessoa (mesmo nick).
  const r = room({ ownsStream: (u, id) => id === u.id || (u.id === 'host' && id === 'obs-host') });
  const host = r.add('host'); r.add('a');
  assert.equal(host.emit('control:grant', { to: 'a', stream: 'obs-host', devices: { keyboard: true, mouse: true, gamepad: true } }).ok, true);
  assert.ok(host.emit('control:grant', { to: 'a', stream: 'de-outra-pessoa', devices: { mouse: true } }).error);
});
test('um mouse só: modo controle e formato do mouse só entre quem tem o mouse liberado', () => {
  const r = room(), host = r.add('host'), a = r.add('a'), b = r.add('b');
  host.emit('control:grant', { to: 'a', stream: 'host', devices: { mouse: true } });
  host.emit('control:grant', { to: 'b', stream: 'host', devices: { gamepad: true } });
  const before = r.sent.length;
  a.emit('control:mode', { stream: 'host', on: true });
  b.emit('control:mode', { stream: 'host', on: true }); // sem o mouse: não conta
  a.emit('control:mode', { stream: 'outra', on: true });
  const modes = r.sent.slice(before).filter((m) => m.event === 'control:mode');
  assert.deepEqual(modes, [{ id: 'host', event: 'control:mode', value: { from: 'a', stream: 'host', on: true } }]);
  const mark = r.sent.length;
  host.emit('control:cursor', { shape: 'text' });
  host.emit('control:cursor', { shape: 'url(javascript:alert(1))' });
  a.emit('control:cursor', { shape: 'pointer' }); // quem não transmite não manda formato
  const shapes = r.sent.slice(mark).filter((m) => m.event === 'control:cursor');
  assert.deepEqual(shapes, [{ id: 'a', event: 'control:cursor', value: { stream: 'host', shape: 'text' } }]);
});
test('um mouse só: todo formato que o app manda o servidor aceita; fora do Windows nada se esconde', () => {
  const { CURSOR_SHAPES } = require('../../server/control');
  const { CSS_SHAPES, createSystemCursor } = require('../system-cursor');
  for (const shape of CSS_SHAPES) assert.ok(CURSOR_SHAPES.has(shape), shape);
  if (process.platform !== 'win32') assert.equal(createSystemCursor(), null);
  process.env.WSS_FAKE_SYSTEM_CURSOR = '1';
  const fake = createSystemCursor();
  fake.hide(); assert.equal(fake.hidden, true);
  fake.restore(); assert.equal(fake.hidden, false);
  delete process.env.WSS_FAKE_SYSTEM_CURSOR;
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

test('presets reconhecem a disposição padrão e mantêm saída XInput para Xbox e PlayStation', () => {
  assert.equal(model.defaultProfile({ id: 'Sony DualSense Wireless Controller' }).preset, 'playstation');
  assert.equal(model.defaultProfile({ id: 'GameSir Controller' }).preset, 'custom');
  const pad = { buttons: Array.from({ length: 22 }, (_, i) => ({ value: i === 0 ? 1 : 0 })), axes: [0, 0, 0, 0] };
  const xbox = model.applyPreset('xbox'); const play = model.applyPreset('playstation');
  assert.equal(model.labelsFor(play)[0], '✕'); assert.equal(model.labelsFor(xbox)[0], 'A');
  assert.deepEqual(model.sample(pad, xbox), model.sample(pad, play));
  assert.equal(report(model.sample(pad, play)).wButtons, 0x1000);
  const migrated = model.profile({ buttons: [2], deadzone: 0.2 });
  assert.equal(migrated.buttons[0], 2); assert.equal(migrated.deadzone, 0.2); assert.equal(migrated.preset, 'xbox');
});

test('extras compartilham botões sem soltar a entrada principal e preservam gatilhos analógicos', () => {
  const p = model.profile({ preset: 'custom', extraButtons: [{ name: 'L4', source: 17, target: 0 }, { name: 'R4', source: 19, target: 6 }] });
  const pad = { buttons: Array.from({ length: 22 }, () => ({ value: 0 })), axes: [0, 0, 0, 0] };
  pad.buttons[17].value = 1; pad.buttons[19].value = 0.7;
  let state = model.sample(pad, p);
  assert.equal(state.buttons.length, 17); assert.equal(model.validState(state), true);
  assert.equal(state.buttons[0], 1); assert.equal(state.buttons[6], 0.7);
  pad.buttons[0].value = 1; pad.buttons[17].value = 0;
  assert.equal(model.sample(pad, p).buttons[0], 1);
  pad.buttons[0].value = 0; pad.buttons[6].value = 0.9;
  assert.equal(model.sample(pad, p).buttons[0], 0); assert.equal(model.sample(pad, p).buttons[6], 0.9);
  const standard = model.applyPreset('xbox', p);
  pad.buttons[17].value = 1;
  assert.equal(model.sample(pad, standard).buttons[0], 0);
  assert.equal(model.profile({ preset: 'custom', extraButtons: [{ source: 64, target: 0 }, { source: 17, target: 18 }, null] }).extraButtons.length, 0);
  assert.equal(model.profile({ preset: 'custom', extraButtons: Array.from({ length: 30 }, () => ({ source: 17, target: 0 })) }).extraButtons.length, 16);
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

test('detalhes distinguem permissão, presença física, confirmação nativa e comandos recentes', () => {
  let clock = 100;
  const r = room({ now: () => clock }), host = r.add('host'), player = r.add('player'), stranger = r.add('stranger');
  host.emit('control:grant', { stream: 'host', to: 'player', devices: { gamepad: true } });
  const state = () => r.service.details(r.users.get('host'));
  assert.deepEqual(state().counts, { allowed: 1, physical: 0, connected: 0, receiving: 0 });
  stranger.emit('control:presence', { stream: 'host', connected: true, sending: true, name: 'Falso' });
  assert.equal(state().counts.physical, 0);
  player.emit('control:presence', { stream: 'host', connected: true, sending: true, name: '<Controle>\nXbox' });
  assert.equal(state().counts.physical, 1); assert.equal(state().counts.connected, 0);
  player.emit('control:receiver', { stream: 'host', from: 'player', connected: true });
  assert.equal(state().counts.connected, 0);
  host.emit('control:receiver', { stream: 'host', from: 'player', connected: true });
  assert.equal(state().counts.connected, 1); assert.equal(state().counts.receiving, 0);
  player.emit('control:input', { stream: 'host', kind: 'gamepad', ...model.neutral() });
  assert.equal(state().counts.receiving, 1); assert.equal(state().people[0].deviceName, '<Controle>Xbox');
  clock += 1201; assert.equal(state().counts.receiving, 0);
  player.emit('control:presence', { stream: 'host', connected: false, sending: false });
  assert.equal(state().counts.connected, 0); assert.equal(state().counts.allowed, 1);
  // Somente o próprio proprietário recebe os detalhes de suas concessões.
  assert.equal(player.emit('control:details').people.length, 0);
  assert.ok(r.sent.filter((p) => p.event === 'control:sharing').every((p) => p.id === 'host'));
});

test('pausar bloqueia gamepad sem retirar permissão; limite não descarta pessoas silenciosamente', () => {
  const r = room(), host = r.add('host'), a = r.add('a'); r.add('b');
  for (const to of ['a', 'b']) host.emit('control:grant', { to, stream: 'host', devices: { gamepad: true } });
  assert.ok(host.emit('control:options', { maxGamepads: 1, gamepadPaused: false }).error);
  assert.ok(host.emit('control:options', { maxGamepads: 5, gamepadPaused: false }).error);
  assert.equal(host.emit('control:options', { maxGamepads: 2, gamepadPaused: true }).ok, true);
  const count = r.sent.filter((p) => p.event === 'control:input').length;
  a.emit('control:input', { stream: 'host', kind: 'gamepad', ...model.neutral() });
  assert.equal(r.sent.filter((p) => p.event === 'control:input').length, count);
  assert.equal(r.service.details(r.users.get('host')).counts.allowed, 2);
  assert.equal(host.emit('control:options', { maxGamepads: 2, gamepadPaused: false }).ok, true);
  a.emit('control:input', { stream: 'host', kind: 'gamepad', ...model.neutral() });
  assert.equal(r.sent.filter((p) => p.event === 'control:input').length, count + 1);
  host.emit('control:revoke', { to: 'b' });
  assert.equal(host.emit('control:options', { maxGamepads: 1, gamepadPaused: false }).ok, true);
});

test('limites dos gatilhos preservam pressão parcial e chegam ao XInput em 8 bits', () => {
  const pad = { buttons: Array.from({length: 22}, () => ({value: 0})), axes: [0,0,0,0] };
  const p = model.profile({preset:'custom', triggerLimits:[0.5,0.75], extraButtons:[{source:19,target:6}]});
  pad.buttons[6].value = 1; pad.buttons[7].value = 0.5;
  let state = model.sample(pad,p);
  assert.equal(state.buttons[6],0.5); assert.equal(state.buttons[7],0.375);
  assert.equal(report(state).bLeftTrigger,128); assert.equal(report(state).bRightTrigger,96);
  pad.buttons[6].value = 0.5; assert.equal(model.sample(pad,p).buttons[6],0.25);
  pad.buttons[6].value = 0; pad.buttons[19].value = 1;
  assert.equal(model.sample(pad,p).buttons[6],0.5);
  assert.deepEqual(model.applyPreset('playstation',p).triggerLimits,[1,1]);
  assert.deepEqual(model.profile({triggerLimits:[NaN,Infinity]}).triggerLimits,[1,1]);
  assert.deepEqual(model.profile({triggerLimits:[-1,2]}).triggerLimits,[0,1]);
  pad.buttons[19].value=0; assert.equal(report(model.sample(pad,p)).bLeftTrigger,0);
});

test('gatilhos em eixos independentes ou compartilhados preservam curso, inversão e calibração',()=>{
  const pad={buttons:Array.from({length:17},()=>({value:0})),axes:[0,0,0,0,-1,1]};
  const config=model.profile({triggers:[{type:'axis',source:4,min:-1,max:1},{type:'axis',source:5,min:1,max:-1}]});
  for(const pressure of [0,.1,.25,.5,.75,1]){
    pad.axes[4]=pressure*2-1;pad.axes[5]=1-pressure*2;
    const state=model.sample(pad,config);
    assert.ok(Math.abs(state.buttons[6]-pressure)<1e-10);assert.ok(Math.abs(state.buttons[7]-pressure)<1e-10);
    assert.equal(report(state).bLeftTrigger,Math.round(pressure*255));
  }
  pad.axes[4]=0.4;
  const calibrated=model.profile({triggers:[{type:'axis',source:4,min:.2,max:.6}]});
  assert.ok(Math.abs(model.sample(pad,calibrated).buttons[6]-.5)<1e-10);
  assert.equal(model.sample({...pad,axes:[]},config).buttons[6],0);
  const shared=model.profile({triggers:[{type:'axis',source:4,min:0,max:1},{type:'axis',source:4,min:0,max:-1}]});
  pad.axes[4]=.5;assert.equal(model.sample(pad,shared).buttons[6],.5);assert.equal(model.sample(pad,shared).buttons[7],0);
  pad.axes[4]=-.5;assert.equal(model.sample(pad,shared).buttons[6],0);assert.equal(model.sample(pad,shared).buttons[7],.5);
  const invalid=model.profile({triggers:[{type:'axis',source:999,min:1,max:1}, {type:'button',source:6,min:-1,max:NaN}]});
  assert.deepEqual(invalid.triggers[0],{type:'axis',source:6,min:-1,max:1});
  assert.deepEqual(invalid.triggers[1],{type:'button',source:6,min:0,max:1});
});
test('Nenhum bloqueia a saída e o Guide (Xbox/PS) vem bloqueado, inclusive em perfis antigos', () => {
  const pressed = { buttons: Array.from({ length: 17 }, () => ({ value: 1 })), axes: [0, 0, 0, 0] };
  const fresh = model.profile();
  assert.equal(fresh.buttons[model.GUIDE], model.NONE);
  assert.equal(report(model.sample(pressed, fresh)).wButtons & 0x400, 0, 'Guide não chega ao XInput');
  assert.equal(model.profile({ buttons: Array.from({ length: 17 }, (_, i) => i) }).buttons[model.GUIDE], model.NONE, 'perfil salvo antes da versão 2');
  assert.equal(model.applyPreset('playstation', fresh).buttons[model.GUIDE], model.NONE, 'restaurar preset mantém bloqueado');
  const released = model.profile({ ...fresh, buttons: fresh.buttons.map((b, i) => (i === model.GUIDE ? 16 : b)) });
  assert.equal(released.buttons[model.GUIDE], 16, 'quem liberou continua liberado');
  assert.ok(report(model.sample(pressed, released)).wButtons & 0x400);
  const blocked = model.profile({ v: 2, buttons: [model.NONE], triggers: [{ type: 'none' }, { type: 'axis', source: 2 }] });
  const state = model.sample({ ...pressed, axes: [0, 0, 1, 0] }, blocked);
  assert.equal(state.buttons[0], 0, 'A como Nenhum');
  assert.equal(state.buttons[1], 1, 'os outros continuam');
  assert.equal(state.buttons[6], 0, 'LT como Nenhum');
  assert.equal(state.buttons[7], 1, 'RT pelo eixo');
  assert.equal(report(state).bLeftTrigger, 0);
  assert.equal(model.profile({ v: 2, buttons: [-2] }).buttons[0], 0, 'índice inválido volta ao padrão');
});
test('o controle Xbox sem fio não é confundido com o PlayStation (os dois dizem "Wireless Controller")', () => {
  const preset = (id) => model.defaultProfile({ id }).preset;
  assert.equal(preset('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'), 'xbox');
  assert.equal(preset('045e-0b13-Xbox Wireless Controller'), 'xbox');
  assert.equal(preset('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), 'playstation');
  assert.equal(preset('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
  assert.equal(preset('GameSir-T4 Kaleid'), 'custom');
  assert.equal(preset('Controle genérico'), 'xbox');
});
test('nomes dos botões físicos: Xbox, PlayStation e, fora do padrão, o número', () => {
  assert.equal(model.physicalName(0, { layout: 'xbox' }), 'A');
  assert.equal(model.physicalName(16, { layout: 'xbox' }), 'Xbox (Guide)');
  assert.equal(model.physicalName(2, { layout: 'playstation' }), '□ Quadrado');
  assert.equal(model.physicalName(17, { layout: 'playstation' }), 'Touchpad');
  assert.equal(model.physicalName(17, { layout: 'xbox' }), 'Botão 17');
  assert.equal(model.physicalName(0, { layout: 'xbox' }, false), 'Botão 0');
});
