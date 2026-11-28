// AV1 de 10 bits (NVENC com o OBS em P010/HDR) não aparece no navegador: o decodificador
// AV1 do WebRTC só aceita 8 bits. Daqui sai o perfil e a profundidade de cor do cabeçalho
// de sequência (AV1, seção 5.5), lido nos pacotes RTP que passam pelo app.

function reader(bytes) {
  let pos = 0; // em bits
  const bit = () => {
    if (pos >= bytes.length * 8) throw Error('fim');
    const value = (bytes[pos >> 3] >> (7 - (pos & 7))) & 1;
    pos += 1;
    return value;
  };
  const f = (n) => { let v = 0; for (let i = 0; i < n; i += 1) v = v * 2 + bit(); return v; };
  const uvlc = () => { let zeros = 0; while (!bit()) { zeros += 1; if (zeros >= 32) return 2 ** 32 - 1; } return zeros ? f(zeros) + (2 ** zeros - 1) : 0; };
  return { f, uvlc };
}

// Corpo do OBU de cabeçalho de sequência -> { profile, bitDepth } (null se não der pra ler).
function sequenceHeader(body) {
  try {
    const { f, uvlc } = reader(body);
    const profile = f(3);
    f(1); // still_picture
    const reduced = f(1);
    let decoderModel = 0, delayLength = 0;
    if (reduced) f(5);
    else {
      if (f(1)) { // timing_info
        f(32); f(32);
        if (f(1)) uvlc();
        decoderModel = f(1);
        if (decoderModel) { delayLength = f(5) + 1; f(32); f(5); f(5); }
      }
      const initialDelay = f(1);
      const points = f(5) + 1;
      for (let i = 0; i < points; i += 1) {
        f(12);
        if (f(5) > 7) f(1);
        if (decoderModel && f(1)) { f(delayLength); f(delayLength); f(1); }
        if (initialDelay && f(1)) f(4);
      }
    }
    const widthBits = f(4) + 1, heightBits = f(4) + 1;
    f(widthBits); f(heightBits);
    if (!reduced && f(1)) { f(4); f(3); } // frame_id_numbers
    f(1); f(1); f(1); // 128x128, filter_intra, intra_edge
    if (!reduced) {
      f(1); f(1); f(1); f(1); // interintra, masked, warped, dual_filter
      const orderHint = f(1);
      if (orderHint) { f(1); f(1); }
      const screen = f(1) ? 2 : f(1);
      if (screen > 0 && !f(1)) f(1);
      if (orderHint) f(3);
    }
    f(1); f(1); f(1); // superres, cdef, restoration
    const high = f(1);
    const bitDepth = profile === 2 && high ? (f(1) ? 12 : 10) : high ? 10 : 8;
    return { profile, bitDepth, ...(reduced ? { reduced: true } : {}) };
  } catch { return null; }
}

function leb128(bytes, start) {
  let value = 0, i = start;
  for (let n = 0; n < 8 && i < bytes.length; n += 1, i += 1) {
    value += (bytes[i] & 127) * 2 ** (7 * n);
    if (!(bytes[i] & 128)) return { value, next: i + 1 };
  }
  return null;
}

// Carga útil de um pacote RTP AV1 (RFC do AV1 em RTP): o cabeçalho de sequência vem como
// o primeiro OBU de um pacote que começa um OBU (Z=0). Devolve { profile, bitDepth } ou null.
function rtpSequenceHeader(payload) {
  if (!payload || payload.length < 3) return null;
  const agg = payload[0];
  if (agg & 0x80) return null; // continua um OBU do pacote anterior
  const count = (agg >> 4) & 3;
  let start = 1, end = payload.length;
  if (count !== 1) {
    const len = leb128(payload, 1);
    if (!len) return null;
    start = len.next; end = Math.min(payload.length, start + len.value);
  }
  const header = payload[start];
  if (header === undefined || ((header >> 3) & 15) !== 1) return null; // 1: OBU_SEQUENCE_HEADER
  let i = start + 1 + ((header >> 2) & 1);
  if (header & 2) { // obu_has_size_field
    const size = leb128(payload, i);
    if (!size) return null;
    i = size.next; end = Math.min(end, i + size.value);
  }
  return sequenceHeader(payload.subarray(i, end));
}

// Os OBUs de um pacote RTP AV1: W (bits 5-4 do cabeçalho de agregação) diz quantos; com
// W=0 todos têm o tamanho (leb128) na frente; com W>0, o último vai até o fim do pacote.
function elements(payload) {
  if (!payload || payload.length < 2) return null;
  const agg = payload[0];
  const count = (agg >> 4) & 3;
  const list = [];
  let i = 1;
  while (i < payload.length) {
    let end = payload.length;
    if (count === 0 || list.length < count - 1) {
      const len = leb128(payload, i);
      if (!len || len.next + len.value > payload.length) return null;
      i = len.next; end = i + len.value;
    }
    list.push({ start: i, end });
    i = end;
    if (count && list.length === count) break;
  }
  return { agg, list };
}

const obuType = (payload, el) => (payload[el.start] >> 3) & 15;
function obuBody(payload, el) {
  const h = payload[el.start];
  let i = el.start + 1 + ((h >> 2) & 1);
  if (h & 2) { const size = leb128(payload, i); if (!size) return -1; i = size.next; }
  return i;
}
function leb128Bytes(value) {
  const out = [];
  do { let b = value & 127; value = Math.floor(value / 128); if (value) b |= 128; out.push(b); } while (value);
  return Buffer.from(out);
}

// Alguns codificadores (a NVENC AV1 do OBS, por exemplo) mandam o cabeçalho de sequência
// só no começo da transmissão. Quem entra depois não decodifica nada, por mais quadros-chave
// que cheguem (tela preta). Isto guarda o cabeçalho e coloca de volta em cada quadro-chave
// que vier sem ele. packet(rtp) devolve o pacote (o mesmo ou um novo, com o cabeçalho).
function createSequenceHeaderRepeater() {
  let seq = null, info = null, seqTs = null, injected = 0;
  return {
    info: () => info,
    injected: () => injected,
    packet(rtp) {
      const payload = rtp.subarray(12);
      const parsed = elements(payload);
      if (!parsed) return rtp;
      const ts = rtp.readUInt32BE(4);
      const continued = (parsed.agg & 0x80) !== 0;
      for (let k = 0; k < parsed.list.length; k += 1) {
        if (k === 0 && continued) continue; // pedaço de um OBU do pacote anterior
        const el = parsed.list[k];
        const type = obuType(payload, el);
        if (type === 1) {
          const body = obuBody(payload, el);
          if (body < 0) return rtp;
          const h = payload[el.start];
          seq = Buffer.concat([payload.subarray(el.start, el.start + 1 + ((h >> 2) & 1)), payload.subarray(body, el.end)]);
          seq[0] = h & ~2; // sem o campo de tamanho, como manda o RTP do AV1
          info = sequenceHeader(payload.subarray(body, el.end)) || info;
          seqTs = ts;
          return rtp;
        }
        if (type !== 3 && type !== 6) continue; // só o cabeçalho de quadro (ou quadro inteiro)
        if (!seq || seqTs === ts) return rtp;
        const body = obuBody(payload, el);
        if (body < 0 || body >= el.end) return rtp;
        // Sem reduced_still_picture_header: show_existing_frame (1 bit) e frame_type (2 bits; 0 = chave).
        const key = info && info.reduced ? true : !(payload[body] & 0x80) && ((payload[body] >> 5) & 3) === 0;
        if (!key) return rtp;
        seqTs = ts; injected += 1;
        const parts = [rtp.subarray(0, 12), Buffer.from([(parsed.agg & 0xc0) | 0x08])]; // W=0 (todos com tamanho), N=1
        parsed.list.forEach((item, i) => {
          if (i === k) parts.push(leb128Bytes(seq.length), seq);
          parts.push(leb128Bytes(item.end - item.start), payload.subarray(item.start, item.end));
        });
        return Buffer.concat(parts);
      }
      return rtp;
    },
  };
}

module.exports = { sequenceHeader, rtpSequenceHeader, createSequenceHeaderRepeater };
