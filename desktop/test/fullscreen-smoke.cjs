// Executar com: electron test/fullscreen-smoke.cjs
// Usa a janela e o preload reais, uma página local e um perfil temporário isolado.
const { app, BrowserWindow, screen } = require('electron');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');

const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><head><title>Fullscreen smoke test</title></head>'
    + '<body><form id="login-form"></form><main id="grid">Teste local</main></body></html>');
});

async function until(check, label) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timeout: ${label}`);
}

(async () => {
  let win;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.WSS_SERVER = `http://127.0.0.1:${server.address().port}`;
    process.env.WSS_USER_DATA = path.join(os.tmpdir(), `wss-fullscreen-smoke-${process.pid}`);
    process.env.WSS_BORDERLESS_FULLSCREEN = '1';
    delete process.env.WSS_DISABLE_HARDWARE_ACCELERATION;
    delete process.env.WSS_WINDOWED_FULLSCREEN;
    require('../main');
    await app.whenReady();
    await until(() => {
      win = BrowserWindow.getAllWindows()[0];
      return win && win.webContents.getURL().startsWith(process.env.WSS_SERVER);
    }, 'janela principal');
    const evaluate = (code) => win.webContents.executeJavaScript(code, true);
    await until(() => evaluate('Boolean(document.getElementById("wss-window-bar"))'), 'preload');
    await until(() => evaluate('getComputedStyle(document.getElementById("wss-window-bar")).position === "fixed"'), 'CSS local');
    const normal = win.getBounds();
    const monitor = screen.getDisplayMatching(normal).bounds;
    const key = (keyCode) => {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    };
    const isBorderlessFull = () => evaluate('document.documentElement.hasAttribute("data-wss-fullscreen")');
    const expectFull = async () => {
      await until(isBorderlessFull, 'tela cheia sem bordas');
      await until(() => {
        const bounds = win.getBounds();
        return ['x', 'y', 'width', 'height'].every((key) => bounds[key] === monitor[key]);
      }, 'limites da janela após a transição do Windows');
      assert.equal(win.isFullScreen(), false);
      assert.deepEqual(win.getBounds(), monitor);
      assert.equal(await evaluate('getComputedStyle(document.getElementById("wss-window-bar")).display'), 'none');
    };
    await evaluate('document.getElementById("grid").requestFullscreen()');
    await expectFull();
    key('Escape');
    await until(async () => !(await isBorderlessFull()) && !(await evaluate('Boolean(document.fullscreenElement)')), 'Esc restaura');
    assert.deepEqual(win.getBounds(), normal);
    console.log('OK: fullscreen HTML cobre o monitor sem fullscreen nativo; Esc restaura.');

    key('F11');
    await expectFull();
    await evaluate('document.getElementById("grid").requestFullscreen()');
    await evaluate('document.exitFullscreen()');
    await expectFull();
    key('F11');
    await until(async () => !(await isBorderlessFull()), 'F11 restaura');
    assert.deepEqual(win.getBounds(), normal);
    console.log('OK: F11 e vídeo mantêm estados independentes e restauram a janela.');

    win.maximize();
    await until(() => win.isMaximized(), 'maximizar');
    await evaluate('document.getElementById("grid").requestFullscreen()');
    await expectFull();
    await evaluate('document.exitFullscreen()');
    await until(() => win.isMaximized(), 'restaurar maximização');
    console.log('OK: maximização restaurada após sair do vídeo.');
    win.unmaximize();
    await until(() => !win.isMaximized(), 'restaurar tamanho');
    key('F11');
    await expectFull();
    win.webContents.reload();
    await until(async () => !(await isBorderlessFull()) && win.webContents.getURL().startsWith(process.env.WSS_SERVER), 'recarregar restaura');
    console.log('OK: navegação restaura a janela.');
    server.close();
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    server.close();
    app.exit(1);
  }
})();
