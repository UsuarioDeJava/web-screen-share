(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WssColor = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const clampByte = (v) => Math.round(Math.min(255, Math.max(0, Number(v) || 0)));
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const rgbToHex = (...rgb) => `#${rgb.map((v) => clampByte(v).toString(16).padStart(2, '0')).join('')}`;
  function hsvToRgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255; };
    return [f(5), f(3), f(1)];
  }
  function rgbToHsv(r, g, b) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B), d = max - Math.min(R, G, B);
    let h = 0;
    if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }
  function hslToHex(h, s, l) {
    const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
    const f = (n) => { const k = (n + h / 30) % 12; return (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255; };
    return rgbToHex(f(0), f(8), f(4));
  }
  function normalizeHex(raw) {
    const text = String(raw ?? '').trim().toLowerCase();
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(text);
    if (rgb) return rgbToHex(...rgb.slice(1, 4));
    const hex = text.replace(/^#/, '');
    if (/^[0-9a-f]{3}$/.test(hex)) return `#${[...hex].map((c) => c + c).join('')}`;
    return /^[0-9a-f]{6}$/.test(hex) ? `#${hex}` : null;
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const inkFor = (hex) => luminance(hex) > 0.36 ? '#12141c' : '#ffffff';
  const hexHue = (hex) => Math.round(rgbToHsv(...hexToRgb(hex)).h) % 360;
  function autoHue(name) { let hash = 0; for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) >>> 0; return hash % 360; }
  function paletteFromPixels(data) {
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2]; buckets.set(key, b);
    }
    const ranked = [...buckets.values()].map((b) => {
      const rgb = [b.r / b.n, b.g / b.n, b.b / b.n], { s, v } = rgbToHsv(...rgb);
      return { rgb, score: b.n * (0.3 + s) * (v < 0.15 ? 0.15 : 1) };
    }).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const { rgb } of ranked) {
      if (picked.every((p) => Math.hypot(p[0] - rgb[0], p[1] - rgb[1], p[2] - rgb[2]) > 64)) picked.push(rgb);
      if (picked.length === 6) break;
    }
    return picked.map((rgb) => rgbToHex(...rgb));
  }
  function createPaletteCache(load) {
    let currentUrl, current;
    return (url) => {
      if (url !== currentUrl || !current) {
        currentUrl = url;
        current = url ? Promise.resolve().then(() => load(url)).catch(() => { if (currentUrl === url) current = null; return []; }) : Promise.resolve([]);
      }
      return current.then((colors) => [...colors]);
    };
  }
  const loadPalette = createPaletteCache(async (url) => {
    const image = new Image(); image.src = url;
    let timer;
    try {
      await Promise.race([image.decode(), new Promise((_, reject) => { timer = setTimeout(() => { image.src = ''; reject(new Error('Tempo de leitura da foto excedido.')); }, 8000); })]);
    } finally { clearTimeout(timer); }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, 48, 48);
    return paletteFromPixels(ctx.getImageData(0, 0, 48, 48).data);
  });
  return { clampByte, hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, hslToHex, hexHue, normalizeHex, luminance, contrast, inkFor, autoHue, paletteFromPixels, createPaletteCache, loadPalette };
});
