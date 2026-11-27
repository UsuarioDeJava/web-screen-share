// WSS Câmera: a porta do app do PC (pareamento, WHIP e quando abre). O repasse pra sala
// (obs-local) e a pergunta "Conectar a câmera?" são de mentira.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCameraLocal, localAddresses } = require('../camera-local');

function setup({ answer = true, askTimeout = 500 } = {}) {
  let stored = [];
  const asked = [];
  let session = null;
  const obs = {
    on: true,
    ready: () => obs.on,
    session: () => session,
    started: [],
    async start(body, input) {
      if (session) return null;
      if (/sem-h264/.test(body)) throw Error('Configure o OBS para AV1 ou H.264 e áudio Opus.');
      obs.started.push({ body, input });
      session = { id: '11111111-2222-3333-4444-555555555555', source: 'camera' };
      return { row: session, answer: 'v=0 resposta' };
    },
    endSession(id) { if (session && session.id === id) { session = null; return true; } return false; },
  };
  const camera = createCameraLocal({
    obs, port: 0, host: '127.0.0.1', askTimeout, name: () => 'PC da Ana', addresses: () => ['192.168.0.10', '100.64.1.2'],
    devices: { list: () => stored, save: (list) => { stored = list; } },
    ask: (device, signal) => new Promise((resolve) => {
      asked.push(device);
      if (answer === 'wait') signal.addEventListener('abort', () => resolve(false));
      else setTimeout(() => resolve(answer), 20);
    }),
  });
  const base = () => `http://127.0.0.1:${camera.address().port}`;
  const call = async (path, { method = 'GET', body, token, type, origin } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (type) headers['Content-Type'] = type;
    if (origin) headers.Origin = origin;
    const res = await fetch(base() + path, { method, headers, body });
    return { status: res.status, text: await res.text(), location: res.headers.get('location') };
  };
  return { camera, obs, call, asked, stored: () => stored, end: () => camera.close() };
}

const codeOf = (url) => new URL(url.replace('wsscam://', 'http://x/')).searchParams.get('c');

test('a porta só abre com o app na sala e (câmera pareada ou QR aberto)', async () => {
  const t = setup();
  t.camera.room(true);
  assert.equal(t.camera.isOpen(), false, 'na sala, sem câmera nem QR: fechada (sem aviso do firewall)');
  const qr = t.camera.pairing();
  await t.camera.ready();
  assert.equal(t.camera.isOpen(), true, 'abriu o QR: abre');
  assert.match(qr.url, /^wsscam:\/\/pair\?h=192\.168\.0\.10,100\.64\.1\.2&p=\d+&c=[A-Za-z0-9_-]{32}$/);
  assert.equal(qr.inRoom, true);
  t.camera.room(false);
  assert.equal(t.camera.isOpen(), false, 'saiu da sala: fecha');
  t.end();
});

test('GET /camera acha o PC; com Origin (página da web), recusa', async () => {
  const t = setup();
  t.camera.room(true); t.camera.pairing(); await t.camera.ready();
  const found = await t.call('/camera');
  assert.equal(found.status, 200);
  assert.deepEqual(JSON.parse(found.text), { app: 'wss-camera', name: 'PC da Ana', version: 1 });
  assert.equal((await t.call('/camera', { origin: 'http://site.mal' })).status, 403);
  t.end();
});

test('pareamento pelo QR: na hora, uso único; código errado não', async () => {
  const t = setup();
  t.camera.room(true);
  const code = codeOf(t.camera.pairing().url);
  await t.camera.ready();
  const json = (o) => JSON.stringify(o);
  assert.equal((await t.call('/camera/pair', { method: 'POST', body: json({ device: 'Moto G', code: 'errado' }) })).status, 403);
  const ok = await t.call('/camera/pair', { method: 'POST', body: json({ device: 'Moto G\u0007', code }) });
  assert.equal(ok.status, 200);
  const { token, name } = JSON.parse(ok.text);
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(name, 'PC da Ana');
  assert.equal(t.asked.length, 0, 'pelo QR não pergunta nada');
  assert.equal((await t.call('/camera/pair', { method: 'POST', body: json({ device: 'Outro', code }) })).status, 403, 'o mesmo código não serve de novo');
  const [device] = t.stored();
  assert.equal(device.name, 'Moto G');
  assert.equal(device.tokenHash.length, 64);
  assert.ok(!JSON.stringify(t.stored()).includes(token), 'guarda só o hash do token');
  assert.deepEqual(t.camera.devices().map((d) => d.name), ['Moto G']);
  t.end();
});

test('pareamento pelo IP: o PC pergunta (Conectar, Recusar, ninguém respondeu, um por vez)', async () => {
  const body = JSON.stringify({ device: 'Galaxy' });
  let t = setup({ answer: true });
  t.camera.room(true); t.camera.pairing(); await t.camera.ready();
  const ok = await t.call('/camera/pair', { method: 'POST', body });
  assert.equal(ok.status, 200);
  assert.deepEqual(t.asked, ['Galaxy']);
  t.end();

  t = setup({ answer: false });
  t.camera.room(true); t.camera.pairing(); await t.camera.ready();
  const no = await t.call('/camera/pair', { method: 'POST', body });
  assert.deepEqual([no.status, no.text], [403, 'Recusado no PC.']);
  assert.equal((await t.call('/camera/pair', { method: 'POST', body })).status, 429, 'recusou: o mesmo celular espera pra pedir de novo');
  t.end();

  t = setup({ answer: 'wait', askTimeout: 300 });
  t.camera.room(true); t.camera.pairing(); await t.camera.ready();
  const first = t.call('/camera/pair', { method: 'POST', body });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await t.call('/camera/pair', { method: 'POST', body: JSON.stringify({ device: 'Intruso' }) })).status, 429, 'uma pergunta por vez');
  assert.equal((await first).status, 408, 'ninguém respondeu');
  assert.equal(t.stored().length, 0);
  t.end();
});

test('WHIP: com o token, publica (portas UDP da câmera); sem, 401; ocupado, 409; fora da sala, 503', async () => {
  const t = setup();
  t.camera.room(true);
  const code = codeOf(t.camera.pairing().url);
  await t.camera.ready();
  const { token } = JSON.parse((await t.call('/camera/pair', { method: 'POST', body: JSON.stringify({ device: 'Moto G', code }) })).text);
  const offer = 'v=0 oferta h264';
  assert.equal((await t.call('/camera/whip', { method: 'POST', body: offer, type: 'application/sdp' })).status, 401);
  assert.equal((await t.call('/camera/whip', { method: 'POST', body: offer, type: 'application/sdp', token: 'a'.repeat(64) })).status, 401);
  assert.equal((await t.call('/camera/whip', { method: 'POST', body: offer, type: 'text/plain', token })).status, 415);
  t.obs.on = false;
  const out = await t.call('/camera/whip', { method: 'POST', body: offer, type: 'application/sdp', token });
  assert.deepEqual([out.status, out.text], [503, 'Entre na sala no app.']);
  t.obs.on = true;
  const bad = await t.call('/camera/whip', { method: 'POST', body: 'sem-h264', type: 'application/sdp', token });
  assert.deepEqual([bad.status, bad.text], [400, 'Câmera incompatível: precisa de vídeo H.264.']);
  const res = await t.call('/camera/whip', { method: 'POST', body: offer, type: 'application/sdp', token });
  assert.equal(res.status, 201);
  assert.equal(res.text, 'v=0 resposta');
  assert.equal(res.location, '/camera/session/11111111-2222-3333-4444-555555555555');
  assert.deepEqual(t.obs.started[0].input, { portRangeBegin: 38220, portRangeEnd: 38230 });
  const busy = await t.call('/camera/whip', { method: 'POST', body: offer, type: 'application/sdp', token });
  assert.deepEqual([busy.status, busy.text], [409, 'O OBS ou outra câmera já está transmitindo.']);
  assert.equal((await t.call(res.location, { method: 'DELETE' })).status, 401);
  assert.equal((await t.call(res.location, { method: 'DELETE', token })).status, 200);
  assert.equal(t.obs.session(), null, 'DELETE encerra a publicação');
  t.end();
});

test('Remover a câmera: o token deixa de valer e a transmissão dela acaba', async () => {
  const t = setup();
  t.camera.room(true);
  const code = codeOf(t.camera.pairing().url);
  await t.camera.ready();
  const { token } = JSON.parse((await t.call('/camera/pair', { method: 'POST', body: JSON.stringify({ device: 'Moto G', code }) })).text);
  assert.equal((await t.call('/camera/whip', { method: 'POST', body: 'v=0', type: 'application/sdp', token })).status, 201);
  assert.equal(t.camera.remove(t.camera.devices()[0].id), true);
  assert.equal(t.obs.session(), null);
  assert.equal(t.camera.isOpen(), false, 'sem câmera e sem QR: a porta fecha');
  t.camera.pairing(); await t.camera.ready();
  assert.equal((await t.call('/camera/whip', { method: 'POST', body: 'v=0', type: 'application/sdp', token })).status, 401, 'removida: volta pro pareamento');
  t.end();
});

test('IPs do QR: rede de casa primeiro, sem loopback nem 169.254', () => {
  assert.deepEqual(localAddresses({
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    tailscale0: [{ address: '100.101.102.103', family: 'IPv4', internal: false }],
    eth0: [{ address: '192.168.0.10', family: 'IPv4', internal: false }, { address: 'fe80::1', family: 'IPv6', internal: false }],
    apipa: [{ address: '169.254.3.4', family: 'IPv4', internal: false }],
  }), ['192.168.0.10', '100.101.102.103']);
});
