/* Conexão de comandos por concessão, independente do vídeo (inclui OBS).
 * Socket.IO negocia ICE/SDP e mantém compatibilidade; não participa do caminho P2P.
 */
(function (root) {
  function create({ socket, iceServers, onInput, onReset, onActivity = () => {}, onChange = () => {}, onFeedback = null, onFeedbackStop = () => {},
    PeerConnection = root.RTCPeerConnection, now = () => performance.now(), binaryFast = true, maxFastBufferedBytes = 16384,
    fastPacketLifeTimeMs = null }) {
    const wire = root.WssControlWire, model = root.WssGamepad;
    const binaryEnabled = binaryFast === true && typeof wire.encodeFast === 'function' && typeof wire.decodeFast === 'function';
    const sessions = new Map(), guests = new Map();
    const signalQueue = root.WssSignaling.createQueue({ handle: async ({ session, message }) => {
      if (!session.closed && sessions.get(session.id) === session) {
        try { await handleSignal(message); }
        catch { fallback(session, 'Negociação WebRTC falhou; usando servidor.'); }
      }
    } });
    const MAX_BUFFER = 16 * 1024;
    const fastBufferLimit = Number.isInteger(maxFastBufferedBytes) && maxFastBufferedBytes >= 0 && maxFastBufferedBytes <= MAX_BUFFER ? maxFastBufferedBytes : MAX_BUFFER;
    // Expiração por tempo é opt-in de pesquisa. Não combina os dois modos de
    // confiabilidade e não promete limitar filas posteriores/atraso de chegada.
    const fastLifetime = Number.isInteger(fastPacketLifeTimeMs) && fastPacketLifeTimeMs > 0 && fastPacketLifeTimeMs <= 1000 ? fastPacketLifeTimeMs : null;
    let destroyed = false, timer = null;
    function report(s) {
      onChange({ session: s.id, stream: s.stream, peer: s.peer, role: s.role,
        transport: s.direct ? 'webrtc' : 'socket', ...s.stats });
    }
    function reset(s) { if (s.role === 'host') onReset({ from: s.peer, stream: s.stream, session: s.id }); }
    function envelope(s, input, lane = 'event') {
      const packet = { v: 1, session: s.id, epoch: s.epoch, seq: ++s.seq, lane, input };
      if (lane === 'event') packet.held = { keys: [...s.keys], buttons: [...s.buttons], pad: s.pad };
      return packet;
    }
    function fallback(s, reason) {
      if (s.closed) return;
      const wasDirect = s.direct;
      s.direct = false; s.pingAt = null;
      if (wasDirect && s.role === 'guest') onFeedbackStop({ stream: s.stream, session: s.id });
      s.stats.reason = reason;
      if (wasDirect) { s.epoch++; if (s.active) transmit(s, null); }
      report(s);
    }
    function transmit(s, input) {
      if (s.closed || !socket.connected) return false;
      let lane = s.direct && input?.kind === 'move' ? 'move' : s.direct && input?.kind === 'analog' ? 'analog' : 'event';
      let channel = lane === 'event' ? s.events : s.moves;
      if (s.direct && (s.events?.readyState !== 'open' || s.events.bufferedAmount > MAX_BUFFER)) {
        fallback(s, 'Fila de comandos congestionada; usando servidor.');
        lane = 'event'; channel = null;
      }
      // Movimentos são substituíveis. Nunca acumula uma fila de posições antigas.
      if (s.direct && lane !== 'event') {
        if (!channel || channel.readyState !== 'open') return false;
        s.stats.maxFastBufferedAmount = Math.max(s.stats.maxFastBufferedAmount || 0, channel.bufferedAmount);
        if (channel.bufferedAmount > fastBufferLimit) {
          s.stats.droppedFastSnapshots = (s.stats.droppedFastSnapshots || 0) + 1;
          return false;
        }
      }
      if (lane === 'event' && input?.kind === 'analog') input = null;
      const packet = envelope(s, input, lane);
      if (s.direct) {
        try {
          const data = lane !== 'event' && s.binaryFast ? wire.encodeFast(packet) : null;
          const payload = data || JSON.stringify(packet);
          channel.send(payload);
          s.stats.peerPacketsSent = (s.stats.peerPacketsSent || 0) + 1;
          if (lane !== 'event') {
            s.stats.fastPayloadBytesSent = (s.stats.fastPayloadBytesSent || 0) + (data ? data.byteLength : payload.length);
            const counter = data ? 'binaryFastPacketsSent' : 'jsonFastPacketsSent';
            s.stats[counter] = (s.stats[counter] || 0) + 1;
          }
          if (lane === 'analog') s.stats.analogPacketsSent = (s.stats.analogPacketsSent || 0) + 1;
          return true;
        }
        catch { fallback(s, 'Canal de comandos indisponível; usando servidor.'); return transmit(s, input); }
      }
      const engine = socket.io?.engine;
      if (engine && (engine.transport?.writable === false || engine.writeBuffer?.length
        || (engine.transport?.ws?.bufferedAmount || 0) > MAX_BUFFER)) {
        s.stats.droppedSnapshots = (s.stats.droppedSnapshots || 0) + 1;
        s.stats.reason = 'Transporte pelo servidor ocupado; aguardando snapshot atual.';
        return false;
      }
      (socket.volatile || socket).emit('control:packet', { stream: s.stream, packet });
      s.stats.socketPacketsSent = (s.stats.socketPacketsSent || 0) + 1;
      return true;
    }
    function signal(s, data) {
      if (!s.closed && socket.connected) socket.emit('control:signal', { to: s.peer, session: s.id, stream: s.stream, data });
    }
    function bind(s, channel) {
      const key = channel.label === 'wss-control-events-v1' ? 'events' : channel.label === 'wss-control-moves-v1' ? 'moves' : null;
      if (s.closed || !key || s[key]) { channel.close(); return; }
      channel.binaryType = 'arraybuffer';
      s[key] = channel;
      if (key === 'moves') {
        s.stats.fastMaxPacketLifeTime = channel.maxPacketLifeTime ?? null;
        s.stats.fastMaxRetransmits = channel.maxRetransmits ?? null;
      }
      channel.onopen = () => {
        if (s.closed || key !== 'events') return;
        if (s.role === 'guest') {
          onFeedbackStop({ stream: s.stream, session: s.id });
          s.direct = true; s.epoch++; s.stats.reason = '';
          // Sincroniza tudo antes dos próximos eventos; gerações antigas são ignoradas.
          transmit(s, null);
          try { channel.send(JSON.stringify({ meta: 'feedback-capabilities', supported: typeof onFeedback === 'function' })); } catch {}
        } else {
          try { channel.send(JSON.stringify({ meta: 'capabilities', analog: true, fastBinary: binaryEnabled ? 1 : 0 })); }
          catch { fallback(s, 'Não foi possível anunciar os canais de comandos.'); }
        }
        report(s);
      };
      channel.onclose = () => fallback(s, 'Canal fechado; usando servidor.');
      channel.onerror = () => fallback(s, 'Erro no canal; usando servidor.');
      channel.onmessage = ({ data }) => {
        if (s.closed) return;
        // Antes de JSON/decode e incluindo mensagens inválidas. A rajada rápida
        // não pode consumir toda a capacidade de solturas/snapshots confiáveis.
        if (!s.ingress.accept(key === 'moves')) {
          s.stats.droppedIncomingPackets = (s.stats.droppedIncomingPackets || 0) + 1;
          return;
        }
        const text = typeof data === 'string';
        if (text ? data.length > wire.MAX_BYTES : !binaryEnabled || s.role !== 'host' || key !== 'moves'
          || data?.byteLength > wire.FAST_MAX_BYTES) return;
        let p; try { p = text ? JSON.parse(data) : wire.decodeFast(data, s.devices, s.id); } catch { return; }
        if (!p) return;
        if (key === 'events' && p?.meta === 'capabilities' && s.role === 'guest') {
          s.analogSupported = p.analog === true;
          s.binaryFast = Boolean(binaryEnabled && p.fastBinary === 1);
          s.stats.fastFormat = s.binaryFast ? 'binary-v1' : 'json'; report(s); return;
        }
        if (key === 'events' && p?.meta === 'feedback-capabilities' && s.role === 'host') {
          s.feedbackSupported = p.supported === true; return;
        }
        if (key === 'events' && p?.meta === 'feedback') { acceptFeedback(s, p.packet); return; }
        if (key === 'events' && p?.meta === 'ping' && Number.isFinite(p.at)) {
          if (s.role === 'host' && channel.bufferedAmount < MAX_BUFFER) {
            try { channel.send(JSON.stringify({ meta: 'pong', at: p.at })); }
            catch { fallback(s, 'Canal de diagnóstico indisponível.'); }
          }
          return;
        }
        if (key === 'events' && p?.meta === 'pong' && s.role === 'guest' && p.at === s.pingAt) {
          s.stats.commandRttMs = Math.max(0, now() - p.at); s.pingAt = null;
          s.rtt.push(s.stats.commandRttMs); if (s.rtt.length > 120) s.rtt.shift();
          s.pressureRttMs = Math.min(...s.rtt) + 80;
          s.stats.commandLatency = root.WssNetworkHealth.percentiles(s.rtt); report(s); return;
        }
        if (s.role !== 'host' || (key === 'moves') !== (p?.lane === 'move' || p?.lane === 'analog')) return;
        if (s.receiver.accept(p)) {
          s.direct = true; s.remoteEpoch = p.epoch;
          if (!text) s.stats.binaryFastPacketsReceived = (s.stats.binaryFastPacketsReceived || 0) + 1;
          onActivity({ from: s.peer, stream: s.stream, session: s.id, gamepad: Boolean(p.held?.pad) });
        }
      };
    }
    async function connect(s) {
      if (!PeerConnection) { fallback(s, 'WebRTC indisponível neste cliente; usando servidor.'); return; }
      try {
        const servers = await (typeof iceServers === 'function' ? iceServers() : iceServers);
        if (s.closed) return;
        const pc = new PeerConnection({ iceServers: servers }); s.pc = pc;
        pc.onicecandidate = ({ candidate }) => { if (candidate) signal(s, { type: 'candidate', candidate: candidate.toJSON ? candidate.toJSON() : candidate }); };
        pc.onconnectionstatechange = () => {
          if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) fallback(s, 'Conexão WebRTC interrompida; usando servidor.');
        };
        pc.ondatachannel = ({ channel }) => bind(s, channel);
        if (s.role === 'host') {
          bind(s, pc.createDataChannel('wss-control-events-v1', { ordered: true }));
          bind(s, pc.createDataChannel('wss-control-moves-v1', { ordered: false,
            ...(fastLifetime == null ? { maxRetransmits: 0 } : { maxPacketLifeTime: fastLifetime }) }));
          const offer = await pc.createOffer();
          if (s.closed || s.pc !== pc) return;
          await pc.setLocalDescription(offer);
          signal(s, { type: 'offer', sdp: pc.localDescription.sdp });
        }
      } catch { fallback(s, 'WebRTC indisponível; usando servidor.'); }
    }
    function add({ session, peer, stream, devices }, role) {
      if (!session || !peer || !stream || destroyed) return null;
      const old = sessions.get(session);
      if (old) return old;
      if (role === 'guest' && guests.has(stream)) remove(guests.get(stream));
      const s = { id: session, peer, stream, devices: model.permissions(devices), role, epoch: 1, seq: 0,
        keys: new Set(), buttons: new Set(), pad: null, active: false, direct: false, closed: false,
        stats: { reason: 'Negociando WebRTC; fallback pelo servidor disponível.', droppedIncomingPackets: 0 }, feedbackSeq: 0, lastFeedbackSeq: 0, feedbackAt: -Infinity, receivedFeedbackAt: -Infinity,
        rtt: [], pressureRttMs: Infinity, lastAnalogAt: null,
        pending: [], ingress: wire.createReceiveBudget({ now, totalRate: 450, fastRate: 300 }) };
      if (role === 'host') s.receiver = wire.createReceiver({ session, devices: s.devices, now,
        deliver: input => onInput({ ...input, from: peer, stream, session }), reset: () => reset(s) });
      sessions.set(session, s);
      if (!timer) timer = setInterval(tick, 100);
      if (role === 'guest') guests.set(stream, session);
      if (role === 'guest' && typeof onFeedback === 'function' && socket.connected) {
        socket.emit('control:feedback-capabilities', { stream, session, supported: true });
      }
      s.ready = connect(s); report(s); return s;
    }
    function remove(id) {
      const s = sessions.get(id); if (!s) return;
      s.closed = true; s.receiver?.neutralize();
      signalQueue.remove(s.id); s.pending.length = 0;
      if (s.role === 'guest') onFeedbackStop({ stream: s.stream, session: s.id });
      if (guests.get(s.stream) === id) guests.delete(s.stream);
      sessions.delete(id);
      if (!sessions.size && timer) { clearInterval(timer); timer = null; }
      s.events?.close(); s.moves?.close(); s.pc?.close();
    }
    async function handleSignal(msg) {
      const s = msg && sessions.get(msg.session);
      if (!s || msg.from !== s.peer || msg.stream !== s.stream) return;
      await s.ready;
      if (s.closed || !s.pc) return;
      const { data } = msg, pc = s.pc;
      if (data.type === 'offer' && s.role === 'guest' && !pc.remoteDescription) {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        if (s.closed || s.pc !== pc) return;
        const answer = await pc.createAnswer();
        if (s.closed || s.pc !== pc) return;
        await pc.setLocalDescription(answer);
        signal(s, { type: 'answer', sdp: pc.localDescription.sdp });
      } else if (data.type === 'answer' && s.role === 'host' && !pc.remoteDescription) {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      } else if (data.type === 'candidate') {
        if (!pc.remoteDescription) { if (s.pending.length < 64) s.pending.push({ candidate: data.candidate, address: msg.address }); return; }
        await addCandidate(pc, data.candidate, msg.address);
      }
      if (!s.closed && pc.remoteDescription) for (const { candidate, address } of s.pending.splice(0)) {
        if (s.closed || s.pc !== pc) return;
        await addCandidate(pc, candidate, address);
      }
    }
    async function addCandidate(pc, candidate, address) {
      const candidates = [candidate];
      const parts = candidate.candidate.split(' ');
      // Mesma estratégia da mídia: mDNS não atravessa a VPN. O endereço vem do
      // socket visto pelo servidor, nunca de um campo fornecido pelo remetente.
      if (parts[7] === 'host' && parts[4]?.endsWith('.local') && typeof address === 'string'
        && /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-fA-F0-9:]+$/.test(address)) {
        parts[4] = address; candidates.push({ ...candidate, candidate: parts.join(' ') });
      }
      for (const c of candidates) { try { await pc.addIceCandidate(c); } catch {} }
    }
    const signalHandler = msg => {
      const s = msg && sessions.get(msg.session); if (!s) return;
      if (s.closed || msg.from !== s.peer || msg.stream !== s.stream) return;
      const data = root.WssSignaling.cleanControl(msg.data); if (!data) return;
      const message = { from: s.peer, stream: s.stream, session: s.id, data,
        address: typeof msg.address === 'string' && msg.address.length <= 64 ? msg.address : null };
      if (!signalQueue.enqueue(s.id, { session: s, message })) {
        s.stats.droppedSignals = (s.stats.droppedSignals || 0) + 1;
        if (s.stats.droppedSignals === 1) report(s);
      }
    };
    const packetHandler = msg => {
      const s = msg && sessions.get(msg.packet?.session);
      if (!s || s.role !== 'host' || msg.from !== s.peer || msg.stream !== s.stream) return;
      if (s.receiver.accept(msg.packet)) {
        s.direct = false; s.remoteEpoch = msg.packet.epoch;
        onActivity({ from: s.peer, stream: s.stream, session: s.id, gamepad: Boolean(msg.packet.held?.pad) });
      }
    };
    function acceptFeedback(s, value) {
      if (s.closed || s.role !== 'guest' || !s.devices.gamepad || !s.active || !s.pad || typeof onFeedback !== 'function') return;
      const packet = wire.cleanFeedback(value, s.id);
      if (!packet || packet.epoch !== s.epoch || packet.seq <= s.lastFeedbackSeq) return;
      s.lastFeedbackSeq = packet.seq;
      if ((packet.strong || packet.weak) && now() - s.receivedFeedbackAt < 25) return;
      s.receivedFeedbackAt = now();
      onFeedback({ ...packet, from: s.peer, stream: s.stream });
    }
    const feedbackHandler = msg => {
      const s = msg && sessions.get(msg.packet?.session);
      if (s && msg.from === s.peer && msg.stream === s.stream && !s.direct) acceptFeedback(s, msg.packet);
    };
    const feedbackCapabilityHandler = msg => {
      const s = msg && sessions.get(msg.session);
      if (s?.role === 'host' && msg.from === s.peer && msg.stream === s.stream) s.feedbackSupported = msg.supported === true;
    };
    const revokedHandler = msg => {
      for (const s of sessions.values()) if (s.stream === msg.stream && (msg.mine ? s.role === 'host' && (!msg.to || s.peer === msg.to) : s.role === 'guest')) remove(s.id);
    };
    const disconnectHandler = () => { for (const id of sessions.keys()) remove(id); signalQueue.reset(); };
    socket.on('control:signal', signalHandler); socket.on('control:packet', packetHandler);
    socket.on('control:feedback', feedbackHandler);
    socket.on('control:feedback-capabilities', feedbackCapabilityHandler);
    socket.on('control:revoked', revokedHandler); socket.on('disconnect', disconnectHandler);
    function tick() {
      for (const s of sessions.values()) {
        if (s.role === 'host') {
          s.receiver.expire();
          if(now()-(s.lastHostReport||0)>=2000){s.lastHostReport=now();report(s);}
          continue;
        }
        if (s.active) transmit(s, null); // heartbeat + snapshot: recupera solturas e alimenta watchdog
        const time = now();
        // Não substitui uma observação pendente por outra: isso ocultaria RTTs
        // maiores que 1 s. Timeout é ausência de resposta, não uma amostra zero.
        if (s.direct && s.pingAt != null && time - s.pingAt >= 5000) {
          s.pingAt = null;
          s.stats.commandProbeTimeouts = (s.stats.commandProbeTimeouts || 0) + 1;
          report(s);
        }
        if (s.direct && s.pingAt == null && time - (s.lastPing || 0) >= 1000 && s.events.bufferedAmount < MAX_BUFFER) {
          s.lastPing = s.pingAt = time;
          try { s.events.send(JSON.stringify({ meta: 'ping', at: time })); }
          catch { fallback(s, 'Erro no diagnóstico do canal; usando servidor.'); }
        }
        if (s.pc && !s.statsPending && time - (s.lastStats || 0) >= 2000) {
          s.lastStats = time; s.statsPending = true;
          s.pc.getStats().then(stats => {
            if (s.closed) return;
            const pair = root.WssNetworkHealth.selectedPair(stats);
            const route = root.WssNetworkHealth.routeFromStats(stats);
            s.stats.route = route.kind; s.stats.routeLabel = route.label; s.stats.protocol = route.protocol; s.stats.vpn = route.vpn;
            s.stats.networkRttMs = pair?.currentRoundTripTime == null ? null : pair.currentRoundTripTime * 1000;
            report(s);
          }).catch(() => {}).finally(() => { s.statsPending = false; });
        }
      }
    }
    return {
      host: grant => add(grant, 'host'), guest: grant => add(grant, 'guest'),
      feedback(peer, value) {
        const s = [...sessions.values()].find(s => s.role === 'host' && s.peer === peer && s.devices.gamepad);
        if (!s || s.closed || !socket.connected || !s.remoteEpoch || !s.feedbackSupported) return false;
        const packet = wire.cleanFeedback({ ...value, v: 1, session: s.id, epoch: s.remoteEpoch, seq: s.feedbackSeq + 1 }, s.id);
        if (!packet || ((packet.strong || packet.weak) && now() - s.feedbackAt < 40)) return false;
        if (s.direct) {
          if (!s.feedbackSupported || s.events?.readyState !== 'open' || s.events.bufferedAmount > MAX_BUFFER) return false;
          try { s.events.send(JSON.stringify({ meta: 'feedback', packet })); } catch { return false; }
        } else {
          const engine = socket.io?.engine;
          if (engine && (engine.transport?.writable === false || engine.writeBuffer?.length
            || (engine.transport?.ws?.bufferedAmount || 0) > MAX_BUFFER)) return false;
          (socket.volatile || socket).emit('control:feedback', { to: s.peer, stream: s.stream, packet });
        }
        s.feedbackAt = now(); s.feedbackSeq++; return true;
      },
      send(stream, value) {
        const s = sessions.get(guests.get(stream)); if (!s) return false;
        const input = wire.cleanInput(value, s.devices); if (!input) return true;
        s.active = true;
        if (input.kind === 'key') {
          if (input.down && !s.keys.has(input.code) && s.keys.size >= 32) return true;
          if (input.down) s.keys.add(input.code); else s.keys.delete(input.code);
        } else if (input.kind === 'button') {
          if (input.down) s.buttons.add(input.button); else s.buttons.delete(input.button);
        } else if (input.kind === 'gamepad') {
          const previous = s.pad;
          s.pad = { axes: input.axes, buttons: input.buttons };
          const digitalChanged = !previous || input.buttons.some((v, i) => i !== 6 && i !== 7 && (v >= 0.5) !== (previous.buttons[i] >= 0.5));
          const analogChanged = !previous || input.axes.some((v, i) => v !== previous.axes[i])
            || input.buttons[6] !== previous.buttons[6] || input.buttons[7] !== previous.buttons[7];
          if (!s.direct || !s.analogSupported || digitalChanged) transmit(s, null);
          else if (analogChanged) {
            const time = now();
            const probeAge = s.pingAt == null ? 0 : time - s.pingAt;
            const delayed = Math.max(probeAge, s.stats.commandRttMs || 0) > s.pressureRttMs;
            // Sob pressão, o próximo envio leva os eixos mais recentes. O
            // heartbeat também leva o último estado se o movimento terminar.
            if (!delayed || s.lastAnalogAt == null || time - s.lastAnalogAt >= 32) {
              if (transmit(s, { kind: 'analog', axes: input.axes, triggers: [input.buttons[6], input.buttons[7]] })) s.lastAnalogAt = time;
            }
          }
          return true;
        }
        transmit(s, input.kind === 'gamepad' ? null : input); return true;
      },
      stop(stream) {
        const s = sessions.get(guests.get(stream)); if (!s) return;
        onFeedbackStop({ stream: s.stream, session: s.id });
        s.keys.clear(); s.buttons.clear(); if (s.pad) s.pad = model.neutral();
        transmit(s, null); s.active = false;
      },
      revoke(peer) { for (const s of sessions.values()) if (s.role === 'host' && (!peer || peer === s.peer)) remove(s.id); },
      legacyAllowed(peer) { return ![...sessions.values()].some(s => s.role === 'host' && s.peer === peer && s.receiver.modern); },
      snapshot: () => [...sessions.values()].map(s => ({ stream: s.stream, peer: s.peer, role: s.role,
        transport: s.direct ? 'webrtc' : 'socket', signalingPending: signalQueue.sizeFor(s.id), ...s.stats })),
      destroy() {
        destroyed = true; disconnectHandler(); clearInterval(timer);
        socket.off('control:signal', signalHandler); socket.off('control:packet', packetHandler);
        socket.off('control:feedback', feedbackHandler);
        socket.off('control:feedback-capabilities', feedbackCapabilityHandler);
        socket.off('control:revoked', revokedHandler); socket.off('disconnect', disconnectHandler);
      },
    };
  }
  root.WssControlTransport = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
