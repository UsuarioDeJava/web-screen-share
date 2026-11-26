/* Gamepad físico -> perfil local -> estado Xbox normalizado enviado ao proprietário. */
window.WssGamepadClient = {
  async start({ panel, canSend, send, onStatus = () => {}, pollIntervalMs = window.WssInputPacing?.DEFAULT_INTERVAL_MS || 8 }) {
    const bridge = window.wssDesktop || window.desktopSettings;
    const model = window.WssGamepad;
    const make = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
    let profiles = {};
    try { profiles = JSON.parse(localStorage.getItem('wss-gamepad-profiles') || '{}'); } catch {}
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) profiles = {};
    if (bridge?.readGamepadProfiles) profiles = await bridge.readGamepadProfiles().catch(() => profiles);
    profiles = Object.assign(Object.create(null), profiles);
    const select = make('select'); select.setAttribute('aria-label', 'Meu controle físico');
    const presetRow = make('div'); presetRow.className = 'gamepad-profile-controls';
    const presetLabel = make('label', 'Preset do controle'); const presetSelect = make('select'); presetSelect.disabled = true; presetSelect.className = 'gamepad-preset'; presetSelect.setAttribute('aria-label', 'Preset do controle');
    for (const item of model.presets) { const option = make('option', item.name); option.value = item.id; presetSelect.append(option); } presetLabel.append(presetSelect);
    const presetHint = make('p', 'Xbox e PlayStation aplicam o mapeamento padrão e seus símbolos. GameSir / personalizado permite combinar botões extras com os comandos do controle virtual.'); presetHint.className = 'dialog-sub';
    presetRow.append(presetLabel, presetHint);
    const status = make('p', 'Conecte o gamepad e pressione um botão para detectá-lo.'); status.className = 'dialog-sub';
    const feedback = make('p'); feedback.className = 'gamepad-feedback'; feedback.setAttribute('role', 'status');
    const mapping = make('div'); mapping.className = 'gamepad-mapping';
    const preview = make('p'); preview.className = 'dialog-sub'; preview.setAttribute('aria-live', 'off');
    const monitor = make('div'); const view = window.WssGamepadView.create(monitor, { onChange: (change) => { const next = getProfile(); change(next); next.triggerLimits = [1, 1]; save(next); editor(); } });
    const remap = make('section'); remap.className = 'gamepad-remap'; remap.append(mapping);
    const extras = make('section'); extras.className = 'gamepad-extras'; extras.hidden = true;
    const extraInfo = make('p'); extraInfo.className = 'dialog-sub'; const extraReadings = make('div'); extraReadings.className = 'gpad-physical-extras';
    const extraBindings = make('div'); extraBindings.className = 'gpad-extra-bindings';
    const addExtra = make('button', 'Adicionar botão extra'); addExtra.type = 'button'; addExtra.className = 'btn gamepad-add-extra';
    const layoutLabel = make('label', 'Aparência do controle'); const layoutSelect = make('select'); layoutSelect.setAttribute('aria-label', 'Aparência do controle personalizado');
    for (const [id, label] of [['xbox', 'Xbox'], ['playstation', 'PlayStation']]) { const option = make('option', label); option.value = id; layoutSelect.append(option); } layoutLabel.append(layoutSelect);
    extras.append(make('h4', 'Botões extras · GameSir e outros'), extraInfo, layoutLabel, extraReadings, extraBindings, addExtra);
    const vibrationStatus = make('p'); vibrationStatus.className = 'gamepad-vibration-status'; vibrationStatus.setAttribute('role', 'status');
    const vibrationButtons = ['esquerda', 'direita'].map((side, i) => {
      const button = make('button', '〰 ' + (i ? 'D' : 'E')); button.type = 'button'; button.className = 'gamepad-vibrate gamepad-vibrate-' + side;
      button.setAttribute('aria-label', 'Testar vibração ' + side); button.title = 'Testar vibração ' + side + ' por 1 segundo'; button.disabled = true;
      (i ? view.vibrationRight : view.vibrationLeft).append(button); return button;
    });
    let activeActuator = null, activeSide = -1, vibrationRun = 0, vibrationMessage = false, remoteFeedback = null;
    const actuatorFor = (pad) => pad?.vibrationActuator || pad?.hapticActuators?.[0];
    const dualRumble = (a) => typeof a?.playEffect === 'function' && (!a.effects?.length || a.effects.includes('dual-rumble'));
    const supportsVibration = (a) => dualRumble(a);
    function stopVibration() {
      remoteFeedback?.stop();
      vibrationRun++; const actuator = activeActuator; activeActuator = null; activeSide = -1;
      vibrationButtons.forEach(button => button.classList.remove('is-active'));
      if (actuator) { try { Promise.resolve(typeof actuator.reset === 'function' ? actuator.reset() : actuator.playEffect('dual-rumble', { duration: 0, strongMagnitude: 0, weakMagnitude: 0 })).catch(() => {}); } catch {} vibrationStatus.textContent = 'Teste interrompido.'; }
    }
    vibrationButtons.forEach((button, side) => button.addEventListener('click', async () => {
      const stopping = activeSide === side; stopVibration(); if (stopping) return;
      const actuator = actuatorFor(current()); if (!supportsVibration(actuator)) return;
      vibrationMessage = true; const run = ++vibrationRun; activeActuator = actuator; activeSide = side; button.classList.add('is-active');
      vibrationStatus.textContent = 'Testando vibração ' + (side ? 'direita' : 'esquerda') + '…';
      try {
        const result = await actuator.playEffect('dual-rumble', { duration: 1000, startDelay: 0, strongMagnitude: side ? 0 : 0.5, weakMagnitude: side ? 0.5 : 0 });
        if (run === vibrationRun) vibrationStatus.textContent = result === false ? 'O dispositivo não executou a vibração.' : result === 'preempted' ? 'Teste interrompido pelo dispositivo.' : 'Teste concluído no controle local.';
      } catch { if (run === vibrationRun) vibrationStatus.textContent = 'Vibração indisponível neste modo de conexão. Tente USB ou outro modo do controle.'; }
      finally { if (run === vibrationRun) { activeActuator = null; activeSide = -1; button.classList.remove('is-active'); } }
    }));
    window.addEventListener('blur', stopVibration);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopVibration(); });
    const panelVisible = () => !panel.closest('[hidden],details:not([open]),dialog:not([open])');
    const diagnostic = make('section'); diagnostic.className = 'gamepad-diagnostic'; diagnostic.append(make('h4', 'Leituras técnicas'), preview, vibrationStatus);
    presetHint.textContent = 'Escolha o modelo e teste os comandos. Os ajustes são salvos automaticamente.';
    view.mapping.append(extras, remap);
    panel.append(select, presetRow, status, feedback, monitor, diagnostic);
    const pads = [];
    let knownDevices = [], selected = '', lastSent = null, sentAt = 0, wasSending = false, lastPaint = 0;
    let lastView = null;
    const current = () => pads.find((pad) => String(pad.index) === selected);
    remoteFeedback = window.WssGamepadFeedback?.create({ getPad: current, canPlay: () => canSend() && !activeActuator });
    let cachedProfile = null;
    const getProfile = () => {
      const pad = current(), source = pad && Object.hasOwn(profiles, pad.id) ? profiles[pad.id] : null;
      if (!cachedProfile || cachedProfile.id !== pad?.id || cachedProfile.source !== source) {
        const profile = source ? model.profile({ ...source, triggerLimits: [1, 1] }) : model.defaultProfile(pad);
        cachedProfile = { id: pad?.id, source, profile, sample: model.createSampler(profile, { reuseOutput: true }) };
      }
      return cachedProfile.profile;
    };
    let learning = null; const rawExtraNodes = [];
    async function save(p) {
      const pad = current(); if (!pad) return;
      profiles[pad.id] = model.profile(p);
      try {
        if (bridge?.saveGamepadProfile) await bridge.saveGamepadProfile({ id: pad.id, profile: profiles[pad.id] });
        localStorage.setItem('wss-gamepad-profiles', JSON.stringify(profiles)); feedback.textContent = 'Mapeamento salvo neste aplicativo.'; }
      catch { feedback.textContent = 'Mapeamento aplicado; não foi possível salvar o perfil.'; }
    }
    presetSelect.addEventListener('change', () => { save(model.applyPreset(presetSelect.value, getProfile())); editor(); });
    layoutSelect.addEventListener('change', () => { const next = getProfile(); next.layout = layoutSelect.value; save(next); editor(); });
    addExtra.addEventListener('click', () => {
      const next = getProfile(); if (next.extraButtons.length >= 16) return;
      let source = 17; while (source < 63 && next.extraButtons.some((p) => p.source === source)) source++;
      next.extraButtons.push({ name: `M${next.extraButtons.length + 1}`, source, target: 0 }); save(next); editor();
    });
    function extraEditor(pad, p) {
      extras.hidden = !pad || p.preset !== 'custom'; extraBindings.replaceChildren(); extraReadings.replaceChildren(); rawExtraNodes.length = 0;
      if (extras.hidden) return;
      layoutSelect.value = p.layout;
      extraInfo.textContent = `O app detectou ${pad.buttons.length} botões físicos. Use Detectar botão para descobrir o índice da tecla desejada. Em controles padrão, as entradas adicionais começam em B17; em outros modos, a ordem pode variar. Se uma tecla traseira só repetir outro botão no firmware, ela precisa ser configurada no software do fabricante.`;
      const labels = model.labelsFor(p);
      for (let i = 0; i < Math.min(64, pad.buttons.length); i++) { const chip = make('span', `B${i}: 0.00`); chip.className = 'gpad-extra-chip'; extraReadings.append(chip); rawExtraNodes.push({ chip, index: i }); }
      if (!rawExtraNodes.length) extraReadings.append(make('p', 'Nenhum botão extra independente detectado neste modo de conexão.'));
      p.extraButtons.forEach((binding, i) => {
        const row = make('div'); row.className = 'gpad-extra-binding';
        const nameLabel = make('label', 'Nome'); const name = make('input'); name.type = 'text'; name.maxLength = 24; name.value = binding.name; name.setAttribute('aria-label', `Nome do botão extra ${i + 1}`); nameLabel.append(name);
        const sourceLabel = make('label', 'Botão físico'); const source = make('input'); source.type = 'number'; source.min = '0'; source.max = '63'; source.step = '1'; source.value = String(binding.source); source.setAttribute('aria-label', `Índice físico do botão extra ${i + 1}`); sourceLabel.append(source);
        const targetLabel = make('label', 'Enviar como'); const target = make('select'); target.setAttribute('aria-label', `Destino do botão extra ${i + 1}`);
        labels.forEach((label, index) => { const option = make('option', label); option.value = String(index); target.append(option); }); target.value = String(binding.target); targetLabel.append(target);
        name.addEventListener('change', () => { const next = getProfile(); next.extraButtons[i].name = name.value; save(next); });
        source.addEventListener('change', () => { if (source.value !== '' && source.checkValidity()) { const next = getProfile(); next.extraButtons[i].source = Number(source.value); save(next); } });
        target.addEventListener('change', () => { const next = getProfile(); next.extraButtons[i].target = Number(target.value); save(next); });
        const learn = make('button', 'Detectar botão'); learn.type = 'button'; learn.className = 'btn';
        learn.addEventListener('click', () => {
          if (learning) learning.button.textContent = 'Detectar botão';
          learning = { index: i, button: learn, until: performance.now() + 15000, held: new Set(current().buttons.map((b, index) => b.value > 0.5 ? index : -1).filter((index) => index >= 0)) };
          learn.textContent = 'Pressione o botão…'; feedback.textContent = 'Pressione o botão físico desejado. A detecção termina em 15 segundos.';
        });
        const remove = make('button', 'Remover'); remove.type = 'button'; remove.className = 'btn'; remove.setAttribute('aria-label', `Remover botão extra ${i + 1}`);
        remove.addEventListener('click', () => { const next = getProfile(); next.extraButtons.splice(i, 1); save(next); editor(); });
        row.append(nameLabel, sourceLabel, targetLabel, learn, remove); extraBindings.append(row);
      });
      addExtra.disabled = p.extraButtons.length >= 16;
    }
    function editor() {
      lastView = null;
      learning = null; stopVibration(); vibrationMessage = false;
      mapping.replaceChildren(); const pad = current(); if (!pad) { presetSelect.disabled = true; extras.hidden = true; rawExtraNodes.length = 0; return; }
      const p = getProfile();
      presetSelect.disabled = !pad; presetSelect.value = p.preset;
      function number(label, value, max, change, step = '1') {
        const row = make('label', label + ' '); const input = make('input'); input.type = 'number'; input.min = '0'; input.max = String(max); input.step = step; input.value = String(value);
        input.addEventListener('change', () => { if (input.checkValidity() && input.value !== '') { const next = getProfile(); change(next, Number(input.value)); save(next); } }); row.append(input); mapping.append(row);
      }
      number('Zona morta (0 a 0,5)', p.deadzone, 0.5, (next, value) => { next.deadzone = value; }, '0.01');
      const reset = make('button', 'Restaurar padrão deste preset'); reset.type = 'button'; reset.className = 'btn'; reset.addEventListener('click', () => { const next = model.applyPreset(p.preset, p); next.extraButtons = []; next.triggerLimits = [1, 1]; next.triggers = model.profile().triggers; save(next); editor(); }); mapping.append(reset);
      extraEditor(pad, p);
    }
    select.addEventListener('change', () => { stopVibration(); if (wasSending) send(model.neutral()); selected = select.value; lastSent = null; editor(); });
    let profilePoll = 0, profileReading = false, lastStatus = null, statusAt = 0;
    const acceptProfiles = value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      if (JSON.stringify(value) !== JSON.stringify(profiles)) { profiles = Object.assign(Object.create(null), value); editor(); }
    };
    const unsubscribeProfiles = bridge?.onGamepadProfiles?.(acceptProfiles);
    const timer = setInterval(() => {
      if (!bridge?.onGamepadProfiles && bridge?.readGamepadProfiles && !profileReading && !document.hidden
        && (panelVisible() || canSend()) && performance.now() - profilePoll > 2000) {
        profilePoll = performance.now(); profileReading = true;
        bridge.readGamepadProfiles().then(acceptProfiles).catch(() => {}).finally(() => { profileReading = false; });
      }
      // Atualiza referências dos snapshots do navegador sem criar arrays e uma
      // assinatura string em toda leitura. Metadados só mudam com os dispositivos.
      let count = 0, devicesChanged = false;
      for (const pad of navigator.getGamepads?.() || []) {
        if (!pad) continue;
        const known = knownDevices[count];
        if (!known || known.index !== pad.index || known.id !== pad.id || known.buttons !== pad.buttons.length) devicesChanged = true;
        pads[count++] = pad;
      }
      pads.length = count;
      if (devicesChanged || knownDevices.length !== count) {
        knownDevices = pads.map(pad => ({ index: pad.index, id: pad.id, buttons: pad.buttons.length }));
        if (!selected && pads[0]) selected = String(pads[0].index);
        const options = pads.map((pad) => { const option = make('option', pad.id); option.value = String(pad.index); return option; });
        if (!pads.some((pad) => String(pad.index) === selected)) { const option = make('option', 'Controle desconectado'); option.value = selected; options.unshift(option); }
        select.replaceChildren(...options); select.value = selected; select.hidden = pads.length <= 1; editor();
      }
      const pad = current(), sending = canSend() && Boolean(pad), time = performance.now();
      const paint = !document.hidden && time - lastPaint > 33 && panelVisible();
      // Só remapeia/aloca o estado quando será enviado ou desenhado. Descoberta
      // de dispositivos, presença, neutralização e relógio do envio continuam ativos.
      const config = sending || paint ? getProfile() : null;
      const state = sending || paint ? pad ? cachedProfile.sample(pad) : model.neutral() : null;
      if (!pad && activeActuator) stopVibration();
      if (learning && pad) {
        for (const index of learning.held) if (!(pad.buttons[index]?.value > 0.5)) learning.held.delete(index);
        const source = pad.buttons.findIndex((b, index) => index < 64 && b.value > 0.5 && !learning.held.has(index));
        if (source >= 0 && document.hasFocus()) { const next = getProfile(); next.extraButtons[learning.index].source = source; save(next); editor(); }
        else if (performance.now() > learning.until) { learning.button.textContent = 'Detectar botão'; learning = null; feedback.textContent = 'Nenhum novo botão detectado. Confira se o dispositivo expõe essa tecla como um botão independente.'; }
      }
      if (!sending) remoteFeedback?.stop();
      if (sending) {
        if (!model.sameState(state, lastSent) || time - sentAt >= 250) {
          // Snapshot independente antes do callback, como a string anterior:
          // mutações feitas por quem recebe não alteram a comparação seguinte.
          const snapshot = { axes: state.axes.slice(), buttons: state.buttons.slice() };
          send({ axes: state.axes.slice(), buttons: state.buttons.slice() }); lastSent = snapshot; sentAt = time;
        }
      } else if (wasSending) { send(model.neutral()); lastSent = null; }
      wasSending = sending;
      const connected = Boolean(pad), name = pad?.id || '';
      if (!lastStatus || connected !== lastStatus.connected || name !== lastStatus.name || sending !== lastStatus.sending || time - statusAt > 1000) {
        lastStatus = { connected, name, sending }; statusAt = time; onStatus({ connected, name, sending });
      }
      if (paint) {
        lastPaint = time;
        // O sampler reutiliza vetores: guarde uma cópia para comparar a pintura,
        // incluindo leituras físicas que não aparecem no estado remapeado.
        const viewKey = JSON.stringify([pad?.id, pad?.mapping, pad?.axes, pad?.buttons.map(b => b.value), state, config,
          sending, supportsVibration(actuatorFor(pad)), vibrationMessage]);
        if (viewKey === lastView && !view.isLearning?.()) return;
        lastView = viewKey;
        vibrationButtons.forEach(button => { button.disabled = !supportsVibration(actuatorFor(pad)); });
        view.update(pad, state, config);
        if (!vibrationMessage) vibrationStatus.textContent = !pad ? 'Conecte um controle para testar.' : supportsVibration(actuatorFor(pad)) ? 'Vibração local: E testa o motor forte; D testa o motor fraco. Clique novamente para parar.' : 'Vibração indisponível neste modo de conexão.';
        for (const { chip, index } of rawExtraNodes) { const value = pad?.buttons[index]?.value || 0; chip.textContent = `B${index}: ${value.toFixed(2)}`; chip.classList.toggle('is-pressed', value > 0.1); }
        status.textContent = pad ? `${pad.mapping === 'standard' ? 'Mapeamento padrão' : 'Controle sem padrão: ajuste os índices físicos abaixo'}. ${sending ? 'Enviando' : 'Teste local'}.` : 'Conecte o gamepad e pressione um botão.';
        const raw = pad ? pad.buttons.map((b, i) => b.value > 0.1 ? `${i}=${b.value.toFixed(2)}` : '').filter(Boolean).join(' ') : '';
        const rawAxes = pad ? pad.axes.map((v, i) => `${i}=${v.toFixed(2)}`).join(' ') : 'nenhum';
        preview.textContent = `Botões físicos: ${raw || 'nenhum'} | Eixos físicos: ${rawAxes} | Saída: ${state.buttons.map((v, i) => v > 0.1 ? model.labelsFor(config)[i] : '').filter(Boolean).join(' ') || 'neutro'} | Eixos mapeados: ${state.axes.join(', ')}`;
      }
    }, pollIntervalMs === 8 ? 8 : 16);
    window.addEventListener('pagehide', () => { stopVibration(); if (wasSending) send(model.neutral()); onStatus({ connected: false, name: '', sending: false }); clearInterval(timer); unsubscribeProfiles?.(); }, { once: true });
    return { profiles: () => profiles, feedback: value => remoteFeedback?.apply(value), stopFeedback: () => remoteFeedback?.stop() };
  },
};
