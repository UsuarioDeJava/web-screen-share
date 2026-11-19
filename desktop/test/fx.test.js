const { test } = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../shared/fx');
const { validateRoomAction } = require('../room-settings');

test('estilo: qualquer entrada vira um estilo válido (o que não existe volta pro padrão)', () => {
  assert.deepEqual(fx.normalize(null), fx.DEFAULTS);
  assert.deepEqual(fx.normalize('qualquer coisa'), fx.DEFAULTS);
  const style = fx.normalize({ skin: 'sword', deco: '<script>', size: 'xl', name: 'true', ping: 'emoji', emoji: 'fire', width: 'l', extra: 1 });
  assert.equal(style.skin, 'sword');
  assert.equal(style.deco, 'none');
  assert.equal(style.size, 'm');
  assert.equal(style.name, false);
  assert.equal(style.ping, 'emoji');
  assert.equal(style.emoji, 'fire');
  assert.equal(style.width, 'l');
  assert.equal('extra' in style, false);
  assert.equal(fx.isDefault(fx.normalize({})), true);
  assert.equal(fx.isDefault(style), false);
});

test('catálogo: todo pacote pronto usa só opções que existem', () => {
  for (const [id, pack] of Object.entries(fx.PACKS)) {
    const style = fx.normalize({ ...fx.DEFAULTS, ...pack.style });
    for (const [key, value] of Object.entries(pack.style)) assert.equal(style[key], value, `${id}.${key}`);
  }
  for (const skin of Object.values(fx.SKINS)) {
    assert.equal(skin.hot.length, 2);
    assert.ok(skin.layers.length > 0);
  }
});

test('Configurações do app: o estilo só passa validado', () => {
  const action = validateRoomAction({ type: 'style', style: { skin: 'wand', trail: 'fire', brush: 'evil' } });
  assert.equal(action.type, 'style');
  assert.equal(action.style.skin, 'wand');
  assert.equal(action.style.trail, 'fire');
  assert.equal(action.style.brush, 'normal');
  assert.throws(() => validateRoomAction({ type: 'style', style: [] }));
  assert.throws(() => validateRoomAction({ type: 'style' }));
});
