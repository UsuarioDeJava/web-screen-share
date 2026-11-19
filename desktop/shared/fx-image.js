// Imagens próprias do mouse e do ping: lê os cursores do Windows (.cur e .ani, com a
// ponta que vem no arquivo), PNG, GIF e WebP, e deixa tudo pequeno e leve pra mandar pro
// servidor. Animação (.ani, ou GIF/WebP grande) vira PNG animado (APNG): mantém a
// transparência suave (o GIF só tem "transparente ou não") e qualquer navegador mostra.
//
// As partes que só mexem com bytes (parseIco, parseAni, decodeDib, assembleApng) não
// dependem da página e são testadas no Node; prepare/decodeFrames usam canvas.
(function () {
  'use strict';

  const MAX_SIDE = 128; // px: maior que isso, reduz
  const MAX_BYTES = 2 * 1024 * 1024; // o que vai pro servidor
  const MAX_INPUT = 12 * 1024 * 1024; // o arquivo escolhido
  const MAX_FRAMES = 120;

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const i32 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);
  const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));
  const fail = (msg) => { throw new Error(msg); };

  // ---------- .cur / .ico ----------

  // Entradas do arquivo: tamanho, a ponta (só .cur) e a imagem (PNG ou bitmap do Windows).
  function parseIco(bytes) {
    if (bytes.length < 22 || u16(bytes, 0) !== 0) fail('Esse arquivo de cursor não abriu.');
    const type = u16(bytes, 2); // 1: ícone, 2: cursor
    const count = u16(bytes, 4);
    if ((type !== 1 && type !== 2) || !count || count > 64 || bytes.length < 6 + count * 16) fail('Esse arquivo de cursor não abriu.');
    const entries = [];
    for (let i = 0; i < count; i += 1) {
      const o = 6 + i * 16;
      const size = u32(bytes, o + 8);
      const offset = u32(bytes, o + 12);
      if (size < 8 || offset + size > bytes.length) continue;
      const data = bytes.subarray(offset, offset + size);
      entries.push({
        w: bytes[o] || 256,
        h: bytes[o + 1] || 256,
        hotX: type === 2 ? u16(bytes, o + 4) : 0,
        hotY: type === 2 ? u16(bytes, o + 6) : 0,
        bpp: type === 1 ? u16(bytes, o + 6) : 0,
        png: data[0] === 0x89 && ascii(data, 1, 3) === 'PNG',
        cursor: type === 2,
        data,
      });
    }
    if (!entries.length) fail('Esse arquivo de cursor não tem imagem.');
    return entries;
  }

  // A melhor imagem do arquivo: a maior que caiba em 128 px (senão, a menor).
  function bestEntry(entries) {
    const fits = entries.filter((e) => e.w <= MAX_SIDE && e.h <= MAX_SIDE);
    const pool = fits.length ? fits : entries;
    return pool.slice().sort((a, b) => (fits.length ? b.w * b.h - a.w * a.h : a.w * a.h - b.w * b.h) || b.bpp - a.bpp)[0];
  }

  // Bitmap do Windows (o que vem dentro do .cur/.ico) -> RGBA. 1, 4, 8, 24 e 32 bits, com a
  // máscara de transparência.
  function decodeDib(data) {
    if (data.length < 40) fail('Imagem do cursor incompleta.');
    const header = u32(data, 0);
    const width = Math.abs(i32(data, 4));
    const height = Math.floor(Math.abs(i32(data, 8)) / 2); // vem dobrada: cor + máscara
    const bpp = u16(data, 14);
    const compression = u32(data, 16);
    if (header < 40 || !width || !height || width > 512 || height > 512) fail('Imagem do cursor com tamanho estranho.');
    if (![1, 4, 8, 24, 32].includes(bpp) || (compression !== 0 && compression !== 3)) fail('Esse tipo de cursor não é suportado.');
    let offset = header + (compression === 3 && header === 40 ? 12 : 0);
    let palette = null;
    if (bpp <= 8) {
      const n = u32(data, 32) || 1 << bpp;
      if (offset + n * 4 > data.length) fail('Imagem do cursor incompleta.');
      palette = [];
      for (let i = 0; i < n; i += 1) palette.push([data[offset + i * 4 + 2], data[offset + i * 4 + 1], data[offset + i * 4]]);
      offset += n * 4;
    }
    const rowBytes = Math.ceil((width * bpp) / 32) * 4;
    const maskRow = Math.ceil(width / 32) * 4;
    if (offset + rowBytes * height > data.length) fail('Imagem do cursor incompleta.');
    const maskStart = offset + rowBytes * height;
    const hasMask = maskStart + maskRow * height <= data.length;
    const rgba = new Uint8ClampedArray(width * height * 4);
    let ownAlpha = false;
    for (let y = 0; y < height; y += 1) {
      const row = offset + (height - 1 - y) * rowBytes; // de baixo pra cima
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (bpp === 32) {
          const p = row + x * 4;
          rgba[i] = data[p + 2];
          rgba[i + 1] = data[p + 1];
          rgba[i + 2] = data[p];
          rgba[i + 3] = data[p + 3];
          if (data[p + 3]) ownAlpha = true;
        } else if (bpp === 24) {
          const p = row + x * 3;
          rgba[i] = data[p + 2];
          rgba[i + 1] = data[p + 1];
          rgba[i + 2] = data[p];
          rgba[i + 3] = 255;
        } else {
          const bit = x * bpp;
          const byte = data[row + (bit >> 3)];
          const index = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
          const c = palette[index] || [0, 0, 0];
          rgba[i] = c[0];
          rgba[i + 1] = c[1];
          rgba[i + 2] = c[2];
          rgba[i + 3] = 255;
        }
      }
    }
    // Sem transparência própria: a máscara diz o que é transparente (1). Onde ela é 1 e a cor
    // não é preta, o Windows inverte a tela por baixo: aqui vira preto (o mais parecido).
    if (!ownAlpha && hasMask) {
      for (let y = 0; y < height; y += 1) {
        const row = maskStart + (height - 1 - y) * maskRow;
        for (let x = 0; x < width; x += 1) {
          if (!((data[row + (x >> 3)] >> (7 - (x & 7))) & 1)) continue;
          const i = (y * width + x) * 4;
          if (rgba[i] || rgba[i + 1] || rgba[i + 2]) {
            rgba[i] = 0;
            rgba[i + 1] = 0;
            rgba[i + 2] = 0;
          } else rgba[i + 3] = 0;
        }
      }
    }
    return { width, height, rgba };
  }

  // ---------- .ani (cursor animado do Windows) ----------

  // Os quadros (cada um um .cur/.ico), a ordem e quanto tempo cada passo fica (ms).
  function parseAni(bytes) {
    if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'ACON') fail('Esse .ani não abriu.');
    let header = null;
    let rates = null;
    let seq = null;
    const icons = [];
    const walk = (start, end, depth) => {
      let o = start;
      while (o + 8 <= end) {
        const id = ascii(bytes, o, 4);
        const size = u32(bytes, o + 4);
        const body = o + 8;
        if (body + size > end) break;
        if (id === 'anih' && size >= 36) {
          header = { frames: u32(bytes, body + 4), steps: u32(bytes, body + 8), rate: u32(bytes, body + 28), flags: u32(bytes, body + 32) };
        } else if (id === 'rate') {
          rates = [];
          for (let i = 0; i + 4 <= size && i < 4096; i += 4) rates.push(u32(bytes, body + i));
        } else if (id === 'seq ') {
          seq = [];
          for (let i = 0; i + 4 <= size && i < 4096; i += 4) seq.push(u32(bytes, body + i));
        } else if (id === 'LIST' && size >= 4 && depth < 2) {
          walk(body + 4, body + size, depth + 1);
        } else if (id === 'icon' && icons.length < MAX_FRAMES) {
          icons.push(bytes.subarray(body, body + size));
        }
        o = body + size + (size & 1);
      }
    };
    walk(12, Math.min(bytes.length, 8 + u32(bytes, 4)), 0);
    if (!icons.length) fail('Esse .ani não tem quadros.');
    const steps = Math.min(seq ? seq.length : (header && header.steps) || icons.length, MAX_FRAMES);
    const order = [];
    const delays = [];
    for (let i = 0; i < steps; i += 1) {
      const frame = seq ? seq[i] : i % icons.length;
      if (frame >= icons.length) continue;
      const jiffies = (rates && rates[i]) || (header && header.rate) || 6; // 1/60 s
      order.push(frame);
      delays.push(Math.max(20, Math.round((jiffies * 1000) / 60)));
    }
    if (!order.length) fail('Esse .ani não tem quadros.');
    return { icons, order, delays };
  }

  // ---------- PNG animado (APNG) ----------

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function pngChunks(png) {
    if (png.length < 8 || png[0] !== 0x89 || ascii(png, 1, 3) !== 'PNG') fail('PNG inválido.');
    const list = [];
    let o = 8;
    while (o + 12 <= png.length) {
      const len = be32(png, o);
      const type = ascii(png, o + 4, 4);
      if (o + 12 + len > png.length) break;
      list.push({ type, data: png.subarray(o + 8, o + 8 + len) });
      o += 12 + len;
      if (type === 'IEND') break;
    }
    return list;
  }

  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  // Junta PNGs do mesmo tamanho (um por quadro) num PNG animado. delays: ms de cada quadro.
  function assembleApng(pngs, delays) {
    if (!pngs.length) fail('Sem quadros.');
    const parsed = pngs.map(pngChunks);
    const ihdr = parsed[0].find((c) => c.type === 'IHDR');
    if (!ihdr) fail('PNG inválido.');
    const key = Array.from(ihdr.data).join(',');
    if (parsed.some((chunks) => { const h = chunks.find((c) => c.type === 'IHDR'); return !h || Array.from(h.data).join(',') !== key; })) {
      fail('Os quadros precisam ter o mesmo formato.');
    }
    const width = be32(ihdr.data, 0);
    const height = be32(ihdr.data, 4);
    const parts = [Uint8Array.from(SIGNATURE)];
    const chunk = (type, data) => {
      const out = new Uint8Array(12 + data.length);
      const view = new DataView(out.buffer);
      view.setUint32(0, data.length);
      for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
      out.set(data, 8);
      view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
      parts.push(out);
    };
    const be = (values) => {
      const out = new Uint8Array(values.reduce((n, [, size]) => n + size, 0));
      const view = new DataView(out.buffer);
      let o = 0;
      for (const [value, size] of values) {
        if (size === 4) view.setUint32(o, value);
        else if (size === 2) view.setUint16(o, value);
        else view.setUint8(o, value);
        o += size;
      }
      return out;
    };
    chunk('IHDR', ihdr.data);
    if (pngs.length > 1) chunk('acTL', be([[pngs.length, 4], [0, 4]])); // quantos quadros, repetir sempre
    let seq = 0;
    parsed.forEach((chunks, i) => {
      const delay = Math.min(65535, Math.max(10, Math.round(delays[i] || 100)));
      if (pngs.length > 1) chunk('fcTL', be([[seq++, 4], [width, 4], [height, 4], [0, 4], [0, 4], [delay, 2], [1000, 2], [0, 1], [0, 1]]));
      for (const c of chunks) {
        if (c.type !== 'IDAT') continue;
        if (i === 0) chunk('IDAT', c.data);
        else {
          const data = new Uint8Array(4 + c.data.length);
          new DataView(data.buffer).setUint32(0, seq++);
          data.set(c.data, 4);
          chunk('fdAT', data);
        }
      }
    });
    chunk('IEND', new Uint8Array(0));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  // ---------- no navegador ----------

  function sniff(bytes) {
    if (bytes.length < 12) return null;
    if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'image/gif';
    if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
    return null;
  }

  const makeCanvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  const toPng = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('Não deu pra preparar a imagem.'))), 'image/png');
  });
  // Cabe em 128 px (sem aumentar).
  const fit = (w, h) => {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
  };

  async function entryCanvas(entry) {
    if (entry.png) {
      const bitmap = await createImageBitmap(new Blob([entry.data], { type: 'image/png' }));
      const c = makeCanvas(bitmap.width, bitmap.height);
      c.getContext('2d').drawImage(bitmap, 0, 0);
      if (bitmap.close) bitmap.close();
      return c;
    }
    const dib = decodeDib(entry.data);
    const c = makeCanvas(dib.width, dib.height);
    c.getContext('2d').putImageData(new ImageData(dib.rgba, dib.width, dib.height), 0, 0);
    return c;
  }

  // Todos os quadros num tamanho só (o do maior, cabendo em 128 px). Pixel art pequena
  // não borra: sem suavizar quando só aumenta/mantém.
  function sameSize(canvases) {
    const w = Math.max(...canvases.map((c) => c.width));
    const h = Math.max(...canvases.map((c) => c.height));
    const [tw, th] = fit(w, h);
    return canvases.map((src) => {
      if (src.width === tw && src.height === th) return src;
      const c = makeCanvas(tw, th);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, (src.width / w) * tw, (src.height / h) * th);
      return c;
    });
  }

  // Os quadros de uma imagem animada (GIF, APNG, WebP), onde o navegador sabe (Chrome, Edge,
  // o app). [{ canvas, duration (ms) }]; null onde não dá.
  async function decodeFrames(data, type) {
    if (typeof ImageDecoder === 'undefined') return null;
    try {
      if (!(await ImageDecoder.isTypeSupported(type))) return null;
      const decoder = new ImageDecoder({ data, type });
      await decoder.tracks.ready;
      const track = decoder.tracks.selectedTrack;
      const count = Math.min((track && track.frameCount) || 1, MAX_FRAMES);
      const frames = [];
      for (let i = 0; i < count; i += 1) {
        const { image } = await decoder.decode({ frameIndex: i });
        const c = makeCanvas(image.displayWidth, image.displayHeight);
        c.getContext('2d').drawImage(image, 0, 0);
        frames.push({ canvas: c, duration: Math.max(20, Math.round((image.duration || 100000) / 1000)) });
        image.close();
      }
      decoder.close();
      return frames;
    } catch {
      return null;
    }
  }

  async function animated(canvases, delays) {
    const frames = sameSize(canvases);
    if (frames.length === 1) return new Blob([await toPng(frames[0])], { type: 'image/png' });
    const pngs = [];
    for (const c of frames) pngs.push(await toPng(c));
    return new Blob([assembleApng(pngs, delays)], { type: 'image/png' });
  }

  // O arquivo escolhido -> { blob, hx, hy } (a ponta em % da imagem; 0 se o arquivo não diz).
  // kind: 'cursor' (aceita .cur e .ani) ou 'ping'.
  async function prepare(file, kind = 'cursor') {
    if (!file || !file.size) fail('Escolha uma imagem.');
    if (file.size > MAX_INPUT) fail('Esse arquivo é grande demais (até 12 MB).');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = String(file.name || '').toLowerCase();
    let result = null;
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'ACON') {
      if (kind !== 'cursor') fail('Pro ping, use PNG, JPG, WebP ou GIF.');
      const ani = parseAni(bytes);
      const decoded = [];
      let hot = null;
      for (const icon of ani.icons) {
        const entry = bestEntry(parseIco(icon));
        if (!hot) hot = [entry.cursor ? entry.hotX / entry.w : 0, entry.cursor ? entry.hotY / entry.h : 0];
        decoded.push(await entryCanvas(entry));
      }
      const blob = await animated(ani.order.map((i) => decoded[i]), ani.delays);
      result = { blob, hx: hot[0], hy: hot[1] };
    } else if (bytes.length > 6 && u16(bytes, 0) === 0 && (u16(bytes, 2) === 2 || (u16(bytes, 2) === 1 && /\.(ico|cur)$/.test(name)))) {
      if (kind !== 'cursor') fail('Pro ping, use PNG, JPG, WebP ou GIF.');
      const entry = bestEntry(parseIco(bytes));
      const blob = await animated([await entryCanvas(entry)], [0]);
      result = { blob, hx: entry.cursor ? entry.hotX / entry.w : 0, hy: entry.cursor ? entry.hotY / entry.h : 0 };
    } else {
      const type = sniff(bytes);
      if (!type) fail(kind === 'cursor' ? 'Use PNG, GIF, WebP, .cur ou .ani.' : 'Use PNG, JPG, WebP ou GIF.');
      let bitmap;
      try {
        bitmap = await createImageBitmap(new Blob([bytes], { type }));
      } catch {
        fail('Não deu pra abrir essa imagem.');
      }
      const { width, height } = bitmap;
      // Pequena e leve: vai do jeito que está (GIF/APNG/WebP animados continuam animados).
      if (width <= MAX_SIDE && height <= MAX_SIDE && bytes.length <= MAX_BYTES) {
        if (bitmap.close) bitmap.close();
        result = { blob: new Blob([bytes], { type }), hx: 0, hy: 0 };
      } else {
        const frames = type === 'image/jpeg' ? null : await decodeFrames(bytes, type);
        if (frames && frames.length > 1) {
          result = { blob: await animated(frames.map((f) => f.canvas), frames.map((f) => f.duration)), hx: 0, hy: 0 };
        } else {
          const [w, h] = fit(width, height);
          const c = makeCanvas(w, h);
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(bitmap, 0, 0, w, h);
          result = { blob: new Blob([await toPng(c)], { type: 'image/png' }), hx: 0, hy: 0 };
        }
        if (bitmap.close) bitmap.close();
      }
    }
    if (result.blob.size > MAX_BYTES) fail('A imagem ficou grande demais (até 2 MB). Tente uma com menos quadros.');
    const pct = (v) => Math.max(0, Math.min(100, Math.round(v * 100)));
    return { blob: result.blob, hx: pct(result.hx), hy: pct(result.hy) };
  }

  const api = { MAX_SIDE, MAX_BYTES, parseIco, bestEntry, decodeDib, parseAni, crc32, pngChunks, assembleApng, sniff, decodeFrames, prepare };
  if (typeof window !== 'undefined') window.WssFxImage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
