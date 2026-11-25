// Seletor de tela/janela do app: miniaturas atualizando sozinhas, abas Telas/Janelas,
// som do PC (no Windows). Dois cliques numa opção já compartilham.
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const shareBtn = document.getElementById('share');
const audioRow = document.getElementById('audio-row');
const audioBox = document.getElementById('audio');
const windowAudioRow = document.getElementById('window-audio-row');
const windowAudioBox = document.getElementById('window-audio');
const hint = document.getElementById('hint');
const tabs = [...document.querySelectorAll('.tab')];

let info = { systemAudio: false, windowAudio: false, overlay: false };
let sources = [];
let kind = 'screen';
let selected = null;
let loaded = false;
const cards = new Map(); // id -> { card, img }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderHint() {
  const source = sources.find((s) => s.id === selected);
  const screenPicked = source ? source.kind === 'screen' : kind === 'screen';
  hint.classList.toggle('on', info.overlay && screenPicked);
  if (!info.overlay) hint.textContent = 'Quando alguém apontar ou desenhar na sua transmissão, aparece pra quem assiste.';
  else if (screenPicked) hint.textContent = 'Quando alguém apontar ou desenhar na sua transmissão, aparece aqui na sua tela também.';
  else hint.textContent = 'Compartilhando só uma janela, as marcações aparecem só pra quem assiste (pra ver na sua tela, escolha a tela inteira).';
}

// "Só o som deste programa": só pra janelas (e com o som ligado). Fica lembrado.
try { windowAudioBox.checked = localStorage.getItem('wss-window-audio') === '1'; } catch {}
windowAudioBox.addEventListener('change', () => {
  try { localStorage.setItem('wss-window-audio', windowAudioBox.checked ? '1' : '0'); } catch {}
});
audioBox.addEventListener('change', () => renderAudio());
const pickedWindow = () => {
  const source = sources.find((s) => s.id === selected);
  return source ? source.kind === 'window' : kind === 'window';
};
const audioOn = () => !info.systemAudio || audioBox.checked;
function renderAudio() {
  windowAudioRow.hidden = !info.windowAudio || !pickedWindow();
  windowAudioBox.disabled = !audioOn();
}

function select(id) {
  selected = id;
  for (const [key, { card }] of cards) {
    card.classList.toggle('selected', key === id);
    card.setAttribute('aria-pressed', String(key === id));
  }
  shareBtn.disabled = !id;
  renderHint();
  renderAudio();
}

function share() {
  if (selected) window.picker.choose(selected, info.systemAudio && audioBox.checked, info.windowAudio && pickedWindow() && audioOn() && windowAudioBox.checked);
}

function render() {
  const list = sources.filter((s) => s.kind === kind);
  empty.hidden = list.length > 0;
  if (!loaded) empty.textContent = 'Procurando telas e janelas…';
  else empty.textContent = kind === 'screen' ? 'Nenhuma tela encontrada.' : 'Nenhuma janela aberta pra compartilhar.';
  const wanted = new Set(list.map((s) => s.id));
  for (const [id, { card }] of cards) {
    if (!wanted.has(id)) {
      card.remove();
      cards.delete(id);
    }
  }
  for (const source of list) {
    let entry = cards.get(source.id);
    if (!entry) {
      const card = el('button', 'source');
      card.type = 'button';
      const thumb = el('div', 'thumb');
      const img = el('img');
      img.alt = '';
      thumb.append(img);
      const label = el('div', 'label');
      if (source.icon) {
        const iconImg = el('img');
        iconImg.src = source.icon;
        iconImg.alt = '';
        label.append(iconImg);
      }
      label.append(el('span', null, source.name));
      card.title = source.name;
      card.append(thumb, label);
      card.addEventListener('click', () => select(source.id));
      card.addEventListener('dblclick', () => {
        select(source.id);
        share();
      });
      entry = { card, img };
      cards.set(source.id, entry);
    }
    if (source.thumbnail && entry.img.getAttribute('src') !== source.thumbnail) entry.img.src = source.thumbnail;
  }
  // Só mexe na ordem se ela mudou (mexer nos cartões atrapalharia um clique duplo).
  const order = list.map((s) => cards.get(s.id).card);
  const same = order.length === grid.children.length && order.every((card, i) => grid.children[i] === card);
  if (!same) grid.replaceChildren(...order);
  if (selected && !sources.some((s) => s.id === selected)) select(null);
  if (!selected && kind === 'screen' && list.length === 1) select(list[0].id);
}

// Miniaturas "ao vivo": busca de novo 3 s depois da última busca terminar (cada busca
// pode demorar uns segundos; buscas sobrepostas travam).
let refreshTimer = null, refreshing = false, closed = false;
async function refresh() {
  clearTimeout(refreshTimer); refreshTimer = null;
  if (closed || document.hidden || refreshing) return;
  refreshing = true;
  try {
    const found = await window.picker.sources();
    if (closed) return;
    if (found.length || loaded) sources = found;
    loaded = loaded || found.length > 0;
  } catch {
    // tenta de novo na próxima
  }
  finally { refreshing = false; }
  if (closed || document.hidden) return;
  render();
  refreshTimer = setTimeout(refresh, loaded ? 3000 : 500);
}
document.addEventListener('visibilitychange', refresh);
window.addEventListener('pagehide', () => { closed = true; clearTimeout(refreshTimer); refreshTimer = null; }, { once: true });

function setKind(next) {
  kind = next;
  for (const tab of tabs) {
    const on = tab.dataset.kind === kind;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
  }
  const current = sources.find((s) => s.id === selected);
  if (current && current.kind !== kind) select(null);
  render();
  renderHint();
  renderAudio();
}

tabs.forEach((tab) => tab.addEventListener('click', () => setKind(tab.dataset.kind)));
shareBtn.addEventListener('click', share);
document.getElementById('cancel').addEventListener('click', () => window.picker.cancel());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.picker.cancel();
  else if (event.key === 'Enter' && selected) share();
});

(async () => {
  info = await window.picker.info();
  if(info.nativeWindow){setKind('window');for(const tab of tabs)tab.hidden=tab.dataset.kind==='screen';}
  audioRow.hidden = !info.systemAudio;
  renderHint();
  renderAudio();
  render();
  refresh();
})();
