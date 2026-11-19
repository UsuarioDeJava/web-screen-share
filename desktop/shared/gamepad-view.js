/* Visualização SVG do estado já mapeado. Nenhuma imagem ou estado do controle sai deste componente. */
window.WssGamepadView = {
  create(container, { onChange = () => {} } = {}) {
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
    const root = make('section', 'gpad-view'); root.setAttribute('aria-label', 'Monitor do gamepad em tempo real');
    const title = make('h3', 'gpad-device', 'Nenhum controle conectado');
    const badge = make('span', 'gpad-preset-badge', 'Xbox'); const heading = make('div', 'gpad-heading'); heading.append(title, badge);
    const layout = make('div', 'gpad-layout');
    const left = make('div', 'gpad-config-side'), right = make('div', 'gpad-config-side');
    const buttonNodes = [];
    let activePad = null, learning = null, optionKey = '';
    const order = [6,4,8,10,12,14,13,15,7,5,3,2,1,0,9,11];
    window.WssGamepad.labels.forEach((label, i) => {
      const tile = make('div', 'gpad-button gpad-config-row'); tile.dataset.output = String(i); tile.classList.add('gpad-output-'+i);
      const value = make('strong', '', '0%'); const pressure=make('progress'); pressure.max=1; pressure.value=0; pressure.setAttribute('aria-label','Pressão '+label); const caption = make('label', '', label);
      const source = make('select'); source.setAttribute('aria-label', 'Entrada para ' + label); caption.append(source);
      const learn = make('button', '', 'Detectar'); learn.type = 'button'; learn.className = 'gpad-learn'; learn.setAttribute('aria-label', 'Detectar entrada para ' + label);
      source.addEventListener('change', () => {
        const [type, index] = source.value.split(':'); onChange(p => {
          if (i === 6 || i === 7) p.triggers[i - 6] = { type, source: Number(index), min: type === 'axis' ? -1 : 0, max: 1 };
          else p.buttons[i] = Number(index);
        });
      });
      learn.addEventListener('click', () => {
        if (!activePad) return;
        if (learning) learning.button.textContent = 'Detectar';
        learning = { output: i, button: learn, until: performance.now() + 10000, buttons: activePad.buttons.map(b=>b.value), axes: [...activePad.axes] };
        learn.textContent = 'Aperte…';
      });
      tile.append(caption, value, learn, pressure); buttonNodes.push({ tile, value, caption, source, learn, pressure });
    });
    for (const i of order) (i === 7 || [5,3,2,1,0,9,11].includes(i) ? right : left).append(buttonNodes[i].tile);
    const guide = buttonNodes[16].tile; guide.classList.add('gpad-guide');
    const sticks = make('div', 'gpad-sticks'); const stickNodes = [];
    for (let i = 0; i < 2; i++) {
      const item = make('div', 'gpad-stick'); item.append(make('h4', '', i ? 'ANALÓGICO DIREITO' : 'ANALÓGICO ESQUERDO'));
      const plot = make('div', 'gpad-stick-plot');
      const axis = make('div', 'gpad-axis'); const x = make('strong', '', '0.0000'), y = make('strong', '', '0.0000');
      const ax = make('div'), ay = make('div'); ax.append(make('small', '', `AXIS ${i * 2}`), x); ay.append(make('small', '', `AXIS ${i * 2 + 1}`), y); axis.append(ax, ay);
      const graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); graph.setAttribute('viewBox', '0 0 120 120'); graph.setAttribute('aria-label', i ? 'Posição do analógico direito' : 'Posição do analógico esquerdo');
      graph.innerHTML = '<circle cx="60" cy="60" r="54" class="gpad-grid"/><path d="M6 60h108M60 6v108" class="gpad-grid"/><circle class="gpad-dot" cx="60" cy="60" r="4"/>';
      const settings = make('div', 'gpad-stick-settings'); const inputs = [];
      for (let j = 0; j < 2; j++) {
        const index = i * 2 + j; const label = make('label', '', j ? 'Eixo Y' : 'Eixo X');
        const source = make('select'); source.setAttribute('aria-label', (i ? 'Direito' : 'Esquerdo') + (j ? ' · eixo Y' : ' · eixo X'));
        source.addEventListener('change', () => onChange(p => { p.axes[index] = Number(source.value); }));
        const invertLabel = make('label', 'gpad-invert', 'Inverter'); const invert = make('input'); invert.type = 'checkbox';
        invert.setAttribute('aria-label', 'Inverter ' + (i ? 'direito' : 'esquerdo') + (j ? ' Y' : ' X'));
        invert.addEventListener('change', () => onChange(p => { p.invert[index] = invert.checked; }));
        label.append(source); invertLabel.prepend(invert); settings.append(label, invertLabel); inputs.push({source, invert, index});
      }
      plot.append(axis, graph); item.append(plot, settings); sticks.append(item);
      stickNodes.push({ x, y, inputs, dot: graph.querySelector('.gpad-dot') });
    }
    const note = make('p', 'gpad-note', 'Saída configurada: os valores e o desenho mostram o que será enviado ao jogo.');
    const figure = make('div', 'gpad-figure');
    figure.innerHTML = `<svg viewBox="0 0 520 360" role="img" aria-label="Controle Xbox: botões e analógicos acendem ao pressionar">
      <path class="gpad-shadow" d="M149 79C115 79 99 94 88 127L49 252c-18 65 10 106 48 78l58-43h210l58 43c38 28 66-13 48-78l-39-125c-11-33-27-48-61-48Z"/>
      <path class="gpad-body" d="M149 69C115 69 99 84 88 117L49 242c-18 65 10 106 48 78l58-43h210l58 43c38 28 66-13 48-78l-39-125c-11-33-27-48-61-48Z"/>
      <path class="gpad-grid" d="m75 185 80 92m290-92-80 92"/>
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
    const wiring = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); wiring.classList.add('gpad-wiring'); wiring.setAttribute('aria-hidden', 'true');
    const wires = buttonNodes.map(() => { const path = document.createElementNS(wiring.namespaceURI, 'path'); wiring.append(path); return path; });
    const center = make('div', 'gpad-center'); center.append(figure, sticks);
    const mapping = make('section', 'gpad-integrated-mapping');
    const vibrationLeft = make('div', 'gpad-rumble-left'), vibrationRight = make('div', 'gpad-rumble-right');
    layout.className = 'gpad-config-layout'; layout.append(wiring, vibrationLeft, guide, vibrationRight, left, center, right);
    root.append(heading, layout, mapping, note); container.append(root);
    let wireFrame = 0;
    function drawWires() {
      cancelAnimationFrame(wireFrame); wireFrame=requestAnimationFrame(()=>{
        if(!root.isConnected||!layout.clientWidth)return;
        const bounds=layout.getBoundingClientRect();wiring.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
        buttonNodes.forEach((node,i)=>{
          const target=figure.querySelector('[data-button="'+i+'"]') || figure.querySelector('[data-trigger="'+i+'"]');
          const targetBox=target.getBoundingClientRect(), box=node.tile.getBoundingClientRect();const fromLeft=node.tile.parentElement===left;
          const isGuide=i===16; const x=(isGuide?box.left+box.width/2:fromLeft?box.right:box.left)-bounds.left, y=(isGuide?box.bottom:box.top+box.height/2)-bounds.top;
          const tx=targetBox.left+targetBox.width/2-bounds.left,ty=targetBox.top+targetBox.height/2-bounds.top;
          const bend=x+(fromLeft?14:-14);wires[i].setAttribute('d',isGuide?'M'+x+' '+y+'L'+tx+' '+ty:'M'+x+' '+y+'H'+bend+'L'+tx+' '+ty);
        });
      });
    }
    const resizeObserver=new ResizeObserver(drawWires);resizeObserver.observe(layout);resizeObserver.observe(figure);
    const controls = [...figure.querySelectorAll('[data-button]')]; const handles = [...figure.querySelectorAll('[data-stick]')]; const triggers = [...figure.querySelectorAll('[data-trigger]')];
    const extraVisual = make('div', 'gpad-extra-visual'); figure.append(extraVisual);
    let layoutKey = '', extrasKey = ''; const extraNodes = [];
    return {
      mapping, vibrationLeft, vibrationRight,
      update(pad, state, config) {
        const profile = window.WssGamepad.profile(config); activePad=pad; const labels = window.WssGamepad.labelsFor(profile);
        badge.textContent = window.WssGamepad.presets.find((p) => p.id === profile.preset).name;
        if (layoutKey !== profile.layout) {
          layoutKey = profile.layout; root.dataset.layout = layoutKey;
          figure.querySelector('svg').setAttribute('aria-label', 'Controle ' + (layoutKey === 'playstation' ? 'PlayStation' : 'Xbox') + ': estado dos botões e analógicos');
          figure.querySelector('[data-left-assembly]').setAttribute('transform', layoutKey === 'playstation' ? 'translate(55 80)' : 'translate(0 0)');
          figure.querySelector('[data-dpad-assembly]').setAttribute('transform', layoutKey === 'playstation' ? 'translate(-60 -80)' : 'translate(0 0)');
          for (const node of figure.querySelectorAll('[data-glyph]')) node.textContent = node.dataset.glyph === '16' && layoutKey === 'xbox' ? 'X' : labels[Number(node.dataset.glyph)];
          buttonNodes.forEach((node, i) => { node.caption.firstChild.textContent = labels[i]; node.tile.title = labels[i]; }); drawWires();
        }
        const nextOptionKey=JSON.stringify([pad?.id,pad?.buttons.length,pad?.axes.length,profile.buttons,profile.triggers]);
        if(nextOptionKey!==optionKey){
          if (learning) { learning.button.textContent='Detectar'; learning=null; } optionKey=nextOptionKey;
          buttonNodes.forEach((node,i)=>{
            node.source.replaceChildren();
            const add=(text,value)=>{const option=make('option','',text);option.value=value;node.source.append(option);};
            if(i===6||i===7)add('Automático · B'+profile.buttons[i],'mapped:'+i);
            for(let b=0;b<(pad?.buttons.length||17);b++)add('Botão '+b,'button:'+b);
            if(i===6||i===7)for(let a=0;a<(pad?.axes.length||0);a++)add('Eixo '+a+' · analógico','axis:'+a);
            const t=profile.triggers[i-6];node.source.value=i===6||i===7 ? t.type+':'+(t.type==='mapped'?i:t.source) : 'button:'+profile.buttons[i];
          });drawWires();
        }
        buttonNodes.forEach(node=>{node.source.disabled=node.learn.disabled=!pad;});
        if(learning&&pad){
          const l=learning;let type='button',source=pad.buttons.findIndex((b,i)=>b.value-l.buttons[i]>.25);
          if((l.output===6||l.output===7)&&source<0){type='axis';source=pad.axes.findIndex((v,i)=>Math.abs(v-l.axes[i])>.25);}
          if(source>=0&&document.hasFocus()){
            const min=type==='axis'?l.axes[source]:0;learning=null;l.button.textContent='Detectar';
            onChange(p=>{if(l.output===6||l.output===7)p.triggers[l.output-6]={type,source,min,max:type==='axis'&&min>.5?-1:1};else p.buttons[l.output]=source;});
          }else if(performance.now()>l.until){learning=null;l.button.textContent='Detectar';}
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
        state.buttons.forEach((value, i) => { buttonNodes[i].value.textContent = Math.round(value*100)+'%'; buttonNodes[i].pressure.value=value; wires[i].classList.toggle('is-active',value>0.01); buttonNodes[i].tile.classList.toggle('is-pressed', value > 0.1); buttonNodes[i].tile.style.setProperty('--pressure', `${value * 100}%`); });
        for (const c of controls) c.classList.toggle('is-pressed', state.buttons[Number(c.dataset.button)] > 0.1);
        for (const trigger of triggers) { const amount = state.buttons[Number(trigger.dataset.trigger)] * 27; trigger.setAttribute('height', String(amount)); trigger.setAttribute('y', String(35 - amount)); }
        stickNodes.forEach((stick, i) => {
          const x = state.axes[i * 2], y = state.axes[i * 2 + 1]; stick.x.textContent = x.toFixed(4); stick.y.textContent = y.toFixed(4);
          stick.inputs.forEach(({source, invert, index}) => {
            const count = Math.max(pad?.axes.length || 4, profile.axes[index] + 1);
            if (source.options.length !== count) { source.replaceChildren(...Array.from({length:count}, (_, a) => { const option=make('option','','Axis '+a); option.value=String(a); return option; })); }
            source.value=String(profile.axes[index]); invert.checked=profile.invert[index]; source.disabled=invert.disabled=!pad;
          });
          stick.dot.setAttribute('cx', String(60 + x * 54)); stick.dot.setAttribute('cy', String(60 + y * 54)); handles[i].setAttribute('transform', `translate(${x * 12} ${y * 12})`);

        });
      },
    };
  },
};
