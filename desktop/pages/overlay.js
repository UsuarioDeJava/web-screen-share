// Marcações da sua transmissão na sua tela de verdade: alguém apontou (Alt+clique),
// desenhou (Alt+arrastar) ou reagiu. Posições de 0 a 1 em relação à tela inteira.
const fx = document.getElementById('fx');
const SVG_NS = 'http://www.w3.org/2000/svg';
const strokes = new Map(); // "nome|id" -> { svg, path, points, expire }
const altHeld = new Map(); // nome -> { list, timer }: traços de quem ainda segura o Alt

const unit = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
function hslHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const v = Math.round((l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
    return v.toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
// A cor exata (#rrggbb) que a sala manda; sem ela (sala de antes), sai do tom.
const color = (hue, exact) => (HEX_COLOR.test(exact || '') ? exact
  : Number(hue) === -1 ? '#ffffff' : hslHex(((Number(hue) || 0) % 360 + 360) % 360, 95, 64));
const text = (v) => String(v == null ? '' : v).slice(0, 40);
// Estilos do mouse e das marcações de cada pessoa (setinha, efeito, rastro, clique,
// ping, pincel): ../shared/fx.js, o mesmo da sala. Sem ele (ou sem estilo), o clássico.
const Fx = window.WssFx;
const OVERLAY_SCALE = 0.85; // na tela de verdade, um pouco menor que na sala

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function ping({ x, y, name, hue, color: exact, style }) {
  if (Fx && Fx.ping(fx, `${unit(x) * 100}%`, `${unit(y) * 100}%`, style, color(hue, exact), text(name), unit(x) > 0.8)) return;
  const mark = el('div', 'ping');
  mark.style.left = `${unit(x) * 100}%`;
  mark.style.top = `${unit(y) * 100}%`;
  mark.style.setProperty('--c', color(hue, exact));
  // Sem o nome (atrapalhava): a cor diz quem foi.
  mark.append(el('span', 'ping-ring'), el('span', 'ping-ring'), el('span', 'ping-dot'));
  mark.addEventListener('animationend', (e) => {
    if (e.target === mark) mark.remove();
  });
  fx.append(mark);
}

function strokePath(pts) {
  const f = (v) => v.toFixed(4);
  if (pts.length < 2) return '';
  const start = `M${f(pts[0])} ${f(pts[1])}`;
  if (pts.length === 2) return `${start}L${f(pts[0])} ${f(pts[1])}`;
  let d = start;
  for (let i = 2; i < pts.length - 2; i += 2) {
    d += `Q${f(pts[i])} ${f(pts[i + 1])} ${f((pts[i] + pts[i + 2]) / 2)} ${f((pts[i + 1] + pts[i + 3]) / 2)}`;
  }
  return `${d}L${f(pts[pts.length - 2])} ${f(pts[pts.length - 1])}`;
}

// O pincel de quem desenha (neon, tracejado, giz, marca-texto, arco-íris, rastro...).
// arrow: com ponta de flecha (quem assiste: Alt + Shift + arrastar; você: Shift + arrastar).
function brushFor(svg, path, style, hex, arrow = false) {
  if (Fx) return Fx.brush(svg, path, style, hex, strokePath, { arrow });
  return { update: (points) => path.setAttribute('d', strokePath(points)), setArrow: () => {} };
}

function finishStroke(key, stroke) {
  strokes.delete(key);
  clearTimeout(stroke.expire);
  stroke.svg.classList.add('fading');
  stroke.svg.addEventListener('animationend', () => stroke.svg.remove());
}

// Quem assiste desenhando com o Alt apertado: o traço fica até a pessoa soltar o Alt
// (draw-release). Se o aviso não vier, some sozinho em 2 minutos.
function keepUntilRelease(name, key, stroke) {
  strokes.delete(key);
  clearTimeout(stroke.expire);
  const who = text(name);
  let held = altHeld.get(who);
  if (!held) {
    held = { list: [], timer: null };
    altHeld.set(who, held);
  }
  held.list.push(stroke);
  clearTimeout(held.timer);
  held.timer = setTimeout(() => releaseAlt(who), 120000);
}

function releaseAlt(name) {
  const who = text(name);
  const held = altHeld.get(who);
  if (!held) return;
  altHeld.delete(who);
  clearTimeout(held.timer);
  for (const stroke of held.list) {
    stroke.svg.classList.add('fading');
    stroke.svg.addEventListener('animationend', () => stroke.svg.remove());
  }
}

function draw({ key, points, end, hue, hold, name, color: exact, style, arrow }) {
  if (typeof key !== 'string' || !Array.isArray(points)) return;
  let stroke = strokes.get(key);
  if (!stroke) {
    if (!points.length) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'draw');
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.setProperty('--c', color(hue, exact));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path);
    fx.append(svg);
    stroke = { svg, path, points: [], expire: null, arrow: arrow === true, brush: brushFor(svg, path, style, color(hue, exact), arrow === true) };
    strokes.set(key, stroke);
  } else if (arrow === true && !stroke.arrow) {
    stroke.arrow = true; // o Shift veio no meio do traço
    stroke.brush.setArrow(true);
  }
  for (const v of points.slice(0, 256)) {
    if (stroke.points.length < 2400) stroke.points.push(unit(v));
  }
  stroke.brush.update(stroke.points);
  clearTimeout(stroke.expire);
  const done = () => (hold === 'alt' ? keepUntilRelease(name, key, stroke) : finishStroke(key, stroke));
  if (end) done();
  else stroke.expire = setTimeout(done, 5000);
}

function react({ emoji, name, hue, color: exact }) {
  const items = fx.querySelectorAll('.react');
  for (let i = 0; i <= items.length - 20; i += 1) items[i].remove();
  const item = el('div', 'react');
  item.style.left = `${78 + Math.random() * 18}%`;
  item.style.setProperty('--drift', `${Math.round(Math.random() * 60 - 30)}px`);
  item.style.setProperty('--c', color(hue, exact));
  item.append(el('span', 'react-emoji', text(emoji).slice(0, 8)), el('span', 'react-name', text(name)));
  item.addEventListener('animationend', (e) => {
    if (e.target === item) item.remove();
  });
  fx.append(item);
}

// ---------- modo desenho (Ctrl+Shift+D): você rabisca aqui, quem assiste vê ----------

const board = document.getElementById('board');
const hud = document.getElementById('hud');
const colorsEl = document.getElementById('colors');
// Sua cor da sala, vermelho, amarelo, verde e branco.
const PALETTE = [{ hue: null, name: 'Sua cor' }, { hue: 0, name: 'Vermelho' }, { hue: 50, name: 'Amarelo' }, { hue: 140, name: 'Verde' }, { hue: -1, name: 'Branco' }];
const own = []; // seus traços: ficam até desfazer, limpar ou sair do modo
let myHue = 200;
let myColor = null; // a sua cor exata, se a sala mandou
let myStyle = null; // o seu estilo (o pincel dos seus rabiscos)
let picked = null; // cor escolhida na barrinha (null: a sua cor)
let current = null; // traço sendo desenhado agora
let ownCounter = 0;

const activeHue = () => (picked === null ? myHue : picked);
const activeColor = () => (picked === null ? color(myHue, myColor) : color(picked));

function renderColors() {
  document.body.style.setProperty('--mine', activeColor());
  colorsEl.replaceChildren(...PALETTE.map((option) => {
    const swatch = el('button', 'swatch');
    swatch.type = 'button';
    swatch.title = option.name;
    swatch.style.setProperty('--c', option.hue === null ? color(myHue, myColor) : color(option.hue));
    swatch.classList.toggle('active', option.hue === picked);
    swatch.addEventListener('click', () => {
      picked = option.hue;
      renderColors();
    });
    return swatch;
  }));
}

function fadeOut(stroke) {
  stroke.svg.classList.add('clearing');
  stroke.svg.addEventListener('animationend', () => stroke.svg.remove());
}

function newStroke() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'draw own');
  svg.setAttribute('viewBox', '0 0 1 1');
  svg.setAttribute('preserveAspectRatio', 'none');
  const hue = activeHue();
  const hex = activeColor();
  svg.style.setProperty('--c', hex);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  fx.append(svg);
  ownCounter += 1;
  return { id: ownCounter, hue, color: hex, svg, path, points: [], pending: [], timer: null, arrow: false, brush: brushFor(svg, path, myStyle, hex) };
}

function ownArrow(stroke) {
  if (stroke.arrow) return;
  stroke.arrow = true;
  stroke.brush.setArrow(true);
}

// Sai em pedaços a cada 30 ms enquanto você desenha; sem limite de tamanho.
function flush(stroke, end = false) {
  clearTimeout(stroke.timer);
  stroke.timer = null;
  if (!stroke.pending.length && !end) return;
  window.overlayBridge.draw({ id: stroke.id, points: stroke.pending.splice(0), end, hue: stroke.hue, color: stroke.color, arrow: stroke.arrow });
}

function addPoint(stroke, clientX, clientY) {
  const x = Math.round(unit(clientX / innerWidth) * 10000) / 10000;
  const y = Math.round(unit(clientY / innerHeight) * 10000) / 10000;
  const n = stroke.points.length;
  if (n && Math.hypot(x - stroke.points[n - 2], y - stroke.points[n - 1]) < 0.0008) return;
  stroke.points.push(x, y);
  stroke.pending.push(x, y);
  stroke.brush.update(stroke.points);
  if (!stroke.timer) stroke.timer = setTimeout(() => flush(stroke), 30);
}

function endStroke() {
  if (!current) return;
  flush(current, true);
  own.push(current);
  current = null;
}

function undo() {
  if (current) return;
  const stroke = own.pop();
  if (!stroke) return;
  stroke.svg.remove();
  window.overlayBridge.undo(stroke.id);
}

function clearOwn() {
  endStroke();
  for (const stroke of own.splice(0)) stroke.svg.remove();
  window.overlayBridge.clear();
}

function setDrawMode(on, hue, exact, style) {
  if (Number.isInteger(hue)) myHue = hue;
  myColor = HEX_COLOR.test(exact || '') ? exact : null;
  myStyle = style && typeof style === 'object' ? style : null;
  document.body.classList.toggle('drawing', on);
  hud.hidden = !on;
  renderColors();
  if (!on) {
    endStroke();
    for (const stroke of own.splice(0)) fadeOut(stroke); // somem devagar, como pra quem assiste
  }
}

board.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  board.setPointerCapture(event.pointerId);
  endStroke();
  current = newStroke();
  if (event.shiftKey) ownArrow(current);
  addPoint(current, event.clientX, event.clientY);
});
board.addEventListener('pointermove', (event) => {
  if (!current) return;
  if (event.shiftKey) ownArrow(current); // Shift (a qualquer momento): o traço vira flecha
  const coalesced = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  for (const e of coalesced.length ? coalesced : [event]) addPoint(current, e.clientX, e.clientY);
});
board.addEventListener('pointerup', endStroke);
board.addEventListener('pointercancel', endStroke);
board.addEventListener('contextmenu', (event) => event.preventDefault());
hud.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-act]');
  if (!button) return;
  if (button.dataset.act === 'undo') undo();
  else if (button.dataset.act === 'clear') clearOwn();
  else if (button.dataset.act === 'exit') window.overlayBridge.exit();
});

// ---------- mouse de quem assiste ----------

const cursorsEl = document.getElementById('cursors');
const cursors = new Map(); // id -> { node, hue, timer }
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2.5 19.5 13l-7 1.2-3.6 6.3z"/></svg>';
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

// Cor da pessoa (a mesma do avatar); se ficar parecida demais com a de outro mouse na
// tela, gira até ficar diferente: cada um com a sua.
function distinctHue(id, wanted) {
  const used = [...cursors.entries()].filter(([key]) => key !== id).map(([, c]) => c.hue);
  let hue = ((Number(wanted) || 0) % 360 + 360) % 360;
  for (let i = 0; i < 12 && used.some((u) => hueGap(u, hue) < 32); i += 1) hue = (hue + 137.5) % 360;
  return Math.round(hue);
}

// Letra escura numa cor clara (amarelo, branco...), senão branca.
function inkFor(hex) {
  const lin = (i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5) > 0.36 ? '#12141c' : '#ffffff';
}

function paintCursor(c) {
  const hex = c.custom || color(c.hue);
  c.node.style.setProperty('--c', hex);
  c.node.style.setProperty('--ink', c.custom ? inkFor(hex) : '#ffffff');
}

function removeCursor(id) {
  const c = cursors.get(id);
  if (!c) return;
  cursors.delete(id);
  clearTimeout(c.timer);
  c.node.classList.add('gone');
  setTimeout(() => c.node.remove(), 300);
}

// Foto de perfil no mouse: só do servidor da sala (o endereço que o app abriu).
const SERVER_ORIGIN = (() => {
  try {
    return new URL(new URLSearchParams(window.location.search).get('server')).origin;
  } catch {
    return null;
  }
})();

function safePhoto(url) {
  if (typeof url !== 'string' || !SERVER_ORIGIN) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin === SERVER_ORIGIN && /^\/avatar\/[0-9a-f]{32}$/.test(parsed.pathname) ? parsed.href : null;
  } catch {
    return null;
  }
}

function paintBadge(c, letter, avatar) {
  const photo = safePhoto(avatar);
  if (photo === c.photo) return;
  c.photo = photo;
  if (!photo) {
    c.badge.textContent = text(letter).slice(0, 2);
    c.badge.style.backgroundImage = '';
    c.badge.classList.remove('has-photo');
    return;
  }
  // Troca a letrinha pela foto (GIF anima) quando ela terminar de carregar.
  const img = new Image();
  img.onload = () => {
    if (c.photo !== photo) return;
    c.badge.textContent = '';
    c.badge.style.backgroundImage = `url("${photo}")`;
    c.badge.classList.add('has-photo');
  };
  img.src = photo;
}

// Clique e rolagem de quem assiste: a animação fica parada onde a pessoa clicou (não vai
// junto do mouse, e um clique novo não apaga o anterior). O desenho é o do ../shared/fx.js.
function showClick(left, top, kind, style, hex) {
  if (Fx) Fx.click(cursorsEl, left, top, kind, style, hex, { scale: OVERLAY_SCALE });
}

function cursor({ id, x, y, gone, letter, hue, avatar, click, color: exact, style, name }) {
  // A cor que a pessoa escolheu vai exata; a automática gira se ficar parecida com outra.
  const custom = HEX_COLOR.test(exact || '') ? exact.toLowerCase() : null;
  if (typeof id !== 'string') return;
  if (gone) {
    removeCursor(id);
    return;
  }
  let c = cursors.get(id);
  if (!c) {
    const node = el('div', 'cursor');
    node.innerHTML = ARROW;
    const badge = el('span', 'cursor-badge', text(letter).slice(0, 2));
    node.append(badge);
    c = { node, badge, photo: null, hue: custom ? hue : distinctHue(id, hue), wanted: hue, custom, timer: null };
    paintCursor(c);
    cursors.set(id, c);
    cursorsEl.append(node);
  } else if (hue !== c.wanted || custom !== c.custom) {
    // A pessoa trocou de cor no perfil.
    c.wanted = hue;
    c.custom = custom;
    c.hue = custom ? hue : distinctHue(id, hue);
    paintCursor(c);
  }
  paintBadge(c, letter, avatar);
  const hex = c.custom || color(c.hue);
  if (Fx) Fx.applyCursor(c.node, style, { scale: OVERLAY_SCALE });
  c.node.style.left = `${unit(x) * 100}%`;
  c.node.style.top = `${unit(y) * 100}%`;
  if (click) showClick(c.node.style.left, c.node.style.top, click, style, hex);
  if (Fx) Fx.trail(cursorsEl, c, unit(x) * 100, unit(y) * 100, style, hex, '%');
  clearTimeout(c.timer);
  c.timer = setTimeout(() => removeCursor(id), 4000); // parou de mandar: some
}

// ---------- alguém controlando o seu mouse e teclado ----------

const controlBanner = document.getElementById('control');
function control({ on, name, paused, shortcut }) {
  controlBanner.hidden = !on;
  controlBanner.classList.toggle('paused', Boolean(paused));
  document.getElementById('control-text').textContent = !on ? ''
    : paused ? `Você está no mouse: ${text(name)} espera você parar ·`
      : `${text(name)} está controlando o seu mouse e teclado ·`;
  document.getElementById('control-keys').hidden = shortcut === false;
  document.getElementById('control-list').hidden = shortcut !== false;
}

window.overlayBridge.onEvent((event) => {
  if (!event || typeof event !== 'object') return;
  if (event.type === 'cursor') cursor(event);
  else if (event.type === 'control') control(event);
  if (event.type === 'ping') ping(event);
  else if (event.type === 'draw') draw(event);
  else if (event.type === 'draw-release') releaseAlt(event.name);
  else if (event.type === 'react') react(event);
  else if (event.type === 'draw-mode') setDrawMode(Boolean(event.on), event.hue, event.color, event.style);
  else if (event.type === 'draw-undo') undo();
  else if (event.type === 'draw-clear') clearOwn();
});
