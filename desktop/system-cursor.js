// O mouse do Windows de quem transmite, enquanto outra pessoa controla:
// - hide(): some (vira transparente) em todos os programas, então ele não aparece na
//   transmissão junto com o mouse de quem controla (o Chromium desenha na captura o
//   cursor que o Windows mostra). Quem transmite continua vendo onde ele está: a camada
//   de marcações (que fica fora da captura) desenha um no lugar.
// - restore(): volta o do usuário (o esquema de cursores dele, do registro).
// - shape(): o formato agora (seta, texto, mãozinha...), em nome de cursor do CSS, pra quem
//   controla ver o mouse dele com o mesmo formato.
// Só no Windows (user32.dll pela koffi, como o input.js). Se o app fechar com o mouse
// escondido, um arquivo marca isso e a próxima abertura devolve o mouse.
const fs = require('fs');

// Cursores do sistema (OCR_*/IDC_*) e o nome deles no CSS.
const SHAPES = new Map([
  [32512, 'default'], [32513, 'text'], [32514, 'wait'], [32515, 'crosshair'], [32516, 'default'],
  [32642, 'nwse-resize'], [32643, 'nesw-resize'], [32644, 'ew-resize'], [32645, 'ns-resize'],
  [32646, 'move'], [32648, 'not-allowed'], [32649, 'pointer'], [32650, 'progress'], [32651, 'help'],
  [32671, 'default'], [32672, 'default'],
]);
const CSS_SHAPES = new Set([...SHAPES.values(), 'none']);

let api = null; // as funções do Windows (uma vez só: os tipos da koffi têm nome único)
function windowsApi() {
  if (api) return api;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const POINT = koffi.struct('WssCursorPoint', { x: 'int32', y: 'int32' });
  const CURSORINFO = koffi.struct('WssCursorInfo', { cbSize: 'uint32', flags: 'uint32', hCursor: 'uintptr', ptScreenPos: POINT });
  api = {
    size: koffi.sizeof(CURSORINFO),
    LoadCursorW: user32.func('__stdcall', 'LoadCursorW', 'uintptr', ['uintptr', 'uintptr']),
    CreateCursor: user32.func('__stdcall', 'CreateCursor', 'uintptr', ['uintptr', 'int', 'int', 'int', 'int', 'void *', 'void *']),
    SetSystemCursor: user32.func('__stdcall', 'SetSystemCursor', 'bool', ['uintptr', 'uint32']),
    SystemParametersInfoW: user32.func('__stdcall', 'SystemParametersInfoW', 'bool', ['uint32', 'uint32', 'void *', 'uint32']),
    GetCursorInfo: user32.func('__stdcall', 'GetCursorInfo', 'bool', [koffi.inout(koffi.pointer(CURSORINFO))]),
  };
  return api;
}

// Pros testes fora do Windows (WSS_FAKE_SYSTEM_CURSOR=1): finge esconder e diz um formato.
function fakeCursor() {
  let hidden = false;
  return {
    get hidden() { return hidden; },
    hide() { hidden = true; },
    restore() { hidden = false; },
    shape: () => process.env.WSS_FAKE_CURSOR_SHAPE || 'pointer',
  };
}

function createSystemCursor({ markerFile } = {}) {
  if (process.env.WSS_FAKE_SYSTEM_CURSOR === '1') return fakeCursor();
  if (process.platform !== 'win32') return null;
  let w;
  try { w = windowsApi(); } catch (err) {
    console.error('Cursor do sistema indisponível:', err.message);
    return null;
  }
  // Cada cursor do sistema por handle (o mesmo depois de trocar o desenho: o Windows troca
  // o conteúdo, não o handle, por isso dá pra saber o formato com ele escondido).
  const byHandle = new Map();
  for (const [id, css] of SHAPES) {
    const handle = w.LoadCursorW(0, id);
    if (handle) byHandle.set(String(handle), css);
  }
  // 32×32 monocromático: AND tudo 1 e XOR tudo 0 = transparente.
  const AND = Buffer.alloc(128, 0xff);
  const XOR = Buffer.alloc(128, 0x00);
  const info = { cbSize: w.size, flags: 0, hCursor: 0, ptScreenPos: { x: 0, y: 0 } };
  let hidden = false;
  const mark = (on) => {
    if (!markerFile) return;
    try {
      if (on) fs.writeFileSync(markerFile, String(Date.now()));
      else fs.rmSync(markerFile, { force: true });
    } catch {}
  };
  const self = {
    get hidden() { return hidden; },
    hide() {
      if (hidden) return;
      hidden = true;
      mark(true); // antes: se o app cair no meio, a próxima abertura devolve o mouse
      for (const id of SHAPES.keys()) {
        const blank = w.CreateCursor(0, 0, 0, 32, 32, AND, XOR);
        if (blank) w.SetSystemCursor(blank, id); // o Windows fica com ele (e apaga depois)
      }
    },
    restore(force = false) {
      if (!hidden && !force) return;
      hidden = false;
      w.SystemParametersInfoW(0x0057, 0, null, 0); // SPI_SETCURSORS: recarrega os do usuário
      mark(false);
    },
    shape() {
      info.cbSize = w.size;
      if (!w.GetCursorInfo(info)) return null;
      if (!(info.flags & 1)) return 'none'; // CURSOR_SHOWING desligado (o programa escondeu)
      return byHandle.get(String(info.hCursor)) || 'default';
    },
  };
  // O app fechou (ou caiu) da última vez com o mouse escondido: devolve agora.
  try { if (markerFile && fs.existsSync(markerFile)) self.restore(true); } catch {}
  return self;
}

module.exports = { createSystemCursor, CSS_SHAPES };
