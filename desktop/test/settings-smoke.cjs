// Integração com janela/preloads reais e Socket.IO local, sem acessar a sala do usuário.
const { app, BrowserWindow, dialog } = require('electron');
const { Server } = require('socket.io');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
// As configurações abrem como popup dentro da janela (WebContentsView), não numa janela.
const settingsPopup = () => {
  const contents = require('electron').webContents.getAllWebContents().find((wc) => !wc.isDestroyed() && /\/settings\.html$/.test(wc.getURL()));
  return contents && { webContents: contents, focus: () => contents.focus(), close: () => contents.close() };
};
const outputPath = process.env.WSS_TEST_SCREENSHOT_DIR;
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><html><head><title>Sala de teste local</title></head><body>'
    + '<form id="login-form"></form><main id="grid">Sala de teste</main>'
    + '<script src="/socket.io/socket.io.js"></script><script>'
    + 'window.testSocket=io();testSocket.emit("join",{name:"Teste"},r=>{window.joined=r;});'
    + '</script></body></html>');
});
const io = new Server(server);
io.on('connection', (socket) => socket.on('join', (_payload, ack) => ack({
  me: { id: socket.id, name: 'Teste' },
  users: [{ id: socket.id, name: 'Teste' }, { id: 'ana', name: 'Ana', sharing: false }],
})));
async function until(check, label) {
  const end = Date.now() + 8000;
  while (Date.now() < end) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timeout: ${label}`);
}

(async () => {
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.WSS_SERVER = `http://127.0.0.1:${server.address().port}`;
    process.env.WSS_USER_DATA = path.join(os.tmpdir(), `wss-settings-smoke-${process.pid}`);
    process.env.WSS_BORDERLESS_FULLSCREEN = '1';
    delete process.env.WSS_DISABLE_HARDWARE_ACCELERATION;
    delete process.env.WSS_WINDOWED_FULLSCREEN;
    require('../main');
    await app.whenReady();
    let room;
    await until(() => { room = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith(process.env.WSS_SERVER)); return room; }, 'janela da sala');
    const inRoom = (code) => room.webContents.executeJavaScript(code, true);
    await until(() => inRoom('Boolean(window.joined && document.getElementById("wss-settings-open"))'), 'entrada na sala');
    await inRoom('document.getElementById("wss-settings-open").click()');
    let panel;
    await until(() => { panel = settingsPopup(); return panel; }, 'painel');
    const inPanel = (code) => panel.webContents.executeJavaScript(code, true);
    await until(() => inPanel('Boolean(window.desktopSettings && document.getElementById("environment").textContent)'), 'painel inicializado');
    const state = () => inPanel('window.desktopSettings.read()');
    let data = await state();
    assert.ok(data.log.rows.some((r) => r.message.includes('Você entrou na sala como Teste')));
    assert.ok(data.log.rows.some((r) => r.message.includes('Ana já estava na sala')));
    assert.equal(await inRoom('Boolean(window.joined.me)'), true);
    console.log('OK: observador mantém entrada/ack da sala e registra participantes existentes.');

    io.emit('user:joined', { id: 'bruno', name: 'Bruno', sharing: false });
    io.emit('user:updated', { id: 'bruno', name: 'Bruno', sharing: true });
    io.emit('user:left', { id: 'bruno' });
    await inRoom('testSocket.emit("share",true); window.testPc=new RTCPeerConnection({iceServers:[]});testPc.close();console.error("Erro técnico de teste");');
    await until(async () => {
      const rows = (await state()).log.rows;
      return rows.some((r) => r.message.includes('Erro técnico de teste')) && rows.some((r) => r.message.includes('Bruno saiu'));
    }, 'eventos da sala e erros técnicos');
    data = await state();
    for (const text of ['Bruno entrou', 'Bruno iniciou', 'Bruno saiu', 'Início de transmissão', 'WebRTC #1 criada', 'WebRTC #1 encerrada']) {
      assert.ok(data.log.rows.some((r) => r.message.includes(text)), `Evento ausente: ${text}`);
    }
    assert.ok(data.log.rows.some((r) => r.direction === 'out'));
    assert.ok(data.log.rows.some((r) => r.direction === 'in'));
    console.log('OK: entradas, saídas, transmissão, WebRTC e erros registrados sem payloads brutos.');

    await inPanel('document.getElementById("tab-log").click()');
    await until(() => inPanel('document.getElementById("log-rows").textContent.includes("Bruno saiu")'), 'log em tempo real');
    await inPanel('document.getElementById("pause").click()');
    io.emit('user:joined', { id: 'pausa', name: 'Durante a pausa', sharing: false });
    await until(async () => (await state()).log.rows.some((r) => r.message.includes('Durante a pausa')), 'registro durante pausa');
    assert.equal(await inPanel('document.getElementById("log-rows").textContent.includes("Durante a pausa")'), false);
    await inPanel('document.getElementById("pause").click()');
    await until(() => inPanel('document.getElementById("log-rows").textContent.includes("Durante a pausa")'), 'retomar visualização');
    await inPanel('document.getElementById("category").value="stream";document.getElementById("category").dispatchEvent(new Event("input"))');
    assert.equal(await inPanel('[...document.querySelectorAll("#log-rows tr")].every(r=>r.children[2].textContent==="Transmissões")'), true);
    await inPanel('document.getElementById("category").value="";document.getElementById("category").dispatchEvent(new Event("input"))');
    console.log('OK: atualização em tempo real, pausa sem perder eventos e filtro por categoria.');
    await inPanel('window.firstLogRow=document.querySelector("#log-rows tr");window.logPackets=[];desktopSettings.onLog(p=>logPackets.push({count:p.rows.length,reset:p.reset}))');
    io.emit('user:joined', { id: 'incremental', name: 'Evento incremental', sharing: false });
    await until(() => inPanel('document.getElementById("log-rows").textContent.includes("Evento incremental")'), 'incremento');
    assert.equal(await inPanel('window.firstLogRow === document.querySelector("#log-rows tr")'), true);
    assert.equal(await inPanel('logPackets.at(-1).count < document.querySelectorAll("#log-rows tr").length && !logPackets.at(-1).reset'), true);
    await inPanel('document.getElementById("tab-settings").click();window.packetCount=logPackets.length');
    io.emit('user:joined', { id: 'hidden-tab', name: 'Log com aba oculta', sharing: false });
    await until(async () => (await state()).log.rows.some((r) => r.message.includes('Log com aba oculta')), 'registro sem visualização');
    await inPanel('new Promise(resolve=>setTimeout(resolve,400))');
    assert.equal(await inPanel('logPackets.length === packetCount'), true);
    await inPanel('document.getElementById("tab-log").click()');
    await until(() => inPanel('document.getElementById("log-rows").textContent.includes("Log com aba oculta")'), 'ressincronização');
    console.log('OK: somente deltas, linhas preservadas e nenhum envio enquanto a aba está oculta.');

    const invalid = await inPanel('window.desktopSettings.save({server:"javascript:alert(1)"})');
    assert.equal(invalid.ok, false);
    await inPanel('document.getElementById("tab-settings").click(); document.getElementById("hardware").checked=false;document.getElementById("log-limit").value="500";document.getElementById("hardware").dispatchEvent(new Event("input"));');
    assert.equal(await inPanel('document.getElementById("app-save").textContent'), 'Salvar e reiniciar');
    // Valida a persistência separadamente para manter o processo de teste em execução.
    await inPanel('window.desktopSettings.read().then(s=>window.desktopSettings.save({server:s.server,preferences:{...s.preferences,hardwareAcceleration:false,logLimit:500}}))');
    data = await state();
    assert.equal(data.active.hardwareAcceleration, true);
    assert.equal(data.preferences.hardwareAcceleration, false);
    assert.equal(data.restartRequired, true);
    assert.equal(data.log.limit, 500);
    assert.equal(fs.readFileSync(path.join(process.env.WSS_USER_DATA, 'config.json'), 'utf8').includes('"hardwareAcceleration": false'), true);
    console.log('OK: persistência, validação de URL e aplicação gráfica adiada sem desconectar.');
    await inPanel('document.getElementById("tab-log").click()');
    if (outputPath) {
      fs.mkdirSync(outputPath, { recursive: true });
      await panel.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(outputPath, 'settings-log.png'), (await panel.webContents.capturePage()).toPNG());
      await inPanel('document.getElementById("tab-settings").click()');
      await panel.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(outputPath, 'settings-panel.png'), (await panel.webContents.capturePage()).toPNG());
    }
    const exportPath = path.join(process.env.WSS_USER_DATA, 'export-test.json');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
    assert.equal((await inPanel('window.desktopSettings.exportLog()')).saved, true);
    const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    assert.ok(exported.rows.some((r) => r.message.includes('Bruno saiu')));
    assert.ok(exported.rows.every((r) => !('payload' in r)));
    const desired = { server: 'https://servidor-de-teste.invalid:3100', preferences: data.preferences };
    assert.equal((await inPanel(`window.desktopSettings.save(${JSON.stringify(desired)})`)).ok, true);
    const pendingServer = await state();
    assert.equal(pendingServer.activeServer, process.env.WSS_SERVER);
    assert.equal(pendingServer.server, desired.server);
    assert.equal(await inRoom('testSocket.connected'), true);
    const preferencesAfterSave = JSON.parse(fs.readFileSync(path.join(process.env.WSS_USER_DATA, 'config.json'), 'utf8'));
    assert.equal(preferencesAfterSave.pendingServer, desired.server);
    assert.equal(preferencesAfterSave.server, process.env.WSS_SERVER);
    console.log('OK: exportação JSON e mudança de servidor pendente sem interromper a sala atual.');
    const observerErrors = data.log.rows.filter((r) => r.level === 'error' && !r.message.includes('Erro técnico de teste'));
    assert.deepEqual(observerErrors, []);
    io.close(); server.close(); app.exit(0);
  } catch (error) { console.error(error.stack); io.close(); server.close(); app.exit(1); }
})();
