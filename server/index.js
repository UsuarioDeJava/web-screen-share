const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
const VERSION = process.env.APP_VERSION || 'dev';
const LOCAL_TURN_SECRET = process.env.LOCAL_TURN_SECRET;
const LOCAL_TURN_PORT = Number(process.env.LOCAL_TURN_PORT) || 3478;

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

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
// usuário = validade em segundos Unix, senha = HMAC-SHA1(segredo, usuário). O
// endereço é o mesmo host:porta que o navegador usou pra abrir a página.
function localTurnServer(req) {
  const username = `${Math.floor(Date.now() / 1000) + 30 * 24 * 3600}:web-screen-share`;
  const credential = crypto.createHmac('sha1', LOCAL_TURN_SECRET).update(username).digest('base64');
  const host = req.get('host');
  const hostPort = /:\d+$/.test(host) ? host : `${host}:${req.secure ? 443 : 80}`;
  return { urls: `turn:${hostPort}?transport=tcp`, username, credential };
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

const webServer = useHttps
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, app)
  : http.createServer(app);
const io = new Server(webServer);

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

function certificateHostnames() {
  if (!useHttps) return [];
  try {
    const san = new crypto.X509Certificate(fs.readFileSync(TLS_CERT)).subjectAltName || '';
    return san
      .split(', ')
      .filter((entry) => entry.startsWith('DNS:'))
      .map((entry) => entry.slice(4))
      .filter((name) => name !== 'localhost' && !name.startsWith('*'));
  } catch {
    return [];
  }
}

function checkLocalTurn(attempt = 1) {
  const probe = net.connect(LOCAL_TURN_PORT, '127.0.0.1');
  probe.once('connect', () => {
    probe.destroy();
    console.log(`TURN embutido ativo na porta ${PORT} (TCP): usado quando a conexão direta falha.`);
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

const publicUser = ({ id, name, sharing }) => ({ id, name, sharing });

// IP de onde o cliente chega até este servidor (ex.: o do Tailscale). Vai junto dos
// sinais pro outro lado alcançá-lo mesmo quando o navegador esconde o próprio IP.
function clientAddress(socket) {
  const address = socket.handshake.address || '';
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

function removeUser(socket) {
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
    users.set(socket.id, user);
    console.log(`${user.name} entrou na sala (${clientAddress(socket)})`);
    socket.join(ROOM);
    socket.to(ROOM).emit('user:joined', publicUser(user));
    ack({ me: publicUser(user), users: [...users.values()].map(publicUser), version: VERSION });
  });

  socket.on('share', (sharing) => {
    const user = users.get(socket.id);
    if (!user) return;
    user.sharing = Boolean(sharing);
    socket.to(ROOM).emit('user:updated', publicUser(user));
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
  const certNames = certificateHostnames();
  if (certNames.length > 0) {
    console.log(`  - Acesse por ${scheme}://${certNames[0]}:${PORT}/ (o nome do certificado)`);
  } else if (process.env.IN_CONTAINER) {
    // Os IPs de dentro do container (172.x) não servem pra quem está fora.
    console.log(`  - Acesse pelo IP ou nome do servidor, na porta publicada (ex.: ${scheme}://IP-DO-NAS:${PORT}/)`);
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
  if (LOCAL_TURN_SECRET) checkLocalTurn();
});
