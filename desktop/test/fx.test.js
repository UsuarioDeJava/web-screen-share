const { test } = require('node:test');
const assert = require('node:assert/strict');
const fx = require('../shared/fx');
const { validateRoomAction } = require('../room-settings');

test('estilo: qualquer entrada vira um estilo válido (o que não existe volta pro padrão)', () => {
  assert.deepEqual(fx.normalize(null), fx.DEFAULTS);
  assert.deepEqual(fx.normalize('qualquer coisa'), fx.DEFAULTS);
  const style = fx.normalize({ skin: 'sword', deco: '<script>', size: 'xxl', name: 'true', ping: 'emoji', emoji: 'fire', width: 'l', extra: 1 });
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

test('estilo: opções que saíram viram as parecidas; contorno, ponta e imagens', () => {
  const old = fx.normalize({ skin: 'round', trail: 'dots', ping: 'pulse', brush: 'chalk' });
  assert.deepEqual([old.skin, old.trail, old.ping, old.brush], ['classic', 'pixels', 'classic', 'chalk']);
  assert.equal(fx.normalize({ outline: 'FFD23F' }).outline, 'ffd23f');
  assert.equal(fx.normalize({ outline: 'k' }).outline, 'k');
  assert.equal(fx.normalize({ outline: '#fff' }).outline, 'w');
  assert.equal(fx.outlineHex('k'), '#15161d');
  assert.deepEqual([fx.normalize({ hx: 40, hy: '7' }).hx, fx.normalize({ hx: 40, hy: '7' }).hy], [40, 7]);
  assert.deepEqual([fx.normalize({ hx: 101, hy: -1 }).hx, fx.normalize({ hx: 1.5 }).hx], [0, 0]);
  const img = '/avatar/0123456789abcdef0123456789abcdef';
  // Setinha/ping com imagem: só com o endereço de uma foto do servidor.
  assert.equal(fx.normalize({ skin: 'custom', img }).skin, 'custom');
  assert.equal(fx.normalize({ skin: 'custom', img: 'https://sala.exemplo:3000' + img }).img, 'https://sala.exemplo:3000' + img);
  assert.equal(fx.normalize({ skin: 'custom', img: 'javascript:alert(1)' }).skin, 'classic');
  assert.equal(fx.normalize({ skin: 'custom', img: '/avatar/x") ; background:url(' }).skin, 'classic');
  assert.equal(fx.normalize({ skin: 'custom' }).skin, 'classic'); // a imagem ainda não chegou
  assert.equal(fx.normalize({ skin: 'custom', keepCustom: true }).skin, 'custom'); // a escolha salva continua
  assert.equal(fx.normalize({ ping: 'image' }).ping, 'emoji');
  assert.equal(fx.normalize({ ping: 'image', pingImg: img }).ping, 'image');
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
