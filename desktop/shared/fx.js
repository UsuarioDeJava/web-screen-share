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
  // bolinha com a foto e deco: onde o enfeite se apoia (os dois em relação à ponta, na
  // mesma escala de 24).
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

  // Mais setinhas. rot: girar o desenho (graus, em volta do centro); hot já é a ponta girada.
  Object.assign(SKINS, {
    rocket: {
      label: 'Foguete', hot: [4.6, 4.6], badge: [13, 13], deco: [1, 1], rot: -45,
      layers: [
        { d: 'M9.4 17.4 12 22.6l2.6-5.2z', fill: '#ffb02e', stroke: '#ff5b24', width: 1 },
        { d: 'M8 12.6 4.6 16.4V19L8 17.2zM16 12.6l3.4 3.8V19L16 17.2z', fill: 'c', stroke: 'w', width: 1.2 },
        { d: 'M12 1.5c3.4 2.4 4.4 6.4 4 11.4v4.4H8v-4.4C7.6 7.9 8.6 3.9 12 1.5z', fill: 'w', stroke: 'c', width: 1.4 },
        { d: 'M12 7a2 2 0 1 0 0 4 2 2 0 1 0 0-4z', fill: 'c', stroke: 'w', width: 1 },
      ],
    },
    plane: {
      label: 'Aviãozinho', hot: [3, 3], badge: [14, 14], deco: [2, 1],
      layers: [
        { d: 'M3 3 21 10l-8.5 2.5L10 21z', fill: 'c', stroke: 'w', width: 1.5 },
        { d: 'M3 3l9.5 9.5L10 21z', fill: 'rgba(255,255,255,0.38)' },
        { d: 'M3 3l9.5 9.5', fill: 'none', stroke: 'w', width: 1 },
      ],
    },
    paw: {
      label: 'Patinha', hot: [12, 4.4], badge: [6, 13], deco: [0, 0],
      layers: [{
        d: 'M12 11.2c3 0 5.4 2.2 5.4 4.8 0 2.2-1.9 3.4-3.6 3.4-.8 0-1.2-.4-1.8-.4s-1 .4-1.8.4c-1.7 0-3.6-1.2-3.6-3.4 0-2.6 2.4-4.8 5.4-4.8zM4.6 9.6a2 2.4 0 1 0 4 0 2 2.4 0 1 0-4 0zM8 6.4a2.1 2.5 0 1 0 4.2 0 2.1 2.5 0 1 0-4.2 0zM11.8 6.4a2.1 2.5 0 1 0 4.2 0 2.1 2.5 0 1 0-4.2 0zM15.4 9.6a2 2.4 0 1 0 4 0 2 2.4 0 1 0-4 0z',
        fill: 'c', stroke: 'w', width: 1.3,
      }],
    },
    ghost: {
      label: 'Fantasminha', hot: [12, 3], badge: [7, 15], deco: [0, 0.5],
      layers: [
        { d: 'M12 3c-4.6 0-7 3.6-7 8v9l2.4-2 2.4 2 2.2-2 2.2 2 2.4-2 2.4 2v-9c0-4.4-2.4-8-7-8z', fill: 'w', stroke: 'c', width: 1.6 },
        { d: 'M9.6 9.2a1.3 1.7 0 1 0 0 3.4 1.3 1.7 0 1 0 0-3.4zM14.4 9.2a1.3 1.7 0 1 0 0 3.4 1.3 1.7 0 1 0 0-3.4z', fill: '#1d1f2b' },
      ],
    },
    heart: {
      label: 'Coração', hot: [6.7, 6.7], badge: [12, 12], deco: [1, 0.5], rot: 135,
      layers: [{ d: 'M12 19.5s-7.5-5-7.5-9.9c0-2.4 1.9-4.1 4-4.1 1.6 0 2.8.9 3.5 2.1.7-1.2 1.9-2.1 3.5-2.1 2.1 0 4 1.7 4 4.1 0 4.9-7.5 9.9-7.5 9.9z', fill: 'c', stroke: 'w', width: 1.6 }],
    },
    star: {
      label: 'Estrela', hot: [12, 2], badge: [8, 15], deco: [0, 0.5],
      layers: [{ d: 'M12 2l2.47 6.6 7.04.31-5.52 4.39 1.89 6.79L12 16.2l-5.88 3.89 1.89-6.79-5.52-4.39 7.04-.31z', fill: 'c', stroke: 'w', width: 1.5 }],
    },
  });

  const SIZES = { s: { label: 'Pequena', px: 20 }, m: { label: 'Média', px: 26 }, l: { label: 'Grande', px: 34 }, xl: { label: 'Enorme', px: 44 } };

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

  Object.assign(DECOS, {
    wizard: { label: 'Chapéu de mago', svg: '<path d="M7 18.6 12.6 2.4c.2-.5.9-.5 1 0L17 18.6z" fill="#4b3bd6" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/><path d="M8.3 15.4h8" stroke="currentColor" stroke-width="2"/><path d="m12.3 8.4.5 1.1 1.2.1-.9.8.3 1.2-1.1-.7-1 .7.3-1.2-.9-.8 1.2-.1z" fill="#ffd23f"/><circle cx="14.6" cy="12.6" r=".8" fill="#ffd23f"/><ellipse cx="12" cy="19" rx="9.5" ry="2.4" fill="#4b3bd6" stroke="#fff" stroke-width="1"/>' },
    santa: { label: 'Gorro de Natal', svg: '<path d="M5 18 9.4 7c1-2.4 4.4-3.4 6.9-1.6L20.4 11l-2.6 1-2.6-3.1L18.6 18z" fill="#e3263b" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><circle cx="19.6" cy="12" r="2.4" fill="#fff" stroke="#d9dbe6" stroke-width=".8"/><rect x="3.4" y="16.6" width="16.8" height="3.8" rx="1.9" fill="#fff" stroke="#d9dbe6" stroke-width=".8"/>' },
    cap: { label: 'Boné', svg: '<path d="M5 16c0-5 3-8.4 7-8.4s7 3.4 7 8.4z" fill="currentColor" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 16h10c-.2 1.6-1.7 2.4-4 2.4h-6z" fill="currentColor" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 7.6V16M8.4 9 9.6 16M15.6 9l-1.2 7" stroke="#fff" stroke-width=".7" opacity=".6"/><circle cx="12" cy="7.4" r="1.2" fill="#fff"/>' },
    pirate: { label: 'Chapéu pirata', svg: '<path d="M2.4 14.2C5 7.6 8.6 7.4 12 9.4c3.4-2 7-1.8 9.6 4.8-6.2 3.8-13 3.8-19.2 0z" fill="#1d1f2b" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/><circle cx="12" cy="12.4" r="2" fill="#fff"/><path d="M10 15.6l4-1.6M10 14l4 1.6" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="M4 13.8c5.2 2.6 10.8 2.6 16 0" fill="none" stroke="currentColor" stroke-width="1.2"/>' },
    viking: { label: 'Capacete viking', svg: '<path d="M6.4 12.6C4 11.6 2.6 9 3 5.2c1.2 2.8 3 4.4 5.2 5.2zM17.6 12.6c2.4-1 3.8-3.6 3.4-7.4-1.2 2.8-3 4.4-5.2 5.2z" fill="#f5e6c8" stroke="#fff" stroke-width=".9"/><path d="M6 18c0-5 2.6-8.4 6-8.4s6 3.4 6 8.4z" fill="#9aa3b5" stroke="#fff" stroke-width="1"/><path d="M5.6 17.6h12.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M12 9.8v7" stroke="#6b7385" stroke-width="1.4"/>' },
    bunny: { label: 'Orelhas de coelho', svg: '<path d="M8.6 20c-2.6-3-3.6-9.2-2.6-14.6.4-2.2 3-2.2 3.6 0 1.2 4.6 1.4 10.4 1 14.6zM15.4 20c2.6-3 3.6-9.2 2.6-14.6-.4-2.2-3-2.2-3.6 0-1.2 4.6-1.4 10.4-1 14.6z" fill="#fff" stroke="#d9dbe6" stroke-width="1"/><path d="M8.4 17.6C7 14.8 6.8 9.6 7.6 6.6c.5 3 1.2 7.4.8 11zM15.6 17.6c1.4-2.8 1.6-8 .8-11-.5 3-1.2 7.4-.8 11z" fill="#ff9fc6"/>' },
    propeller: { label: 'Boné de hélice', svg: '<path d="M6 18c0-4.6 2.6-7.4 6-7.4s6 2.8 6 7.4z" fill="currentColor" stroke="#fff" stroke-width="1" stroke-linejoin="round"/><path d="M9.6 11.2 9 18M14.4 11.2 15 18" stroke="#ffd23f" stroke-width="1.4"/><path d="M12 10.6V6.8" stroke="#fff" stroke-width="1.4"/><g class="wfx-blades"><ellipse cx="8.4" cy="6.2" rx="3.6" ry="1.3" fill="#ff4d5e" stroke="#fff" stroke-width=".8"/><ellipse cx="15.6" cy="6.2" rx="3.6" ry="1.3" fill="#3fa9ff" stroke="#fff" stroke-width=".8"/></g><circle cx="12" cy="6.2" r="1.3" fill="#ffd23f" stroke="#fff" stroke-width=".8"/>' },
  });

  const AURAS = { none: 'Nenhum', glow: 'Brilho', rainbow: 'Arco-íris', pulse: 'Pulsando', bounce: 'Pulinho', wiggle: 'Balançando', twinkle: 'Estrelinhas' };
  const TRAILS = { none: 'Nenhum', sparkles: 'Brilhinhos', rainbow: 'Arco-íris', hearts: 'Corações', bubbles: 'Bolhas', fire: 'Fogo', snow: 'Neve', notes: 'Notas musicais', smoke: 'Fumaça', pixels: 'Pixels' };
  const CLICKS = { mouse: 'Mini mouse', ripple: 'Ondinha', stars: 'Estrelinhas', hearts: 'Corações', confetti: 'Confete', rays: 'Raios', boom: 'Explosão', pop: 'Quadrinhos', none: 'Nenhuma' };
  const PINGS = { classic: 'Clássico', target: 'Alvo', alert: 'Alerta', arrow: 'Seta caindo', pin: 'Alfinete', flag: 'Bandeira', emoji: 'Emoji', image: 'Imagem própria' };
  const EMOJIS = {
    eyes: '👀', target: '🎯', fire: '🔥', star: '⭐', boom: '💥', heart: '❤️', laugh: '😂', point: '👉', party: '🎉', skull: '💀',
    question: '❓', check: '✅', cross: '❌', warning: '⚠️', money: '💰', ghost: '👻', cool: '😎', think: '🤔', rocket: '🚀', clap: '👏', gift: '🎁', tree: '🎄',
  };
  const PING_SOUNDS = { classic: 'Clássico', pop: 'Pop', bell: 'Sininho', boing: 'Boing', whistle: 'Apito', coin: 'Moedinha', laser: 'Laser', none: 'Sem som' };
  const BRUSHES = { normal: 'Normal', neon: 'Neon', outline: 'Contorno', dashed: 'Tracejado', chalk: 'Pontilhado', marker: 'Marca-texto', rainbow: 'Arco-íris', glitter: 'Purpurina', arrow: 'Flecha', fade: 'Rastro que some' };
  const WIDTHS = { s: { label: 'Fina', k: 0.6 }, m: { label: 'Média', k: 1 }, l: { label: 'Grossa', k: 1.8 } };
  // Contorno da setinha e da bolinha: branco, preto ou uma cor (rrggbb, sem #).
  const OUTLINES = { w: { label: 'Branco', hex: '#ffffff' }, k: { label: 'Preto', hex: '#15161d' } };
  const OUTLINE_COLORS = ['ffd23f', 'ff8a3d', 'ff4d5e', 'ff5fa2', 'b15cff', '7c5cff', '2fc2ff', '3ee07f'];
  const outlineHex = (value) => (OUTLINES[value] ? OUTLINES[value].hex : /^[0-9a-f]{6}$/i.test(value || '') ? `#${value.toLowerCase()}` : '#ffffff');

  const DEFAULTS = Object.freeze({
    skin: 'classic', size: 'm', deco: 'none', aura: 'none', trail: 'none', name: false,
    click: 'mouse', ping: 'classic', emoji: 'eyes', pingSound: 'classic', brush: 'normal', width: 'm',
    outline: 'w', hx: 0, hy: 0,
  });
  const CHOICES = {
    size: SIZES, deco: DECOS, aura: AURAS, trail: TRAILS, click: CLICKS,
    ping: PINGS, emoji: EMOJIS, pingSound: PING_SOUNDS, brush: BRUSHES, width: WIDTHS,
  };
  // Opções que saíram (eram repetidas): quem tinha escolhido fica com a parecida.
  const ALIASES = { skin: { round: 'classic' }, trail: { dots: 'pixels' }, ping: { pulse: 'classic' } };

  // Pacotes prontos: tudo combinando, de uma vez.
  const PACKS = {
    classic: { label: 'Clássico', style: {} },
    neon: { label: 'Neon', style: { skin: 'os', aura: 'glow', trail: 'bubbles', click: 'rays', ping: 'target', pingSound: 'laser', brush: 'neon', outline: 'k' } },
    cute: { label: 'Fofura', style: { skin: 'heart', deco: 'catears', trail: 'hearts', click: 'hearts', ping: 'emoji', emoji: 'heart', pingSound: 'bell', brush: 'marker' } },
    royal: { label: 'Realeza', style: { deco: 'crown', aura: 'glow', trail: 'sparkles', click: 'confetti', ping: 'alert', pingSound: 'bell', brush: 'rainbow', outline: 'ffd23f' } },
    retro: { label: 'Retrô', style: { skin: 'pixel', size: 'l', trail: 'pixels', click: 'pop', ping: 'arrow', pingSound: 'coin', brush: 'dashed', width: 'l' } },
    party: { label: 'Festa', style: { skin: 'wand', deco: 'party', aura: 'rainbow', trail: 'rainbow', click: 'confetti', ping: 'emoji', emoji: 'party', pingSound: 'whistle', brush: 'rainbow' } },
    wizard: { label: 'Mago', style: { skin: 'wand', deco: 'wizard', aura: 'twinkle', trail: 'sparkles', click: 'rays', ping: 'emoji', emoji: 'star', pingSound: 'bell', brush: 'glitter', outline: 'b15cff' } },
    adventure: { label: 'Aventura', style: { skin: 'sword', deco: 'viking', trail: 'fire', click: 'boom', ping: 'flag', pingSound: 'boing', brush: 'chalk' } },
    pirate: { label: 'Pirata', style: { skin: 'sword', deco: 'pirate', trail: 'smoke', click: 'boom', ping: 'flag', pingSound: 'coin', brush: 'arrow', outline: 'k' } },
    space: { label: 'Espacial', style: { skin: 'rocket', size: 'l', aura: 'glow', trail: 'fire', click: 'rays', ping: 'pin', pingSound: 'laser', brush: 'neon' } },
    xmas: { label: 'Natal', style: { deco: 'santa', trail: 'snow', click: 'confetti', ping: 'emoji', emoji: 'gift', pingSound: 'bell', brush: 'rainbow', outline: 'ff4d5e' } },
    angel: { label: 'Anjinho', style: { deco: 'halo', aura: 'glow', trail: 'bubbles', click: 'ripple', ping: 'pin', pingSound: 'bell', brush: 'fade' } },
    devil: { label: 'Diabinho', style: { deco: 'horns', aura: 'pulse', trail: 'fire', click: 'stars', ping: 'emoji', emoji: 'skull', pingSound: 'pop', brush: 'neon', outline: 'k' } },
    spooky: { label: 'Assombrado', style: { skin: 'ghost', aura: 'wiggle', trail: 'smoke', click: 'pop', ping: 'emoji', emoji: 'ghost', pingSound: 'whistle', brush: 'fade' } },
    kitty: { label: 'Gatinho', style: { skin: 'paw', deco: 'bow', aura: 'bounce', trail: 'hearts', click: 'hearts', ping: 'emoji', emoji: 'heart', pingSound: 'pop', brush: 'marker', outline: 'ff5fa2' } },
    alien: { label: 'Alienígena', style: { skin: 'hand', deco: 'antenna', aura: 'glow', trail: 'bubbles', click: 'ripple', ping: 'target', pingSound: 'whistle', brush: 'fade', name: true } },
  };

  // Imagens próprias (setinha e ping): só o endereço das fotos do servidor (/avatar/hash),
  // relativo ou completo (a camada do app recebe completo).
  const IMAGE_URL = /^(https?:\/\/[^\s"'()<>\\]+)?\/avatar\/[a-f0-9]{32}$/;
  const percent = (v) => {
    const n = typeof v === 'string' && /^\d{1,3}$/.test(v) ? Number(v) : v;
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
  };

  // Qualquer coisa que chegar (do servidor, do armazenamento) vira um estilo válido.
  function normalize(raw) {
    const style = { ...DEFAULTS };
    if (!raw || typeof raw !== 'object') return style;
    const pick = (key, options) => {
      let value = raw[key];
      if (ALIASES[key] && Object.prototype.hasOwnProperty.call(ALIASES[key], value)) value = ALIASES[key][value];
      if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(options, value)) style[key] = value;
    };
    pick('skin', { ...SKINS, custom: true });
    for (const [key, options] of Object.entries(CHOICES)) pick(key, options);
    if (typeof raw.name === 'boolean') style.name = raw.name;
    if (typeof raw.outline === 'string' && (OUTLINES[raw.outline] || /^[0-9a-f]{6}$/i.test(raw.outline))) style.outline = raw.outline.toLowerCase();
    for (const key of ['hx', 'hy']) {
      const n = percent(raw[key]);
      if (n !== null) style[key] = n;
    }
    for (const key of ['img', 'pingImg']) {
      if (typeof raw[key] === 'string' && IMAGE_URL.test(raw[key])) style[key] = raw[key];
    }
    // Sem a imagem (ainda não chegou, ou foi tirada): a setinha/o ping normal.
    if (style.skin === 'custom' && !style.img && raw.keepCustom !== true) style.skin = 'classic';
    if (style.ping === 'image' && !style.pingImg && raw.keepCustom !== true) style.ping = 'emoji';
    return style;
  }

  const isDefault = (style) => Object.keys(DEFAULTS).every((key) => style[key] === DEFAULTS[key]);

  // ---------- setinha ----------

  const paint = (value, outline = '#ffffff') => (value === 'c' ? 'currentColor' : value === 'w' ? outline : value || 'none');
  const skinOf = (style) => SKINS[style.skin] || SKINS.classic;

  // Atributos de desenho (não "style" no HTML): as páginas do app têm CSP que bloqueia
  // style escrito no HTML. outline: a cor do contorno (as partes brancas do desenho).
  function skinMarkup(id, extraClass = '', outline = '#ffffff') {
    const skin = SKINS[id] || SKINS.classic;
    const paths = skin.layers.map((layer) => `<path d="${layer.d}" fill="${paint(layer.fill, outline)}" stroke="${layer.stroke ? paint(layer.stroke, outline) : 'none'}" stroke-width="${layer.width || 0}" stroke-linejoin="round" stroke-linecap="round"${layer.crisp ? ' shape-rendering="crispEdges"' : ''}/>`);
    const body = skin.rot ? `<g transform="rotate(${skin.rot} 12 12)">${paths.join('')}</g>` : paths.join('');
    return `<svg class="wfx-arrow${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
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

  // Imagem própria: o tamanho (o lado maior) em cada tamanho escolhido. A ponta (hx, hy) é
  // em % da imagem; o resto (bolinha, enfeite) se apoia no quadrado da imagem.
  const CUSTOM_PX = { s: 24, m: 32, l: 44, xl: 56 };
  const imageSizes = new Map(); // endereço -> [largura, altura] (quando já carregou)
  function customBox(style, scale = 1, size = null) {
    const side = CUSTOM_PX[style.size] * scale;
    const natural = size || imageSizes.get(style.img);
    const ratio = natural ? natural[0] / natural[1] : 1;
    const w = ratio >= 1 ? side : side * ratio;
    const h = ratio >= 1 ? side / ratio : side;
    return { w, h, hotX: (style.hx / 100) * w, hotY: (style.hy / 100) * h };
  }

  // Aplica o estilo num mouse já montado (um elemento sem tamanho, na ponta do mouse,
  // com a bolinha .cursor-badge dentro). arrow: false quando a setinha é o cursor do
  // sistema (o seu próprio mouse) e aqui só vão a bolinha, o enfeite e o nome. scale:
  // a camada do app, na tela de verdade, desenha um pouco menor.
  function applyCursor(node, rawStyle, { arrow = true, name = '', scale = 1 } = {}) {
    const style = normalize(rawStyle);
    const custom = style.skin === 'custom';
    const skin = skinOf(style);
    const size = SIZES[style.size].px * scale;
    const k = size / 24;
    const outline = outlineHex(style.outline);
    node.classList.add('wfx-cursor');
    for (const cls of [...node.classList]) {
      if (/^wfx-(aura|skin|size)-/.test(cls)) node.classList.remove(cls);
    }
    node.classList.add(`wfx-aura-${style.aura}`, `wfx-skin-${style.skin}`, `wfx-size-${style.size}`);
    node.style.setProperty('--o', outline);
    // Onde ficam a bolinha e o enfeite, em relação à ponta.
    let badgeAt;
    let decoAt;
    let shape; // { left, top, width, height, origin } do desenho (setinha ou imagem)
    if (custom) {
      const box = customBox(style, scale);
      shape = { left: -box.hotX, top: -box.hotY, width: box.w, height: box.h };
      badgeAt = [box.w - box.hotX - 6 * scale, box.h - box.hotY - 6 * scale];
      decoAt = [box.w / 2 - box.hotX, -box.hotY];
      // Ainda sem o tamanho da imagem: ajeita quando ela carregar.
      if (!imageSizes.has(style.img)) {
        const probe = new Image();
        probe.onload = () => {
          imageSizes.set(style.img, [probe.naturalWidth || 1, probe.naturalHeight || 1]);
          if (node.isConnected) applyCursor(node, style, { arrow, name, scale });
        };
        probe.src = style.img;
      }
    } else {
      // (bolinha e enfeite: em relação à ponta)
      shape = { left: -skin.hot[0] * k, top: -skin.hot[1] * k, width: size, height: size };
      badgeAt = [skin.badge[0] * k, skin.badge[1] * k];
      decoAt = [skin.deco[0] * k, skin.deco[1] * k];
    }
    // A setinha (troca a original, se tiver), ou a imagem própria.
    for (const old of node.querySelectorAll(':scope > svg:not(.wfx-arrow)')) old.remove();
    let drawn = node.querySelector(':scope > .wfx-arrow');
    const key = custom ? `img|${style.img}` : `${style.skin}|${outline}`;
    if (!arrow) {
      if (drawn) drawn.remove();
    } else {
      if (!drawn || drawn.dataset.key !== key) {
        if (drawn) drawn.remove();
        if (custom) {
          drawn = document.createElement('img');
          drawn.className = 'wfx-arrow wfx-arrow-img';
          drawn.alt = '';
          drawn.draggable = false;
          drawn.src = style.img;
        } else drawn = fromMarkup(skinMarkup(style.skin, '', outline));
        drawn.dataset.key = key;
        drawn.dataset.skin = style.skin;
        node.prepend(drawn);
      }
      drawn.style.width = `${shape.width}px`;
      drawn.style.height = `${shape.height}px`;
      drawn.style.left = `${shape.left}px`;
      drawn.style.top = `${shape.top}px`;
      drawn.style.transformOrigin = `${-shape.left}px ${-shape.top}px`;
    }
    // A bolinha com a foto: no lugar certo pra cada setinha, com a borda no contorno.
    const badge = node.querySelector(':scope > .cursor-badge');
    const [bx, by] = badgeAt;
    if (badge) {
      badge.style.left = `${bx}px`;
      badge.style.top = `${by}px`;
      badge.style.borderColor = outline;
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
      const dsize = (custom ? Math.max(shape.width, shape.height) * 0.62 : size * 0.8);
      deco.style.width = `${dsize}px`;
      deco.style.height = `${dsize}px`;
      deco.style.left = `${decoAt[0] - dsize / 2}px`;
      deco.style.top = `${decoAt[1] - dsize}px`;
    }
    // Estrelinhas piscando em volta (efeito "Estrelinhas").
    let twinkle = node.querySelector(':scope > .wfx-twinkle');
    if (style.aura !== 'twinkle') {
      if (twinkle) twinkle.remove();
    } else {
      if (!twinkle) {
        twinkle = document.createElement('span');
        twinkle.className = 'wfx-twinkle';
        for (let i = 0; i < 3; i += 1) twinkle.append(part(`wfx-tw wfx-tw-${i}`, '✦'));
        node.append(twinkle);
      }
      twinkle.style.left = `${shape.left}px`;
      twinkle.style.top = `${shape.top}px`;
      twinkle.style.width = `${shape.width}px`;
      twinkle.style.height = `${shape.height}px`;
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
  // a imagem (data URL), o tamanho e a ponta, em pixels CSS. frame: pra imagem própria, o
  // desenho já carregado (uma <img>, ImageBitmap ou canvas; um quadro, se for animada).
  function cursorImage(rawStyle, color, scale = 1, frame = null) {
    const style = normalize(rawStyle);
    const pad = 4;
    const canvas = document.createElement('canvas');
    if (style.skin === 'custom') {
      const natural = frame ? [frame.naturalWidth || frame.width || 1, frame.naturalHeight || frame.height || 1] : null;
      if (natural && style.img) imageSizes.set(style.img, natural);
      const box = customBox(style, 1, natural);
      const w = Math.ceil(box.w + pad * 2);
      const h = Math.ceil(box.h + pad * 2);
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      if (frame) {
        if (style.aura === 'glow') {
          ctx.shadowColor = color;
          ctx.shadowBlur = 6 * scale;
        }
        ctx.drawImage(frame, pad, pad, box.w, box.h);
      }
      return { url: canvas.toDataURL('image/png'), box: Math.max(w, h), hotX: Math.round(pad + box.hotX), hotY: Math.round(pad + box.hotY) };
    }
    const skin = skinOf(style);
    const outline = outlineHex(style.outline);
    const size = SIZES[style.size].px;
    const k = size / 24;
    const box = Math.ceil(size + pad * 2);
    canvas.width = Math.round(box * scale);
    canvas.height = Math.round(box * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(pad, pad);
    ctx.scale(k, k);
    if (skin.rot) {
      ctx.translate(12, 12);
      ctx.rotate((skin.rot * Math.PI) / 180);
      ctx.translate(-12, -12);
    }
    const colorOf = (value) => (value === 'c' ? color : value === 'w' ? outline : value);
    skin.layers.forEach((layer, i) => {
      const path = new Path2D(layer.d);
      ctx.save();
      if (i === 0) {
        // Sombra (e o brilho na cor, se escolheu): não seguem a escala do desenho.
        ctx.shadowColor = style.aura === 'glow' ? color : 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = (style.aura === 'glow' ? 6 : 4) * scale;
        ctx.shadowOffsetY = style.aura === 'glow' ? 0 : 2 * scale;
      }
      const fill = colorOf(layer.fill);
      if (fill && fill !== 'none') {
        ctx.fillStyle = fill;
        ctx.fill(path);
      }
      if (layer.stroke) {
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = layer.width || 1;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = colorOf(layer.stroke);
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
      else if (style.trail === 'snow') p.textContent = '❄';
      else if (style.trail === 'notes') p.textContent = state.trailN % 2 ? '♪' : '♫';
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
    } else if (style.click === 'stars' || style.click === 'confetti' || style.click === 'hearts') {
      const n = style.click === 'confetti' ? 10 : 6;
      const glyph = style.click === 'stars' ? '✦' : style.click === 'hearts' ? '♥' : '';
      for (let i = 0; i < n; i += 1) {
        const angle = scroll ? (kind === 'up' ? -90 : 90) + (i - (n - 1) / 2) * 14 : (360 / n) * i + Math.random() * 20;
        const piece = part(style.click === 'confetti' ? 'wfx-bit' : `wfx-star${style.click === 'hearts' ? ' wfx-heart' : ''}`, glyph);
        piece.style.setProperty('--a', `${angle}deg`);
        piece.style.setProperty('--d', `${(scroll ? 26 : 22) + Math.random() * 12}px`);
        if (style.click === 'confetti') piece.style.setProperty('--c', RAINBOW(i * 3 + Math.floor(Math.random() * 9)));
        else if (kind === 'right' && i % 2) piece.style.setProperty('--c', '#ffffff');
        mark.append(piece);
      }
    } else if (style.click === 'rays') {
      // Raios saindo (rodinha: só pra cima ou pra baixo).
      const n = scroll ? 3 : kind === 'right' ? 12 : 8;
      for (let i = 0; i < n; i += 1) {
        const ray = part('wfx-ray');
        const angle = scroll ? (kind === 'up' ? -90 : 90) + (i - 1) * 28 : (360 / n) * i;
        ray.style.setProperty('--a', `${angle}deg`);
        if (kind === 'middle' && i % 2) ray.style.setProperty('--c', '#ffffff');
        mark.append(ray);
      }
    } else if (style.click === 'boom') {
      mark.append(part('wfx-boom-ring'), part('wfx-boom', scroll ? (kind === 'up' ? '💨' : '💫') : kind === 'right' ? '💢' : '💥'));
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
    } else if (style.ping === 'pin') {
      const pin = part('wfx-pin');
      pin.innerHTML = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 1.5a8 8 0 0 0-8 8c0 6 8 18 8 18s8-12 8-18a8 8 0 0 0-8-8z" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="9.6" r="3" fill="#fff"/></svg>';
      mark.append(part('wfx-pin-shadow'), pin);
    } else if (style.ping === 'flag') {
      const flag = part('wfx-flag');
      flag.innerHTML = '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M3.5 31V2" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M3.5 31V2" stroke="#6b4a2b" stroke-width="1.6" stroke-linecap="round"/><path class="wfx-flag-cloth" d="M4.5 3c4-2 7 2 11 0s5 0 6 1v10c-1-1-2-3-6-1s-7-2-11 0z" fill="currentColor" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      mark.append(part('wfx-ring-static'), flag);
    } else if (style.ping === 'image' && style.pingImg) {
      const img = document.createElement('img');
      img.className = 'wfx-ping-img';
      img.alt = '';
      img.draggable = false;
      img.src = style.pingImg;
      mark.append(part('wfx-ring-static'), img);
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
    coin: [[987.77, 0, 0.08, { type: 'square', gain: 0.035 }], [1318.51, 0.08, 0.28, { type: 'square', gain: 0.035 }]],
    laser: [[1800, 0, 0.22, { slideTo: 160, type: 'sawtooth', gain: 0.04 }]],
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
    // Contorno: o traço na cor com um miolo branco por cima.
    let inner = null;
    if (kind === 'outline') {
      svg.style.setProperty('--bw', String(WIDTHS[style.width].k * 1.7));
      inner = document.createElementNS(SVG_NS, 'path');
      inner.setAttribute('vector-effect', 'non-scaling-stroke');
      inner.setAttribute('class', 'wfx-inner');
      inner.style.stroke = '#ffffff';
      svg.append(inner);
    }
    // Flecha: a ponta acompanha o fim do traço.
    let head = null;
    if (kind === 'arrow') {
      head = document.createElementNS(SVG_NS, 'path');
      head.setAttribute('vector-effect', 'non-scaling-stroke');
      head.setAttribute('class', 'wfx-head');
      head.style.fill = color;
      head.style.stroke = color;
      head.style.strokeLinejoin = 'round';
      svg.append(head);
    }
    const glitter = kind === 'glitter' ? {} : null;
    let box = null; // tamanho do traço e onde ele está na camada (lido uma vez)
    let width = 0; // grossura do traço em px (lida uma vez)
    const measure = () => {
      if (box || !svg.isConnected) return box;
      const r = svg.getBoundingClientRect();
      const parent = svg.parentNode && svg.parentNode.getBoundingClientRect ? svg.parentNode.getBoundingClientRect() : r;
      box = { w: r.width || 1, h: r.height || 1, x: r.left - parent.left, y: r.top - parent.top };
      width = parseFloat(getComputedStyle(path).strokeWidth) || 4;
      if (inner) inner.style.strokeWidth = `${Math.max(1.2, width * 0.42)}px`;
      return box;
    };
    return {
      update(points) {
        if (trail) {
          trail.update(points);
          return;
        }
        const d = pathFor(points);
        path.setAttribute('d', d);
        if (inner) {
          measure();
          inner.setAttribute('d', d);
        }
        if (head && points.length >= 4 && measure()) {
          // Direção do fim do traço (em px de verdade: o desenho estica em x e y).
          const n = points.length;
          const ex = points[n - 2] * box.w;
          const ey = points[n - 1] * box.h;
          let dx = 0;
          let dy = 0;
          for (let i = n - 4; i >= 0; i -= 2) {
            dx = ex - points[i] * box.w;
            dy = ey - points[i + 1] * box.h;
            if (Math.hypot(dx, dy) >= 10) break;
          }
          const len = Math.hypot(dx, dy);
          if (len > 0.5) {
            const ux = dx / len;
            const uy = dy / len;
            const size = Math.max(11, width * 3.2);
            const wing = (sign) => {
              const a = Math.PI - sign * 0.5; // ±~29° pra trás
              const wx = ex + size * (ux * Math.cos(a) - uy * Math.sin(a));
              const wy = ey + size * (ux * Math.sin(a) + uy * Math.cos(a));
              return `${(wx / box.w).toFixed(4)} ${(wy / box.h).toFixed(4)}`;
            };
            const tip = `${((ex + ux * width * 0.6) / box.w).toFixed(4)} ${((ey + uy * width * 0.6) / box.h).toFixed(4)}`;
            head.setAttribute('d', `M${tip}L${wing(1)}L${wing(-1)}Z`);
          }
        }
        if (glitter && points.length >= 2 && measure()) {
          // Purpurina: brilhinhos coloridos caindo do traço.
          const n = points.length;
          sprinkle(svg.parentNode, glitter, box.x + points[n - 2] * box.w, box.y + points[n - 1] * box.h);
        }
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

  // Brilhinhos da purpurina (as mesmas partículas do rastro, coloridas, no máximo ~25/s).
  function sprinkle(layer, state, x, y) {
    if (!layer) return;
    const now = performance.now();
    if (now - (state.at || 0) < 40) return;
    state.at = now;
    state.n = (state.n || 0) + 1;
    const count = alive.get(layer) || 0;
    if (count > 70) return;
    alive.set(layer, count + 1);
    const p = document.createElement('span');
    p.className = 'wfx-p wfx-p-glitter';
    p.textContent = state.n % 3 ? '✦' : '✧';
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.setProperty('--c', RAINBOW(state.n * 2));
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 16}px`);
    p.style.setProperty('--dy', `${8 + Math.random() * 14}px`);
    p.style.setProperty('--s', String(0.6 + Math.random() * 0.6));
    p.style.setProperty('--r', `${Math.round(Math.random() * 160 - 80)}deg`);
    p.addEventListener('animationend', () => {
      p.remove();
      alive.set(layer, Math.max(0, (alive.get(layer) || 1) - 1));
    }, { once: true });
    layer.append(p);
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
    function group(label, key, entries, { icon, onPick, wide, beforePick } = {}) {
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
          if (beforePick && beforePick(id) === false) return;
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

    // Imagens próprias (setinha e ping): só aparecem se a página souber mandar (opts.images).
    const images = opts.images || null;
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.hidden = true;
    let fileKind = null;
    container.append(fileInput);
    const pickFile = (kind) => {
      if (!images) return;
      fileKind = kind;
      fileInput.accept = kind === 'cursor' ? '.png,.gif,.webp,.cur,.ani,image/png,image/gif,image/webp' : '.png,.gif,.webp,.jpg,.jpeg,image/png,image/gif,image/webp,image/jpeg';
      fileInput.value = '';
      fileInput.click();
    };
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      const kind = fileKind;
      if (!file || !kind) return;
      const status = kind === 'cursor' ? skinStatus : pingStatus;
      status.textContent = 'Enviando…';
      status.classList.remove('wfx-ed-error');
      let res;
      try {
        res = await images.upload(kind, file);
      } catch (err) {
        res = { error: (err && err.message) || 'Não deu pra usar essa imagem.' };
      }
      if (!res || res.error) {
        status.textContent = (res && res.error) || 'Não deu pra usar essa imagem.';
        status.classList.add('wfx-ed-error');
        return;
      }
      status.textContent = '';
      if (kind === 'cursor') set({ skin: 'custom', hx: res.hx || 0, hy: res.hy || 0, keepCustom: true });
      else set({ ping: 'image', keepCustom: true });
      demo(kind === 'cursor' ? 'move' : 'ping');
    });
    const thumb = (url) => {
      const span = el('span', 'wfx-ed-icon wfx-ed-thumb');
      if (url) {
        const img = el('img');
        img.alt = '';
        img.src = url;
        span.append(img);
      } else span.textContent = '+';
      return span;
    };

    const skinEntries = Object.entries(SKINS).map(([id, sk]) => [id, sk.label]);
    if (images) skinEntries.push(['custom', 'Imagem própria']);
    const skinRow = group('Setinha', 'skin', skinEntries, {
      icon: (id) => (id === 'custom' ? thumb(null) : swatch(skinMarkup(id))),
      beforePick: (id) => {
        if (id === 'custom' && !current().img) {
          pickFile('cursor');
          return false;
        }
        return true;
      },
      onPick: () => demo('move'),
    });
    // A sua imagem: trocar, tirar e marcar a ponta (onde o clique cai).
    const customRow = el('div', 'wfx-ed-row wfx-ed-custom wfx-ed-custom-cursor');
    customRow.append(el('div', 'wfx-ed-label', 'Sua setinha'));
    const customBody = el('div', 'wfx-ed-custom-body');
    const hotBox = el('div', 'wfx-ed-hot');
    hotBox.title = 'Clique na imagem pra marcar a ponta do mouse';
    const hotImg = el('img');
    hotImg.alt = 'A sua setinha';
    hotImg.draggable = false;
    const hotMark = el('span', 'wfx-ed-hotmark');
    hotBox.append(hotImg, hotMark);
    hotBox.addEventListener('click', (e) => {
      const r = hotImg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const hx = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
      const hy = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
      set({ hx, hy });
      demo('click');
    });
    const customSide = el('div', 'wfx-ed-custom-side');
    customSide.append(el('p', 'wfx-ed-note', 'PNG, GIF (animado também), .cur ou .ani do Windows. Clique na imagem pra marcar onde fica a ponta.'));
    const customBtns = el('div', 'wfx-ed-chips');
    const btnSkinFile = el('button', 'wfx-ed-chip', 'Enviar imagem…');
    btnSkinFile.type = 'button';
    btnSkinFile.addEventListener('click', () => pickFile('cursor'));
    const btnSkinRemove = el('button', 'wfx-ed-chip', 'Tirar');
    btnSkinRemove.type = 'button';
    btnSkinRemove.addEventListener('click', async () => {
      if (images && images.remove) await images.remove('cursor');
      set({ skin: 'classic', hx: 0, hy: 0 });
    });
    customBtns.append(btnSkinFile, btnSkinRemove);
    const skinStatus = el('p', 'wfx-ed-note wfx-ed-status');
    skinStatus.setAttribute('role', 'status');
    customSide.append(customBtns, skinStatus);
    customBody.append(hotBox, customSide);
    customRow.append(customBody);
    if (images) sections.append(customRow);

    group('Tamanho', 'size', Object.entries(SIZES).map(([id, sz]) => [id, sz.label]), { onPick: () => demo('move') });
    const outlineEntries = [...Object.entries(OUTLINES).map(([id, o]) => [id, o.label]), ...OUTLINE_COLORS.map((hex) => [hex, `#${hex}`])];
    const outlineRow = group('Contorno', 'outline', outlineEntries, {
      icon: (id) => {
        const dot = el('span', 'wfx-ed-icon wfx-ed-dot');
        dot.style.background = outlineHex(id);
        return dot;
      },
      onPick: () => demo('move'),
    });
    outlineRow.classList.add('wfx-ed-outlines');
    group('Enfeite', 'deco', Object.entries(DECOS).map(([id, d]) => [id, d.label]), { icon: (id) => (id === 'none' ? null : swatch(decoMarkup(id))), onPick: () => demo('move') });
    group('Efeito na setinha', 'aura', Object.entries(AURAS), { onPick: () => demo('move') });
    const trailGlyph = { hearts: '♥', sparkles: '✦', snow: '❄', notes: '♪' };
    group('Rastro', 'trail', Object.entries(TRAILS), { icon: (id) => (id === 'none' ? null : el('span', `wfx-ed-icon wfx-ed-trail wfx-ed-trail-${id}`, trailGlyph[id] || '')), onPick: () => demo('trail') });
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
    const pingEntries = Object.entries(PINGS).filter(([id]) => id !== 'image' || images);
    group('Ping (Alt + clique)', 'ping', pingEntries, {
      icon: (id) => (id === 'image' ? thumb(null) : null),
      beforePick: (id) => {
        if (id === 'image' && !current().pingImg) {
          pickFile('ping');
          return false;
        }
        return true;
      },
      onPick: () => demo('ping'),
    });
    const emojiRow = group('Emoji do ping', 'emoji', Object.entries(EMOJIS).map(([id, e]) => [id, e]), { onPick: () => demo('ping') });
    emojiRow.classList.add('wfx-ed-emojis');
    // A imagem do ping.
    const pingRow = el('div', 'wfx-ed-row wfx-ed-custom wfx-ed-custom-ping');
    pingRow.append(el('div', 'wfx-ed-label', 'Imagem do ping'));
    const pingBody = el('div', 'wfx-ed-custom-body');
    const pingThumb = el('img', 'wfx-ed-pingthumb');
    pingThumb.alt = 'A imagem do seu ping';
    const pingSide = el('div', 'wfx-ed-custom-side');
    pingSide.append(el('p', 'wfx-ed-note', 'PNG, JPG, WebP ou GIF: aparece pulando onde você der o ping.'));
    const pingBtns = el('div', 'wfx-ed-chips');
    const btnPingFile = el('button', 'wfx-ed-chip', 'Enviar imagem…');
    btnPingFile.type = 'button';
    btnPingFile.addEventListener('click', () => pickFile('ping'));
    const btnPingRemove = el('button', 'wfx-ed-chip', 'Tirar');
    btnPingRemove.type = 'button';
    btnPingRemove.addEventListener('click', async () => {
      if (images && images.remove) await images.remove('ping');
      set({ ping: 'emoji' });
    });
    pingBtns.append(btnPingFile, btnPingRemove);
    const pingStatus = el('p', 'wfx-ed-note wfx-ed-status');
    pingStatus.setAttribute('role', 'status');
    pingSide.append(pingBtns, pingStatus);
    pingBody.append(pingThumb, pingSide);
    pingRow.append(pingBody);
    if (images) sections.append(pingRow);
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
      // Setinha própria: a miniatura no botão e o quadro pra marcar a ponta.
      const skinThumb = skinRow.querySelector('[data-value="custom"] .wfx-ed-thumb');
      if (skinThumb) skinThumb.replaceWith(thumb(style.img || null));
      customRow.hidden = style.skin !== 'custom';
      if (style.img && hotImg.getAttribute('src') !== style.img) hotImg.src = style.img;
      hotMark.style.left = `${style.hx}%`;
      hotMark.style.top = `${style.hy}%`;
      const pingChipThumb = sections.querySelector('[data-key="ping"][data-value="image"] .wfx-ed-thumb');
      if (pingChipThumb) pingChipThumb.replaceWith(thumb(style.pingImg || null));
      pingRow.hidden = style.ping !== 'image';
      if (style.pingImg && pingThumb.getAttribute('src') !== style.pingImg) pingThumb.src = style.pingImg;
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
    DEFAULTS, SKINS, SIZES, DECOS, AURAS, TRAILS, CLICKS, PINGS, EMOJIS, PING_SOUNDS, BRUSHES, WIDTHS, PACKS, OUTLINES, OUTLINE_COLORS,
    normalize, isDefault, outlineHex, skinMarkup, decoMarkup, applyCursor, cursorImage, customBox, trail, click, ping, playPing, brush, editor,
  };
  if (typeof window !== 'undefined') window.WssFx = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
