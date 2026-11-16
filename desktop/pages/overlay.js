// Marcações da sua transmissão na sua tela de verdade: alguém apontou (Alt+clique),
// desenhou (Alt+arrastar) ou reagiu. Posições de 0 a 1 em relação à tela inteira.
const fx = document.getElementById('fx');
const SVG_NS = 'http://www.w3.org/2000/svg';
const strokes = new Map(); // "nome|id" -> { svg, path, points, expire }

const unit = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const color = (hue) => (Number(hue) === -1 ? '#ffffff' : `hsl(${(Number(hue) || 0) % 360} 95% 64%)`);
const text = (v) => String(v == null ? '' : v).slice(0, 40);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function ping({ x, y, name, hue }) {
  const mark = el('div', 'ping');
  mark.style.left = `${unit(x) * 100}%`;
  mark.style.top = `${unit(y) * 100}%`;
  mark.style.setProperty('--c', color(hue));
  mark.classList.toggle('flip', unit(x) > 0.8);
  mark.append(el('span', 'ping-ring'), el('span', 'ping-ring'), el('span', 'ping-dot'), el('span', 'ping-name', text(name)));
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

function finishStroke(key, stroke) {
  strokes.delete(key);
  clearTimeout(stroke.expire);
  stroke.svg.classList.add('fading');
  stroke.svg.addEventListener('animationend', () => stroke.svg.remove());
}

function draw({ key, points, end, hue }) {
  if (typeof key !== 'string' || !Array.isArray(points)) return;
  let stroke = strokes.get(key);
  if (!stroke) {
    if (!points.length) return;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'draw');
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.setProperty('--c', color(hue));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(path);
    fx.append(svg);
    stroke = { svg, path, points: [], expire: null };
    strokes.set(key, stroke);
  }
  for (const v of points.slice(0, 256)) {
    if (stroke.points.length < 2400) stroke.points.push(unit(v));
  }
  stroke.path.setAttribute('d', strokePath(stroke.points));
  clearTimeout(stroke.expire);
  if (end) finishStroke(key, stroke);
  else stroke.expire = setTimeout(() => finishStroke(key, stroke), 5000);
}

function react({ emoji, name, hue }) {
  const items = fx.querySelectorAll('.react');
  for (let i = 0; i <= items.length - 20; i += 1) items[i].remove();
  const item = el('div', 'react');
  item.style.left = `${78 + Math.random() * 18}%`;
  item.style.setProperty('--drift', `${Math.round(Math.random() * 60 - 30)}px`);
  item.style.setProperty('--c', color(hue));
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
let picked = null; // cor escolhida na barrinha (null: a sua cor)
let current = null; // traço sendo desenhado agora
let ownCounter = 0;

const activeHue = () => (picked === null ? myHue : picked);

function renderColors() {
  document.body.style.setProperty('--mine', color(activeHue()));
  colorsEl.replaceChildren(...PALETTE.map((option) => {
    const swatch = el('button', 'swatch');
    swatch.type = 'button';
    swatch.title = option.name;
    swatch.style.setProperty('--c', color(option.hue === null ? myHue : option.hue));
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
  svg.style.setProperty('--c', color(hue));
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  fx.append(svg);
  ownCounter += 1;
  return { id: ownCounter, hue, svg, path, points: [], pending: [], timer: null };
}

// Sai em pedaços a cada 30 ms enquanto você desenha; sem limite de tamanho.
function flush(stroke, end = false) {
  clearTimeout(stroke.timer);
  stroke.timer = null;
  if (!stroke.pending.length && !end) return;
  window.overlayBridge.draw({ id: stroke.id, points: stroke.pending.splice(0), end, hue: stroke.hue });
}

function addPoint(stroke, clientX, clientY) {
  const x = Math.round(unit(clientX / innerWidth) * 10000) / 10000;
  const y = Math.round(unit(clientY / innerHeight) * 10000) / 10000;
  const n = stroke.points.length;
  if (n && Math.hypot(x - stroke.points[n - 2], y - stroke.points[n - 1]) < 0.0008) return;
  stroke.points.push(x, y);
  stroke.pending.push(x, y);
  stroke.path.setAttribute('d', strokePath(stroke.points));
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

function setDrawMode(on, hue) {
  if (Number.isInteger(hue)) myHue = hue;
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
  addPoint(current, event.clientX, event.clientY);
});
board.addEventListener('pointermove', (event) => {
  if (!current) return;
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

window.overlayBridge.onEvent((event) => {
  if (!event || typeof event !== 'object') return;
  if (event.type === 'ping') ping(event);
  else if (event.type === 'draw') draw(event);
  else if (event.type === 'react') react(event);
  else if (event.type === 'draw-mode') setDrawMode(Boolean(event.on), event.hue);
  else if (event.type === 'draw-undo') undo();
  else if (event.type === 'draw-clear') clearOwn();
});
