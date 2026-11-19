const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { createGamepadSetup } = require('../gamepad-setup');
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wss-gamepad-setup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const driver = Buffer.from('test driver'), dll = Buffer.from('test dll');
  const assets = [driver, dll].map((bytes, i) => ({ name: i ? 'ViGEmClient.dll' : 'driver.exe', url: 'fixture:' + i, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
  let installs = 0;
  const setup = createGamepadSetup({ directory, platform: 'win32', arch: 'x64', assets,
    fetchFile: async url => url === 'fixture:0' ? driver : url === 'fixture:1' ? dll : Buffer.from('License'),
    install: async file => { assert.equal(file, path.join(directory, 'setup', 'driver.exe')); installs++; return { reboot: false }; }, ...options });
  return { setup, directory, dll, installs: () => installs };
}
test('prepara DLL no perfil correto e compartilha uma instalação concorrente', async t => {
  const f = await fixture(t);
  const a = f.setup.prepare(), b = f.setup.prepare();
  assert.equal(a, b);
  assert.equal((await a).restartRequired, true);
  assert.equal(f.installs(), 1);
  assert.deepEqual(await fs.readFile(path.join(f.directory, 'x64', 'ViGEmClient.dll')), f.dll);
});
test('arquivo com hash incorreto nunca executa o instalador', async t => {
  const f = await fixture(t, { fetchFile: async () => Buffer.from('alterado') });
  await assert.rejects(f.setup.prepare(), /SHA256/);
  assert.equal(f.installs(), 0);
});
test('cancelamento da instalação não prepara DLL e permite tentar novamente', async t => {
  let attempts = 0;
  const f = await fixture(t, { install: async () => { if (!attempts++) throw Error('Cancelado'); return { reboot: false }; } });
  await assert.rejects(f.setup.prepare(), /Cancelado/);
  await assert.rejects(fs.access(path.join(f.directory, 'x64', 'ViGEmClient.dll')));
  assert.equal((await f.setup.prepare()).rebootRequired, false);
});
test('pedido de reinicialização do Windows é preservado', async t => {
  const f = await fixture(t, { install: async () => ({ reboot: true }) });
  const result = await f.setup.prepare();
  assert.equal(result.rebootRequired, true);
  assert.match(result.message, /Windows/);
});
test('não executa preparação em sistemas sem suporte', async t => {
  const f = await fixture(t, { platform: 'linux' });
  await assert.rejects(f.setup.prepare(), /Windows x64/);
  assert.equal(f.installs(), 0);
});
