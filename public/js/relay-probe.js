(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssRelayProbe = factory();
})(globalThis, () => {
  // Echo em dois peers relay-only. Mede RTT de dados, nunca tempo de alocação.
  async function measure(server, { Peer = RTCPeerConnection, now = () => performance.now(), timeoutMs = 6000, signal } = {}) {
    let a, b, timer, abort;
    try {
      if (signal?.aborted) return null;
      a = new Peer({ iceServers: [server], iceTransportPolicy: 'relay' });
      b = new Peer({ iceServers: [server], iceTransportPolicy: 'relay' });
      const work = async () => {
        const queues = [[], []];
        const deliver = (pc, queue, candidate) => {
          if (pc.remoteDescription) pc.addIceCandidate(candidate).catch(() => {});
          else queue.push(candidate);
        };
        a.onicecandidate = e => { if (e.candidate) deliver(b, queues[1], e.candidate); };
        b.onicecandidate = e => { if (e.candidate) deliver(a, queues[0], e.candidate); };
        b.ondatachannel = e => { e.channel.onmessage = msg => { if (e.channel.readyState === 'open') e.channel.send(msg.data); }; };
        const channel = a.createDataChannel('relay-probe');
        const samples = [];
        const done = new Promise(resolve => {
          let sent, sequence = 0;
          const ping = () => {
            if (signal?.aborted || channel.readyState !== 'open') return;
            sent = now(); channel.send(String(++sequence));
          };
          channel.onopen = ping;
          channel.onmessage = e => {
            if (e.data !== String(sequence)) return;
            samples.push(now() - sent);
            if (samples.length < 5) ping();
            else resolve(Math.max(0.001, samples.sort((x, y) => x - y)[2]));
          };
        });
        await a.setLocalDescription(await a.createOffer());
        await b.setRemoteDescription(a.localDescription);
        for (const c of queues[1].splice(0)) await b.addIceCandidate(c);
        await b.setLocalDescription(await b.createAnswer());
        await a.setRemoteDescription(b.localDescription);
        for (const c of queues[0].splice(0)) await a.addIceCandidate(c);
        return done;
      };
      return await Promise.race([work(), new Promise(resolve => {
        timer = setTimeout(() => resolve(null), timeoutMs);
        abort = () => resolve(null);
        signal?.addEventListener('abort', abort, { once: true });
      })]);
    } catch { return null; }
    finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      a?.close(); b?.close();
    }
  }
  function start(socket, { measureRelay = measure } = {}) {
    const controller = new AbortController();
    let timer;
    const run = () => {
      if (controller.signal.aborted || !socket.connected) return;
      socket.timeout(10000).emit('relay:probe', null, async (error, round) => {
        if (controller.signal.aborted) return;
        if (error || !round) { timer = setTimeout(run, 60000); return; }
        const values = [];
        for (const candidate of round.candidates) {
          if (controller.signal.aborted) return;
          values.push(await measureRelay(candidate.server, { signal: controller.signal }));
        }
        if (controller.signal.aborted || !socket.connected) return;
        socket.emit('relay:report', { token: round.token, values });
        timer = setTimeout(run, 60000);
      });
    };
    run();
    return () => { clearTimeout(timer); controller.abort(); };
  }
  return { measure, start };
});
