const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const img = require('../shared/fx-image');

// ---- arquivos de mentira, montados byte a byte

const le = (n, size) => {
  const b = Buffer.alloc(size);
  if (size === 2) b.writeUInt16LE(n);
  else b.writeUInt32LE(n >>> 0);
  return b;
};

// Bitmap do Windows (como vem dentro do .cur): altura dobrada, de baixo pra cima.
function dib(width, height, bpp, rows, mask, palette = []) {
  const header = Buffer.concat([
    le(40, 4), le(width, 4), le(height * 2, 4), le(1, 2), le(bpp, 2), le(0, 4), le(0, 4),
    le(0, 4), le(0, 4), le(palette.length, 4), le(0, 4),
  ]);
  const pal = Buffer.concat(palette.map(([r, g, b]) => Buffer.from([b, g, r, 0])));
  const rowBytes = Math.ceil((width * bpp) / 32) * 4;
  const xor = Buffer.alloc(rowBytes * height);
  rows.forEach((row, y) => Buffer.from(row).copy(xor, (height - 1 - y) * rowBytes));
  const maskRow = Math.ceil(width / 32) * 4;
  const and = Buffer.alloc(maskRow * height);
  mask.forEach((row, y) => Buffer.from(row).copy(and, (height - 1 - y) * maskRow));
  return Buffer.concat([header, pal, xor, and]);
}

function cur(images, type = 2) {
  const head = Buffer.concat([le(0, 2), le(type, 2), le(images.length, 2)]);
  let offset = 6 + images.length * 16;
  const dir = [];
  for (const im of images) {
    dir.push(Buffer.concat([Buffer.from([im.w, im.h, 0, 0]), le(im.hotX || 0, 2), le(im.hotY || 0, 2), le(im.data.length, 4), le(offset, 4)]));
    offset += im.data.length;
  }
  return new Uint8Array(Buffer.concat([head, ...dir, ...images.map((im) => im.data)]));
}

function riffChunk(id, data) {
  const pad = data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(id, 'latin1'), le(data.length, 4), data, pad]);
}

// PNG de verdade (RGBA 8 bits), pra montar o animado.
function png(width, height, rgba) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'latin1'), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (width * 4 + 1) + 1);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

test('.cur de 32 bits: a imagem com transparência e a ponta do arquivo', () => {
  // 2×2: vermelho opaco, verde meio transparente / azul opaco, transparente.
  const rows = [[0, 0, 255, 255, 0, 255, 0, 128], [255, 0, 0, 255, 0, 0, 0, 0]];
  const file = cur([{ w: 2, h: 2, hotX: 1, hotY: 0, data: dib(2, 2, 32, rows, [[0, 0, 0, 0], [0, 0, 0, 0]]) }]);
  const entries = img.parseIco(file);
  assert.equal(entries.length, 1);
  assert.deepEqual([entries[0].w, entries[0].h, entries[0].hotX, entries[0].hotY, entries[0].cursor, entries[0].png], [2, 2, 1, 0, true, false]);
  const out = img.decodeDib(entries[0].data);
  assert.deepEqual([out.width, out.height], [2, 2]);
  assert.deepEqual(Array.from(out.rgba), [255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 0, 0, 0, 0]);
});

test('.cur de 1 bit: a máscara diz o que é transparente', () => {
  // Paleta preto/branco. Linha 0: branco, preto. Linha 1: (máscara) transparente, branco.
  const rows = [[0b10000000], [0b01000000]];
  const mask = [[0b00000000], [0b10000000]];
  const file = cur([{ w: 2, h: 2, data: dib(2, 2, 1, rows, mask, [[0, 0, 0], [255, 255, 255]]) }]);
  const out = img.decodeDib(img.parseIco(file)[0].data);
  assert.deepEqual(Array.from(out.rgba), [255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
});

test('vários tamanhos no .cur: fica o maior que cabe em 128 px', () => {
  const small = { w: 16, h: 16, data: dib(16, 16, 32, [], []) };
  const big = { w: 48, h: 48, hotX: 6, hotY: 4, data: dib(48, 48, 32, [], []) };
  const huge = { w: 0, h: 0, data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(20)]) }; // 256 (PNG)
  const best = img.bestEntry(img.parseIco(cur([small, big, huge])));
  assert.deepEqual([best.w, best.hotX, best.hotY], [48, 6, 4]);
});

test('.ani: quadros, a ordem (seq) e o tempo de cada passo (rate)', () => {
  const frame = (hot) => Buffer.from(cur([{ w: 2, h: 2, hotX: hot, hotY: hot, data: dib(2, 2, 32, [], []) }]));
  const anih = Buffer.concat([le(36, 4), le(2, 4), le(3, 4), le(0, 4), le(0, 4), le(0, 4), le(0, 4), le(6, 4), le(3, 4)]);
  const rate = Buffer.concat([le(6, 4), le(12, 4), le(3, 4)]);
  const seq = Buffer.concat([le(0, 4), le(1, 4), le(0, 4)]);
  const list = Buffer.concat([Buffer.from('fram', 'latin1'), riffChunk('icon', frame(1)), riffChunk('icon', frame(0))]);
  const body = Buffer.concat([Buffer.from('ACON', 'latin1'), riffChunk('anih', anih), riffChunk('rate', rate), riffChunk('seq ', seq), riffChunk('LIST', list)]);
  const file = new Uint8Array(Buffer.concat([Buffer.from('RIFF', 'latin1'), le(body.length, 4), body]));
  const ani = img.parseAni(file);
  assert.equal(ani.icons.length, 2);
  assert.deepEqual(ani.order, [0, 1, 0]);
  assert.deepEqual(ani.delays, [100, 200, 50]);
  assert.equal(img.parseIco(ani.icons[0])[0].hotX, 1);
  assert.throws(() => img.parseAni(new Uint8Array(Buffer.from('RIFF....AVI ', 'latin1'))));
});

test('PNG animado: quadros na ordem, tempos e CRC certos', () => {
  const red = png(2, 2, new Uint8Array(16).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0)));
  const blue = png(2, 2, new Uint8Array(16).map((_, i) => (i % 4 === 2 || i % 4 === 3 ? 255 : 0)));
  const apng = img.assembleApng([red, blue, red], [100, 250, 40]);
  const chunks = img.pngChunks(apng);
  assert.deepEqual(chunks.map((c) => c.type), ['IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'IEND']);
  const actl = Buffer.from(chunks[1].data);
  assert.deepEqual([actl.readUInt32BE(0), actl.readUInt32BE(4)], [3, 0]);
  const fctl = chunks.filter((c) => c.type === 'fcTL').map((c) => Buffer.from(c.data));
  assert.deepEqual(fctl.map((b) => [b.readUInt32BE(0), b.readUInt32BE(4), b.readUInt16BE(20), b.readUInt16BE(22)]), [[0, 2, 100, 1000], [1, 2, 250, 1000], [3, 2, 40, 1000]]);
  // Os números de sequência são um só pra fcTL e fdAT (o 1º quadro vai em IDAT, sem número); todo CRC confere.
  assert.deepEqual(chunks.filter((c) => c.type === 'fdAT').map((c) => Buffer.from(c.data).readUInt32BE(0)), [2, 4]);
  let o = 8;
  while (o < apng.length) {
    const len = Buffer.from(apng).readUInt32BE(o);
    const crc = Buffer.from(apng).readUInt32BE(o + 8 + len);
    assert.equal(img.crc32(apng.subarray(o + 4, o + 8 + len)), crc);
    o += 12 + len;
  }
  // Um quadro só: PNG comum (sem acTL/fcTL).
  assert.deepEqual(img.pngChunks(img.assembleApng([red], [0])).map((c) => c.type), ['IHDR', 'IDAT', 'IEND']);
  assert.throws(() => img.assembleApng([red, png(3, 3, new Uint8Array(36))], [1, 1]));
});

test('arquivos estranhos não quebram nada (dão erro com mensagem)', () => {
  assert.throws(() => img.parseIco(new Uint8Array([0, 0, 2, 0, 1, 0])), /cursor/);
  assert.throws(() => img.decodeDib(new Uint8Array(10)), /cursor/);
  const lying = cur([{ w: 2, h: 2, data: dib(2, 2, 32, [], []) }]);
  lying[6 + 8] = 0xff; // tamanho da imagem maior que o arquivo
  assert.throws(() => img.parseIco(lying));
  assert.equal(img.sniff(new Uint8Array(Buffer.from('GIF89a......', 'latin1'))), 'image/gif');
  assert.equal(img.sniff(new Uint8Array(12)), null);
});
