const { test } = require('node:test');
const assert = require('node:assert/strict');
const { COMMANDS } = require('../../server/testers');

// Usuário de testes: o servidor só repassa o que cada comando aceita.
test('usuário de testes: comandos limpos pelo servidor', () => {
  const start = COMMANDS['share-start'].args;
  assert.deepEqual(start({ source: 'screen:0:0', name: 'Tela 1', audio: true, windowAudio: 'sim', extra: 1 }),
    { source: 'screen:0:0', name: 'Tela 1', audio: true, windowAudio: false });
  assert.equal(start({ source: 'file:///etc/passwd' }), null, 'só telas e janelas do desktopCapturer');
  assert.equal(start({}), null);
  const grant = COMMANDS['control-grant'].args;
  assert.equal(grant({ to: 'abc', devices: {} }), null, 'sem nenhum dispositivo: inválido');
  assert.deepEqual(grant({ to: 'abc', devices: { mouse: true, keyboard: 1 } }), { to: 'abc', devices: { keyboard: false, mouse: true, gamepad: false } });
  assert.deepEqual(COMMANDS.mute.args({ muted: 'true' }), { muted: false }, 'só true de verdade');
  assert.equal(COMMANDS.state.log, false, 'ler o estado não vai pro log');
  assert.match(COMMANDS['control-grant'].log({ to: 'abc', devices: { keyboard: true, mouse: false, gamepad: true } }, () => 'Ana'), /Ana \(teclado, gamepad\)/);
});
