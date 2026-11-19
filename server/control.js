const { permissions, kindDevice, validState } = require('../desktop/shared/gamepad');

function createControl({ io, users, ownsStream, allow, logEvent, now = Date.now, schedule = true }) {
  const grants = (owner) => owner.controls || (owner.controls = new Map());
  const options = (owner) => owner.controlOptions || (owner.controlOptions = { gamepadPaused: false, maxGamepads: 4 });
  function details(owner) {
    const settings = { ...options(owner) };
    const people = [...grants(owner).values()].map((g) => ({
      id: g.to, name: users.get(g.to)?.name || 'Participante', stream: g.stream, devices: g.devices,
      physicalConnected: g.physicalConnected === true, deviceName: g.deviceName || '',
      receiving: !settings.gamepadPaused && g.physicalConnected === true && g.sending === true && g.lastInputAt != null && now() - g.lastInputAt < 1200,
      receiverConnected: g.receiverConnected === true, receiverError: g.receiverError || '',
    }));
    return { options: settings, people, counts: {
      allowed: people.filter((p) => p.devices.gamepad).length,
      physical: people.filter((p) => p.devices.gamepad && p.physicalConnected).length,
      connected: people.filter((p) => p.devices.gamepad && p.physicalConnected && p.receiverConnected).length,
      receiving: people.filter((p) => p.devices.gamepad && p.receiving && p.receiverConnected).length,
    } };
  }
  function publish(owner) {
    if (!owner) return;
    const state = details(owner);
    const key = JSON.stringify(state);
    if (owner.controlSnapshot === key) return;
    owner.controlSnapshot = key;
    io.to(owner.id).emit('control:sharing', state);
  }
  function revoke(owner, to) {
    if (!owner) return;
    for (const grant of [...grants(owner).values()]) {
      if (to && grant.to !== to) continue;
      grants(owner).delete(grant.to);
      io.to(grant.to).emit('control:revoked', { stream: grant.stream });
      io.to(owner.id).emit('control:revoked', { stream: grant.stream, mine: true, to: grant.to });
    }
    publish(owner);
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
      if (devices.gamepad && others.filter((g) => g.devices.gamepad).length >= options(owner).maxGamepads) return reply({ error: `Limite de ${options(owner).maxGamepads} gamepads por computador.` });
      // Teclado e mouse são dispositivos únicos do PC; evitam teclas de pessoas diferentes se misturarem.
      if (others.some((g) => (devices.keyboard && g.devices.keyboard) || (devices.mouse && g.devices.mouse))) return reply({ error: 'Teclado ou mouse já está liberado para outra pessoa. Revogue antes de transferir.' });
      revoke(owner, target.id);
      const grant = { to: target.id, stream: msg.stream, devices };
      grants(owner).set(target.id, grant);
      io.to(target.id).emit('control:granted', { stream: msg.stream, from: owner.name, devices });
      logEvent(`${owner.name} liberou ${Object.keys(devices).filter((k) => devices[k]).join(', ')} para ${target.name}`);
      reply({ ok: true, devices });
      publish(owner);
    });
    socket.on('control:details', (ack) => {
      const owner = users.get(socket.id);
      if (owner && typeof ack === 'function' && allow(socket, 'control-details', 8, 1000)) ack(details(owner));
    });
    socket.on('control:options', (value, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const owner = users.get(socket.id);
      if (!owner || !value || !Number.isInteger(value.maxGamepads) || value.maxGamepads < 1 || value.maxGamepads > 4 || typeof value.gamepadPaused !== 'boolean') return reply({ error: 'Configuração inválida.' });
      if ([...grants(owner).values()].filter((g) => g.devices.gamepad).length > value.maxGamepads) return reply({ error: 'Revogue as permissões excedentes antes de reduzir o limite.' });
      owner.controlOptions = { maxGamepads: value.maxGamepads, gamepadPaused: value.gamepadPaused };
      if (value.gamepadPaused) for (const g of grants(owner).values()) { g.lastInputAt = null; g.receiverConnected = false; }
      publish(owner); reply({ ok: true });
    });
    socket.on('control:presence', (msg) => {
      if (!msg || !allow(socket, 'control-presence', 12, 1000)) return;
      for (const owner of users.values()) {
        const g = grants(owner).get(socket.id);
        if (!g || g.stream !== msg.stream || !g.devices.gamepad) continue;
        g.physicalConnected = msg.connected === true;
        g.sending = g.physicalConnected && msg.sending === true;
        g.deviceName = g.physicalConnected && typeof msg.name === 'string' ? msg.name.replace(/[\x00-\x1f]/g, '').slice(0, 160) : '';
        if (!g.sending) g.lastInputAt = null;
        publish(owner);
      }
    });
    socket.on('control:receiver', (msg) => {
      const owner = users.get(socket.id);
      const g = msg && owner && grants(owner).get(msg.from);
      if (!g || !g.devices.gamepad || g.stream !== msg.stream || !allow(socket, 'control-receiver', 20, 1000)) return;
      g.receiverConnected = !options(owner).gamepadPaused && msg.connected === true;
      // Mensagens internas de DLL/caminhos locais não saem do computador do proprietário.
      g.receiverError = !options(owner).gamepadPaused && msg.failed === true ? 'O aplicativo não confirmou o controle virtual.' : '';
      publish(owner);
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
          if (options(owner).gamepadPaused || !validState(msg)) return;
          out.axes = msg.axes.slice(); out.buttons = msg.buttons.slice();
          grant.lastInputAt = now(); publish(owner);
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
  const timer = schedule ? setInterval(() => { for (const owner of users.values()) if (owner.controls?.size) publish(owner); }, 500) : null;
  timer?.unref();
  return { attach, revoke, revokeFor, revokeStream, details, close() { clearInterval(timer); } };
}
module.exports = { createControl };
