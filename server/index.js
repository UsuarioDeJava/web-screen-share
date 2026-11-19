const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { setupObs } = require('./obs');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const VERSION = process.env.APP_VERSION || 'dev';
const LOCAL_TURN_SECRET = process.env.LOCAL_TURN_SECRET;
const LOCAL_TURN_PORT = Number(process.env.LOCAL_TURN_PORT) || 3478;
// Porta em que o app está publicado no servidor (o lado "Host" do mapeamento). Só
// precisa ser definida quando a página é aberta por um proxy reverso (Caddy, nginx…)
// numa porta diferente: o TURN não passa pelo proxy e precisa ir direto nesta porta.
const PUBLIC_PORT = /^\d+$/.test(process.env.PUBLIC_PORT || '') ? process.env.PUBLIC_PORT : null;
const DISPLAY_PORT = PUBLIC_PORT || PORT;
const MEDIAMTX_WEBRTC_URL = process.env.MEDIAMTX_WEBRTC_URL;
const MEDIAMTX_API_URL = process.env.MEDIAMTX_API_URL;

// Linhas de evento com data e hora (UTC, no mesmo formato do log do MediaMTX), pra
// dar pra cruzar os dois quando algo cai.
function logEvent(message) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19).replace(/-/g, '/');
  console.log(`${stamp} ${message}`);
}

function formatDuration(ms) {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h} h ${m} min`;
  if (m) return `${m} min ${s} s`;
  return `${s} s`;
}

// Um erro inesperado numa requisição não pode derrubar o servidor inteiro (isso
// reiniciaria o container e derrubaria todo mundo, OBS inclusive).
process.on('unhandledRejection', (err) => {
  logEvent(`ERRO inesperado (o servidor continua rodando): ${err && err.stack ? err.stack : err}`);
});

const app = express();
app.get('/js/gamepad-view.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'gamepad-view.js')));
app.get('/js/gamepad.css', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'gamepad.css')));
app.get('/js/gamepad-client.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'gamepad-client.js')));
app.get('/js/gamepad.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'gamepad.js')));
// Arquivos que a sala e o app usam iguais (desktop/shared): gamepads, cores e estilos do mouse.
app.get('/js/color.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'color.js')));
app.get('/js/fx.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'fx.js')));
app.get('/js/fx-image.js', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'fx-image.js')));
app.get('/css/fx.css', (_req, res) => res.sendFile(path.join(__dirname, '..', 'desktop', 'shared', 'fx.css')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Fotos de perfil (PNG, JPG, WebP ou GIF animado), guardadas na memória pelo hash do
// conteúdo enquanto alguém usa: o endereço nunca muda pra mesma foto, então o navegador
// guarda em cache. Quem entra manda a foto de novo (ela fica salva no navegador).
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const avatars = new Map(); // hash -> { buf, type, refs }

function avatarType(buf) {
  if (buf.length < 12) return null;
  if (buf.slice(0, 6).toString('latin1') === 'GIF87a' || buf.slice(0, 6).toString('latin1') === 'GIF89a') return 'image/gif';
  if (buf[0] === 0x89 && buf.slice(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// Guarda (ou conta mais um uso) e devolve o hash.
function storeAvatar(buf, type) {
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
  const entry = avatars.get(hash);
  if (entry) entry.refs += 1;
  else avatars.set(hash, { buf, type, refs: 1 });
  return hash;
}

// Largura e altura (sem abrir a imagem): pras imagens do estilo, que têm limite de tamanho.
const FX_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const FX_IMAGE_MAX_SIDE = 256;
function imageSize(buf, type) {
  try {
    if (type === 'image/png') return buf.length >= 24 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null;
    if (type === 'image/gif') return [buf.readUInt16LE(6), buf.readUInt16LE(8)];
    if (type === 'image/webp') {
      const chunk = buf.slice(12, 16).toString('latin1');
      if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
      if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
      if (chunk === 'VP8L') {
        const bits = buf.readUInt32LE(21);
        return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
      }
      return null;
    }
    if (type === 'image/jpeg') {
      let o = 2;
      while (o + 9 < buf.length) {
        if (buf[o] !== 0xff) return null;
        const marker = buf[o + 1];
        const len = buf.readUInt16BE(o + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)];
        o += 2 + len;
      }
    }
  } catch {}
  return null;
}

function releaseAvatar(hash) {
  const entry = hash && avatars.get(hash);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) avatars.delete(hash);
}

app.get('/avatar/:hash', (req, res) => {
  const entry = avatars.get(req.params.hash);
  if (!entry) {
    res.status(404).end();
    return;
  }
  res.set({ 'Content-Type': entry.type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.send(entry.buf);
});

app.get('/version', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ version: VERSION });
});

// Quando a conexão direta entre dois navegadores não sai (NAT, firewall, ou o
// navegador escondendo o próprio IP), a mídia precisa passar por um TURN. A imagem
// Docker traz um (coturn) atendendo na mesma porta do site; fora dela dá pra usar
// um próprio via TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL. Sem nenhum dos dois, fica
// o TURN público de testes (OpenRelay).
function buildIceServers(req) {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (LOCAL_TURN_SECRET) servers.push(localTurnServer(req));
  const defaultTurn = LOCAL_TURN_SECRET
    ? ''
    : 'turn:openrelay.metered.ca:80,turn:openrelay.metered.ca:443,turn:openrelay.metered.ca:443?transport=tcp';
  const turnUrls = (process.env.TURN_URLS || defaultTurn)
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (turnUrls.length > 0) {
    servers.push({
      urls: turnUrls,
      username: process.env.TURN_USERNAME || 'openrelayproject',
      credential: process.env.TURN_CREDENTIAL || 'openrelayproject',
    });
  }
  return servers;
}

// Credenciais temporárias no formato "TURN REST API" do coturn (--use-auth-secret):
// usuário = validade em segundos Unix, senha = HMAC-SHA1(segredo, usuário).
function turnCredentials() {
  const username = `${Math.floor(Date.now() / 1000) + 30 * 24 * 3600}:web-screen-share`;
  const credential = crypto.createHmac('sha1', LOCAL_TURN_SECRET).update(username).digest('base64');
  return { username, credential };
}

const splitHostPort = (value) => {
  const match = /^(.*):(\d+)$/.exec(value || '');
  return match ? { hostname: match[1], port: match[2] } : { hostname: value || '', port: null };
};

// Atrás de um proxy reverso o pedido chega com X-Forwarded-For (e o endereço original
// em X-Forwarded-Host), e a porta do endereço é a do proxy, não a deste servidor.
const viaProxy = (req) => Boolean(req.get('x-forwarded-for') || req.get('x-forwarded-host'));

// O TURN fica no mesmo host que abriu a página: por TCP na mesma porta do site e por
// UDP na porta UDP publicada (por padrão o mesmo número, ex.: 3000/udp).
function turnAddress(req) {
  const host = splitHostPort(req.get('host'));
  const forwarded = req.get('x-forwarded-host');
  // O proxy pode trocar o Host pelo endereço interno; o nome que o navegador usou vem
  // no X-Forwarded-Host.
  const { hostname } = forwarded ? splitHostPort(forwarded.split(',')[0].trim()) : host;
  const port = PUBLIC_PORT || host.port || String(req.secure ? 443 : 80);
  return { hostname, tcpPort: port, udpPort: process.env.TURN_UDP_PORT || port };
}

// Aberto por proxy sem PUBLIC_PORT: o TURN vai pra uma porta que provavelmente é a do
// proxy, que não repassa TURN. Avisa na página e no log (uma vez).
let proxyWarned = false;
function proxyWithoutPublicPort(req) {
  if (!LOCAL_TURN_SECRET || PUBLIC_PORT || !viaProxy(req)) return null;
  const { tcpPort } = turnAddress(req);
  if (!proxyWarned) {
    proxyWarned = true;
    console.log(`AVISO: a página foi aberta por um proxy reverso, e o TURN não passa por ele (está indo pra porta ${tcpPort}).`);
    console.log('  Defina a variável PUBLIC_PORT com a porta em que este app está publicado no servidor (veja o README).');
  }
  return { port: tcpPort };
}

function localTurnServer(req) {
  const { hostname, tcpPort, udpPort } = turnAddress(req);
  return {
    urls: [`turn:${hostname}:${udpPort}?transport=udp`, `turn:${hostname}:${tcpPort}?transport=tcp`],
    ...turnCredentials(),
  };
}

// Formato do cabeçalho Link de ICE server do WHIP, que o OBS lê.
function turnLink(req) {
  const { hostname, udpPort } = turnAddress(req);
  const { username, credential } = turnCredentials();
  return `<turn:${hostname}:${udpPort}?transport=udp>; rel="ice-server"; username="${username}"; credential="${credential}"`;
}

app.get('/ice-servers', (req, res) => {
  res.set('Cache-Control', 'no-store').json(buildIceServers(req));
});

// HTTPS via certificado do Tailscale (`tailscale cert`): necessário em redes
// mais restritivas onde o navegador do visualizador só faz WebRTC em contexto
// seguro. Defina TLS_CERT/TLS_KEY apontando pros arquivos .crt/.key gerados.
const TLS_CERT = process.env.TLS_CERT;
const TLS_KEY = process.env.TLS_KEY;
const useHttps = TLS_CERT && TLS_KEY && fs.existsSync(TLS_CERT) && fs.existsSync(TLS_KEY);

// Dados do certificado em uso: o nome vai pro log de início e a validade pra página,
// que avisa quando estiver perto de vencer (log quase ninguém olha).
function loadCertificate() {
  if (!useHttps) return null;
  try {
    const cert = new crypto.X509Certificate(fs.readFileSync(TLS_CERT));
    const names = (cert.subjectAltName || '')
      .split(', ')
      .filter((entry) => entry.startsWith('DNS:'))
      .map((entry) => entry.slice(4))
      .filter((name) => name !== 'localhost' && !name.startsWith('*'));
    return { names, expiresAt: new Date(cert.validTo).toISOString(), selfSigned: cert.issuer === cert.subject };
  } catch {
    return null;
  }
}

const certificate = loadCertificate();

app.get('/status', (req, res) => {
  res.set('Cache-Control', 'no-store').json({
    version: VERSION,
    certificate: certificate && !certificate.selfSigned
      ? { names: certificate.names, expiresAt: certificate.expiresAt }
      : null,
    obs: Boolean(obs),
    proxy: proxyWithoutPublicPort(req),
  });
});

const webServer = useHttps
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, app)
  : http.createServer(app);
// Mensagens de até 8 MB: a foto de perfil (até 5 MB) vai pelo socket (e, sem WebSocket,
// em base64, uns 33% maior).
const io = new Server(webServer, { maxHttpBufferSize: 8e6 });

// Uma porta só pra tudo, pra não precisar publicar outra no Docker/CasaOS: conexões
// que começam com uma mensagem STUN/TURN (magic cookie nos bytes 4-7) vão pro TURN
// local; o resto (TLS ou HTTP) é o site.
const STUN_MAGIC_COOKIE = 0x2112a442;

function isStunMessage(chunk) {
  return chunk.length >= 8 && chunk.readUInt32BE(4) === STUN_MAGIC_COOKIE;
}

function proxyToTurn(socket) {
  const upstream = net.connect(LOCAL_TURN_PORT, '127.0.0.1');
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on('error', close).on('close', close);
  socket.on('close', close);
  socket.pipe(upstream).pipe(socket);
}

const server = net.createServer((socket) => {
  socket.on('error', () => socket.destroy());
  socket.setTimeout(30000, () => socket.destroy());
  socket.once('data', (chunk) => {
    socket.setTimeout(0);
    socket.pause();
    socket.unshift(chunk);
    if (LOCAL_TURN_SECRET && isStunMessage(chunk)) proxyToTurn(socket);
    else webServer.emit('connection', socket);
    process.nextTick(() => socket.resume());
  });
});

function checkLocalTurn(attempt = 1) {
  const probe = net.connect(LOCAL_TURN_PORT, '127.0.0.1');
  probe.once('connect', () => {
    probe.destroy();
    console.log(`TURN embutido ativo na porta ${DISPLAY_PORT} (TCP e UDP): usado quando a conexão direta falha.`);
  });
  probe.once('error', () => {
    if (attempt < 10) setTimeout(() => checkLocalTurn(attempt + 1), 1000);
    else console.log('AVISO: o TURN embutido (coturn) não respondeu; conexões que dependem dele vão falhar.');
  });
}

const ROOM = 'sala';
const MAX_NAME_LENGTH = 24;

const users = new Map(); // socket.id -> { id, name, sharing, clientId }

function cleanName(raw) {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) : '';
}

function uniqueName(name) {
  const taken = new Set([...users.values()].map((u) => u.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let i = 2; ; i += 1) {
    const candidate = `${name} (${i})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// since: quando a transmissão começou (hora do servidor), pro tempo ao vivo nos quadros.
// voice: quem está no chat de voz, com o microfone/fone ligado ou não.
// color/hue/avatar/style: a cor, a foto e o estilo do mouse e das marcações que a pessoa
// escolheu. color é a cor exata (#rrggbb); hue, o tom dela (o app de antes da cor livre
// só entende o tom).
// cursorImg/pingImg: as imagens próprias da setinha e do ping (no mesmo lugar das fotos).
const publicUser = ({ id, name, sharing, kind, stream, since, startedAt, voice, hue, color, avatar, style, cursorImg, pingImg }) => {
  const user = kind ? { id, name, sharing, kind, stream } : { id, name, sharing };
  if (sharing) user.since = since || startedAt || null;
  if (voice) user.voice = voice;
  if (Number.isInteger(hue)) user.hue = hue;
  if (color) user.color = color;
  if (avatar) user.avatar = `/avatar/${avatar}`;
  if (style) user.style = style;
  if (cursorImg) user.cursorImg = `/avatar/${cursorImg}`;
  if (pingImg) user.pingImg = `/avatar/${pingImg}`;
  return user;
};

const cleanHue = (raw) => (Number.isInteger(raw) && raw >= 0 && raw < 360 ? raw : null);
const cleanColor = (raw) => (typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null);

// Estilo do mouse e das marcações (setinha, enfeite, rastro, clique, ping, pincel...). O
// que cada valor quer dizer fica com a página (public/js/fx.js, que ignora o que não
// conhece); aqui só confere o formato: chaves conhecidas, textos curtos.
const STYLE_KEYS = ['skin', 'size', 'deco', 'aura', 'trail', 'click', 'ping', 'emoji', 'pingSound', 'brush', 'width', 'outline'];
function cleanStyle(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of STYLE_KEYS) {
    if (typeof raw[key] === 'string' && /^[a-z0-9-]{1,16}$/i.test(raw[key])) out[key] = raw[key];
  }
  if (typeof raw.name === 'boolean') out.name = raw.name;
  // A ponta da setinha com imagem própria, em % da imagem.
  for (const key of ['hx', 'hy']) {
    if (Number.isInteger(raw[key]) && raw[key] >= 0 && raw[key] <= 100) out[key] = raw[key];
  }
  return Object.keys(out).length ? out : null;
}

const voiceState = (raw) => ({ muted: Boolean(raw && raw.muted), deafened: Boolean(raw && raw.deafened) });

// ---------- chat, reações e "apontar" ----------

const CHAT_HISTORY = 100;
const CHAT_MAX_LENGTH = 500;
const REACTIONS = ['🔥', '😂', '😮', '👏', '❤️', '💀'];
const chatHistory = [];
// Id da mensagem: cresce sempre, inclusive depois de o servidor reiniciar (é a hora em
// ms), pra quem estava na sala saber o que ainda não leu.
let lastChatId = 0;

// Limite por pessoa: no máximo `max` eventos de um tipo a cada `windowMs`.
function allow(socket, kind, max, windowMs) {
  const now = Date.now();
  const times = socket.data[kind] || (socket.data[kind] = []);
  while (times.length && now - times[0] > windowMs) times.shift();
  if (times.length >= max) return false;
  times.push(now);
  return true;
}

function cleanChatText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}

// O histórico vai pra um arquivo (na imagem Docker, na pasta de dados), pra continuar
// lá depois de reiniciar ou atualizar o app.
const CHAT_FILE = process.env.CHAT_FILE || null;
let chatSaveTimer = null;

function loadChatHistory() {
  if (!CHAT_FILE) return;
  try {
    const saved = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'));
    if (!Array.isArray(saved)) return;
    for (const m of saved.slice(-CHAT_HISTORY)) {
      if (!m || !Number.isFinite(m.id) || !Number.isFinite(m.at)) continue;
      const name = cleanName(m.name);
      const text = cleanChatText(m.text);
      if (!name || !text) continue;
      chatHistory.push({ id: m.id, name, text, at: m.at });
      lastChatId = Math.max(lastChatId, m.id);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.log(`AVISO: não deu pra ler o histórico do chat (${err.message}).`);
  }
}

function saveChatNow() {
  clearTimeout(chatSaveTimer);
  chatSaveTimer = null;
  if (!CHAT_FILE) return;
  try {
    const tmp = `${CHAT_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(chatHistory));
    fs.renameSync(tmp, CHAT_FILE);
  } catch (err) {
    console.log(`AVISO: não deu pra salvar o histórico do chat (${err.message}).`);
  }
}

function saveChatSoon() {
  if (CHAT_FILE && !chatSaveTimer) chatSaveTimer = setTimeout(saveChatNow, 2000);
}

loadChatHistory();

// Parar o container (ou Ctrl+C) salva o que ainda não foi pro arquivo.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (chatSaveTimer) saveChatNow();
    process.exit(0);
  });
}

// Transmissões do OBS aparecem na sala como participantes que já entram transmitindo.
const obs = MEDIAMTX_WEBRTC_URL && MEDIAMTX_API_URL && LOCAL_TURN_SECRET
  ? setupObs({
    app,
    webrtcUrl: MEDIAMTX_WEBRTC_URL,
    apiUrl: MEDIAMTX_API_URL,
    apiAuth: process.env.MEDIAMTX_API_AUTH,
    cleanName,
    turnLink,
    onStreamsChanged(added, removed) {
      for (const stream of added) {
        logEvent(`OBS: ${stream.name} começou a transmitir`);
        io.to(ROOM).emit('user:joined', publicUser(stream));
      }
      for (const stream of removed) {
        revokeControlFor(stream.id);
        logEvent(`OBS: ${stream.name} parou de transmitir (ficou no ar ${formatDuration(Date.now() - stream.startedAt)})`);
        io.to(ROOM).emit('user:left', { id: stream.id });
      }
    },
  })
  : null;

// IP de onde o cliente chega até este servidor (ex.: o do Tailscale). Vai junto dos
// sinais pro outro lado alcançá-lo mesmo quando o navegador esconde o próprio IP.
function clientAddress(socket) {
  const address = socket.handshake.address || '';
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

// A transmissão é dessa pessoa (pela página ou pelo OBS, com o mesmo nick)?
function ownsStream(user, id) {
  if (id === user.id) return user.sharing;
  return Boolean(obs && obs.list().some((stream) => stream.id === id && stream.name === user.name));
}

const remoteControl = require('./control').createControl({ io, users, ownsStream, allow, logEvent });
const revokeControlFor = remoteControl.revokeFor;

function removeUser(socket) {
  revokeControlFor(socket.id);
  const user = users.get(socket.id);
  if (user) {
    releaseAvatar(user.avatar);
    releaseAvatar(user.cursorImg);
    releaseAvatar(user.pingImg);
  }
  if (!users.delete(socket.id)) return;
  socket.leave(ROOM);
  io.to(ROOM).emit('user:left', { id: socket.id });
}

function listLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

io.on('connection', (socket) => {
  socket.on('join', (payload, ack) => {
    if (typeof ack !== 'function') return;
    if (users.has(socket.id)) return ack({ error: 'Você já está na sala.' });
    const name = cleanName(payload && payload.name);
    if (!name) return ack({ error: 'Escolha um nick.' });

    // Após uma queda de rede o cliente reconecta com outro socket, mas o antigo
    // continua "vivo" aqui até o timeout de ping. Derruba esse fantasma pra
    // pessoa não aparecer duplicada (nem com o nick trocado pra "Nome (2)").
    const clientId = typeof payload.clientId === 'string' ? payload.clientId.slice(0, 64) : '';
    if (clientId) {
      for (const u of users.values()) {
        const ghost = u.clientId === clientId && io.sockets.sockets.get(u.id);
        if (ghost) {
          removeUser(ghost);
          ghost.disconnect(true);
        }
      }
    }

    const user = { id: socket.id, name: uniqueName(name), sharing: false, clientId };
    const hue = cleanHue(payload.hue);
    if (hue !== null) user.hue = hue;
    const color = cleanColor(payload.color);
    if (color) user.color = color;
    const style = cleanStyle(payload.style);
    if (style) user.style = style;
    users.set(socket.id, user);
    logEvent(`${user.name} entrou na sala (${clientAddress(socket)})`);
    socket.join(ROOM);
    socket.to(ROOM).emit('user:joined', publicUser(user));
    const everyone = [...users.values(), ...(obs ? obs.list() : [])];
    ack({ me: publicUser(user), users: everyone.map(publicUser), chat: chatHistory, now: Date.now(), version: VERSION });
  });

  // startedAt: quando a pessoa começou a transmitir, pra não zerar o tempo ao vivo
  // quando ela reconecta no meio da transmissão.
  socket.on('share', (sharing, startedAt) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.sharing = Boolean(sharing);
    const now = Date.now();
    user.since = user.sharing
      ? (Number.isFinite(startedAt) && startedAt <= now && now - startedAt < 86400000 ? startedAt : now)
      : null;
    if (!user.sharing) remoteControl.revokeStream(user.id);
    socket.to(ROOM).emit('user:updated', publicUser(user));
  });

  // Perfil: a cor escolhida (null volta pra cor automática do nick) e/ou o estilo do
  // mouse e das marcações (null volta pro padrão). Só muda o que veio na mensagem.
  socket.on('profile', (msg) => {
    const user = users.get(socket.id);
    if (!user || !msg || typeof msg !== 'object' || !allow(socket, 'profile', 20, 10000)) return;
    if ('hue' in msg || 'color' in msg) {
      const hue = cleanHue(msg.hue);
      if (hue === null) delete user.hue;
      else user.hue = hue;
      const color = cleanColor(msg.color);
      if (color === null) delete user.color;
      else user.color = color;
    }
    if ('style' in msg) {
      const style = cleanStyle(msg.style);
      if (style) user.style = style;
      else delete user.style;
    }
    socket.to(ROOM).emit('user:updated', publicUser(user));
  });

  // Foto de perfil: os bytes da imagem (ou null pra tirar).
  socket.on('avatar', (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const user = users.get(socket.id);
    if (!user) return reply({ error: 'Você não está na sala.' });
    if (!allow(socket, 'avatar', 6, 60000)) return reply({ error: 'Calma aí: muitas trocas de foto seguidas.' });
    let hash = null;
    if (data != null) {
      const buf = Buffer.isBuffer(data) ? data : data instanceof ArrayBuffer ? Buffer.from(data) : null;
      if (!buf || !buf.length) return reply({ error: 'Não deu pra ler a foto.' });
      if (buf.length > AVATAR_MAX_BYTES) return reply({ error: 'A foto passa de 5 MB.' });
      const type = avatarType(buf);
      if (!type) return reply({ error: 'Use uma foto PNG, JPG, WebP ou GIF.' });
      hash = storeAvatar(buf, type);
    }
    releaseAvatar(user.avatar);
    if (hash) user.avatar = hash;
    else delete user.avatar;
    socket.to(ROOM).emit('user:updated', publicUser(user));
    reply({ ok: true, avatar: hash ? `/avatar/${hash}` : null });
  });

  // Imagens próprias do estilo (a setinha e o ping): PNG, GIF, WebP ou JPG pequenos (o
  // navegador já reduz e converte .cur/.ani). Ficam junto das fotos de perfil.
  socket.on('fx:image', (msg, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const user = users.get(socket.id);
    if (!user) return reply({ error: 'Você não está na sala.' });
    const kind = msg && msg.kind;
    if (kind !== 'cursor' && kind !== 'ping') return reply({ error: 'Imagem de quê?' });
    if (!allow(socket, 'fx-image', 12, 60000)) return reply({ error: 'Calma aí: muitas trocas de imagem seguidas.' });
    let hash = null;
    if (msg.data != null) {
      const buf = Buffer.isBuffer(msg.data) ? msg.data : msg.data instanceof ArrayBuffer ? Buffer.from(msg.data) : null;
      if (!buf || !buf.length) return reply({ error: 'Não deu pra ler a imagem.' });
      if (buf.length > FX_IMAGE_MAX_BYTES) return reply({ error: 'A imagem passa de 2 MB.' });
      const type = avatarType(buf);
      if (!type) return reply({ error: 'Use PNG, GIF, WebP ou JPG.' });
      const size = imageSize(buf, type);
      if (!size || size[0] > FX_IMAGE_MAX_SIDE || size[1] > FX_IMAGE_MAX_SIDE) return reply({ error: `A imagem pode ter até ${FX_IMAGE_MAX_SIDE} px de lado.` });
      hash = storeAvatar(buf, type);
    }
    const field = kind === 'cursor' ? 'cursorImg' : 'pingImg';
    releaseAvatar(user[field]);
    if (hash) user[field] = hash;
    else delete user[field];
    socket.to(ROOM).emit('user:updated', publicUser(user));
    reply({ ok: true, url: hash ? `/avatar/${hash}` : null });
  });

  socket.on('chat:send', (raw, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const user = users.get(socket.id);
    if (!user) return reply({ error: 'Você não está na sala.' });
    const text = cleanChatText(raw);
    if (!text) return reply({ error: 'Mensagem vazia.' });
    if (!allow(socket, 'chat', 5, 5000)) return reply({ error: 'Calma aí: muitas mensagens seguidas.' });
    lastChatId = Math.max(lastChatId + 1, Date.now());
    const message = { id: lastChatId, name: user.name, text, at: Date.now() };
    if (Number.isInteger(user.hue)) message.hue = user.hue; // a cor fica no histórico
    if (user.color) message.color = user.color;
    chatHistory.push(message);
    if (chatHistory.length > CHAT_HISTORY) chatHistory.shift();
    saveChatSoon();
    io.to(ROOM).emit('chat:message', message);
    reply({ ok: true });
  });

  const isLive = (id) => {
    if (typeof id !== 'string') return false;
    const user = users.get(id);
    if (user) return user.sharing;
    return Boolean(obs && obs.list().some((stream) => stream.id === id));
  };

  // Emoji que sobe por cima da transmissão, pra todo mundo que está vendo.
  socket.on('react', (msg) => {
    const user = users.get(socket.id);
    if (!user || !msg || !REACTIONS.includes(msg.emoji) || !isLive(msg.stream)) return;
    if (!allow(socket, 'react', 12, 3000)) return;
    io.to(ROOM).emit('react', { stream: msg.stream, emoji: msg.emoji, name: user.name });
  });

  // Chat de voz: o áudio vai direto entre as pessoas (pelo relay de sinalização); aqui
  // só fica quem está na voz e se está mudo, pra todo mundo ver.
  socket.on('voice:join', (state) => {
    const user = users.get(socket.id);
    if (!user || !allow(socket, 'voice', 20, 10000)) return;
    const first = !user.voice;
    user.voice = voiceState(state);
    if (first) logEvent(`${user.name} entrou na voz`);
    socket.to(ROOM).emit('user:updated', publicUser(user));
  });

  socket.on('voice:state', (state) => {
    const user = users.get(socket.id);
    if (!user || !user.voice || !allow(socket, 'voice', 20, 10000)) return;
    user.voice = voiceState(state);
    socket.to(ROOM).emit('user:updated', publicUser(user));
  });

  socket.on('voice:leave', () => {
    const user = users.get(socket.id);
    if (!user || !user.voice) return;
    user.voice = null;
    logEvent(`${user.name} saiu da voz`);
    socket.to(ROOM).emit('user:updated', publicUser(user));
  });



  // Desenho ao vivo por cima da transmissão: o traço chega em pedaços (pontos de 0 a 1,
  // [x, y, x, y...]) enquanto a pessoa ainda está desenhando. Quem transmite, rabiscando
  // a própria tela pelo app, não tem limite de ritmo, escolhe a cor (color, #rrggbb; ou
  // hue de 0 a 359, -1 pra branco) e o traço fica (hold) até ela limpar ou sair do modo
  // desenho.
  socket.on('draw', (msg) => {
    const user = users.get(socket.id);
    if (!user || !msg || !isLive(msg.stream) || typeof msg.id !== 'string' || msg.id.length > 32) return;
    const { points } = msg;
    if (!Array.isArray(points) || points.length > 128 || points.length % 2) return;
    if (!points.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return;
    const owner = ownsStream(user, msg.stream);
    if (!owner && !allow(socket, 'draw', 80, 2000)) return;
    const out = { stream: msg.stream, id: msg.id, points, end: Boolean(msg.end), name: user.name };
    // hold 'alt': quem assiste ainda segura o Alt (o traço fica até soltar). true: quem
    // transmite, no modo desenho (fica até desfazer/limpar).
    if (msg.hold === 'alt') out.hold = 'alt';
    else if (owner && msg.hold) out.hold = true;
    if (owner && Number.isInteger(msg.hue) && msg.hue >= -1 && msg.hue < 360) out.hue = msg.hue;
    if (owner && cleanColor(msg.color)) out.color = cleanColor(msg.color);
    socket.to(ROOM).emit('draw', out);
  });

  // Desfazer um traço / limpar os traços que ficaram: só quem transmite, na própria.
  socket.on('draw:undo', (msg) => {
    const user = users.get(socket.id);
    if (!user || !msg || typeof msg.id !== 'string' || msg.id.length > 32 || !ownsStream(user, msg.stream)) return;
    socket.to(ROOM).emit('draw:undo', { stream: msg.stream, id: msg.id, name: user.name });
  });

  socket.on('draw:clear', (msg) => {
    const user = users.get(socket.id);
    if (!user || !msg || !ownsStream(user, msg.stream)) return;
    socket.to(ROOM).emit('draw:clear', { stream: msg.stream, name: user.name });
  });

  // Soltou o Alt: os rabiscos que a pessoa fez segurando o Alt somem, pra todo mundo.
  socket.on('draw:release', () => {
    const user = users.get(socket.id);
    if (!user || !allow(socket, 'draw-release', 20, 5000)) return;
    socket.to(ROOM).emit('draw:release', { name: user.name });
  });

  const unit = (v) => Number.isFinite(v) && v >= 0 && v <= 1;
  const CLICKS = new Set(['left', 'middle', 'right', 'up', 'down']);

  // Mouse de quem assiste passando por cima da transmissão: vai pra sala toda (quem
  // assiste vê nos quadros; quem transmite, pelo app, vê na tela dela).
  socket.on('cursor', (msg) => {
    const user = users.get(socket.id);
    if (!user || !msg || typeof msg.stream !== 'string') return;
    if (!msg.gone && !(unit(msg.x) && unit(msg.y))) return;
    if (!allow(socket, 'cursor', 60, 1000)) return;
    const out = msg.gone
      ? { stream: msg.stream, id: socket.id, name: user.name, gone: true }
      : { stream: msg.stream, id: socket.id, name: user.name, x: msg.x, y: msg.y };
    // Clique (esquerdo, rodinha, direito) ou rolagem: vira uma animaçãozinha no mouse.
    if (!msg.gone && CLICKS.has(msg.click)) out.click = msg.click;
    socket.to(ROOM).emit('cursor', out);
  });

  remoteControl.attach(socket);

  // "Olha aqui": um ponto na imagem (x e y de 0 a 1), pra todo mundo que está vendo.
  socket.on('ping', (msg) => {
    const user = users.get(socket.id);
    if (!user || !msg || !isLive(msg.stream)) return;
    const { x, y } = msg;
    if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return;
    if (!allow(socket, 'ping', 4, 2000)) return;
    io.to(ROOM).emit('ping', { stream: msg.stream, x, y, name: user.name });
  });

  // Relay ponto a ponto da sinalização WebRTC (watch/offer/answer/candidate/...).
  socket.on('signal', (msg) => {
    if (!users.has(socket.id) || !msg || typeof msg.to !== 'string' || !users.has(msg.to)) return;
    io.to(msg.to).emit('signal', { from: socket.id, address: clientAddress(socket), data: msg.data });
  });

  socket.on('leave', () => removeUser(socket));
  socket.on('disconnect', () => removeUser(socket));
});

server.listen(PORT, HOST, () => {
  const scheme = useHttps ? 'https' : 'http';
  console.log(`Web Screen Share, versão ${VERSION}`);
  console.log(`Servidor rodando em ${scheme}://${HOST}:${PORT}`);
  // Sem "<...>" nas mensagens: o visualizador de logs do CasaOS some com isso.
  const certNames = certificate ? certificate.names : [];
  if (certNames.length > 0) {
    console.log(`  - Acesse por ${scheme}://${certNames[0]}:${DISPLAY_PORT}/ (o nome do certificado)`);
  } else if (process.env.IN_CONTAINER) {
    // Os IPs de dentro do container (172.x) não servem pra quem está fora.
    console.log(`  - Acesse pelo IP ou nome do servidor, na porta publicada (ex.: ${scheme}://IP-DO-NAS:${DISPLAY_PORT}/)`);
  } else {
    console.log(`  - Neste PC: ${scheme}://localhost:${PORT}/`);
    const lan = listLanAddresses();
    if (lan.length > 0) {
      console.log('  - De outros dispositivos na LAN/Tailscale, use um dos endereços abaixo:');
      for (const addr of lan) {
        console.log(`      ${scheme}://${addr}:${PORT}/`);
      }
    }
  }
  if (!useHttps) {
    console.log('  (Sem HTTPS: só quem abrir via localhost consegue compartilhar a tela. Pra');
    console.log('   outros PCs também transmitirem, veja no README como gerar um certificado');
    console.log('   com `tailscale cert`.)');
  }
  if (PUBLIC_PORT) console.log(`  (PUBLIC_PORT=${PUBLIC_PORT}: o TURN vai direto nessa porta, mesmo com a página aberta por um proxy.)`);
  if (LOCAL_TURN_SECRET) checkLocalTurn();
  if (obs) checkObs();
});

async function checkObs(attempt = 1) {
  if (await obs.ready()) {
    const host = `${certificate && certificate.names[0] ? certificate.names[0] : 'IP-DO-NAS'}:${DISPLAY_PORT}`;
    console.log(`Transmissão pelo OBS ativa: no OBS, Serviço "WHIP", servidor https://${host}/obs/SEU-NICK`);
  } else if (attempt < 10) {
    setTimeout(() => checkObs(attempt + 1), 1000);
  } else {
    console.log('AVISO: o servidor de mídia do OBS (MediaMTX) não respondeu; transmitir pelo OBS não vai funcionar.');
  }
}
