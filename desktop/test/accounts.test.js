const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAccounts } = require('../../server/accounts');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wss-acc-')), 'accounts.json');
const quiet = () => {};

test('contas: Admin criado uma vez, com senha no log; entra e troca a senha no primeiro acesso', async () => {
  const file = tempFile();
  const lines = [];
  const acc = createAccounts({ file, log: (l) => lines.push(l) });
  const root = await acc.ensureRoot();
  assert.equal(root.nick, 'Admin');
  assert.ok(lines.some((l) => l.includes(root.password)), 'a senha aparece no log');
  assert.equal(await acc.ensureRoot(), null, 'na segunda vez não cria de novo');
  const login = await acc.login('admin', root.password, 'ip1');
  assert.equal(login.ok, true);
  assert.equal(login.account.root, true);
  assert.equal(login.account.mustChange, true);
  assert.equal((await acc.changePassword(login.account.id, { next: '123' })).error, 'A senha precisa de pelo menos 6 caracteres.');
  assert.equal((await acc.changePassword(login.account.id, { next: root.password })).error, 'A senha nova precisa ser diferente da atual.');
  assert.equal((await acc.changePassword(login.account.id, { next: 'minha-senha', keepToken: login.token })).ok, true);
  assert.equal(acc.resume(login.token).mustChange, false, 'a sessão atual continua');
  // Depois do primeiro acesso, trocar exige a atual.
  assert.equal((await acc.changePassword(login.account.id, { current: 'errada', next: 'outra-senha' })).error, 'A senha atual não confere.');
  // Lê de novo do arquivo (o servidor reiniciou): tudo continua.
  acc.flush();
  const again = createAccounts({ file, log: quiet });
  assert.equal(again.resume(login.token).nick, 'Admin');
  assert.equal((await again.login('Admin', 'minha-senha', 'ip1')).ok, true);
  // Reset (variável ADMIN_RESET_PASSWORD): senha nova e as sessões caem.
  const reset = await again.ensureRoot({ reset: true });
  assert.notEqual(reset.password, root.password);
  assert.equal(again.resume(login.token), null);
});

test('contas: nick único (sem diferenciar maiúsculas), criar, renomear, apagar', async () => {
  const acc = createAccounts({ file: tempFile(), log: quiet });
  await acc.ensureRoot();
  const ana = await acc.create({ nick: 'Ana', password: 'senha-ana' });
  assert.equal(ana.ok, true);
  assert.equal(ana.account.mustChange, true, 'conta nova: troca a senha no primeiro acesso');
  assert.equal((await acc.create({ nick: '  ana ', password: 'outra-senha' })).error, 'Já existe uma conta com esse nick.');
  assert.equal((await acc.create({ nick: 'ADMIN', password: 'outra-senha' })).error, 'Já existe uma conta com esse nick.');
  assert.equal((await acc.create({ nick: '', password: 'outra-senha' })).error, 'Escolha um nick.');
  assert.equal((await acc.create({ nick: 'Bia', password: '12' })).error, 'A senha precisa de pelo menos 6 caracteres.');
  const bia = await acc.create({ nick: 'Bia', password: 'senha-bia', admin: true });
  assert.equal(bia.account.admin, true);
  assert.equal(acc.rename(bia.account.id, 'ANA').error, 'Já existe uma conta com esse nick.');
  assert.equal(acc.rename(bia.account.id, 'bia').ok, true, 'o próprio nick com outra caixa pode');
  assert.equal(acc.rename(bia.account.id, 'Beatriz').account.nick, 'Beatriz');
  assert.equal((await acc.login('beatriz', 'senha-bia', 'ip')).ok, true);
  const root = acc.list().find((a) => a.root);
  assert.equal(acc.remove(root.id).error, 'A conta Admin não pode ser apagada.');
  assert.equal((await acc.update(root.id, { admin: false })).account.admin, true, 'o Admin não perde a administração');
  const session = await acc.login('Ana', 'senha-ana', 'ip');
  assert.equal(acc.remove(ana.account.id).ok, true);
  assert.equal(acc.resume(session.token), null, 'apagou: a sessão cai');
  assert.equal((await acc.login('Ana', 'senha-ana', 'ip')).error, 'Nick ou senha errados.');
});

test('contas: reset de senha pelo painel, sessões, chave do OBS e limite de tentativas', async () => {
  const acc = createAccounts({ file: tempFile(), log: quiet });
  const { account } = await acc.create({ nick: 'Caio', password: 'senha-caio' });
  const first = await acc.login('Caio', 'senha-caio', 'ip');
  await acc.changePassword(account.id, { next: 'senha-nova-caio', keepToken: first.token });
  assert.equal((await acc.update(account.id, { password: 'provisoria' })).account.mustChange, true);
  assert.equal(acc.resume(first.token), null, 'senha resetada: as sessões caem');
  const key = acc.obsKeyOf(account.id);
  assert.ok(key && key.length >= 20);
  assert.equal(acc.byObsKey(key).nick, 'Caio');
  assert.equal(acc.byObsKey('x'.repeat(key.length)), null);
  const second = await acc.login('Caio', 'provisoria', 'ip');
  acc.logout(second.token);
  assert.equal(acc.resume(second.token), null, 'saiu: a sessão some');
  for (let i = 0; i < 10; i += 1) await acc.login('Caio', 'errada', 'atacante');
  assert.match((await acc.login('Caio', 'provisoria', 'atacante')).error, /Muitas tentativas/);
  assert.equal((await acc.login('Caio', 'provisoria', 'outro-ip')).ok, true, 'outro endereço continua podendo');
});

test('contas: usuário de testes (marca guardada, o Admin nunca é de testes)', async () => {
  const file = tempFile();
  const acc = createAccounts({ file, log: quiet });
  await acc.ensureRoot();
  const tess = await acc.create({ nick: 'Tess', password: 'senha-tess', tester: true });
  assert.equal(tess.account.tester, true);
  assert.equal(tess.account.admin, false, 'de testes não é administração');
  assert.equal((await acc.create({ nick: 'Comum', password: 'senha-comum' })).account.tester, false);
  assert.equal((await acc.update(tess.account.id, { admin: true })).account.tester, true, 'dar administração não tira a marca');
  assert.equal((await acc.update(tess.account.id, { tester: false })).account.tester, false);
  await acc.update(tess.account.id, { tester: true });
  const root = acc.list().find((a) => a.root);
  assert.equal((await acc.update(root.id, { tester: true })).account.tester, false, 'o Admin nunca é de testes');
  acc.flush();
  const again = createAccounts({ file, log: quiet });
  assert.equal(again.byNick('tess').tester, true, 'a marca fica salva no arquivo');
  assert.equal((await again.login('Tess', 'senha-tess', 'ip')).account.tester, true);
});
