// WebRTC real com canvas animado: nenhum pixel da tela do usuário é capturado.
const { app, BrowserWindow, session, desktopCapturer, screen } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
let server, captureHandler;
let serverLogs = '';
async function until(check, label, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timeout: ${label}`);
}
const canvasCapture = `navigator.mediaDevices.getDisplayMedia = async () => {
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
  const ctx=canvas.getContext('2d');let frame=0;
  const draw=()=>{ctx.fillStyle='#172040';ctx.fillRect(0,0,640,360);ctx.fillStyle='#55dd99';ctx.fillRect((frame++*7)%600,100,40,100)};
  draw(); const stream=canvas.captureStream(30);
  const timer=setInterval(()=>{if(stream.getVideoTracks()[0].readyState==='ended')clearInterval(timer);else draw()},33);
  return stream;
};`;
const frames = (win) => win.webContents.executeJavaScript(`document.querySelector('.tile:not(.tile-self) video')?.getVideoPlaybackQuality().totalVideoFrames || 0`);
(async () => {
  try {
    const reserve = http.createServer();
    await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
    const port = reserve.address().port; await new Promise((resolve) => reserve.close(resolve));
    server = spawn('node', [path.join(__dirname, '..', '..', 'server', 'index.js')], {
      env: { ...process.env, PORT: String(port), TURN_URLS: ' ', LOCAL_TURN_SECRET: '', CHAT_FILE: '' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    server.stdout.on('data', (data) => { serverLogs += data; });
    server.stderr.on('data', (data) => { serverLogs += data; });
    process.env.WSS_SERVER = `http://127.0.0.1:${port}`;
    process.env.WSS_USER_DATA = path.join(os.tmpdir(), `wss-stream-smoke-${process.pid}`);
    process.env.WSS_BORDERLESS_FULLSCREEN = '1';
    delete process.env.WSS_DISABLE_HARDWARE_ACCELERATION;
    delete process.env.WSS_WINDOWED_FULLSCREEN;
    await until(async () => { try { return (await fetch(process.env.WSS_SERVER + '/version')).ok; } catch { return false; } }, 'servidor');
    await app.whenReady();
    // Exerce o seletor e os IPCs reais, mas o callback nativo é interceptado e nunca
    // entregue ao Chromium. O único stream enviado será o canvas acima.
    session.defaultSession.setDisplayMediaRequestHandler = (handler) => { captureHandler = handler; };
    desktopCapturer.getSources = async () => [{ id: 'screen:fixture', display_id: String(screen.getPrimaryDisplay().id), name: 'Tela de teste', thumbnail: null, appIcon: null }];
    require('../main');
    let room;
    await until(() => { room = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith(process.env.WSS_SERVER)); return room; }, 'janela principal');
    const evaluate = async (win, code) => {
      try { return await win.webContents.executeJavaScript(code, true); }
      catch (error) { throw new Error(`Renderer: ${code.slice(0, 180)}\n${error.message}`); }
    };
    const join = async (win, name) => {
      await until(() => evaluate(win, 'Boolean(window.wssRoomSettings && document.getElementById("nick"))'), 'interface carregada');
      await evaluate(win, `document.getElementById('nick').value=${JSON.stringify(name)};document.getElementById('login-form').requestSubmit()`);
      await until(() => evaluate(win, '!document.getElementById("app").hidden'), 'entrada na sala');
    };
    await join(room, 'Transmissor QA');
    let selected;
    const selection = captureHandler({ securityOrigin: process.env.WSS_SERVER }, (choice) => { selected = choice; });
    let picker;
    await until(() => { picker = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/picker.html')); return picker; }, 'seletor');
    await until(() => evaluate(picker, 'Boolean(window.picker)'), 'ponte do seletor');
    await evaluate(picker, 'window.picker.sources()');
    await evaluate(picker, 'window.picker.choose("screen:fixture",false)');
    await selection;
    assert.equal(selected.video.id, 'screen:fixture');
    await evaluate(room, canvasCapture + 'document.getElementById("btn-share").click()');
    const roomState = () => evaluate(room, 'window.wssRoomSettings.read("media")');
    await until(async () => (await roomState()).overlay.share, 'overlay ativo');
    const track = await evaluate(room, 'document.querySelector(".tile-self video").srcObject.getVideoTracks()[0].id');
    await evaluate(room, 'document.getElementById("wss-settings-open").click()');
    let panel;
    await until(() => { panel = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/settings.html')); return panel; }, 'configurações');
    await until(() => evaluate(panel, 'Boolean(window.desktopSettings && document.getElementById("environment").textContent)'), 'configurações carregadas');
    const preferences = await evaluate(panel, 'desktopSettings.read()');
    const setOverlay = async (enabled) => {
      const value = { server: preferences.server, preferences: { ...preferences.preferences, overlay: enabled } };
      assert.equal((await evaluate(panel, `desktopSettings.save(${JSON.stringify(value)})`)).ok, true);
      await until(async () => (await roomState()).overlay.share === enabled, 'estado sincronizado');
      assert.equal(await evaluate(room, 'document.querySelector(".tile-self .tag-overlay").hidden'), !enabled);
      assert.equal(await evaluate(room, 'document.querySelector(".tile-self video").srcObject.getVideoTracks()[0].id'), track);
      assert.equal(await evaluate(room, '(async()=> (await wssDesktop.caps()).control)()'), enabled);
    };
    await setOverlay(false);
    assert.equal(BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('/overlay.html')), false);
    await setOverlay(true);
    await until(() => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('/overlay.html')), 'janela do overlay carregada');
    const overlayId = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/overlay.html')).id;
    const onlyLog = { server: preferences.server, preferences: { ...preferences.preferences, overlay: true, logLimit: 1000 } };
    await evaluate(panel, `desktopSettings.save(${JSON.stringify(onlyLog)})`);
    assert.equal(BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('/overlay.html')).id, overlayId);
    console.log('OK: overlays desligam e religam durante captura; estado, etiqueta e controle sincronizados sem trocar o stream.');
    panel.close();

    const peer = new BrowserWindow({ width: 960, height: 680, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
    await peer.loadURL(process.env.WSS_SERVER); peer.show();
    await join(peer, 'Receptor QA');
    await until(async () => await frames(peer) > 5, 'quadros WebRTC no receptor', 30000);
    console.log('OK: receptor decodifica vídeo WebRTC real do canvas animado.');
    await evaluate(room, 'document.getElementById("btn-share").click()');
    await until(() => evaluate(room, '!document.querySelector(".tile-self")'), 'parar transmissão');
    await evaluate(peer, canvasCapture + 'document.getElementById("btn-share").click()');
    await until(async () => await frames(room) > 5, 'vídeo recebido na janela principal', 30000);
    const before = await frames(room);
    await evaluate(room, `document.querySelector('.tile:not(.tile-self) button[aria-label="Tela cheia (F)"]').click()`);
    await until(() => evaluate(room, 'document.documentElement.hasAttribute("data-wss-fullscreen")'), 'fullscreen do vídeo');
    assert.equal(room.isFullScreen(), false);
    await until(async () => await frames(room) > before + 10, 'vídeo continua decodificando em fullscreen');
    room.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    room.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    await until(() => evaluate(room, '!document.fullscreenElement && !document.documentElement.hasAttribute("data-wss-fullscreen")'), 'sair por Esc');
    room.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
    room.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
    await until(() => evaluate(room, 'document.documentElement.hasAttribute("data-wss-fullscreen")'), 'F11');
    const last = await frames(room);
    await until(async () => await frames(room) > last + 10, 'vídeo continua em F11');
    console.log('OK: transmissão recebida continua avançando em tela cheia do vídeo, após Esc e em F11.');
    const health = await roomState();
    assert.equal(health.streams.some((s) => s.state === 'connected'), true);
    peer.destroy(); server.kill(); app.exit(0);
  } catch (error) { console.error(error.stack); console.error(serverLogs); if (server) server.kill(); app.exit(1); }
})();
