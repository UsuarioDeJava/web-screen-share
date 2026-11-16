// Mouse e teclado de verdade, pra quem você deixou controlar a sua tela.
// Windows: user32.dll (SetCursorPos, mouse_event, keybd_event) pela koffi, sem compilar
// nada. Linux: xdotool, se estiver instalado. Teclas pela posição física (KeyboardEvent
// .code), então com o mesmo layout dos dois lados (ex.: ABNT2) sai igualzinho.
const { spawn, spawnSync } = require('child_process');

// KeyboardEvent.code -> [scan code (conjunto 1), tecla estendida (prefixo E0)]
const SCAN = {
  Escape: [0x01], Digit1: [0x02], Digit2: [0x03], Digit3: [0x04], Digit4: [0x05], Digit5: [0x06],
  Digit6: [0x07], Digit7: [0x08], Digit8: [0x09], Digit9: [0x0a], Digit0: [0x0b], Minus: [0x0c],
  Equal: [0x0d], Backspace: [0x0e], Tab: [0x0f], KeyQ: [0x10], KeyW: [0x11], KeyE: [0x12],
  KeyR: [0x13], KeyT: [0x14], KeyY: [0x15], KeyU: [0x16], KeyI: [0x17], KeyO: [0x18], KeyP: [0x19],
  BracketLeft: [0x1a], BracketRight: [0x1b], Enter: [0x1c], ControlLeft: [0x1d], KeyA: [0x1e],
  KeyS: [0x1f], KeyD: [0x20], KeyF: [0x21], KeyG: [0x22], KeyH: [0x23], KeyJ: [0x24], KeyK: [0x25],
  KeyL: [0x26], Semicolon: [0x27], Quote: [0x28], Backquote: [0x29], ShiftLeft: [0x2a],
  Backslash: [0x2b], KeyZ: [0x2c], KeyX: [0x2d], KeyC: [0x2e], KeyV: [0x2f], KeyB: [0x30],
  KeyN: [0x31], KeyM: [0x32], Comma: [0x33], Period: [0x34], Slash: [0x35], ShiftRight: [0x36],
  NumpadMultiply: [0x37], AltLeft: [0x38], Space: [0x39], CapsLock: [0x3a], F1: [0x3b], F2: [0x3c],
  F3: [0x3d], F4: [0x3e], F5: [0x3f], F6: [0x40], F7: [0x41], F8: [0x42], F9: [0x43], F10: [0x44],
  NumLock: [0x45], ScrollLock: [0x46], Numpad7: [0x47], Numpad8: [0x48], Numpad9: [0x49],
  NumpadSubtract: [0x4a], Numpad4: [0x4b], Numpad5: [0x4c], Numpad6: [0x4d], NumpadAdd: [0x4e],
  Numpad1: [0x4f], Numpad2: [0x50], Numpad3: [0x51], Numpad0: [0x52], NumpadDecimal: [0x53],
  IntlBackslash: [0x56], F11: [0x57], F12: [0x58], IntlRo: [0x73], NumpadComma: [0x7e],
  NumpadEnter: [0x1c, true], ControlRight: [0x1d, true], NumpadDivide: [0x35, true],
  PrintScreen: [0x37, true], AltRight: [0x38, true], Home: [0x47, true], ArrowUp: [0x48, true],
  PageUp: [0x49, true], ArrowLeft: [0x4b, true], ArrowRight: [0x4d, true], End: [0x4f, true],
  ArrowDown: [0x50, true], PageDown: [0x51, true], Insert: [0x52, true], Delete: [0x53, true],
  ContextMenu: [0x5d, true],
};

// KeyboardEvent.code -> nome da tecla no X11 (xdotool).
const XKEYS = {
  Escape: 'Escape', Minus: 'minus', Equal: 'equal', Backspace: 'BackSpace', Tab: 'Tab',
  BracketLeft: 'bracketleft', BracketRight: 'bracketright', Enter: 'Return', ControlLeft: 'Control_L',
  Semicolon: 'semicolon', Quote: 'apostrophe', Backquote: 'grave', ShiftLeft: 'Shift_L',
  Backslash: 'backslash', Comma: 'comma', Period: 'period', Slash: 'slash', ShiftRight: 'Shift_R',
  NumpadMultiply: 'KP_Multiply', AltLeft: 'Alt_L', Space: 'space', CapsLock: 'Caps_Lock',
  NumLock: 'Num_Lock', ScrollLock: 'Scroll_Lock', NumpadSubtract: 'KP_Subtract', NumpadAdd: 'KP_Add',
  NumpadDecimal: 'KP_Decimal', NumpadEnter: 'KP_Enter', ControlRight: 'Control_R', NumpadDivide: 'KP_Divide',
  PrintScreen: 'Print', AltRight: 'ISO_Level3_Shift', Home: 'Home', ArrowUp: 'Up', PageUp: 'Prior',
  ArrowLeft: 'Left', ArrowRight: 'Right', End: 'End', ArrowDown: 'Down', PageDown: 'Next',
  Insert: 'Insert', Delete: 'Delete', ContextMenu: 'Menu',
};
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') XKEYS[`Key${c}`] = c.toLowerCase();
for (let d = 0; d <= 9; d += 1) {
  XKEYS[`Digit${d}`] = String(d);
  XKEYS[`Numpad${d}`] = `KP_${d}`;
}
for (let f = 1; f <= 12; f += 1) XKEYS[`F${f}`] = `F${f}`;

// A tecla do Windows fica de fora: abriria o Iniciar ou bloquearia o PC (Win+L).
const BLOCKED = new Set(['MetaLeft', 'MetaRight', 'OSLeft', 'OSRight']);

function windowsInput() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const SetCursorPos = user32.func('__stdcall', 'SetCursorPos', 'bool', ['int', 'int']);
  const mouseEvent = user32.func('__stdcall', 'mouse_event', 'void', ['uint32', 'uint32', 'uint32', 'int32', 'uintptr_t']);
  const keybdEvent = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr_t']);
  const getAsyncKeyState = user32.func('__stdcall', 'GetAsyncKeyState', 'short', ['int']);
  const BUTTONS = [[0x0002, 0x0004], [0x0020, 0x0040], [0x0008, 0x0010]]; // esquerdo, meio, direito
  return {
    move: (x, y) => SetCursorPos(Math.round(x), Math.round(y)),
    button: (button, down) => mouseEvent(BUTTONS[button][down ? 0 : 1], 0, 0, 0, 0),
    wheel: (notches) => mouseEvent(0x0800, 0, 0, Math.round(-notches * 120), 0),
    key: (code, down) => {
      const [scan, extended] = SCAN[code];
      keybdEvent(0, scan, 0x0008 | (extended ? 0x0001 : 0) | (down ? 0 : 0x0002), 0);
    },
    supports: (code) => Boolean(SCAN[code]),
    // Ctrl+Shift+X apertado agora (lido direto do teclado: vale mesmo se outro programa
    // tiver ficado com o atalho).
    revokeKeysDown: () => [0x11, 0x10, 0x58].every((vk) => getAsyncKeyState(vk) < 0),
    close: () => {},
  };
}

function xdotoolInput() {
  const found = spawnSync('xdotool', ['version'], { stdio: 'ignore' });
  if (found.error || found.status !== 0) return null;
  const proc = spawn('xdotool', ['-'], { stdio: ['pipe', 'ignore', 'ignore'] });
  proc.on('error', () => {});
  proc.stdin.on('error', () => {});
  const run = (line) => {
    if (!proc.killed && proc.stdin.writable) proc.stdin.write(`${line}\n`);
  };
  return {
    move: (x, y) => run(`mousemove ${Math.round(x)} ${Math.round(y)}`),
    button: (button, down) => run(`${down ? 'mousedown' : 'mouseup'} ${[1, 2, 3][button]}`),
    wheel: (notches) => {
      for (let i = 0; i < Math.min(10, Math.abs(Math.round(notches))); i += 1) run(`click ${notches > 0 ? 5 : 4}`);
    },
    key: (code, down) => run(`${down ? 'keydown' : 'keyup'} ${XKEYS[code]}`),
    supports: (code) => Boolean(XKEYS[code]),
    close: () => proc.kill(),
  };
}

// Guarda o que está apertado pra soltar tudo quando o controle acaba (sem tecla presa).
function createInput() {
  let backend = null;
  try {
    if (process.platform === 'win32') backend = windowsInput();
    else if (process.platform === 'linux') backend = xdotoolInput();
  } catch (err) {
    console.error('Controle remoto indisponível:', err.message);
    backend = null;
  }
  if (!backend) return null;
  const keys = new Set();
  const buttons = new Set();
  return {
    move: (x, y) => backend.move(x, y),
    button(button, down) {
      if (![0, 1, 2].includes(button)) return;
      if (down) buttons.add(button);
      else if (!buttons.delete(button)) return;
      backend.button(button, down);
    },
    wheel: (notches) => backend.wheel(Math.max(-10, Math.min(10, notches))),
    key(code, down) {
      if (BLOCKED.has(code) || !backend.supports(code)) return;
      if (down) keys.add(code);
      else if (!keys.delete(code)) return;
      backend.key(code, down);
    },
    releaseAll() {
      for (const code of [...keys]) this.key(code, false);
      for (const button of [...buttons]) this.button(button, false);
    },
    revokeKeysDown: backend.revokeKeysDown || null,
    close() {
      this.releaseAll();
      backend.close();
    },
  };
}

module.exports = { createInput };
