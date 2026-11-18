const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBorderlessFullscreen } = require('../borderless-fullscreen');

function fixture(maximized = false) {
  const normal = { x: 100, y: 120, width: 1000, height: 700 };
  const monitor = { id: 2, bounds: { x: -2560, y: 0, width: 2560, height: 1440 } };
  let bounds = { ...normal };
  let topmost = false;
  let displays = [monitor];
  const win = {
    getBounds: () => ({ ...bounds }), getNormalBounds: () => ({ ...normal }),
    isMaximized: () => maximized, isFocused: () => true,
    maximize: () => { maximized = true; }, unmaximize: () => { maximized = false; },
    setBounds: (value) => { bounds = { ...value }; },
    setAlwaysOnTop: (value) => { topmost = value; },
    setFullScreen: () => { throw new Error('O fullscreen nativo não deve ser usado'); },
  };
  const screen = { getAllDisplays: () => displays, getDisplayMatching: () => displays[0] };
  const controller = createBorderlessFullscreen(win, screen);
  return { controller, win, monitor, normal, topmost: () => topmost, removeMonitor: () => {
    displays = [{ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }];
  } };
}

test('cobre o monitor e restaura posição e tamanho; chamadas repetidas são seguras', () => {
  const f = fixture();
  f.controller.set('html', true);
  f.controller.set('html', true);
  assert.deepEqual(f.win.getBounds(), f.monitor.bounds);
  assert.equal(f.topmost(), true);
  f.controller.exit();
  f.controller.exit();
  assert.deepEqual(f.win.getBounds(), f.normal);
  assert.equal(f.topmost(), false);
  assert.equal(f.controller.active, false);
});

test('sair do vídeo mantém o fullscreen solicitado por F11 e restaura maximização ao terminar', () => {
  const f = fixture(true);
  f.controller.set('window', true);
  f.controller.set('html', true);
  f.controller.set('html', false);
  assert.equal(f.controller.active, true);
  assert.deepEqual(f.controller.restoreState, { bounds: f.normal, maximized: true });
  f.controller.exit();
  assert.equal(f.win.isMaximized(), true);
  assert.equal(f.controller.restoreState, null);
});

test('permite alternar para outros aplicativos e recupera um monitor removido', () => {
  const f = fixture();
  f.controller.set('html', true);
  f.controller.focus(false);
  assert.equal(f.topmost(), false);
  f.controller.focus(true);
  assert.equal(f.topmost(), true);
  f.removeMonitor();
  f.controller.position();
  assert.deepEqual(f.win.getBounds(), { x: 0, y: 0, width: 1920, height: 1080 });
  f.controller.exit();
  f.controller.focus(true);
  assert.equal(f.topmost(), false);
});
