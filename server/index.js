const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

// Servidores ICE usados pelos clientes (transmissor e visualizadores) para o
// WebRTC. STUN sozinho não é suficiente quando um dos lados está atrás de um
// NAT/firewall restritivo (comum em redes domésticas com antivírus mais
// agressivo): a conexão fica presa em "conectando" para sempre porque não há
// como retransmitir a mídia. Um servidor TURN resolve isso fazendo o relay.
// Por padrão usamos um TURN público de testes (OpenRelay); para uso sério,
// defina TURN_URLS/TURN_USERNAME/TURN_CREDENTIAL com um TURN próprio.
function buildIceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrls = (process.env.TURN_URLS || 'turn:openrelay.metered.ca:80,turn:openrelay.metered.ca:443,turn:openrelay.metered.ca:443?transport=tcp')
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

app.get('/ice-servers', (req, res) => {
  res.json(buildIceServers());
});

// HTTPS via certificado do Tailscale (`tailscale cert`): necessário em redes
// mais restritivas onde o navegador do visualizador só faz WebRTC em contexto
// seguro. Defina TLS_CERT/TLS_KEY apontando pros arquivos .crt/.key gerados.
const TLS_CERT = process.env.TLS_CERT;
const TLS_KEY = process.env.TLS_KEY;
const useHttps = TLS_CERT && TLS_KEY && fs.existsSync(TLS_CERT) && fs.existsSync(TLS_KEY);

const server = useHttps
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, app)
  : http.createServer(app);
const io = new Server(server);

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
    socket.join(ROOM);
    socket.to(ROOM).emit('user:joined', publicUser(user));
    ack({ me: publicUser(user), users: [...users.values()].map(publicUser) });
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
    io.to(msg.to).emit('signal', { from: socket.id, data: msg.data });
  });

  socket.on('leave', () => removeUser(socket));
  socket.on('disconnect', () => removeUser(socket));
});

server.listen(PORT, HOST, () => {
  const scheme = useHttps ? 'https' : 'http';
  console.log(`Servidor rodando em ${scheme}://${HOST}:${PORT}${useHttps ? ' (HTTPS via certificado do Tailscale)' : ''}`);
  console.log(`  - Neste PC: ${scheme}://localhost:${PORT}/`);
  const lan = listLanAddresses();
  if (lan.length > 0) {
    console.log('  - De outros dispositivos na LAN/Tailscale, use um dos endereços abaixo:');
    for (const addr of lan) {
      console.log(`      ${scheme}://${addr}:${PORT}/`);
    }
  }
  if (!useHttps) {
    console.log('  (Sem HTTPS: só quem abrir via localhost consegue compartilhar a tela. Pra');
    console.log('   outros PCs também transmitirem, veja no README como gerar um certificado');
    console.log('   com `tailscale cert`.)');
  }
});
