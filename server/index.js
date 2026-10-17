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

// Estado da sinalização: um transmissor (host) por vez, N visualizadores.
let host = null; // { id: socket.id }
const viewers = new Map(); // socket.id -> { id }

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
  socket.on('role:host', () => {
    // Se já existe um transmissor, avisa o antigo que foi substituído.
    if (host && host.id !== socket.id) {
      io.to(host.id).emit('host:replaced');
    }
    host = { id: socket.id };

    // Reencaminha todos os visualizadores já esperando para negociar com o novo host.
    for (const viewerId of viewers.keys()) {
      io.to(host.id).emit('viewer:joined', { viewerId });
    }

    // Avisa todos os visualizadores que o transmissor está pronto (renegociação limpa).
    io.emit('host:available');
  });

  socket.on('role:viewer', () => {
    viewers.set(socket.id, { id: socket.id });
    if (host) {
      socket.emit('host:available');
      io.to(host.id).emit('viewer:joined', { viewerId: socket.id });
    } else {
      socket.emit('host:unavailable');
    }
  });

  // Relay genérico de sinalização (offer/answer/ICE candidates).
  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  // Visualizador pede uma qualidade diferente; repassa ao host com o id do viewer.
  socket.on('quality:change', ({ quality }) => {
    if (!host) return;
    io.to(host.id).emit('quality:change', { viewerId: socket.id, quality });
  });

  socket.on('disconnect', () => {
    if (host && host.id === socket.id) {
      host = null;
      io.emit('host:left');
    } else if (viewers.has(socket.id)) {
      viewers.delete(socket.id);
      if (host) {
        io.to(host.id).emit('viewer:left', { viewerId: socket.id });
      }
    }
  });
});

server.listen(PORT, HOST, () => {
  const scheme = useHttps ? 'https' : 'http';
  console.log(`Servidor rodando em ${scheme}://${HOST}:${PORT}${useHttps ? ' (HTTPS via certificado do Tailscale)' : ''}`);
  console.log(`  - No próprio PC (transmissor): ${scheme}://localhost:${PORT}/host.html`);
  const lan = listLanAddresses();
  if (lan.length > 0) {
    console.log('  - Para outros dispositivos na LAN/Tailscale, use um dos endereços abaixo:');
    for (const addr of lan) {
      console.log(`      ${scheme}://${addr}:${PORT}/`);
    }
  }
  if (!useHttps) {
    console.log('  (Sem HTTPS. Se o visualizador tiver problemas de conexão WebRTC, veja o');
    console.log('   README sobre como gerar um certificado com `tailscale cert`.)');
  }
});
