const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePreferences, startupPreferences } = require('../preferences');
const { createActivityLog } = require('../activity-log');
const { validateRoomAction } = require('../room-settings');

test('preferências inválidas não desativam opções por acidente; ambiente sobrescreve só a execução', () => {
  assert.deepEqual(normalizePreferences({ fullscreen: 'bad', hardwareAcceleration: 'false', logLimit: Infinity }), normalizePreferences());
  const saved = normalizePreferences({ fullscreen: 'native', hardwareAcceleration: true });
  const active = startupPreferences(saved, { WSS_BORDERLESS_FULLSCREEN: '1', WSS_DISABLE_HARDWARE_ACCELERATION: '1' });
  assert.equal(active.fullscreen, 'borderless');
  assert.equal(active.hardwareAcceleration, false);
  assert.equal(saved.fullscreen, 'native');
  assert.equal(saved.hardwareAcceleration, true);
});

test('log limita memória, mantém sequência depois de limpar e não grava conteúdo arbitrário', () => {
  const log = createActivityLog({ limit: 2 });
  log.add({ category: 'people', message: 'Ana entrou', payload: { credential: 'não copiar' } });
  log.add({ message: 'B' }); log.add({ message: 'C' });
  const data = log.snapshot();
  assert.deepEqual(data.rows.map((row) => row.message), ['B', 'C']);
  assert.equal('payload' in data.rows[0], false);
  data.rows[0].message = 'mutado';
  assert.equal(log.snapshot().rows[0].message, 'B');
  log.clear(); log.add({ message: 'Depois de limpar' });
  assert.equal(log.snapshot().rows[0].id, 4);
});

test('desativar o registro preserva histórico, bloqueia novos eventos e respeita limite de frequência', () => {
  const log = createActivityLog();
  log.add({ message: 'Antes' });
  log.configure({ logging: false, logLimit: 500 });
  log.add({ message: 'Não registrar' });
  assert.equal(log.snapshot().rows.length, 1);
  log.configure({ logging: true, logLimit: 500 });
  for (let i = 0; i < 150; i++) log.add({ message: String(i) });
  assert.equal(log.snapshot().rows.length, 100);
  assert.equal(log.snapshot().omitted, 51);
});

test('mensagens exportáveis ocultam credenciais em URLs e campos conhecidos', () => {
  const log = createActivityLog();
  log.add({ message: 'https://ana:senha@host/path?token=secreto password=outra Authorization: Bearer abc.def.ghi {"credential": "chave-privada"}' });
  const message = log.snapshot().rows[0].message;
  assert.equal(message.includes('senha'), false);
  assert.equal(message.includes('secreto'), false);
  assert.equal(message.includes('outra'), false);
  assert.equal(message.includes('abc.def.ghi'), false);
  assert.equal(message.includes('chave-privada'), false);
});

test('ações da sala aceitam só comandos conhecidos e fotos limitadas', () => {
  assert.throws(() => validateRoomAction({ type: 'evaluate', code: 'qualquer código' }));
  assert.throws(() => validateRoomAction({ type: 'color', color: 'url(javascript:bad)' }));
  assert.throws(() => validateRoomAction({ type: 'cursor', field: 'share', enabled: 'false' }));
  assert.throws(() => validateRoomAction({ type: 'photo', mime: 'text/html', data: 'YQ==' }));
  assert.deepEqual(validateRoomAction({ type: 'color', color: '#12AB34', unrelated: 'ignorar' }), { type: 'color', color: '#12ab34', commit: true });
  assert.deepEqual(validateRoomAction({ type: 'color', color: '#12ab34', commit: false }), { type: 'color', color: '#12ab34', commit: false });
  assert.deepEqual(validateRoomAction({ type: 'obs-display', value: 'off' }), { type: 'obs-display', value: 'off' });
  assert.throws(() => validateRoomAction({ type: 'obs-display', value: 'qualquer monitor' }));
});
