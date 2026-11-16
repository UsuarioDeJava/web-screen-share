// Marcações da sua transmissão na sua tela de verdade: alguém apontou (Alt+clique),
// desenhou (Alt+arrastar) ou reagiu. Posições de 0 a 1 em relação à tela inteira.
const fx = document.getElementById('fx');
const SVG_NS = 'http://www.w3.org/2000/svg';
const strokes = new Map(); // "nome|id" -> { svg, path, points, expire }

const unit = (v) => Math.min(1, Math.max(0, Number(v) || 0));
const color = (hue) => `hsl(${(Number(hue) || 0) % 360} 95% 64%)`;
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

window.overlayBridge.onEvent((event) => {
  if (!event || typeof event !== 'object') return;
  if (event.type === 'ping') ping(event);
  else if (event.type === 'draw') draw(event);
  else if (event.type === 'react') react(event);
});
