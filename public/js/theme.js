// Tema da sala: um CSS próprio aplicado por cima de tudo (como os temas do Discord).
// Carrega no <head>, antes de desenhar a página, pra não piscar o tema padrão.
// Por enquanto sem tela: dá pra testar pelo console (veja THEMES.md):
//   WssTheme.set(':root { --accent-2-rgb: 255 120 200; --wallpaper: url("https://...") }')
//   WssTheme.clear()
(() => {
  const KEY = 'wss-theme-css';
  const style = document.getElementById('wss-theme');
  const read = () => {
    try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
  };
  const apply = (css) => { if (style) style.textContent = css; };
  apply(read());
  window.WssTheme = {
    get: read,
    set(css) {
      const text = String(css || '');
      try { localStorage.setItem(KEY, text); } catch { /* sem armazenamento: vale só nesta aba */ }
      apply(text);
    },
    clear() {
      try { localStorage.removeItem(KEY); } catch { /* idem */ }
      apply('');
    },
  };
})();
