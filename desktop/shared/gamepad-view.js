/* Visualização SVG do estado já mapeado. Nenhuma imagem ou estado do controle sai deste componente. */
window.WssGamepadView = {
  create(container) {
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const root = make('section', 'gpad-view'); root.setAttribute('aria-label', 'Monitor do gamepad em tempo real');
    const title = make('h3', 'gpad-device', 'Nenhum controle conectado');
    const badge = make('span', 'gpad-preset-badge', 'Xbox'); const heading = make('div', 'gpad-heading'); heading.append(title, badge);
    const meta = make('dl', 'gpad-meta'); const metadata = {};
    for (const [key, label] of [['index', 'Índice'], ['connected', 'Conectado'], ['mapping', 'Mapeamento'], ['timestamp', 'Timestamp'], ['vibration', 'Vibração']]) {
      const item = make('div'); const value = make('dd', '', '—'); item.append(make('dt', '', label), value); meta.append(item); metadata[key] = value;
    }
    const layout = make('div', 'gpad-layout'); const readings = make('div', 'gpad-readings');
    const buttons = make('div', 'gpad-buttons'); const buttonNodes = [];
    window.WssGamepad.labels.forEach((label, i) => {
      const tile = make('div', 'gpad-button'); tile.title = label;
      const value = make('strong', '', '0.00'); const caption = make('small', '', `B${i} · ${label}`); tile.append(caption, value); buttons.append(tile); buttonNodes.push({ tile, value, caption });
    });
    const sticks = make('div', 'gpad-sticks'); const stickNodes = [];
    for (let i = 0; i < 2; i++) {
      const item = make('div', 'gpad-stick'); item.append(make('h4', '', i ? 'ANALÓGICO DIREITO' : 'ANALÓGICO ESQUERDO'));
      const plot = make('div', 'gpad-stick-plot');
      const axis = make('div', 'gpad-axis'); const x = make('strong', '', '0.0000'), y = make('strong', '', '0.0000');
      const ax = make('div'), ay = make('div'); ax.append(make('small', '', `AXIS ${i * 2}`), x); ay.append(make('small', '', `AXIS ${i * 2 + 1}`), y); axis.append(ax, ay);
      const graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); graph.setAttribute('viewBox', '0 0 120 120'); graph.setAttribute('aria-label', i ? 'Posição do analógico direito' : 'Posição do analógico esquerdo');
      graph.innerHTML = '<circle cx="60" cy="60" r="54" class="gpad-grid"/><path d="M6 60h108M60 6v108" class="gpad-grid"/><circle class="gpad-dot" cx="60" cy="60" r="4"/>';
      plot.append(axis, graph); item.append(plot); sticks.append(item);
      stickNodes.push({ x, y, dot: graph.querySelector('.gpad-dot') });
    }
    const note = make('p', 'gpad-note', 'Saída configurada: os valores e o desenho mostram o que será enviado ao jogo.');
    const figure = make('div', 'gpad-figure');
    figure.innerHTML = `<svg viewBox="0 0 520 360" role="img" aria-label="Controle Xbox: botões e analógicos acendem ao pressionar">
      <path class="gpad-shadow" d="M149 79C115 79 99 94 88 127L49 252c-18 65 10 106 48 78l58-65h210l58 65c38 28 66-13 48-78l-39-125c-11-33-27-48-61-48Z"/>
      <path class="gpad-body" d="M149 69C115 69 99 84 88 117L49 242c-18 65 10 106 48 78l58-65h210l58 65c38 28 66-13 48-78l-39-125c-11-33-27-48-61-48Z"/>
      <path class="gpad-grid" d="m75 185 80 70m290-70-80 70"/>
      <rect class="gpad-control" data-button="4" x="115" y="48" width="83" height="12" rx="6"/><text x="156" y="43" data-glyph="4">LB</text>
      <rect class="gpad-control" data-button="5" x="322" y="48" width="83" height="12" rx="6"/><text x="363" y="43" data-glyph="5">RB</text>
      <rect class="gpad-control" x="140" y="5" width="31" height="33" rx="10"/><rect class="gpad-trigger-fill" data-trigger="6" x="143" y="35" width="25" height="0" rx="7"/>
      <rect class="gpad-control" x="347" y="5" width="31" height="33" rx="10"/><rect class="gpad-trigger-fill" data-trigger="7" x="350" y="35" width="25" height="0" rx="7"/>
      <g data-left-assembly><circle class="gpad-stick-ring" cx="145" cy="145" r="40"/><g data-stick="0"><circle class="gpad-control" data-button="10" cx="145" cy="145" r="30"/></g></g>
      <circle class="gpad-stick-ring" cx="326" cy="225" r="40"/><g data-stick="1"><circle class="gpad-control" data-button="11" cx="326" cy="225" r="30"/></g>
      <circle class="gpad-control" data-button="8" cx="230" cy="145" r="11"/><text x="230" y="149">≡</text>
      <circle class="gpad-control" data-button="9" cx="280" cy="145" r="11"/><text x="280" y="149">☰</text>
      <circle class="gpad-control" data-button="16" cx="255" cy="99" r="14"/><text x="255" y="103" data-glyph="16">X</text>
      <circle class="gpad-control" data-button="0" cx="381" cy="173" r="15"/><text x="381" y="178" data-glyph="0">A</text>
      <circle class="gpad-control" data-button="1" cx="410" cy="144" r="15"/><text x="410" y="149" data-glyph="1">B</text>
      <circle class="gpad-control" data-button="2" cx="352" cy="144" r="15"/><text x="352" y="149" data-glyph="2">X</text>
      <circle class="gpad-control" data-button="3" cx="381" cy="115" r="15"/><text x="381" y="120" data-glyph="3">Y</text>
      <g data-dpad-assembly><circle class="gpad-stick-ring" cx="202" cy="225" r="37"/>
      <path class="gpad-control" data-button="12" d="m202 197-12 10 12 12 12-12Z"/><path class="gpad-control" data-button="13" d="m202 253-12-10 12-12 12 12Z"/>
      <path class="gpad-control" data-button="14" d="m174 225 10-12 12 12-12 12Z"/><path class="gpad-control" data-button="15" d="m230 225-10-12-12 12 12 12Z"/></g>
    </svg>`;
    readings.append(buttons, sticks, note); layout.append(readings, figure); root.append(heading, meta, layout); container.append(root);
    const controls = [...figure.querySelectorAll('[data-button]')]; const handles = [...figure.querySelectorAll('[data-stick]')]; const triggers = [...figure.querySelectorAll('[data-trigger]')];
    const extraVisual = make('div', 'gpad-extra-visual'); figure.append(extraVisual);
    let layoutKey = '', extrasKey = ''; const extraNodes = [];
    return {
      update(pad, state, config) {
        const profile = window.WssGamepad.profile(config); const labels = window.WssGamepad.labelsFor(profile);
        badge.textContent = window.WssGamepad.presets.find((p) => p.id === profile.preset).name;
        if (layoutKey !== profile.layout) {
          layoutKey = profile.layout; root.dataset.layout = layoutKey;
          figure.querySelector('svg').setAttribute('aria-label', 'Controle ' + (layoutKey === 'playstation' ? 'PlayStation' : 'Xbox') + ': estado dos botões e analógicos');
          figure.querySelector('[data-left-assembly]').setAttribute('transform', layoutKey === 'playstation' ? 'translate(55 80)' : 'translate(0 0)');
          figure.querySelector('[data-dpad-assembly]').setAttribute('transform', layoutKey === 'playstation' ? 'translate(-60 -80)' : 'translate(0 0)');
          for (const node of figure.querySelectorAll('[data-glyph]')) node.textContent = node.dataset.glyph === '16' && layoutKey === 'xbox' ? 'X' : labels[Number(node.dataset.glyph)];
          buttonNodes.forEach((node, i) => { node.caption.textContent = 'B' + i + ' · ' + labels[i]; node.tile.title = labels[i]; });
        }
        const bindings = profile.preset === 'custom' ? profile.extraButtons : [];
        const key = JSON.stringify([profile.layout, bindings]);
        if (key !== extrasKey) {
          extrasKey = key; extraNodes.length = 0; extraVisual.replaceChildren();
          for (const binding of bindings) { const chip = make('span', 'gpad-extra-chip', (binding.name || 'Extra') + ' → ' + labels[binding.target] + ' · B' + binding.source); extraNodes.push(chip); extraVisual.append(chip); }
        }
        bindings.forEach((binding, i) => extraNodes[i].classList.toggle('is-pressed', (pad?.buttons[binding.source]?.value || 0) > 0.1));
        extraVisual.hidden = !bindings.length;
        title.textContent = pad?.id || 'Nenhum controle conectado'; root.classList.toggle('is-disconnected', !pad);
        metadata.index.textContent = pad ? String(pad.index) : '—'; metadata.connected.textContent = pad ? 'Sim' : 'Não';
        metadata.mapping.textContent = pad ? pad.mapping || 'personalizado' : '—'; metadata.timestamp.textContent = pad ? (Number(pad.timestamp) || 0).toFixed(2) : '—';
        metadata.vibration.textContent = 'Teste nos ajustes rápidos';
        state.buttons.forEach((value, i) => { buttonNodes[i].value.textContent = value.toFixed(2); buttonNodes[i].tile.classList.toggle('is-pressed', value > 0.1); buttonNodes[i].tile.style.setProperty('--pressure', `${value * 100}%`); });
        for (const c of controls) c.classList.toggle('is-pressed', state.buttons[Number(c.dataset.button)] > 0.1);
        for (const trigger of triggers) { const amount = state.buttons[Number(trigger.dataset.trigger)] * 27; trigger.setAttribute('height', String(amount)); trigger.setAttribute('y', String(35 - amount)); }
        stickNodes.forEach((stick, i) => {
          const x = state.axes[i * 2], y = state.axes[i * 2 + 1]; stick.x.textContent = x.toFixed(4); stick.y.textContent = y.toFixed(4);
          stick.dot.setAttribute('cx', String(60 + x * 54)); stick.dot.setAttribute('cy', String(60 + y * 54)); handles[i].setAttribute('transform', `translate(${x * 12} ${y * 12})`);

        });
      },
    };
  },
};
