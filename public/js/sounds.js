// Sons curtos da sala (alguém entrou, saiu, começou a transmitir, mensagem no chat,
// alguém apontou na tela), gerados na hora pelo Web Audio: sem arquivos de áudio.
window.RoomSounds = (() => {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let enabled = true;
  try { enabled = localStorage.getItem('wss-sounds') !== '0'; } catch {}

  // [frequência, início (s), duração (s), opções]
  const SOUNDS = {
    join: [[659.25, 0, 0.16], [987.77, 0.09, 0.22]],
    leave: [[783.99, 0, 0.16], [523.25, 0.09, 0.24]],
    live: [[523.25, 0, 0.14], [659.25, 0.08, 0.14], [783.99, 0.16, 0.3]],
    message: [[880, 0, 0.1, { type: 'triangle', gain: 0.07 }], [1318.51, 0.06, 0.14, { type: 'triangle', gain: 0.05 }]],
    mention: [[987.77, 0, 0.12, { type: 'triangle' }], [1318.51, 0.1, 0.12, { type: 'triangle' }], [1760, 0.2, 0.22, { type: 'triangle' }]],
    ping: [[1046.5, 0, 0.16, { slideTo: 1567.98, gain: 0.05 }]],
  };

  function context() {
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(c, freq, start, dur, { type = 'sine', gain = 0.08, slideTo } = {}) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(amp).connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function play(name) {
    if (!enabled || !SOUNDS[name]) return;
    const c = context();
    if (!c || c.state !== 'running') return;
    const t = c.currentTime + 0.01;
    for (const [freq, at, dur, opts] of SOUNDS[name]) tone(c, freq, t + at, dur, opts);
  }

  return {
    play,
    // Chamado num clique: o navegador só libera áudio depois de um gesto da pessoa.
    unlock: context,
    get enabled() { return enabled; },
    set enabled(value) {
      enabled = Boolean(value);
      try { localStorage.setItem('wss-sounds', enabled ? '1' : '0'); } catch {}
    },
  };
})();
