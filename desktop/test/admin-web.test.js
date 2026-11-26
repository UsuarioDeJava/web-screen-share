const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAdmin } = require('../../server/admin');
const { createRoomConfig } = require('../../server/room-config');

async function panel(t, password) {
  const app = express();
  const router = express.Router();
  const users = new Map([['guest', { id: 'guest', name: 'Admin' }]]);
  const target = { id: 'guest', emit() {} };
  const changes = [];
  createAdmin({ router, password, config: createRoomConfig(), users,
    io: { sockets: { sockets: new Map([['guest', target]]) } },
    removeUser: socket => users.delete(socket.id), clearChat: () => changes.push('chat'),
    onSettings: patch => changes.push(patch), logEvent() {}, version: 'test', obsAvailable: false });
  app.use('/admin', router);
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/admin';
  const api = (action, data, cookie = '') => fetch(base + '/api/' + action,
    data === undefined ? { headers: { cookie } } : {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'X-WSS-Admin': '1' },
      body: JSON.stringify(data),
    });
  return { base, api, users, changes };
}

test('painel separado exige senha, aplica ações e revoga a sessão ao sair', async t => {
  const { base, api, users, changes } = await panel(t, 'senha-de-teste');
  assert.match(await (await fetch(base)).text(), /id="admin-login"/);
  assert.equal((await api('state')).status, 401);
  assert.equal((await api('settings', { settings: { roomName: 'Teste' } })).status, 401);
  assert.equal((await api('login', { password: 'incorreta' })).status, 401);
  const login = await api('login', { password: 'senha-de-teste' });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  const cookie = setCookie.split(';')[0];
  const post = (action, data = {}) => api(action, data, cookie);
  assert.equal((await post('settings', { settings: { roomName: 'Sala nova', control: false } })).status, 200);
  const state = await (await api('state', undefined, cookie)).json();
  assert.equal(state.settings.roomName, 'Sala nova');
  assert.equal(state.online[0].name, 'Admin');
  assert.equal((await post('kick', { id: 'guest' })).status, 200);
  assert.equal(users.size, 0);
  assert.equal((await post('chat-clear')).status, 200);
  assert.deepEqual(changes, [{ roomName: 'Sala nova', control: false }, 'chat']);
  assert.equal((await post('logout')).status, 200);
  assert.equal((await api('state', undefined, cookie)).status, 401);
});

test('painel sem senha configurada mantém o acesso administrativo fechado', async t => {
  const { api } = await panel(t, '');
  assert.equal((await api('login', { password: '' })).status, 503);
  assert.equal((await api('state')).status, 503);
});
