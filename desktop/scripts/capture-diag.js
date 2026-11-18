// Diagnóstico (Windows): a camada de marcações fica mesmo de fora da captura da tela?
// Abre janelas vermelhas iguais à camada, protege de jeitos diferentes, captura a tela
// como o app captura (desktopCapturer) e vê se o vermelho aparece. Resultado em
// DIAG_OUT (JSON). Uso: electron scripts/capture-diag.js
const { app, BrowserWindow, desktopCapturer, screen } = require('electron');
const fs = require('fs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let win32 = null;
try {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  win32 = {
    set: user32.func('__stdcall', 'SetWindowDisplayAffinity', 'bool', ['uintptr_t', 'uint32']),
    get: user32.func('__stdcall', 'GetWindowDisplayAffinity', 'bool', ['uintptr_t', koffi.out(koffi.pointer('uint32'))]),
    exStyle: user32.func('__stdcall', 'GetWindowLongPtrW', 'intptr_t', ['uintptr_t', 'int']),
    lastError: kernel32.func('__stdcall', 'GetLastError', 'uint32', []),
  };
} catch (err) {
  console.error('koffi:', err.message);
}

const hwndOf = (win) => {
  const b = win.getNativeWindowHandle();
  return b.length >= 8 ? b.readBigUInt64LE(0) : BigInt(b.readUInt32LE(0));
};

async function capture(point) {
  const d = screen.getPrimaryDisplay();
  const w = Math.round(d.size.width * d.scaleFactor);
  const h = Math.round(d.size.height * d.scaleFactor);
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
  const img = sources[0].thumbnail;
  const size = img.getSize();
  const bmp = img.toBitmap(); // BGRA
  const x = Math.round((point.x / d.size.width) * size.width);
  const y = Math.round((point.y / d.size.height) * size.height);
  const i = (y * size.width + x) * 4;
  return { r: bmp[i + 2], g: bmp[i + 1], b: bmp[i], size, sources: sources.length };
}

async function trial(name, opts) {
  const bounds = { x: 120, y: 120, width: 360, height: 260 };
  const win = new BrowserWindow({
    ...bounds,
    transparent: opts.transparent !== false,
    backgroundColor: opts.transparent === false ? '#ff0000' : '#00000000',
    frame: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
  });
  if (opts.ignore) win.setIgnoreMouseEvents(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  if (opts.before) win.setContentProtection(true);
  await win.loadURL(`data:text/html,${encodeURIComponent('<body style="margin:0;background:rgb(255,0,0)"></body>')}`);
  win.showInactive();
  await sleep(700);
  if (opts.after) win.setContentProtection(true);
  let direct = null;
  if (opts.direct && win32) direct = { ok: win32.set(hwndOf(win), 0x11), err: win32.lastError() };
  await sleep(700);
  let affinity = null;
  let exStyle = null;
  if (win32) {
    const out = [0];
    win32.get(hwndOf(win), out);
    affinity = out[0];
    exStyle = `0x${Number(win32.exStyle(hwndOf(win), -20)).toString(16)}`;
  }
  const pixel = await capture({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  win.destroy();
  await sleep(300);
  const red = pixel.r > 200 && pixel.g < 60 && pixel.b < 60;
  return { name, captured: red, affinity, exStyle, direct, pixel };
}

// As janelas de teste abrem e fecham: sem isso, o app fecharia junto com a primeira.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const results = [];
  const run = async (name, opts) => {
    try {
      results.push(await trial(name, opts));
    } catch (err) {
      results.push({ name, error: err.message });
    }
  };
  await run('sem proteção (o vermelho tem que aparecer)', { ignore: true });
  await run('como o app faz hoje (protege antes de mostrar)', { ignore: true, before: true });
  await run('protege depois de mostrar', { ignore: true, after: true });
  await run('antes e depois de mostrar', { ignore: true, before: true, after: true });
  await run('SetWindowDisplayAffinity direto, depois de mostrar', { ignore: true, direct: true });
  await run('sem atravessar o mouse, protege antes', { before: true });
  await run('janela opaca, protege antes', { transparent: false, ignore: true, before: true });
  const report = { os: process.getSystemVersion(), electron: process.versions.electron, results };
  const text = JSON.stringify(report, null, 2);
  console.log(text);
  if (process.env.DIAG_OUT) fs.writeFileSync(process.env.DIAG_OUT, text);
  app.exit(0);
});
