// Estilos do mouse e das marcações: modelo da setinha, tamanho, enfeite, efeito, rastro,
// nome junto, animação do clique, estilo e som do ping (Alt + clique) e pincel (Alt +
// arrastar). Cada pessoa escolhe o seu no perfil e todo mundo vê igual: na sala (os
// quadros), na tela de verdade de quem transmite (a camada do app) e na prévia.
//
// Um arquivo só (desktop/shared/fx.js): o servidor entrega pra sala em /js/fx.js e o app
// usa direto (camada na tela e Configurações). Nada aqui depende da página: só desenha no
// elemento recebido.
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- catálogo ----------

  // Setinhas num quadrado 24×24. hot: a ponta (onde o clique cai). badge: onde fica a
  // bolinha com a foto e deco: onde o enfeite se apoia (os dois em relação à ponta).
  // Camadas: fill/stroke 'c' = a cor da pessoa, 'w' = branco, ou uma cor fixa.
  const SKINS = {
    classic: {
      label: 'Clássica', hot: [4, 2.5], badge: [14.5, 16], deco: [2.5, 1],
      layers: [{ d: 'M4 2.5 19.5 13l-7 1.2-3.6 6.3z', fill: 'c', stroke: 'w', width: 1.6 }],
    },
    os: {
      label: 'Do PC', hot: [4, 2], badge: [11, 18], deco: [2, 1],
      layers: [{ d: 'M4 2v16.5l4.3-4.1 3 6.6 2.8-1.3-3-6.4H17z', fill: 'c', stroke: 'w', width: 1.5 }],
    },
    round: {
      label: 'Redonda', hot: [3.4, 3.3], badge: [13, 15], deco: [2.5, 1.5],
      layers: [{ d: 'M4.2 3.3c-.5-.4-1.2 0-1.1.6l1.9 15.4c.1.7 1 .9 1.4.3l3.4-4.6 5.9-.7c.7-.1 1-.9.4-1.4z', fill: 'c', stroke: 'w', width: 1.6 }],
    },
    pixel: {
      label: 'Pixel', hot: [4, 2], badge: [12, 18], deco: [2, 1],
      layers: [{ d: 'M4 2h2v2h2v2h2v2h2v2h2v2h2v2h2v2h-4v2h2v4h-2v2h-2v-4h-2v-2h-2v2H4z', fill: 'c', stroke: 'w', width: 1.4, crisp: true }],
    },
    hand: {
      label: 'Mãozinha', hot: [9, 2], badge: [7, 18], deco: [0, 0.5],
      layers: [{ d: 'M9 2a1.5 1.5 0 0 1 1.5 1.5V10a1.4 1.4 0 0 1 2.8.2v.3a1.4 1.4 0 0 1 2.8.3v.6a1.4 1.4 0 0 1 2.8.4V16c0 3-2 5.5-5 5.5h-2.4c-1.6 0-3-.8-3.9-2.1L4 14.6a1.4 1.4 0 0 1 2.1-1.8l1.4 1.4V3.5A1.5 1.5 0 0 1 9 2z', fill: 'c', stroke: 'w', width: 1.4 }],
    },
    cross: {
      label: 'Mira', hot: [12, 12], badge: [7, 7], deco: [0, -7],
      layers: [
        { d: 'M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6M12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12z', fill: 'none', stroke: 'w', width: 4.4 },
        { d: 'M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6M12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12z', fill: 'none', stroke: 'c', width: 2.2 },
        { d: 'M12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 1 0 0-2.8z', fill: 'c', stroke: 'w', width: 1 },
      ],
    },
    pen: {
      label: 'Lápis', hot: [3, 3], badge: [13, 13], deco: [3, 2],
      layers: [
        { d: 'M3 3l5.2 1.6 12.3 12.3-3.6 3.6L4.6 8.2z', fill: 'c', stroke: 'w', width: 1.4 },
        { d: 'M3 3l5.2 1.6-3.6 3.6z', fill: '#f3d3a1', stroke: 'w', width: 1 },
        { d: 'M3 3l2.1.65-1.45 1.45z', fill: '#2b2b33' },
        { d: 'M18 14.4 14.4 18', fill: 'none', stroke: 'w', width: 1.4 },
      ],
    },
    sword: {
      label: 'Espadinha', hot: [3, 3], badge: [13, 13], deco: [3, 2],
      layers: [
        { d: 'M3 3l6.4 1.3 7 7-5.1 5.1-7-7z', fill: '#e3e9f5', stroke: 'w', width: 1.2 },
        { d: 'M3 3l6.4 1.3 4.6 4.6-5.1 5.1-4.6-4.6z', fill: '#c3ccdd' },
        { d: 'M18.4 9.6 9.6 18.4', fill: 'none', stroke: 'w', width: 4.4 },
        { d: 'M18.4 9.6 9.6 18.4', fill: 'none', stroke: 'c', width: 2.6 },
        { d: 'M14.6 14.6 19.4 19.4', fill: 'none', stroke: 'w', width: 4.2 },
        { d: 'M14.6 14.6 19.4 19.4', fill: 'none', stroke: '#6b4a2b', width: 2.4 },
        { d: 'M20.4 18.6a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 1 0 0-3.6z', fill: 'c', stroke: 'w', width: 1 },
      ],
    },
    wand: {
      label: 'Varinha', hot: [6.5, 6.5], badge: [10, 10], deco: [0, -5],
      layers: [
        { d: 'M9.2 9.2 21 21', fill: 'none', stroke: 'w', width: 4 },
        { d: 'M9.2 9.2 21 21', fill: 'none', stroke: 'c', width: 2.2 },
        { d: 'M6.5 1.3l1.29 3.42 3.66.17-2.86 2.29.97 3.53L6.5 8.7l-3.06 2.01.97-3.53-2.86-2.29 3.66-.17z', fill: '#ffd23f', stroke: 'w', width: 1.2 },
      ],
    },
  };

  const SIZES = { s: { label: 'Pequena', px: 20 }, m: { label: 'Média', px: 26 }, l: { label: 'Grande', px: 34 } };

  // Enfeites: desenhos num quadrado 24×24 apoiados em cima da ponta (currentColor: a cor da pessoa).
  const DECOS = {
    none: { label: 'Nenhum', svg: '' },
    crown: { label: 'Coroa', svg: '<path d="M3 17 5 7l4.5 4L12 4l2.5 7L19 7l2 10z" fill="#ffd23f" stroke="#a87b0c" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="13.6" r="1.5" fill="#ff4d5e"/><rect x="3" y="16.8" width="18" height="3.2" rx="1" fill="#ffc53d" stroke="#a87b0c" stroke-width="1"/>' },
    tophat: { label: 'Cartola', svg: '<rect x="6.5" y="3.5" width="11" height="13" rx="1.5" fill="#1d1f2b" stroke="#fff" stroke-width="1"/><rect x="6.5" y="12.2" width="11" height="2.6" fill="currentColor"/><ellipse cx="12" cy="17.6" rx="9" ry="2.6" fill="#1d1f2b" stroke="#fff" stroke-width="1"/>' },
    party: { label: 'Chapéu de festa', svg: '<path d="M12 3 19 20H5z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><path d="M9.6 10.2l5 1.8M7.9 14.6l8.2 2.9" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/><circle cx="12" cy="3.2" r="2.3" fill="#ffd23f" stroke="#fff" stroke-width="1"/>' },
    halo: { label: 'Auréola', svg: '<ellipse cx="12" cy="13" rx="9" ry="3.6" fill="none" stroke="#ffe27a" stroke-width="2.8"/><ellipse cx="12" cy="13" rx="9" ry="3.6" fill="none" stroke="#fffbe0" stroke-width="1"/>' },
    horns: { label: 'Chifrinhos', svg: '<path d="M4.5 20c-1.6-5.2 0-10.5 4.2-13.6-1 4.2 0 8.4 3.1 10.5z" fill="#e8394d" stroke="#fff" stroke-width="1"/><path d="M19.5 20c1.6-5.2 0-10.5-4.2-13.6 1 4.2 0 8.4-3.1 10.5z" fill="#e8394d" stroke="#fff" stroke-width="1"/>' },
    catears: { label: 'Orelhas de gato', svg: '<path d="M3 20 5 4l7 8.4z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><path d="M21 20 19 4l-7 8.4z" fill="currentColor" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.7 16.3 6.6 8.4l3.4 4.1zM18.3 16.3l-.9-7.9-3.4 4.1z" fill="#ff9fc6"/>' },
    bow: { label: 'Lacinho', svg: '<path d="M12 13 4 8v10zM12 13l8-5v10z" fill="#ff5fa2" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="13" r="2.4" fill="#ff8cc0" stroke="#fff" stroke-width="1"/>' },
    flower: { label: 'Florzinha', svg: '<g fill="#ffb3d1" stroke="#fff" stroke-width="1"><circle cx="12" cy="7.4" r="3.6"/><circle cx="17.1" cy="11.1" r="3.6"/><circle cx="15.2" cy="17.1" r="3.6"/><circle cx="8.8" cy="17.1" r="3.6"/><circle cx="6.9" cy="11.1" r="3.6"/></g><circle cx="12" cy="12.8" r="3" fill="#ffd23f" stroke="#fff" stroke-width="1"/>' },
    antenna: { label: 'Anteninhas', svg: '<path d="M8.5 21 6 8.5M15.5 21 18 8.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M8.5 21 6 8.5M15.5 21 18 8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6" cy="6.6" r="2.8" fill="#7dff8a" stroke="#fff" stroke-width="1"/><circle cx="18" cy="6.6" r="2.8" fill="#7dff8a" stroke="#fff" stroke-width="1"/>' },
  };

  const AURAS = { none: 'Nenhum', glow: 'Brilho', rainbow: 'Arco-íris', pulse: 'Pulsando' };
  const TRAILS = { none: 'Nenhum', sparkles: 'Brilhinhos', dots: 'Bolinhas', rainbow: 'Arco-íris', hearts: 'Corações', bubbles: 'Bolhas', fire: 'Fogo' };
  const CLICKS = { mouse: 'Mini mouse', ripple: 'Ondinha', stars: 'Estrelinhas', confetti: 'Confete', pop: 'Quadrinhos', none: 'Nenhuma' };
  const PINGS = { classic: 'Clássico', target: 'Alvo', alert: 'Alerta', arrow: 'Seta caindo', pulse: 'Pulso', emoji: 'Emoji' };
  const EMOJIS = { eyes: '👀', target: '🎯', fire: '🔥', star: '⭐', boom: '💥', heart: '❤️', laugh: '😂', point: '👉', party: '🎉', skull: '💀' };
  const PING_SOUNDS = { classic: 'Clássico', pop: 'Pop', bell: 'Sininho', boing: 'Boing', whistle: 'Apito', none: 'Sem som' };
  const BRUSHES = { normal: 'Normal', neon: 'Neon', dashed: 'Tracejado', chalk: 'Giz', marker: 'Marca-texto', rainbow: 'Arco-íris', fade: 'Rastro que some' };
  const WIDTHS = { s: { label: 'Fina', k: 0.6 }, m: { label: 'Média', k: 1 }, l: { label: 'Grossa', k: 1.8 } };

  const DEFAULTS = Object.freeze({
    skin: 'classic', size: 'm', deco: 'none', aura: 'none', trail: 'none', name: false,
    click: 'mouse', ping: 'classic', emoji: 'eyes', pingSound: 'classic', brush: 'normal', width: 'm',
  });
  const CHOICES = {
    skin: SKINS, size: SIZES, deco: DECOS, aura: AURAS, trail: TRAILS, click: CLICKS,
    ping: PINGS, emoji: EMOJIS, pingSound: PING_SOUNDS, brush: BRUSHES, width: WIDTHS,
  };

  // Pacotes prontos: tudo combinando, de uma vez.
  const PACKS = {
    classic: { label: 'Clássico', style: {} },
    neon: { label: 'Neon', style: { skin: 'os', aura: 'glow', trail: 'dots', click: 'ripple', ping: 'target', pingSound: 'pop', brush: 'neon' } },
    cute: { label: 'Fofura', style: { skin: 'round', deco: 'catears', trail: 'hearts', click: 'stars', ping: 'emoji', emoji: 'heart', pingSound: 'bell', brush: 'marker' } },
    royal: { label: 'Realeza', style: { deco: 'crown', aura: 'glow', trail: 'sparkles', click: 'confetti', ping: 'alert', pingSound: 'bell', brush: 'rainbow' } },
    retro: { label: 'Retrô', style: { skin: 'pixel', size: 'l', trail: 'dots', click: 'pop', ping: 'arrow', pingSound: 'boing', brush: 'dashed', width: 'l' } },
    party: { label: 'Festa', style: { skin: 'wand', deco: 'party', aura: 'rainbow', trail: 'rainbow', click: 'confetti', ping: 'emoji', emoji: 'party', pingSound: 'whistle', brush: 'rainbow' } },
    adventure: { label: 'Aventura', style: { skin: 'sword', deco: 'tophat', trail: 'fire', click: 'pop', ping: 'pulse', pingSound: 'boing', brush: 'chalk' } },
    angel: { label: 'Anjinho', style: { skin: 'round', deco: 'halo', aura: 'glow', trail: 'bubbles', click: 'ripple', ping: 'pulse', pingSound: 'bell', brush: 'fade' } },
    devil: { label: 'Diabinho', style: { deco: 'horns', aura: 'pulse', trail: 'fire', click: 'stars', ping: 'emoji', emoji: 'skull', pingSound: 'pop', brush: 'neon' } },
    alien: { label: 'Alienígena', style: { skin: 'hand', deco: 'antenna', aura: 'glow', trail: 'bubbles', click: 'ripple', ping: 'target', pingSound: 'whistle', brush: 'fade', name: true } },
  };

  // Qualquer coisa que chegar (do servidor, do armazenamento) vira um estilo válido.
  function normalize(raw) {
    const style = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return style;
    for (const [key, options] of Object.entries(CHOICES)) {
      const value = raw[key];
      if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(options, value)) style[key] = value;
    }
    if (typeof raw.name === 'boolean') style.name = raw.name;
    return style;
  }

  const isDefault = (style) => Object.keys(DEFAULTS).every((key) => style[key] === DEFAULTS[key]);

  // ---------- setinha ----------

  const paint = (value) => (value === 'c' ? 'currentColor' : value === 'w' ? '#ffffff' : value || 'none');

  // Atributos de desenho (não "style" no HTML): as páginas do app têm CSP que bloqueia
  // style escrito no HTML.
  function skinMarkup(id, extraClass = '') {
    const skin = SKINS[id] || SKINS.classic;
    const paths = skin.layers.map((layer) => `<path d="${layer.d}" fill="${paint(layer.fill)}" stroke="${layer.stroke ? paint(layer.stroke) : 'none'}" stroke-width="${layer.width || 0}" stroke-linejoin="round" stroke-linecap="round"${layer.crisp ? ' shape-rendering="crispEdges"' : ''}/>`);
    return `<svg class="wfx-arrow${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${paths.join('')}</svg>`;
  }

  function decoMarkup(id) {
    const deco = DECOS[id];
    return deco && deco.svg ? `<svg viewBox="0 0 24 24" aria-hidden="true">${deco.svg}</svg>` : '';
  }

  function fromMarkup(markup) {
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    return holder.firstElementChild;
  }

  // Aplica o estilo num mouse já montado (um elemento sem tamanho, na ponta do mouse,
  // com a bolinha .cursor-badge dentro). arrow: false quando a setinha é o cursor do
  // sistema (o seu próprio mouse) e aqui só vão a bolinha, o enfeite e o nome. scale:
  // a camada do app, na tela de verdade, desenha um pouco menor.
  function applyCursor(node, rawStyle, { arrow = true, name = '', scale = 1 } = {}) {
    const style = normalize(rawStyle);
    const skin = SKINS[style.skin];
    const size = SIZES[style.size].px * scale;
    const k = size / 24;
    node.classList.add('wfx-cursor');
    for (const cls of [...node.classList]) {
      if (/^wfx-(aura|skin|size)-/.test(cls)) node.classList.remove(cls);
    }
    node.classList.add(`wfx-aura-${style.aura}`, `wfx-skin-${style.skin}`, `wfx-size-${style.size}`);
    // A setinha (troca a original, se tiver).
    for (const old of node.querySelectorAll(':scope > svg:not(.wfx-arrow)')) old.remove();
    let svg = node.querySelector(':scope > svg.wfx-arrow');
    if (!arrow) {
      if (svg) svg.remove();
    } else {
      if (!svg || svg.dataset.skin !== style.skin) {
        if (svg) svg.remove();
        svg = fromMarkup(skinMarkup(style.skin));
        svg.dataset.skin = style.skin;
        node.prepend(svg);
      }
      svg.style.width = `${size}px`;
      svg.style.height = `${size}px`;
      svg.style.left = `${-skin.hot[0] * k}px`;
      svg.style.top = `${-skin.hot[1] * k}px`;
      svg.style.transformOrigin = `${skin.hot[0] * k}px ${skin.hot[1] * k}px`;
    }
    // A bolinha com a foto: no lugar certo pra cada setinha.
    const badge = node.querySelector(':scope > .cursor-badge');
    const bx = skin.badge[0] * k;
    const by = skin.badge[1] * k;
    if (badge) {
      badge.style.left = `${bx}px`;
      badge.style.top = `${by}px`;
    }
    // Enfeite.
    let deco = node.querySelector(':scope > .wfx-deco');
    if (style.deco === 'none') {
      if (deco) deco.remove();
    } else {
      if (!deco || deco.dataset.deco !== style.deco) {
        if (deco) deco.remove();
        deco = document.createElement('span');
        deco.className = `wfx-deco wfx-deco-${style.deco}`;
        deco.dataset.deco = style.deco;
        deco.innerHTML = decoMarkup(style.deco);
        node.append(deco);
      }
      const dsize = size * 0.8;
      deco.style.width = `${dsize}px`;
      deco.style.height = `${dsize}px`;
      deco.style.left = `${skin.deco[0] * k - dsize / 2}px`;
      deco.style.top = `${skin.deco[1] * k - dsize}px`;
    }
    // Nome junto.
    let label = node.querySelector(':scope > .wfx-name');
    if (!style.name || !name) {
      if (label) label.remove();
    } else {
      if (!label) {
        label = document.createElement('span');
        label.className = 'wfx-name';
        node.append(label);
      }
      label.textContent = name;
      label.style.left = `${bx + (badge ? badge.offsetWidth || 22 : 0) + 4}px`;
      label.style.top = `${by + 3}px`;
    }
    return style;
  }

  // A setinha como imagem (o cursor de verdade do sistema, pro seu próprio mouse). Devolve
  // a imagem (data URL), o tamanho e a ponta, em pixels CSS.
  function cursorImage(rawStyle, color, scale = 1) {
    const style = normalize(rawStyle);
    const skin = SKINS[style.skin];
    const size = SIZES[style.size].px;
    const k = size / 24;
    const pad = 4;
    const box = Math.ceil(size + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(box * scale);
    canvas.height = Math.round(box * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(pad, pad);
    ctx.scale(k, k);
    skin.layers.forEach((layer, i) => {
      const path = new Path2D(layer.d);
      ctx.save();
      if (i === 0) {
        // Sombra (e o brilho na cor, se escolheu): não seguem a escala do desenho.
        ctx.shadowColor = style.aura === 'glow' ? color : 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = (style.aura === 'glow' ? 6 : 4) * scale;
        ctx.shadowOffsetY = style.aura === 'glow' ? 0 : 2 * scale;
      }
      const fill = layer.fill === 'c' ? color : layer.fill === 'w' ? '#ffffff' : layer.fill;
      if (fill && fill !== 'none') {
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      if (layer.stroke) {
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = layer.width || 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = layer.stroke === 'c' ? color : layer.stroke === 'w' ? '#ffffff' : layer.stroke;
        ctx.stroke(path);
      }
      ctx.restore();
    });
    return { url: canvas.toDataURL('image/png'), box, hotX: Math.round(pad + skin.hot[0] * k), hotY: Math.round(pad + skin.hot[1] * k) };
  }

  // ---------- rastro ----------

  const RAINBOW = (n) => `hsl(${(n * 37) % 360} 95% 62%)`;
  const alive = new WeakMap(); // camada -> quantas partículas vivas

  // state: um objeto por mouse (guarda a posição anterior). x, y: números na unidade unit
  // ('px' ou '%'), em relação à camada.
  function trail(layer, state, x, y, rawStyle, color, unit = 'px') {
    const style = normalize(rawStyle);
    if (style.trail === 'none' || !layer) return;
    const now = performance.now();
    const last = state.trailAt || 0;
    const from = state.trailPos;
    state.trailPos = [x, y];
    if (now - last < 34) return;
    state.trailAt = now;
    state.trailN = (state.trailN || 0) + 1;
    // Mexeu muito desde a última: uma partícula no meio do caminho também.
    const points = from && Math.hypot(x - from[0], y - from[1]) > (unit === '%' ? 2 : 24) ? [[(x + from[0]) / 2, (y + from[1]) / 2], [x, y]] : [[x, y]];
    for (const [px, py] of points) {
      const count = alive.get(layer) || 0;
      if (count > 70) return;
      alive.set(layer, count + 1);
      const p = document.createElement('span');
      p.className = `wfx-p wfx-p-${style.trail}`;
      p.style.left = `${px}${unit}`;
      p.style.top = `${py}${unit}`;
      p.style.setProperty('--c', style.trail === 'rainbow' ? RAINBOW(state.trailN) : color);
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 18}px`);
      p.style.setProperty('--dy', `${(Math.random() - 0.5) * 18}px`);
      p.style.setProperty('--s', String(0.7 + Math.random() * 0.6));
      p.style.setProperty('--r', `${Math.round(Math.random() * 120 - 60)}deg`);
      if (style.trail === 'hearts') p.textContent = '♥';
      else if (style.trail === 'sparkles') p.textContent = '✦';
      p.addEventListener('animationend', () => {
        p.remove();
        alive.set(layer, Math.max(0, (alive.get(layer) || 1) - 1));
      }, { once: true });
      layer.append(p);
    }
  }

  // ---------- clique e rolagem ----------

  const POP_WORDS = { left: 'CLICK!', right: 'CLACK!', middle: 'TOC!', up: 'VUSH ▲', down: 'VUSH ▼' };

  // A animação do clique no mouse da pessoa (node: o elemento do mouse). kind: left,
  // middle, right, up, down. Devolve false pro estilo "mini mouse" (cada página desenha o
  // dela, que já existia).
  // "Mini mouse": qual botão foi apertado (ou pra onde a rodinha girou).
  const MINI_MOUSE = '<svg class="click-mouse" viewBox="0 -6 14 34" aria-hidden="true"><rect class="m-body" x="1" y="1" width="12" height="20" rx="6"/><path class="m-part m-left" d="M7 1.6V8H1.6V7A5.4 5.4 0 0 1 7 1.6z"/><path class="m-part m-right" d="M7 1.6V8h5.4V7A5.4 5.4 0 0 0 7 1.6z"/><path class="m-line" d="M7 1v7M1 8h12"/><rect class="m-part m-wheel" x="5.8" y="3" width="2.4" height="4" rx="1.2"/><path class="m-arrow m-up" d="M4 -1.5 7 -4.5 10 -1.5"/><path class="m-arrow m-down" d="M4 23.5 7 26.5 10 23.5"/></svg>';
  // Cada clique (ou giro da rodinha) vira uma marquinha própria, parada no lugar onde
  // aconteceu: não segue o mouse e não apaga as anteriores (os confetes de antes terminam
  // de cair). layer: o elemento posicionado onde ela entra; left/top: CSS com a unidade.
  // opts.scale: menor/maior (a camada na tela de quem transmite usa um pouco menor).
  const CLICK_KINDS = ['left', 'middle', 'right', 'up', 'down'];
  const MAX_CLICKS = 24; // por camada, ao mesmo tempo
  function click(layer, left, top, kind, rawStyle, color, opts = {}) {
    if (!layer || !CLICK_KINDS.includes(kind)) return false;
    const style = normalize(rawStyle);
    if (style.click === 'none') return true;
    const alive = layer.querySelectorAll(':scope > .wfx-click');
    for (let i = 0; i <= alive.length - MAX_CLICKS; i += 1) alive[i].remove();
    const mark = document.createElement('span');
    mark.className = `wfx-click wfx-click-${style.click} wfx-k-${kind}`;
    mark.style.left = left;
    mark.style.top = top;
    mark.style.setProperty('--c', color);
    if (opts.scale && opts.scale !== 1) mark.style.scale = String(opts.scale);
    const scroll = kind === 'up' || kind === 'down';
    if (style.click === 'mouse') {
      mark.innerHTML = MINI_MOUSE;
      if (!scroll) mark.prepend(part('wfx-mm-ring'));
    } else if (style.click === 'ripple') {
      if (scroll) mark.append(part('wfx-chevron', kind === 'up' ? '▲' : '▼'));
      else if (kind === 'middle') mark.append(part('wfx-dot'));
      else {
        mark.append(part('wfx-ring'));
        if (kind === 'right') mark.append(part('wfx-ring wfx-ring-2'));
      }
    } else if (style.click === 'stars' || style.click === 'confetti') {
      const n = style.click === 'stars' ? 6 : 10;
      for (let i = 0; i < n; i += 1) {
        const angle = scroll ? (kind === 'up' ? -90 : 90) + (i - (n - 1) / 2) * 14 : (360 / n) * i + Math.random() * 20;
        const piece = part(style.click === 'stars' ? 'wfx-star' : 'wfx-bit', style.click === 'stars' ? '✦' : '');
        piece.style.setProperty('--a', `${angle}deg`);
        piece.style.setProperty('--d', `${(scroll ? 26 : 22) + Math.random() * 12}px`);
        if (style.click === 'confetti') piece.style.setProperty('--c', RAINBOW(i * 3 + Math.floor(Math.random() * 9)));
        else if (kind === 'right' && i % 2) piece.style.setProperty('--c', '#ffffff');
        mark.append(piece);
      }
    } else if (style.click === 'pop') {
      mark.append(part('wfx-bubble', POP_WORDS[kind] || 'CLICK!'));
    }
    mark.addEventListener('animationend', (e) => { if (e.target === mark) mark.remove(); });
    layer.append(mark);
    return true;
  }

  function part(className, text) {
    const span = document.createElement('span');
    span.className = className;
    if (text) span.textContent = text;
    return span;
  }

  // ---------- ping (Alt + clique) ----------

  // Desenha o ping no lugar (left/top: valores CSS já com a unidade). Devolve null pro
  // estilo clássico (cada página desenha o dela).
  function ping(layer, left, top, rawStyle, color, name, flip = false) {
    const style = normalize(rawStyle);
    if (style.ping === 'classic' || !layer) return null;
    const mark = document.createElement('div');
    mark.className = `wfx-ping wfx-ping-${style.ping}`;
    mark.classList.toggle('flip', Boolean(flip));
    mark.style.left = left;
    mark.style.top = top;
    mark.style.setProperty('--c', color);
    if (style.ping === 'target') {
      mark.append(part('wfx-tg wfx-tg-1'), part('wfx-tg wfx-tg-2'), part('wfx-tg-cross'), part('wfx-tg-dot'));
    } else if (style.ping === 'alert') {
      mark.append(part('wfx-ring-static'), part('wfx-alert', '!'));
    } else if (style.ping === 'arrow') {
      const arrow = part('wfx-drop');
      arrow.innerHTML = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M8 2h8v13h6L12 28 2 15h6z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      mark.append(part('wfx-ring-static'), arrow);
    } else if (style.ping === 'pulse') {
      mark.append(part('wfx-wave'), part('wfx-wave wfx-wave-2'), part('wfx-wave wfx-wave-3'), part('wfx-tg-dot'));
    } else if (style.ping === 'emoji') {
      mark.append(part('wfx-ring-static'), part('wfx-emoji', EMOJIS[style.emoji] || EMOJIS.eyes));
    }
    if (name) mark.append(part('wfx-ping-name', name));
    mark.addEventListener('animationend', (e) => { if (e.target === mark) mark.remove(); });
    layer.append(mark);
    return mark;
  }

  // ---------- sons do ping (Web Audio, sem arquivos) ----------

  // [frequência, início (s), duração (s), opções]
  const TONES = {
    classic: [[1046.5, 0, 0.16, { slideTo: 1567.98, gain: 0.05 }]],
    pop: [[420, 0, 0.07, { slideTo: 1100, gain: 0.09, type: 'triangle' }], [1300, 0.05, 0.05, { gain: 0.04 }]],
    bell: [[1567.98, 0, 0.5, { gain: 0.05 }], [2349.32, 0, 0.35, { gain: 0.025 }], [1318.51, 0.09, 0.45, { gain: 0.035 }]],
    boing: [[180, 0, 0.32, { slideTo: 620, type: 'triangle', gain: 0.09 }], [620, 0.3, 0.12, { slideTo: 380, type: 'triangle', gain: 0.05 }]],
    whistle: [[1200, 0, 0.14, { slideTo: 2400, gain: 0.05 }], [2400, 0.15, 0.18, { slideTo: 1500, gain: 0.05 }]],
    none: [],
  };
  let audio = null;
  function playPing(id) {
    const tones = TONES[id] || TONES.classic;
    if (!tones.length) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      if (!audio) audio = new AudioCtx();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      const t0 = audio.currentTime + 0.01;
      for (const [freq, start, dur, opts = {}] of tones) {
        const osc = audio.createOscillator();
        const amp = audio.createGain();
        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(freq, t0 + start);
        if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + start + dur);
        amp.gain.setValueAtTime(0.0001, t0 + start);
        amp.gain.exponentialRampToValueAtTime(opts.gain || 0.06, t0 + start + 0.012);
        amp.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(amp).connect(audio.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.02);
      }
    } catch {}
  }

  // ---------- pincel (Alt + arrastar) ----------

  let gradientCount = 0;
  const lighten = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return '#ffffff';
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `#${v.map((c) => Math.round(c + (255 - c) * 0.55).toString(16).padStart(2, '0')).join('')}`;
  };

  // "Rastro que some": o traço vai apagando do mais velho pro mais novo. São só alguns
  // traços fixos (um por faixa de idade, cada um mais transparente) redesenhados no máximo
  // uma vez por quadro, sem animação por pedaço e sem o desfoque da sombra: com um
  // elemento animado novo a cada mexida, o navegador redesenhava a imagem inteira com
  // desfoque a cada quadro e criava/destruía camadas sem parar (o app piscava em preto).
  const FADE_LIFE = 900;
  const FADE_LEVELS = 5;
  function fadeTrail(svg, path, pathFor) {
    svg.style.filter = 'none';
    path.setAttribute('d', '');
    const make = () => {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(p);
      return p;
    };
    const unders = [];
    const tops = [];
    for (let i = 0; i < FADE_LEVELS; i += 1) {
      const p = make();
      p.setAttribute('class', 'wfx-fade-under');
      p.setAttribute('stroke-opacity', String(0.45 * (1 - i / FADE_LEVELS)));
      p.style.stroke = '#000';
      if (i) p.style.strokeLinecap = 'butt'; // emendas retas: pontas redondas sobrepostas viram bolinhas
      unders.push(p);
    }
    for (let i = 0; i < FADE_LEVELS; i += 1) {
      const p = make();
      p.setAttribute('class', 'wfx-fade-lvl');
      p.setAttribute('stroke-opacity', String(1 - i / FADE_LEVELS));
      if (i) p.style.strokeLinecap = 'butt';
      tops.push(p);
    }
    const pts = []; // só os pontos ainda vivos
    const times = [];
    let seen = 0;
    let lastAt = 0;
    let raf = 0;
    let painted = 0;
    let widthSet = false;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    function render(t) {
      let cut = 0;
      while (cut < times.length && t - times[cut] > FADE_LIFE) cut += 1;
      if (cut) {
        times.splice(0, cut);
        pts.splice(0, cut * 2);
      }
      if (!widthSet && svg.isConnected) {
        // A sombra é um traço preto um pouco mais grosso por baixo (barato, sem desfoque).
        const w = parseFloat(getComputedStyle(tops[0]).strokeWidth) || 4;
        for (const p of unders) p.style.strokeWidth = `${w + 3}px`;
        widthSet = true;
      }
      let end = times.length;
      for (let i = 0; i < FADE_LEVELS; i += 1) {
        const oldest = t - ((i + 1) * FADE_LIFE) / FADE_LEVELS;
        let start = end;
        while (start > 0 && times[start - 1] >= oldest) start -= 1;
        if (i === FADE_LEVELS - 1) start = 0;
        // Cada faixa vai até o primeiro ponto da faixa mais nova: os pedaços se emendam.
        const stop = Math.min(times.length, end + 1);
        const d = stop - start >= 2 ? pathFor(pts.slice(start * 2, stop * 2)) : '';
        tops[i].setAttribute('d', d);
        unders[i].setAttribute('d', d);
        end = start;
      }
      return times.length > 0;
    }
    function tick() {
      raf = 0;
      if (!svg.isConnected && painted) return; // o traço já saiu da tela
      const t = now();
      if (t - painted >= 15) {
        painted = t;
        if (!render(t)) return;
      }
      raf = requestAnimationFrame(tick);
    }
    return {
      update(points) {
        const n = Math.floor(points.length / 2);
        if (n <= seen) return;
        const t = now();
        // Pontos que chegam juntos (de outra pessoa, em lotes) ganham horários espalhados
        // desde o lote anterior: o rastro some liso, não aos degraus.
        const from = lastAt && t - lastAt < 250 ? lastAt : t;
        const k = n - seen;
        for (let j = 0; j < k; j += 1) times.push(from + ((t - from) * (j + 1)) / k);
        pts.push(...points.slice(seen * 2, n * 2));
        seen = n;
        lastAt = t;
        if (!raf) raf = requestAnimationFrame(tick);
      },
    };
  }

  // Prepara o traço (svg com viewBox 0..1 e o path dentro) no estilo do pincel de quem
  // desenha. Devolve { update(points) }: chame a cada pontos novos (pathFor monta o "d").
  function brush(svg, path, rawStyle, color, pathFor) {
    const style = normalize(rawStyle);
    const kind = style.brush;
    svg.classList.add('wfx-brush', `wfx-brush-${kind}`);
    svg.style.setProperty('--bw', String(WIDTHS[style.width].k * (kind === 'marker' ? 3 : kind === 'chalk' ? 1.3 : 1)));
    if (kind === 'neon') {
      path.style.stroke = lighten(color);
      svg.style.filter = `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 8px ${color})`;
    } else if (kind === 'dashed') {
      path.style.strokeDasharray = '10 9';
    } else if (kind === 'chalk') {
      path.style.strokeDasharray = '0.5 5';
      path.style.opacity = '0.9';
    } else if (kind === 'marker') {
      path.style.opacity = '0.45';
      path.style.strokeLinecap = 'butt';
      svg.style.filter = 'none';
    }
    let gradient = null;
    if (kind === 'rainbow') {
      gradientCount += 1;
      const id = `wfx-rainbow-${gradientCount}-${Math.random().toString(36).slice(2, 7)}`;
      const defs = document.createElementNS(SVG_NS, 'defs');
      gradient = document.createElementNS(SVG_NS, 'linearGradient');
      gradient.setAttribute('id', id);
      gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
      for (let i = 0; i <= 6; i += 1) {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', String(i / 6));
        stop.setAttribute('stop-color', `hsl(${i * 60} 95% 62%)`);
        gradient.append(stop);
      }
      defs.append(gradient);
      svg.prepend(defs);
      path.style.stroke = `url(#${id})`;
    }
    const trail = kind === 'fade' ? fadeTrail(svg, path, pathFor) : null;
    return {
      update(points) {
        if (trail) {
          trail.update(points);
          return;
        }
        path.setAttribute('d', pathFor(points));
        if (gradient) {
          let x1 = 1;
          let y1 = 1;
          let x2 = 0;
          let y2 = 0;
          for (let i = 0; i + 1 < points.length; i += 2) {
            x1 = Math.min(x1, points[i]);
            x2 = Math.max(x2, points[i]);
            y1 = Math.min(y1, points[i + 1]);
            y2 = Math.max(y2, points[i + 1]);
          }
          if (x2 - x1 < 0.02 && y2 - y1 < 0.02) x2 = x1 + 0.02;
          gradient.setAttribute('x1', String(x1));
          gradient.setAttribute('y1', String(y1));
          gradient.setAttribute('x2', String(x2));
          gradient.setAttribute('y2', String(y2));
        }
      },
    };
  }

  // ---------- editor (perfil da sala e Configurações do app) ----------

  // opts: get() -> estilo atual; look() -> { color, ink, letter, photo, name };
  // change(estilo) -> salvar. Devolve { refresh() } pra quando a cor/foto/estilo mudar fora.
  function editor(container, opts) {
    container.classList.add('wfx-ed');
    container.innerHTML = '';
    const el = (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      return node;
    };

    // Prévia: um "pedaço de tela" pra testar tudo.
    const preview = el('div', 'wfx-ed-preview');
    preview.tabIndex = 0;
    const hint = el('div', 'wfx-ed-hint', 'Mexa o mouse aqui · clique · Alt + clique: ping · arraste: pincel · rodinha');
    const board = document.createElementNS(SVG_NS, 'svg');
    board.setAttribute('class', 'wfx-ed-board');
    board.setAttribute('viewBox', '0 0 1 1');
    board.setAttribute('preserveAspectRatio', 'none');
    const fake = el('div', 'mouse-cursor wfx-ed-cursor');
    const fakeBadge = el('span', 'cursor-badge');
    fake.append(fakeBadge);
    fake.hidden = true;
    preview.append(hint, board, fake);
    container.append(preview);

    const sections = el('div', 'wfx-ed-sections');
    container.append(sections);

    const current = () => normalize(opts.get());
    const look = () => opts.look() || {};
    const set = (patch) => {
      const next = normalize({ ...current(), ...patch });
      opts.change(next);
      render();
      return next;
    };

    // Pacotes.
    const packs = el('div', 'wfx-ed-row');
    packs.append(el('div', 'wfx-ed-label', 'Pacotes prontos'));
    const packList = el('div', 'wfx-ed-chips');
    for (const [id, pack] of Object.entries(PACKS)) {
      const btn = el('button', 'wfx-ed-chip wfx-ed-pack', pack.label);
      btn.type = 'button';
      btn.dataset.pack = id;
      btn.addEventListener('click', () => {
        set({ ...DEFAULTS, ...pack.style });
        demo('all');
      });
      packList.append(btn);
    }
    packs.append(packList);
    sections.append(packs);

    const groups = [];
    function group(label, key, entries, { icon, onPick, wide } = {}) {
      const row = el('div', 'wfx-ed-row');
      row.append(el('div', 'wfx-ed-label', label));
      const list = el('div', `wfx-ed-chips${wide ? ' wfx-ed-wide' : ''}`);
      for (const [id, text] of entries) {
        const btn = el('button', 'wfx-ed-chip');
        btn.type = 'button';
        btn.dataset.key = key;
        btn.dataset.value = id;
        btn.title = text;
        if (icon) {
          const i = icon(id);
          if (i) btn.append(i);
        }
        btn.append(el('span', 'wfx-ed-text', text));
        btn.addEventListener('click', () => {
          set({ [key]: id });
          if (onPick) onPick(id);
        });
        list.append(btn);
      }
      row.append(list);
      sections.append(row);
      groups.push({ key, row, list });
      return row;
    }
    const swatch = (markup) => {
      const span = el('span', 'wfx-ed-icon');
      span.innerHTML = markup;
      return span;
    };

    group('Setinha', 'skin', Object.entries(SKINS).map(([id, s]) => [id, s.label]), { icon: (id) => swatch(skinMarkup(id)), onPick: () => demo('move') });
    group('Tamanho', 'size', Object.entries(SIZES).map(([id, s]) => [id, s.label]), { onPick: () => demo('move') });
    group('Enfeite', 'deco', Object.entries(DECOS).map(([id, d]) => [id, d.label]), { icon: (id) => (id === 'none' ? null : swatch(decoMarkup(id))), onPick: () => demo('move') });
    group('Efeito na setinha', 'aura', Object.entries(AURAS), { onPick: () => demo('move') });
    group('Rastro', 'trail', Object.entries(TRAILS), { icon: (id) => (id === 'none' ? null : el('span', `wfx-ed-icon wfx-ed-trail wfx-ed-trail-${id}`, id === 'hearts' ? '♥' : id === 'sparkles' ? '✦' : '')), onPick: () => demo('trail') });
    // Nome junto do mouse.
    const nameRow = el('div', 'wfx-ed-row');
    nameRow.append(el('div', 'wfx-ed-label', 'Nome junto'));
    const nameLabel = el('label', 'wfx-ed-switch');
    const nameBox = el('input');
    nameBox.type = 'checkbox';
    nameBox.addEventListener('change', () => { set({ name: nameBox.checked }); demo('move'); });
    nameLabel.append(nameBox, el('span', null, 'Mostrar o seu nick do lado do mouse'));
    nameRow.append(nameLabel);
    sections.append(nameRow);
    group('Clique e rodinha', 'click', Object.entries(CLICKS), { onPick: () => demo('click') });
    group('Ping (Alt + clique)', 'ping', Object.entries(PINGS), { onPick: () => demo('ping') });
    const emojiRow = group('Emoji do ping', 'emoji', Object.entries(EMOJIS).map(([id, e]) => [id, e]), { onPick: () => demo('ping') });
    emojiRow.classList.add('wfx-ed-emojis');
    group('Som do ping', 'pingSound', Object.entries(PING_SOUNDS), { onPick: (id) => playPing(id) });
    group('Pincel (Alt + arrastar)', 'brush', Object.entries(BRUSHES), { onPick: () => demo('draw') });
    group('Espessura', 'width', Object.entries(WIDTHS).map(([id, w]) => [id, w.label]), { onPick: () => demo('draw') });

    function render() {
      const style = current();
      const { color = '#4d8dff', ink = '#fff', letter = '?', photo = null, name = '' } = look();
      container.style.setProperty('--c', color);
      for (const { key, list } of groups) {
        for (const btn of list.children) {
          const on = style[key] === btn.dataset.value;
          btn.classList.toggle('active', on);
          btn.setAttribute('aria-pressed', String(on));
        }
      }
      emojiRow.hidden = style.ping !== 'emoji';
      nameBox.checked = style.name;
      for (const btn of packList.children) {
        const pack = normalize({ ...DEFAULTS, ...PACKS[btn.dataset.pack].style });
        const on = Object.keys(DEFAULTS).every((key) => pack[key] === style[key]);
        btn.classList.toggle('active', on);
      }
      fake.style.setProperty('--c', color);
      fake.style.setProperty('--ink', ink);
      fakeBadge.textContent = photo ? '' : letter;
      fakeBadge.style.backgroundImage = photo ? `url("${photo}")` : '';
      fakeBadge.classList.toggle('has-photo', Boolean(photo));
      applyCursor(fake, style, { name });
    }

    // ---- a prévia funcionando de verdade
    const state = {};
    let stroke = null;
    let downAt = null;
    const local = (e) => {
      const r = preview.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top, r];
    };
    let fakeAt = [0, 0]; // onde a setinha de mentira está (o clique de teste sai ali)
    const place = (x, y) => {
      fakeAt = [x, y];
      fake.hidden = false;
      fake.style.transform = `translate(${x}px, ${y}px)`;
      trail(preview, state, x, y, current(), look().color || '#4d8dff', 'px');
    };
    const pathFor = (pts) => {
      const f = (n) => Math.round(n * 10000) / 10000;
      if (pts.length < 4) return `M${f(pts[0])} ${f(pts[1])}`;
      let d = `M${f(pts[0])} ${f(pts[1])}`;
      for (let i = 2; i + 3 < pts.length; i += 2) d += `Q${f(pts[i])} ${f(pts[i + 1])} ${f((pts[i] + pts[i + 2]) / 2)} ${f((pts[i + 1] + pts[i + 3]) / 2)}`;
      return `${d}L${f(pts[pts.length - 2])} ${f(pts[pts.length - 1])}`;
    };
    function startStroke() {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'wfx-ed-stroke');
      svg.setAttribute('viewBox', '0 0 1 1');
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
      preview.insertBefore(svg, fake);
      const view = { svg, points: [], brush: brush(svg, path, current(), look().color || '#4d8dff', pathFor) };
      return view;
    }
    function endStroke(view) {
      if (!view) return;
      view.svg.classList.add('wfx-ed-fading');
      view.svg.addEventListener('animationend', () => view.svg.remove(), { once: true });
    }
    preview.addEventListener('pointermove', (e) => {
      const [x, y, r] = local(e);
      place(x, y);
      if (downAt && !stroke && Math.hypot(x - downAt[0], y - downAt[1]) > 6) {
        stroke = startStroke();
        stroke.points.push(downAt[0] / r.width, downAt[1] / r.height);
      }
      if (stroke) {
        stroke.points.push(x / r.width, y / r.height);
        stroke.brush.update(stroke.points);
      }
    });
    preview.addEventListener('pointerleave', () => { fake.hidden = true; state.trailPos = null; });
    preview.addEventListener('contextmenu', (e) => e.preventDefault());
    preview.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      preview.focus();
      const [x, y] = local(e);
      place(x, y);
      if (e.altKey) {
        showPing(x, y);
        return;
      }
      if (e.button === 0) {
        preview.setPointerCapture(e.pointerId);
        downAt = [x, y];
      }
      showClick(e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left');
    });
    const release = () => {
      downAt = null;
      endStroke(stroke);
      stroke = null;
    };
    preview.addEventListener('pointerup', release);
    preview.addEventListener('pointercancel', release);
    preview.addEventListener('wheel', (e) => {
      e.preventDefault();
      showClick(e.deltaY < 0 ? 'up' : 'down');
    }, { passive: false });

    function showClick(kind) {
      const { color = '#4d8dff' } = look();
      click(preview, `${fakeAt[0]}px`, `${fakeAt[1]}px`, kind, current(), color);
    }
    function showPing(x, y) {
      const { color = '#4d8dff', name = '' } = look();
      const style = current();
      const r = preview.getBoundingClientRect();
      if (!ping(preview, `${x}px`, `${y}px`, style, color, name || 'Você', x > r.width * 0.7)) classicPing(preview, x, y, color, name || 'Você');
      playPing(style.pingSound);
    }

    // Demonstração automática ao escolher (pra ver na hora como fica).
    let demoTimer = null;
    function demo(what) {
      clearTimeout(demoTimer);
      const r = preview.getBoundingClientRect();
      if (!r.width) return;
      const cx = r.width * 0.42;
      const cy = r.height * 0.5;
      if (what === 'ping' || what === 'all') showPing(r.width * 0.62, cy);
      if (what === 'draw' || what === 'all') {
        const view = startStroke();
        let i = 0;
        const step = () => {
          const t = i / 24;
          view.points.push(0.12 + t * 0.5, 0.62 + Math.sin(t * Math.PI * 2.2) * 0.18);
          view.brush.update(view.points);
          i += 1;
          if (i <= 24) demoTimer = setTimeout(step, 22);
          else endStroke(view);
        };
        step();
      }
      if (what === 'move' || what === 'trail' || what === 'click' || what === 'all') {
        let i = 0;
        const step = () => {
          const t = i / 18;
          place(cx - 60 + t * 120, cy + Math.sin(t * Math.PI * 2) * 22);
          i += 1;
          if (i <= 18) demoTimer = setTimeout(step, 28);
          else if (what === 'click' || what === 'all') showClick('left');
        };
        step();
      }
    }

    render();
    return { refresh: render, demo };
  }

  // O ping clássico, só pra prévia do editor (as páginas têm o delas).
  function classicPing(layer, x, y, color, name) {
    const mark = document.createElement('div');
    mark.className = 'wfx-ping wfx-ping-classic';
    mark.style.left = `${x}px`;
    mark.style.top = `${y}px`;
    mark.style.setProperty('--c', color);
    mark.append(part('wfx-wave'), part('wfx-wave wfx-wave-2'), part('wfx-tg-dot'), part('wfx-ping-name', name));
    mark.addEventListener('animationend', (e) => { if (e.target === mark) mark.remove(); });
    layer.append(mark);
  }

  const api = {
    DEFAULTS, SKINS, SIZES, DECOS, AURAS, TRAILS, CLICKS, PINGS, EMOJIS, PING_SOUNDS, BRUSHES, WIDTHS, PACKS,
    normalize, isDefault, skinMarkup, decoMarkup, applyCursor, cursorImage, trail, click, ping, playPing, brush, editor,
  };
  if (typeof window !== 'undefined') window.WssFx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
