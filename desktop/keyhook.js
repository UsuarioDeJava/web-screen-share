// Teclado inteiro pra quem você controla (Windows). Com o app na frente e o mouse em cima
// da transmissão que você controla, um gancho de teclado de baixo nível pega as teclas
// antes do Windows (Win, Alt+Tab, Alt+F4, Ctrl+Esc, Print Screen, os atalhos de outros
// programas...) e manda tudo pra lá, em vez de agir aqui. Só Ctrl+Alt+Del (e Win+L) o
// Windows não deixa nenhum programa pegar.
const { codeForScan } = require('./input');

const WH_KEYBOARD_LL = 13;
const LLKHF_EXTENDED = 0x01;
const LLKHF_INJECTED = 0x10;
const LLKHF_UP = 0x80;
const ALTGR_CTRL = 0x21d; // o Ctrl de mentira que o Windows manda junto com o AltGr

// O que fazer com uma tecla de verdade que chegou no gancho. null: deixa passar (o Windows
// e os programas veem). Senão, a tecla é engolida e, com forward, vai pra lá.
// held: as teclas engolidas na descida (a subida delas também é nossa, mesmo que a captura
// tenha acabado no meio; e a subida de uma tecla apertada antes de capturar passa).
function keyAction({ scanCode, flags }, capturing, held, acceptInjected = false) {
  if ((flags & LLKHF_INJECTED) && !acceptInjected) return null; // tecla "digitada" por programa, não por você
  const up = Boolean(flags & LLKHF_UP);
  const altGrCtrl = scanCode === ALTGR_CTRL;
  const code = altGrCtrl ? 'AltGrCtrl' : codeForScan(scanCode & 0xff, Boolean(flags & LLKHF_EXTENDED));
  if (!code) return null;
  if (!up) {
    if (!capturing) return null;
    held.add(code);
    return { code, down: true, forward: !altGrCtrl };
  }
  if (!held.delete(code)) return null;
  return { code, down: false, forward: !altGrCtrl };
}

let api; // funções do Windows (carregadas uma vez: os tipos da koffi têm nome único)
function loadApi() {
  if (api) return api;
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const KBD = koffi.struct('KBDLLHOOKSTRUCT', { vkCode: 'uint32', scanCode: 'uint32', flags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr' });
  const HookProc = koffi.proto('__stdcall', 'LowLevelKeyboardProc', 'intptr', ['int', 'uintptr', 'void *']);
  api = {
    koffi,
    KBD,
    HookProc,
    SetWindowsHookExW: user32.func('__stdcall', 'SetWindowsHookExW', 'void *', ['int', koffi.pointer(HookProc), 'void *', 'uint32']),
    CallNextHookEx: user32.func('__stdcall', 'CallNextHookEx', 'intptr', ['void *', 'int', 'uintptr', 'void *']),
    UnhookWindowsHookEx: user32.func('__stdcall', 'UnhookWindowsHookEx', 'bool', ['void *']),
    GetModuleHandleW: kernel32.func('__stdcall', 'GetModuleHandleW', 'void *', ['str16']),
  };
  return api;
}

// shouldCapture(): pegar as teclas agora? onKey(code, down): uma tecla pra mandar.
// O gancho só fica instalado enquanto start() valer (o resto do tempo, nada muda).
// acceptInjected: só pro autoteste (lá a tecla é "apertada" por programa).
function createKeyHook({ shouldCapture, onKey, acceptInjected = false }) {
  if (process.platform !== 'win32') return null;
  let win;
  try {
    win = loadApi();
  } catch (err) {
    console.error('Captura do teclado indisponível:', err.message);
    return null;
  }
  const held = new Set();
  let hook = null;
  let proc = null;

  const handle = (nCode, wParam, lParam) => {
    if (nCode === 0) {
      try {
        const action = keyAction(win.koffi.decode(lParam, win.KBD), shouldCapture(), held, acceptInjected);
        if (action) {
          if (action.forward) onKey(action.code, action.down);
          return 1; // engolida: o Windows e os outros programas não veem
        }
      } catch (err) {
        console.error('Captura do teclado:', err.message);
      }
    }
    return win.CallNextHookEx(null, nCode, wParam, lParam);
  };

  return {
    start() {
      if (hook) return true;
      try {
        proc = win.koffi.register(handle, win.koffi.pointer(win.HookProc));
        hook = win.SetWindowsHookExW(WH_KEYBOARD_LL, proc, win.GetModuleHandleW(null), 0);
      } catch (err) {
        console.error('Captura do teclado:', err.message);
        hook = null;
      }
      if (!hook && proc) {
        win.koffi.unregister(proc);
        proc = null;
      }
      return Boolean(hook);
    },
    stop() {
      if (!hook) return;
      try {
        win.UnhookWindowsHookEx(hook);
        win.koffi.unregister(proc);
      } catch {}
      hook = null;
      proc = null;
      held.clear();
    },
  };
}

module.exports = { createKeyHook, keyAction };
