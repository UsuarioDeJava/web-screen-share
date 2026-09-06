const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

const server = http.createServer(app);
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
  console.log(`Servidor rodando em http://${HOST}:${PORT}`);
  console.log(`  - No próprio PC (transmissor): http://localhost:${PORT}/host.html`);
  const lan = listLanAddresses();
  if (lan.length > 0) {
    console.log('  - Para outros dispositivos na LAN/Tailscale, use um dos endereços abaixo:');
    for (const addr of lan) {
      console.log(`      http://${addr}:${PORT}/`);
    }
  }
});
