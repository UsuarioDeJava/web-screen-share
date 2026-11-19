// Usa a interface e o servidor reais do repositório, com perfil e porta isolados.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const assert = require('node:assert/strict');
let server;
let serverLogs = '';
const outputPath = process.env.WSS_TEST_SCREENSHOT_DIR;
async function until(check, label, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)); }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  try {
    const reservation = http.createServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    server = spawn('node', [path.join(__dirname, '..', '..', 'server', 'index.js')], {
      env: { ...process.env, PORT: String(port), TURN_URLS: ' ', LOCAL_TURN_SECRET: '', CHAT_FILE: '' },
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    server.stdout.on('data', (chunk) => { serverLogs += chunk; });
    server.stderr.on('data', (chunk) => { serverLogs += chunk; });
    server.on('error', (error) => { serverLogs += error.message; });
    process.env.WSS_SERVER = `http://127.0.0.1:${port}`;
    process.env.WSS_USER_DATA = path.join(os.tmpdir(), `wss-room-settings-smoke-${process.pid}`);
    process.env.WSS_BORDERLESS_FULLSCREEN = '1';
    delete process.env.WSS_DISABLE_HARDWARE_ACCELERATION;
    delete process.env.WSS_WINDOWED_FULLSCREEN;
    await until(async () => { try { return (await fetch(process.env.WSS_SERVER + '/version')).ok; } catch { return false; } }, 'servidor local');
    require('../main');
    await app.whenReady();
    let room;
    await until(() => { room = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith(process.env.WSS_SERVER)); return room; }, 'sala');
    const inRoom = (code) => room.webContents.executeJavaScript(code, true);
    await until(() => inRoom('Boolean(document.getElementById("wss-settings-open") && document.getElementById("nick"))'), 'interface');
    await inRoom('document.getElementById("nick").value="Teste Perfil";document.getElementById("login-form").requestSubmit()');
    await until(() => inRoom('document.getElementById("app").hidden === false'), 'entrada na sala');
    assert.equal(await inRoom('Boolean(document.querySelector(".me #wss-settings-open"))'), true);
    await until(() => inRoom('getComputedStyle(document.querySelector(".sidebar-links")).display === "none"'), 'links consolidados');
    assert.equal(await inRoom('getComputedStyle(document.getElementById("btn-cursor")).display'), 'none');
    await inRoom('document.getElementById("btn-obs").hidden=false');
    assert.equal(await inRoom('getComputedStyle(document.getElementById("btn-obs")).display'), 'none');
    await inRoom('document.getElementById("wss-settings-open").click()');
    let panel;
    await until(() => { panel = BrowserWindow.getAllWindows().find((w) => /settings\.html$/.test(w.webContents.getURL())); return panel; }, 'configurações');
    const inPanel = (code) => panel.webContents.executeJavaScript(code, true);
    await until(() => inPanel('document.getElementById("profile-name").textContent === "Teste Perfil"'), 'perfil integrado');
    assert.equal(await inRoom('document.querySelectorAll("dialog[open]").length'), 0);
    console.log('OK: engrenagem ao lado do usuário, links antigos ocultos e perfil na página única.');

    await inPanel('window.desktopSettings.roomAction({type:"color",color:"#12ab34"})');
    assert.equal(await inRoom('localStorage.getItem("wss-color")'), '#12ab34');
    await inPanel('document.getElementById("tab-pointer").click()');
    // O seu ponteiro liga/desliga em cada transmissão (botão em cima dela); aqui fica o dos outros.
    await until(() => inPanel('!document.getElementById("show-cursors").disabled'), 'ponteiro');
    await inPanel('document.getElementById("show-cursors").click();');
    await until(() => inRoom('localStorage.getItem("wss-show-cursors") === "0"'), 'preferência de ponteiro');
    await inPanel('window.desktopSettings.roomAction({type:"sounds",enabled:false})');
    assert.equal(await inRoom('window.RoomSounds.enabled'), false);
    console.log('OK: cor, ponteiro e sons alteram as preferências reais da sala.');

    const photo = { type: 'photo', mime: 'image/gif', name: 'teste.gif', data: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' };
    await inPanel(`window.desktopSettings.roomAction(${JSON.stringify(photo)})`);
    let state = await inPanel('window.desktopSettings.readRoom()');
    assert.ok(state.photo && state.photo.startsWith(process.env.WSS_SERVER + '/avatar/'));
    await inPanel('document.getElementById("tab-profile").click()');
    await until(() => inPanel('!document.getElementById("profile-photo").hidden'), 'foto no painel');
    await until(() => inPanel('document.getElementById("profile-photo").complete && document.getElementById("profile-photo").naturalWidth > 0'), 'foto carregada');
    if (outputPath) {
      fs.mkdirSync(outputPath, { recursive: true });
      await panel.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(outputPath, 'unified-settings-profile.png'), (await panel.webContents.capturePage()).toPNG());
      await inRoom('document.getElementById("btn-people").click()');
      await room.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,500))');
      fs.writeFileSync(path.join(outputPath, 'unified-settings-user.png'), (await room.webContents.capturePage({ x: 0, y: Math.max(0, room.getContentBounds().height - 180), width: 280, height: 180 })).toPNG());
    }
    await inPanel('window.desktopSettings.roomAction({type:"photo-remove"})');
    state = await inPanel('window.desktopSettings.readRoom()');
    assert.equal(state.photo, null);
    console.log('OK: foto enviada e removida pelo fluxo original do servidor e armazenamento da sala.');

    await inPanel('document.getElementById("tab-pointer").click(); document.getElementById("gamepad-config").open=true; Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>[{index:0,id:"Controle de teste",mapping:"standard",buttons:Array.from({length:17},(_,i)=>({value:i===1?1:0})),axes:[0,0,0,0]}]})');
    await until(() => inPanel('document.querySelectorAll("#gamepad-config input[type=number]").length===1'), 'editor do gamepad');
    await until(() => inPanel('document.querySelectorAll(".gpad-button").length===17 && document.querySelector(".gpad-device").textContent==="Controle de teste"'), 'visualização do gamepad');
    await inPanel('const gamepadField=document.querySelector(".gpad-output-0 select"); gamepadField.value="button:1"; gamepadField.dispatchEvent(new Event("change"));');
    await until(async () => (await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste']?.buttons[0] === 1, 'perfil nativo do gamepad');
    assert.equal((await inRoom('window.wssDesktop.readGamepadProfiles()'))['Controle de teste'].buttons[0], 1);
    const gamepadConfig = JSON.parse(fs.readFileSync(path.join(process.env.WSS_USER_DATA, 'config.json'), 'utf8'));
    assert.equal(gamepadConfig.gamepadProfiles['Controle de teste'].buttons[0], 1);
    await until(() => inPanel('document.querySelector(".gamepad-diagnostic p").textContent.includes("A B")'), 'teste do mapeamento normalizado');
    assert.equal(await inPanel('document.querySelectorAll(".gpad-control.is-pressed").length>=2'), true);
    assert.equal(await inPanel('document.querySelector(".gpad-output-0 strong").textContent'), '100%');
    assert.equal(await inPanel('document.querySelectorAll(".gpad-test-button,.gpad-circularity-score").length'), 0);
    assert.equal(await inPanel('getComputedStyle(document.querySelector(".gpad-view")).backgroundColor'), 'rgb(17, 21, 33)');
    await inPanel('document.querySelector(".gamepad-preset").value="playstation";document.querySelector(".gamepad-preset").dispatchEvent(new Event("change"))');
    await until(() => inPanel('document.querySelector(".gpad-view").dataset.layout==="playstation" && [...document.querySelectorAll("[data-glyph]")].find(e=>e.dataset.glyph==="0").textContent==="✕"'), 'preset PlayStation');
    assert.equal((await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste'].preset, 'playstation');
    if (outputPath) {
      await inPanel('document.querySelector(".gpad-view").scrollIntoView({block:"start"});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(outputPath, 'gamepad-playstation.png'), (await panel.webContents.capturePage()).toPNG());
    }
    await inPanel('document.querySelector(".gamepad-preset").value="xbox";document.querySelector(".gamepad-preset").dispatchEvent(new Event("change"))');
    await until(() => inPanel('[...document.querySelectorAll("[data-glyph]")].find(e=>e.dataset.glyph==="0").textContent==="A"'), 'preset Xbox');
    await inPanel('document.querySelector(".gamepad-preset").value="custom";document.querySelector(".gamepad-preset").dispatchEvent(new Event("change"));window.qaSource=17;Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>[{index:0,id:"Controle de teste",timestamp:performance.now(),mapping:"standard",buttons:Array.from({length:22},(_,i)=>({value:i===window.qaSource?1:0})),axes:[0.5,-0.3,0,0]}]})');
    await until(() => inPanel('document.querySelectorAll(".gpad-physical-extras .gpad-extra-chip").length===22'), 'detecção de botões físicos');
    await inPanel('document.querySelector(".gamepad-add-extra").click()');
    await until(() => inPanel('document.querySelector(".gpad-extra-visual").textContent.includes("M1 → A") && document.querySelector(".gpad-output-0 strong").textContent==="100%"'), 'extra B17 envia A');
    await inPanel('document.querySelector(".gpad-extra-binding select").value="5";document.querySelector(".gpad-extra-binding select").dispatchEvent(new Event("change"))');
    await until(async () => (await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste'].extraButtons[0].target===5, 'destino extra salvo');
    panel.focus();
    await inPanel('document.querySelector(".gpad-extra-binding button").click();window.qaSource=19;');
    await until(async () => (await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste'].extraButtons[0].source===19, 'detectar botão extra B19');
    await until(() => inPanel('document.querySelector(".gamepad-diagnostic p").textContent.includes("RB")'), 'extra remapeado antes de enviar');
    if (outputPath) {
      await inPanel('document.getElementById("tab-pointer").click(); document.getElementById("gamepad-config").scrollIntoView({block:"start"}); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(outputPath, 'gamepad-settings.png'), (await panel.webContents.capturePage()).toPNG());
      await inPanel('document.querySelector(".gamepad-extras").scrollIntoView({block:"start"});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(outputPath, 'gamepad-extras.png'), (await panel.webContents.capturePage()).toPNG());
    }
    await inPanel('document.querySelectorAll(".gpad-extra-binding button")[1].click()');
    await until(async () => (await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste'].extraButtons.length===0, 'remoção de extra persistida');
    await until(() => inPanel('document.querySelector(".gpad-extra-visual").hidden'), 'remover extra solta o botão de saída');
    await inPanel('window.qaSource=6; window.qaRumble=[]; window.qaActuator={effects:["dual-rumble"],playEffect:(type,params)=>{window.qaRumble.push({type,params});return new Promise(resolve=>window.qaEndRumble=resolve)},reset:()=>{window.qaRumble.push({stop:true});window.qaEndRumble?.("preempted");return Promise.resolve()}};const oldGet=navigator.getGamepads;Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>oldGet().map(p=>({...p,vibrationActuator:window.qaActuator}))})');
    await until(() => inPanel('document.querySelectorAll(".gpad-wiring path[d]").length===17'),'linhas entre configuração e botão');
    await inPanel('window.qaAxis=-1;const qaGet=navigator.getGamepads;Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>qaGet().map(p=>({...p,axes:[0,0,0,0,window.qaAxis]}))});');
    await until(() => inPanel('[...document.querySelector(".gpad-output-6 select").options].some(o=>o.value==="axis:4")'),'fonte de eixo disponível');
    await inPanel('const source=document.querySelector(".gpad-output-6 select");source.value="axis:4";source.dispatchEvent(new Event("change"));window.qaAxis=0');
    await until(async () => (await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste'].triggers[0].type==='axis','fonte analógica salva');
    await until(() => inPanel('document.querySelector(".gpad-output-6 strong").textContent==="50%"'),'meio curso do eixo produz meio gatilho');
    assert.equal(await inPanel('Boolean(document.querySelector(".gpad-calibration"))'), false);
    assert.equal(await inPanel('document.querySelector(".gamepad-diagnostic").tagName'), 'SECTION');
    assert.equal(await inPanel('document.querySelector(".gpad-guide").dataset.output'), '16');
    assert.deepEqual(await inPanel('[...document.querySelector(".gpad-config-side").children].map(e=>Number(e.dataset.output))'), [6,4,8,10,12,14,13,15]);
    await inPanel('const axis=document.querySelector(".gpad-stick-settings select");axis.value="2";axis.dispatchEvent(new Event("change"))');
    await until(async()=> (await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste'].axes[0]===2, 'eixo do analógico salvo junto ao desenho');
    await inPanel('window.qaAxis=1');
    await until(() => inPanel('document.querySelector(".gpad-output-6 strong").textContent==="100%"'),'curso completo');
    await inPanel('window.qaAxis=-1');
    await until(() => inPanel('document.querySelector(".gpad-output-6 strong").textContent==="0%"'),'gatilho solto');
    if(outputPath){await inPanel('document.querySelector(".gpad-view").scrollIntoView({block:"start"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(outputPath,'gamepad-final.png'),(await panel.webContents.capturePage()).toPNG());}
    panel.focus();
    await inPanel('document.querySelector(".gpad-output-10 .gpad-learn").click();window.qaSource=2');
    await until(async()=> (await inPanel('window.desktopSettings.readGamepadProfiles()'))['Controle de teste'].buttons[10]===2,'detecção direta de botão no diagrama');
    await inPanel('document.querySelector(".gamepad-vibrate").click()');
    await until(() => inPanel('window.qaRumble.length===1'),'teste de vibração iniciado');
    assert.deepEqual(await inPanel('window.qaRumble[0]'),{type:'dual-rumble',params:{duration:1000,startDelay:0,strongMagnitude:0.5,weakMagnitude:0}});
    await inPanel('document.querySelector(".gamepad-vibrate-esquerda").click()');
    await until(() => inPanel('window.qaRumble.some(x=>x.stop)'),'vibração interrompida');
    await until(() => inPanel('!document.querySelector(".gamepad-vibrate-direita").disabled'),'novo teste disponível');
    await inPanel('document.querySelector(".gamepad-vibrate-direita").click();window.dispatchEvent(new Event("blur"))');
    await until(() => inPanel('window.qaRumble.filter(x=>x.stop).length===2'),'perda de foco interrompe vibração');
    if(outputPath){await inPanel('document.querySelector(".gpad-view").scrollIntoView({block:"start"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(outputPath,'gamepad-quick.png'),(await panel.webContents.capturePage()).toPNG());}
    assert.deepEqual(await inPanel('window.qaRumble.filter(x=>x.params)[1].params'),{duration:1000,startDelay:0,strongMagnitude:0,weakMagnitude:0.5});
    if (outputPath) {
      panel.setSize(640, 820);
      await inPanel('document.querySelector(".gpad-view").scrollIntoView({block:"start"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      assert.equal(await inPanel('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true);
      fs.writeFileSync(path.join(outputPath, 'gamepad-narrow.png'), (await panel.webContents.capturePage()).toPNG());
      panel.setSize(1050, 1100);
      await inPanel('document.querySelector(".gpad-view").scrollIntoView({block:"start"});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      fs.writeFileSync(path.join(outputPath, 'gamepad-complete.png'), (await panel.webContents.capturePage()).toPNG());
    }
    console.log('OK: gamepad simulado detectado, remapeado, testado e salvo no perfil nativo compartilhado com a sala.');

    await inPanel('document.getElementById("tab-connection").click()');
    await until(() => inPanel('!document.getElementById("run-diagnostics").disabled'), 'diagnóstico disponível');
    await inPanel('document.getElementById("run-diagnostics").click()');
    await until(() => inPanel('document.getElementById("diagnostic-output").textContent.includes("Fim do teste.")'), 'diagnóstico concluído');
    assert.equal(await inRoom('document.getElementById("diag-dialog").open'), false);
    assert.equal(await inRoom('document.getElementById("app").hidden'), false);
    await inPanel('document.getElementById("tab-shortcuts").click()');
    await until(() => inPanel('document.querySelectorAll("#room-shortcuts dt").length > 5'), 'atalhos da sala');
    await inPanel('document.getElementById("tab-settings").click();document.getElementById("check-update").click()');
    await until(() => inPanel('document.getElementById("update-status").textContent.includes("código-fonte")'), 'verificação de versões original');
    console.log('OK: diagnóstico original e atalhos dentro da página única, sem desconectar.');
    await inPanel('document.getElementById("tab-obs").click()');
    await until(() => inPanel('document.getElementById("obs-url").value.includes("/obs/Teste%20Perfil")'), 'endereço OBS');
    await until(() => inPanel('!document.getElementById("obs-monitor").disabled'), 'monitores disponíveis');
    const monitors = await inPanel('window.desktopSettings.readRoom("obs")');
    assert.ok(monitors.displays.length > 0);
    assert.equal(await inRoom('document.getElementById("obs-dialog").open'), false);
    const selectDisplay = async (value) => {
      await inPanel(`document.getElementById("obs-monitor").value=${JSON.stringify(value)};document.getElementById("obs-monitor").dispatchEvent(new Event("change"));`);
      await until(async () => (await inPanel('window.desktopSettings.readRoom("obs")')).obsDisplay === value, 'monitor persistido');
      await until(() => inPanel('!document.getElementById("obs-monitor").disabled'), 'seleção aplicada');
      const config = JSON.parse(fs.readFileSync(path.join(process.env.WSS_USER_DATA, 'config.json'), 'utf8'));
      assert.equal(config.obsDisplay, value);
    };
    await selectDisplay('off');
    await selectDisplay(String(monitors.displays[0].id));
    if (outputPath) {
      await panel.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(outputPath, 'unified-settings-obs.png'), (await panel.webContents.capturePage()).toPNG());
    }
    const invalidDisplay = await inPanel('window.desktopSettings.roomAction({type:"obs-display",value:"99999999999999999999"}).then(()=>false,()=>true)');
    assert.equal(invalidDisplay, true);
    console.log('OK: OBS oculto na sala; endereço, monitor, opção Desligado e persistência nas configurações.');
    server.kill(); app.exit(0);
  } catch (error) { console.error(error.stack); console.error(serverLogs); if (server) server.kill(); app.exit(1); }
})();
