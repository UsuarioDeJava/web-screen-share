// Atualização do app: procurar, baixar sozinho (atualizações automáticas) e reiniciar.
// O Electron e o electron-updater são de mentira; o relógio também.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');

const fakeApp = Object.assign(new EventEmitter(), { isPackaged: false, getVersion: () => '2.2.2' });
const electron = {
  app: fakeApp,
  net: { fetch: async () => ({ ok: true, text: async () => 'version: 2.2.2\n' }) },
  shell: { openExternal: () => {} },
  Notification: { isSupported: () => false },
};
const load = Module._load;
Module._load = function (request, ...rest) { return request === 'electron' ? electron : load.call(this, request, ...rest); };
const { createUpdates } = require('../updates');
Module._load = load;

function fakeUpdater({ latest = '2.2.2', fail = false } = {}) {
  const u = Object.assign(new EventEmitter(), {
    latest, fail, downloads: 0, installs: [],
    setFeedURL() {},
    async checkForUpdates() {
      if (u.fail) throw new Error('sem internet');
      u.emit('update-available', { version: u.latest });
      return { updateInfo: { version: u.latest } };
    },
    async downloadUpdate() { u.downloads += 1; },
    quitAndInstall(...args) { u.installs.push(args); },
  });
  return u;
}

function setup({ auto = true, latest } = {}) {
  process.env.WSS_UPDATE_MODE = 'install';
  const sent = [];
  const updater = fakeUpdater({ latest });
  let on = auto;
  const updates = createUpdates({ getWindow: () => null, send: (s) => sent.push(s), getAuto: () => on, loadUpdater: () => updater });
  updates.listen();
  return { updates, updater, sent, setAuto: (v) => { on = v; }, last: () => sent[sent.length - 1] };
}

test('manual: acha a versão nova e mostra o aviso; "Atualizar" baixa e reinicia na hora', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { updates, updater, last } = setup({ auto: false, latest: '2.3.0' });
  assert.deepEqual(await updates.check(), { result: 'available', version: '2.3.0', current: '2.2.2' });
  assert.equal(last().state, 'available');
  assert.equal(updater.downloads, 0, 'sem o automático, não baixa sozinho');
  updates.act();
  assert.equal(last().state, 'downloading');
  assert.ok(!last().background);
  updater.emit('update-downloaded', { version: '2.3.0' });
  assert.equal(last().state, 'installing');
  t.mock.timers.tick(1500);
  assert.deepEqual(updater.installs, [[true, true]], 'reinicia direto');
});

test('automático: baixa em segundo plano, avisa que está pronta e só reinicia pelo botão', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { updates, updater, sent, last } = setup({ auto: true, latest: '2.3.0' });
  assert.equal((await updates.check()).result, 'busy');
  assert.equal(updater.downloads, 1, 'baixa sozinho assim que acha');
  assert.ok(sent.every((s) => s.state !== 'available'), 'não mostra "Saiu a versão" antes de baixar');
  assert.equal(last().state, 'downloading');
  assert.equal(last().background, true, 'baixando em segundo plano (a sala não mostra)');
  updater.emit('download-progress', { percent: 40 });
  assert.equal(last().background, true);
  updater.emit('update-downloaded', { version: '2.3.0' });
  assert.equal(last().state, 'ready');
  assert.equal(last().auto, true);
  t.mock.timers.tick(5000);
  assert.deepEqual(updater.installs, [], 'pronta: não reinicia sozinho');
  assert.deepEqual(await updates.check(), { result: 'ready', version: '2.3.0', current: '2.2.2' }, 'procurar de novo não baixa de novo');
  assert.equal(updater.downloads, 1);
  updates.act();
  assert.equal(last().state, 'installing');
  t.mock.timers.tick(800);
  assert.deepEqual(updater.installs, [[true, true]]);
});

test('automático: uma versão ainda mais nova depois da pronta baixa de novo', async () => {
  const { updates, updater, last } = setup({ auto: true, latest: '2.3.0' });
  await updates.check();
  updater.emit('update-downloaded', { version: '2.3.0' });
  updater.latest = '2.3.1';
  await updates.check();
  assert.equal(updater.downloads, 2);
  updater.emit('update-downloaded', { version: '2.3.1' });
  assert.deepEqual([last().state, last().version], ['ready', '2.3.1']);
});

test('automático: se o download em segundo plano falhar, mostra o aviso normal', async () => {
  const { updates, updater, last } = setup({ auto: true, latest: '2.3.0' });
  await updates.check();
  updater.emit('error', new Error('caiu'));
  assert.deepEqual([last().state, last().version], ['available', '2.3.0']);
});

test('ligar o automático com o aviso já na tela: baixa na hora', async () => {
  const { updates, updater, setAuto, last } = setup({ auto: false, latest: '2.3.0' });
  await updates.check();
  assert.equal(last().state, 'available');
  setAuto(true);
  updates.autoChanged();
  assert.equal(updater.downloads, 1);
  assert.equal(last().background, true);
});

test('sem versão nova: está atualizado; sem internet: erro; uma procura por vez', async () => {
  const { updates, updater } = setup({ auto: true });
  assert.deepEqual(await updates.check(), { result: 'current', current: '2.2.2' });
  updater.fail = true;
  assert.equal((await updates.check()).result, 'error');
  updater.fail = false;
  let calls = 0;
  const original = updater.checkForUpdates;
  updater.checkForUpdates = async () => { calls += 1; return original(); };
  const [a, b] = await Promise.all([updates.check(), updates.check()]);
  assert.equal(calls, 1, 'dois cliques juntos: uma procura só');
  assert.deepEqual(a, b);
});

test('procura a cada 15 minutos e ao voltar pro app (se faz mais de 5 minutos)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { updates, updater } = setup({ auto: false });
  let calls = 0;
  const original = updater.checkForUpdates;
  updater.checkForUpdates = async () => { calls += 1; return original(); };
  updates.start();
  t.mock.timers.tick(8000); await new Promise(setImmediate);
  assert.equal(calls, 1, 'ao abrir');
  t.mock.timers.tick(60 * 1000); fakeApp.emit('browser-window-focus'); await new Promise(setImmediate);
  assert.equal(calls, 1, 'voltou pro app logo depois: não procura de novo');
  t.mock.timers.tick(5 * 60 * 1000); fakeApp.emit('browser-window-focus'); await new Promise(setImmediate);
  assert.equal(calls, 2, 'voltou depois de 5 minutos: procura');
  t.mock.timers.tick(15 * 60 * 1000); await new Promise(setImmediate);
  assert.equal(calls, 3, 'a cada 15 minutos');
  updater.fail = true;
  t.mock.timers.tick(15 * 60 * 1000); await new Promise(setImmediate);
  assert.equal(calls, 4);
  updater.fail = false;
  t.mock.timers.tick(60 * 1000); await new Promise(setImmediate);
  assert.equal(calls, 5, 'falhou: tenta de novo em 1 minuto');
  fakeApp.removeAllListeners('browser-window-focus');
});
