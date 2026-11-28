const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { writeConfig, readConfig } = require('../config-store');
const colors = require('../shared/color');
const createVideoHealth = require('../../public/js/video-health');
const { createRoomSettings } = require('../room-settings');

test('falha ao substituir configuração preserva JSON anterior e remove temporário', () => {
  const dir = fs.mkdtempSync(path.join(__dirname, '.config-test-'));
  const file = path.join(dir, 'config.json');
  try {
    writeConfig(file, { version: 1 });
    assert.throws(() => writeConfig(file, { version: 2 }, { ...fs, renameSync() { throw new Error('falha simulada'); } }));
    assert.deepEqual(readConfig(file), { version: 1 });
    assert.deepEqual(fs.readdirSync(dir), ['config.json']);
    writeConfig(file, { version: 3 });
    assert.deepEqual(readConfig(file), { version: 3 });
    fs.writeFileSync(file, '{');
    const warnings = [];
    assert.deepEqual(readConfig(file, (value) => warnings.push(value)), {});
    assert.equal(warnings.length, 1);
    assert.equal(fs.readFileSync(file, 'utf8'), '{');
  } finally { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});

test('cores compartilhadas preservam conversões, contraste e cache de paleta', async () => {
  assert.equal(colors.normalizeHex('#AbC'), '#aabbcc');
  assert.equal(colors.rgbToHex(...colors.hsvToRgb(120, 1, 1)), '#00ff00');
  assert.equal(colors.inkFor('#ffffff'), '#12141c');
  let loads = 0;
  const cached = colors.createPaletteCache(async () => { loads++; return ['#ff0000']; });
  const values = await Promise.all([cached('/a'), cached('/a')]);
  assert.equal(loads, 1);
  values[0].push('#ffffff');
  assert.deepEqual(await cached('/a'), ['#ff0000']);
  await cached('/b'); assert.equal(loads, 2);
  assert.deepEqual(colors.paletteFromPixels([255, 0, 0, 255, 0, 0, 0, 0]), ['#ff0000']);
});

test('monitor distingue tela estática de dados sem quadros e limita reconexões', () => {
  const health = createVideoHealth();
  const sample = (bytes, frames, now) => health.sample({ bytesReceived: bytes, framesDecoded: frames }, now);
  sample(100, 1, 0);
  assert.equal(sample(100, 1, 15000).stalled, false);
  sample(200, 2, 16000);
  assert.equal(sample(300, 2, 20000).stalled, false);
  assert.equal(sample(400, 2, 30000).stalled, true);
  assert.equal(sample(500, 2, 45000).stalled, false);
  health.reset();
  assert.equal(sample(600, 2, 100000).stalled, false);
  assert.equal(sample(700, 3, 120000).stalled, false);
});

test('vídeo esperando o primeiro quadro-chave (OBS com intervalo longo): não reconecta antes da hora', () => {
  const health = createVideoHealth();
  const sample = (bytes, frames, now) => health.sample({ bytesReceived: bytes, framesDecoded: frames }, now);
  sample(100, 0, 0);
  for (let t = 2000; t <= 28000; t += 2000) assert.equal(sample(100 + t, 0, t).stalled, false, `esperando aos ${t / 1000} s`);
  assert.equal(sample(30000, 0, 30000).waitingKeyframe, true, 'avisa que está esperando');
  assert.equal(sample(40000, 5, 32000).stalled, false, 'chegou o quadro-chave: a imagem aparece e não reconecta');
  let stalledAt = null;
  for (let t = 34000; t <= 48000 && stalledAt === null; t += 2000) if (sample(40000 + t, 5, t).stalled) stalledAt = t;
  assert.equal(stalledAt, 44000, 'depois do primeiro quadro (aos 32 s), 12 s sem novos quadros: reconecta');
  const never = createVideoHealth();
  never.sample({ bytesReceived: 1, framesDecoded: 0 }, 0);
  for (let t = 2000; t < 46000; t += 2000) never.sample({ bytesReceived: 1 + t, framesDecoded: 0 }, t);
  assert.equal(never.sample({ bytesReceived: 50000, framesDecoded: 0 }, 46000).stalled, true, 'nenhum quadro em 45 s: aí sim reconecta');
});

test('upload demorado não bloqueia leitura ou revogação e espera pode ser cancelada', async () => {
  let resolvePhoto;
  const contents = { isDestroyed: () => false, getURL: () => 'https://sala', executeJavaScript: (source) => source.includes('"type":"photo"')
    ? new Promise((resolve) => { resolvePhoto = resolve; }) : Promise.resolve({ ok: true }) };
  const room = createRoomSettings({ getContents: () => contents, isServer: () => true });
  const photo = room.action({ type: 'photo', mime: 'image/gif', data: 'YQ==', name: 'a.gif' });
  const photoCancelled = assert.rejects(photo, /cancelada/);
  assert.deepEqual(await room.read(), { ok: true });
  assert.deepEqual(await room.action({ type: 'control', name: 'Ana', grant: false }), { ok: true });
  room.cancel(); await photoCancelled; resolvePhoto({ ok: true });
});
