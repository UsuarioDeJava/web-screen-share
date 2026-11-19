const { permissions, kindDevice, validState } = require('../desktop/shared/gamepad');

function createControl({ io, users, ownsStream, allow, logEvent }) {
  const grants = (owner) => owner.controls || (owner.controls = new Map());
  function revoke(owner, to) {
    if (!owner) return;
    for (const grant of [...grants(owner).values()]) {
      if (to && grant.to !== to) continue;
      grants(owner).delete(grant.to);
      io.to(grant.to).emit('control:revoked', { stream: grant.stream });
      io.to(owner.id).emit('control:revoked', { stream: grant.stream, mine: true, to: grant.to });
    }
  }
  function revokeFor(id) {
    for (const owner of users.values()) {
      for (const grant of [...grants(owner).values()]) {
        if (owner.id === id || grant.to === id || grant.stream === id) revoke(owner, grant.to);
      }
    }
  }
  function attach(socket) {
    socket.on('control:grant', (msg, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const owner = users.get(socket.id);
      const target = msg && users.get(msg.to);
      if (!owner || !target || target.id === owner.id || target.kind === 'obs' || !ownsStream(owner, msg.stream)) return reply({ error: 'Não deu pra dar o controle.' });
      // Clientes antigos continuam recebendo somente teclado e mouse.
      const devices = msg.devices === undefined ? { keyboard: true, mouse: true, gamepad: false } : permissions(msg.devices);
      if (!Object.values(devices).some(Boolean)) return reply({ error: 'Selecione pelo menos um dispositivo.' });
      const others = [...grants(owner).values()].filter((g) => g.to !== target.id);
      if (devices.gamepad && others.filter((g) => g.devices.gamepad).length >= 4) return reply({ error: 'Limite de quatro gamepads por computador.' });
      // Teclado e mouse são dispositivos únicos do PC; evitam teclas de pessoas diferentes se misturarem.
      if (others.some((g) => (devices.keyboard && g.devices.keyboard) || (devices.mouse && g.devices.mouse))) return reply({ error: 'Teclado ou mouse já está liberado para outra pessoa. Revogue antes de transferir.' });
      revoke(owner, target.id);
      const grant = { to: target.id, stream: msg.stream, devices };
      grants(owner).set(target.id, grant);
      io.to(target.id).emit('control:granted', { stream: msg.stream, from: owner.name, devices });
      logEvent(`${owner.name} liberou ${Object.keys(devices).filter((k) => devices[k]).join(', ')} para ${target.name}`);
      reply({ ok: true, devices });
    });
    socket.on('control:revoke', (msg) => revoke(users.get(socket.id), typeof msg?.to === 'string' ? msg.to : undefined));
    socket.on('control:input', (msg) => {
      const device = kindDevice(msg?.kind);
      if (!device || !allow(socket, 'control', 400, 1000)) return;
      for (const owner of users.values()) {
        const grant = grants(owner).get(socket.id);
        if (!grant || grant.stream !== msg.stream || !grant.devices[device]) continue;
        const out = { kind: msg.kind, from: socket.id, stream: msg.stream };
        if (msg.kind === 'gamepad') {
          if (!validState(msg)) return;
          out.axes = msg.axes.slice(); out.buttons = msg.buttons.slice();
        } else if (msg.kind === 'key') {
          if (typeof msg.code !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(msg.code)) return;
          out.code = msg.code; out.down = msg.down === true;
        } else {
          if (Number.isFinite(msg.x) && msg.x >= 0 && msg.x <= 1 && Number.isFinite(msg.y) && msg.y >= 0 && msg.y <= 1) { out.x = msg.x; out.y = msg.y; }
          if (msg.kind === 'button') {
            if (![0, 1, 2].includes(msg.button)) return;
            out.button = msg.button; out.down = msg.down === true;
          } else if (msg.kind === 'wheel') {
            if (!Number.isFinite(msg.dy)) return;
            out.dy = Math.max(-10, Math.min(10, msg.dy));
          } else if (out.x === undefined) return;
        }
        io.to(owner.id).emit('control:input', out);
      }
    });
  }
  function revokeStream(id) {
    for (const owner of users.values()) for (const grant of [...grants(owner).values()]) if (grant.stream === id) revoke(owner, grant.to);
  }
  return { attach, revoke, revokeFor, revokeStream };
}
module.exports = { createControl };
