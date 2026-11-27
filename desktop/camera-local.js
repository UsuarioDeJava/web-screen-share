// WSS Câmera: o celular transmite a câmera pela rede local, entrando como o OBS local
// (obs-local.js), por outra porta e aberta na rede. Protocolo: PROTOCOLO.md da branch
// mobile-camera-app.
// - GET  /camera                 acha o PC (sem senha).
// - POST /camera/pair            pareia: pelo código do QR (na hora) ou pelo IP digitado
//                                (o PC pergunta "Conectar a câmera ...?").
// - POST /camera/whip            oferta WHIP com o token do pareamento.
// - DELETE /camera/session/<id>  encerra.
// Só fica aberta com o app na sala e a publicação pronta (a mesma hora que o OBS local), e
// só se tiver câmera pareada ou o QR aberto nas Configurações: quem não usa a câmera não
// vê o aviso do firewall do Windows.
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');

const PORT = 38219;
const MEDIA_PORTS = [38220, 38230]; // UDP do vídeo (pra liberar no firewall)
const CODE_TTL = 10 * 60 * 1000;
const ASK_TIMEOUT = 60 * 1000;
const ASK_COOLDOWN = 30 * 1000; // recusou: o mesmo endereço espera pra pedir de novo
const MAX_DEVICES = 20;

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const cleanName = (value) => (typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 60) : '') || 'Celular';

// IPv4 da rede: primeiro os da rede de casa (192.168, 10, 172.16-31), depois o resto
// (Tailscale e afins). Sem loopback e sem 169.254.
function localAddresses(interfaces = os.networkInterfaces()) {
  const found = [];
  for (const list of Object.values(interfaces)) {
    for (const item of list || []) {
      if (item.internal || (item.family !== 'IPv4' && item.family !== 4) || item.address.startsWith('169.254.')) continue;
      if (!found.includes(item.address)) found.push(item.address);
    }
  }
  const home = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return [...found.filter(home), ...found.filter((ip) => !home(ip))];
}

// devices: { list(), save(list) } com [{ id, name, tokenHash, addedAt }].
// ask(device, signal): pergunta no PC se aceita (true/false); signal cancela a pergunta.
function createCameraLocal({ obs, devices, ask, name = () => os.hostname(), onChange = () => {}, port = PORT, mediaPorts = MEDIA_PORTS,
  addresses = localAddresses, askTimeout = ASK_TIMEOUT, host = '0.0.0.0' }) {
  let listener = null;
  let opening = null;
  let code = null; // { value, until }
  let asking = null; // { address }
  const cooldown = new Map(); // endereço -> até quando
  let sessionDevice = null; // { session, device }
  let inRoom = false;
  let codeTimer = null;

  const findDevice = (token) => {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const hash = Buffer.from(sha256(token), 'hex');
    return devices.list().find((d) => {
      const stored = Buffer.from(String(d.tokenHash || ''), 'hex');
      return stored.length === hash.length && crypto.timingSafeEqual(stored, hash);
    }) || null;
  };
  const bearer = (req) => /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1] || null;

  function addDevice(device) {
    const token = crypto.randomBytes(32).toString('hex');
    const list = [...devices.list(), { id: crypto.randomUUID(), name: cleanName(device), tokenHash: sha256(token), addedAt: Date.now() }];
    devices.save(list.slice(-MAX_DEVICES));
    onChange();
    sync();
    return token;
  }

  async function readBody(req, limit) {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > limit) return null;
    }
    return body;
  }

  async function pair(req, reply, res) {
    const raw = await readBody(req, 4096);
    if (raw === null) return reply(413, 'Pedido grande demais.');
    let msg = {};
    try { msg = JSON.parse(raw || '{}'); } catch { return reply(400, 'Pedido inválido.'); }
    const device = cleanName(msg && msg.device);
    const json = (token) => reply(200, JSON.stringify({ token, name: name() }), 'application/json');
    if (typeof msg.code === 'string' && msg.code) {
      const given = Buffer.from(msg.code);
      const valid = code && Date.now() < code.until && given.length === code.value.length && crypto.timingSafeEqual(given, code.value);
      if (!valid) return reply(403, 'Código vencido. Abra o QR de novo no PC.');
      code = null; // uso único
      return json(addDevice(device));
    }
    // IP digitado: o PC pergunta. Um pedido por vez; recusou, o mesmo endereço espera.
    const address = req.socket.remoteAddress || '';
    if (asking) return reply(429, 'Já tem um pedido esperando no PC.');
    if ((cooldown.get(address) || 0) > Date.now()) return reply(429, 'Recusado no PC. Espere um pouco.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), askTimeout);
    asking = { address };
    res.once('close', () => { if (!res.writableEnded) controller.abort(); }); // o celular desistiu
    let accepted = null;
    try { accepted = await ask(device, controller.signal); } catch { accepted = null; }
    finally { clearTimeout(timer); asking = null; }
    if (controller.signal.aborted && accepted !== true) return reply(408, 'Ninguém respondeu no PC.');
    if (!accepted) {
      cooldown.set(address, Date.now() + ASK_COOLDOWN);
      return reply(403, 'Recusado no PC.');
    }
    return json(addDevice(device));
  }

  async function whip(req, reply, res) {
    const device = findDevice(bearer(req));
    if (!device) return reply(401, 'Câmera não pareada. Pareie de novo.');
    if (!/^application\/sdp\b/i.test(req.headers['content-type'] || '')) return reply(415, 'Formato inválido.');
    if (!obs.ready()) return reply(503, 'Entre na sala no app.');
    if (obs.session()) return reply(409, 'O OBS ou outra câmera já está transmitindo.');
    const body = await readBody(req, 65536);
    if (body === null) return reply(413, 'Oferta grande demais.');
    let started;
    try {
      started = await obs.start(body, { portRangeBegin: mediaPorts[0], portRangeEnd: mediaPorts[1] });
    } catch (err) {
      const text = /H\.264|AV1|Opus|Oferta/.test(String(err && err.message)) ? 'Câmera incompatível: precisa de vídeo H.264.'
        : /recusou/.test(String(err && err.message)) ? 'A sala recusou a câmera.' : 'Falha ao conectar a câmera.';
      return reply(400, text);
    }
    if (!started) return reply(409, 'O OBS ou outra câmera já está transmitindo.');
    if (res.destroyed) { obs.endSession(started.row.id); return; }
    sessionDevice = { session: started.row.id, device: device.id };
    res.writeHead(201, { 'Content-Type': 'application/sdp', Location: `/camera/session/${started.row.id}` }).end(started.answer);
  }

  async function request(req, res) {
    const reply = (status, text = '', type = 'text/plain; charset=utf-8') => {
      if (!res.destroyed && !res.headersSent) res.writeHead(status, { 'Content-Type': type }).end(text);
    };
    // Página da web nenhuma fala com a câmera (igual ao OBS local).
    if (req.headers.origin) return reply(403, 'Origem não permitida.');
    const url = String(req.url || '').split('?')[0];
    if (url === '/camera' && req.method === 'GET') {
      return reply(200, JSON.stringify({ app: 'wss-camera', name: name(), version: 1 }), 'application/json');
    }
    if (url === '/camera/pair' && req.method === 'POST') return pair(req, reply, res);
    if (url === '/camera/whip' && req.method === 'POST') return whip(req, reply, res);
    const session = /^\/camera\/session\/([a-f0-9-]{36})$/i.exec(url)?.[1];
    if (session && req.method === 'DELETE') {
      const device = findDevice(bearer(req));
      if (!device) return reply(401, 'Câmera não pareada. Pareie de novo.');
      const mine = sessionDevice && sessionDevice.session === session && sessionDevice.device === device.id;
      if (mine && obs.endSession(session)) sessionDevice = null;
      return reply(mine ? 200 : 404, mine ? '' : 'Sessão não encontrada.');
    }
    return reply(404, 'Não encontrado.');
  }

  // Abre com o app na sala e (câmera pareada ou QR valendo); fecha fora disso.
  function sync() {
    const wanted = inRoom && (devices.list().length > 0 || Boolean(code && Date.now() < code.until));
    if (wanted && !listener) open().catch((err) => console.error('Porta da câmera:', err && err.message));
    else if (!wanted && listener) close();
  }

  async function open() {
    if (listener) return opening;
    const server = listener = http.createServer({ requestTimeout: ASK_TIMEOUT + 15000 }, (req, res) => {
      request(req, res).catch(() => { if (!res.headersSent && !res.destroyed) res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Falha ao conectar a câmera.'); });
    });
    opening = new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    try { await opening; } catch (err) { if (listener === server) listener = null; throw err; }
    return opening;
  }

  function close() {
    if (!listener) return;
    const server = listener;
    listener = null;
    server.close();
    server.closeAllConnections();
  }

  const deviceList = () => devices.list().map((d) => ({ id: d.id, name: d.name, addedAt: d.addedAt }));

  return {
    // O app entrou na sala com a publicação pronta (ou saiu).
    room(on) {
      inRoom = Boolean(on);
      sync();
    },
    close() {
      inRoom = false;
      close();
    },
    // Pras Configurações: o QR (código novo a cada vez, uso único, 10 min), os IPs e as câmeras.
    pairing() {
      code = { value: Buffer.from(crypto.randomBytes(24).toString('base64url')), until: Date.now() + CODE_TTL };
      clearTimeout(codeTimer);
      codeTimer = setTimeout(sync, CODE_TTL + 1000);
      codeTimer.unref?.();
      sync();
      const ips = addresses();
      return {
        inRoom,
        ips,
        port,
        url: `wsscam://pair?h=${ips.join(',')}&p=${port}&c=${code.value.toString()}`,
        devices: deviceList(),
      };
    },
    devices: deviceList,
    remove(id) {
      const list = devices.list();
      const next = list.filter((d) => d.id !== id);
      if (next.length === list.length) return false;
      devices.save(next);
      if (sessionDevice && sessionDevice.device === id) { obs.endSession(sessionDevice.session); sessionDevice = null; }
      onChange();
      sync();
      return true;
    },
    isOpen: () => Boolean(listener),
    ready: () => opening,
    address: () => listener?.address() || null,
  };
}

module.exports = { createCameraLocal, localAddresses, PORT, MEDIA_PORTS };
