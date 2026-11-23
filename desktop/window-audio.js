// "Só o som deste programa": na transmissão de uma janela, o som vem só do programa dela
// (veja window-audio-worker.js, que roda num processo separado). Aqui: liga e desliga esse
// processo e repassa o som pra página da sala (send), que troca o som do PC por ele.
const os = require('os');
const path = require('path');
const { utilityProcess } = require('electron');

// Windows 10 2004 (build 19041) ou mais novo; WSS_FAKE_WINDOW_AUDIO nos testes (1: um tom;
// error: finge que o Windows recusou).
const SUPPORTED = ['1', 'error'].includes(process.env.WSS_FAKE_WINDOW_AUDIO)
  || (process.platform === 'win32' && Number(os.release().split('.')[2] || 0) >= 19041);
const READY_TIMEOUT_MS = 6000;
const UNUSED_MS = 15000; // a sala não pediu o som (servidor antigo): para

function createWindowAudio({ send, log = () => {} }) {
  let current = null; // { child, ready: Promise<{ ok, rate, channels } | { error }> }

  function stop() {
    const was = current;
    current = null;
    if (!was) return;
    try { was.child.postMessage({ stop: true }); } catch {}
    setTimeout(() => { try { was.child.kill(); } catch {} }, 1000).unref();
  }

  // sourceId: o id da janela no seletor ("window:<hwnd>:0").
  function start(sourceId) {
    stop();
    const match = /^window:(\d+):/.exec(String(sourceId || ''));
    if (!SUPPORTED || !match) return false;
    const child = utilityProcess.fork(path.join(__dirname, 'window-audio-worker.js'), [], {
      serviceName: 'Web Screen Share (som da janela)',
      env: { ...process.env },
    });
    const entry = { child, ready: null, asked: false };
    setTimeout(() => { if (current === entry && !entry.asked) stop(); }, UNUSED_MS).unref();
    entry.ready = new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ error: 'o som do programa não respondeu' });
        if (current === entry) stop();
      }, READY_TIMEOUT_MS);
      child.on('message', (msg) => {
        if (current !== entry || !msg) return;
        if (msg.pcm) send(msg.pcm);
        else if (msg.ready) {
          clearTimeout(timer);
          resolve({ ok: true, rate: Number(msg.ready.rate) || 48000, channels: Number(msg.ready.channels) || 2 });
        } else if (msg.error) {
          clearTimeout(timer);
          log(`Som só do programa: ${String(msg.error).slice(0, 200)}`);
          resolve({ error: String(msg.error).slice(0, 200) });
          stop();
        }
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ error: `o processo do som parou (${code})` });
        if (current === entry) current = null;
      });
    });
    current = entry;
    child.postMessage({ start: { hwnd: match[1] } });
    return true;
  }

  return {
    supported: SUPPORTED,
    start,
    stop,
    // Pra página: o som do programa está vindo? { wanted: false } quando não foi pedido.
    async status() {
      if (!current) return { wanted: false };
      current.asked = true;
      return { wanted: true, ...(await current.ready) };
    },
  };
}

module.exports = { createWindowAudio };
