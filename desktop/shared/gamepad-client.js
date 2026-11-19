/* Gamepad físico -> perfil local -> estado Xbox normalizado enviado ao proprietário. */
window.WssGamepadClient = {
  async start({ panel, canSend, send }) {
    const bridge = window.wssDesktop || window.desktopSettings;
    const model = window.WssGamepad;
    const make = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
    let profiles = {};
    try { profiles = JSON.parse(localStorage.getItem('wss-gamepad-profiles') || '{}'); } catch {}
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) profiles = {};
    if (bridge?.readGamepadProfiles) profiles = await bridge.readGamepadProfiles().catch(() => profiles);
    const select = make('select'); select.setAttribute('aria-label', 'Meu controle físico');
    const status = make('p', 'Conecte o gamepad e pressione um botão para detectá-lo.'); status.className = 'dialog-sub';
    const mapping = make('div'); mapping.className = 'gamepad-mapping';
    const preview = make('p'); preview.className = 'dialog-sub'; preview.setAttribute('aria-live', 'off');
    const hint = make('p', 'Configure uma vez neste aplicativo. Todos os computadores que você controlar recebem o mesmo mapeamento como um controle Xbox 360. Abra esta seção para testar sem enviar comandos.'); hint.className = 'dialog-sub';
    panel.append(hint, select, status, mapping, preview);
    let pads = [], selected = '', signature = '', lastSent = '', sentAt = 0, wasSending = false, lastPaint = 0;
    const current = () => pads.find((pad) => String(pad.index) === selected);
    const getProfile = () => model.profile(profiles[current()?.id]);
    async function save(p) {
      const pad = current(); if (!pad) return;
      profiles[pad.id] = model.profile(p);
      try {
        if (bridge?.saveGamepadProfile) await bridge.saveGamepadProfile({ id: pad.id, profile: profiles[pad.id] });
        localStorage.setItem('wss-gamepad-profiles', JSON.stringify(profiles)); status.textContent = 'Mapeamento salvo neste aplicativo.'; }
      catch { status.textContent = 'Mapeamento aplicado; armazenamento local indisponível.'; }
    }
    function editor() {
      mapping.replaceChildren(); const pad = current(); if (!pad) return;
      const p = getProfile();
      function number(label, value, max, change, step = '1') {
        const row = make('label', label + ' '); const input = make('input'); input.type = 'number'; input.min = '0'; input.max = String(max); input.step = step; input.value = String(value);
        input.addEventListener('change', () => { if (input.checkValidity() && input.value !== '') { const next = getProfile(); change(next, Number(input.value)); save(next); } }); row.append(input); mapping.append(row);
      }
      model.labels.forEach((label, i) => number(label + ' · botão físico', p.buttons[i], 63, (next, value) => { next.buttons[i] = value; }));
      ['Analógico esquerdo X', 'Analógico esquerdo Y', 'Analógico direito X', 'Analógico direito Y'].forEach((label, i) => {
        number(label + ' · eixo', p.axes[i], 15, (next, value) => { next.axes[i] = value; });
        const row = make('label', 'Inverter ' + label + ' '); const input = make('input'); input.type = 'checkbox'; input.checked = p.invert[i];
        input.addEventListener('change', () => { const next = getProfile(); next.invert[i] = input.checked; save(next); }); row.append(input); mapping.append(row);
      });
      number('Zona morta (0 a 0,5)', p.deadzone, 0.5, (next, value) => { next.deadzone = value; }, '0.01');
      const reset = make('button', 'Restaurar padrão'); reset.type = 'button'; reset.className = 'btn'; reset.addEventListener('click', () => { save(model.profile()); editor(); }); mapping.append(reset);
    }
    select.addEventListener('change', () => { if (wasSending) send(model.neutral()); selected = select.value; lastSent = ''; editor(); });
    let profilePoll = 0;
    const timer = setInterval(() => {
      if (bridge?.readGamepadProfiles && performance.now() - profilePoll > 2000) {
        profilePoll = performance.now(); bridge.readGamepadProfiles().then((value) => { if (JSON.stringify(value) !== JSON.stringify(profiles)) { profiles = value; editor(); } }).catch(() => {});
      }
      pads = Array.from(navigator.getGamepads?.() || []).filter(Boolean);
      const nextSignature = pads.map((p) => p.index + ':' + p.id).join('|');
      if (signature !== nextSignature) {
        signature = nextSignature;
        if (!selected && pads[0]) selected = String(pads[0].index);
        const options = pads.map((pad) => { const option = make('option', pad.id); option.value = String(pad.index); return option; });
        if (!pads.some((pad) => String(pad.index) === selected)) { const option = make('option', 'Controle desconectado'); option.value = selected; options.unshift(option); }
        select.replaceChildren(...options); select.value = selected; editor();
      }
      const pad = current(); const state = pad ? model.sample(pad, getProfile()) : model.neutral();
      const sending = canSend() && Boolean(pad);
      const time = performance.now();
      if (sending) {
        const packet = JSON.stringify(state);
        if (packet !== lastSent || time - sentAt >= 250) { send(state); lastSent = packet; sentAt = time; }
      } else if (wasSending) { send(model.neutral()); lastSent = ''; }
      wasSending = sending;
      if (panel.open && time - lastPaint > 150) {
        lastPaint = time;
        status.textContent = pad ? `${pad.mapping === 'standard' ? 'Mapeamento padrão' : 'Controle sem padrão: ajuste os índices físicos abaixo'}. ${sending ? 'Enviando' : 'Teste local'}.` : 'Conecte o gamepad e pressione um botão.';
        const raw = pad ? pad.buttons.map((b, i) => b.value > 0.1 ? `${i}=${b.value.toFixed(2)}` : '').filter(Boolean).join(' ') : '';
        const rawAxes = pad ? pad.axes.map((v, i) => `${i}=${v.toFixed(2)}`).join(' ') : 'nenhum';
        preview.textContent = `Botões físicos: ${raw || 'nenhum'} | Eixos físicos: ${rawAxes} | Saída: ${state.buttons.map((v, i) => v > 0.1 ? model.labels[i] : '').filter(Boolean).join(' ') || 'neutro'} | Eixos mapeados: ${state.axes.join(', ')}`;
      }
    }, 16);
    window.addEventListener('pagehide', () => { if (wasSending) send(model.neutral()); clearInterval(timer); }, { once: true });
    return { profiles: () => profiles };
  },
};
