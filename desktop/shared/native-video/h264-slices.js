// Inspeção de teste: apenas delimitação de NAL e primeiros campos do slice_header.
// Não decodifica imagens nem altera o fluxo. H.264, seções 7.3.3 / 7.4.3.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssH264Slices = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function units(bytes) {
    if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error('Tamanho H264 inválido.');
    let at = 0; const lengthNals = [];
    while (at + 4 <= bytes.length) {
      const size = bytes[at] * 16777216 + bytes[at + 1] * 65536 + bytes[at + 2] * 256 + bytes[at + 3];
      if (size < 1 || at + 4 + size > bytes.length) break;
      lengthNals.push(bytes.subarray(at + 4, at + 4 + size)); at += 4 + size;
      if (lengthNals.length > 512) throw new Error('NALs demais no quadro.');
    }
    if (at === bytes.length && lengthNals.length) return { format: 'avcc-4', nals: lengthNals };
    const starts = [];
    for (let i = 0; i + 2 < bytes.length; i++) {
      if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) { starts.push({ at: i, from: i + 3 }); i += 2; }
      else if (i + 3 < bytes.length && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) {
        starts.push({ at: i, from: i + 4 }); i += 3;
      }
      if (starts.length > 512) throw new Error('NALs demais no quadro.');
    }
    if (starts.length) {
      if (bytes.subarray(0, starts[0].at).some(value => value !== 0)) throw new Error('Prefixo Annex B inválido.');
      return { format: 'annex-b', nals: starts.map((start, i) => bytes.subarray(start.from, starts[i + 1]?.at ?? bytes.length)) };
    }
    throw new Error('Formato H264 não reconhecido; inspeção inconclusiva.');
  }
  function sliceType(nal) {
    // Os dois primeiros ue(v) cabem no prefixo; não percorre payload da imagem.
    const rbsp = []; let zeros = 0;
    for (let i = 1; i < nal.length && rbsp.length < 64; i++) {
      const value = nal[i];
      if (zeros >= 2 && value === 3) {
        if (i + 1 >= nal.length || nal[i + 1] > 3) throw new Error('Escape H264 inválido.');
        zeros = 0; continue;
      }
      rbsp.push(value); zeros = value === 0 ? zeros + 1 : 0;
    }
    let at = 0;
    const bit = () => { if (at >= rbsp.length * 8) throw new Error('Slice truncado.'); return (rbsp[at >> 3] >> (7 - (at++ & 7))) & 1; };
    const ue = () => {
      let count = 0; while (!bit()) if (++count > 30) throw new Error('ue(v) fora do limite de inspeção.');
      let suffix = 0; for (let i = 0; i < count; i++) suffix = suffix * 2 + bit();
      return 2 ** count - 1 + suffix;
    };
    ue(); const type = ue(); ue(); // first_mb_in_slice, slice_type, pic_parameter_set_id
    if (type > 9) throw new Error('slice_type inválido.');
    return ['P', 'B', 'I', 'SP', 'SI'][type % 5];
  }
  function analyze(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const { format, nals } = units(bytes);
    const result = { format, nals: nals.length, nalTypes: {}, slices: { P: 0, B: 0, I: 0, SP: 0, SI: 0 }, unsupportedVcl: 0 };
    for (const nal of nals) {
      if (!nal.length || nal[0] & 0x80 || !(nal[0] & 31)) throw new Error('Cabeçalho NAL inválido.');
      const type = nal[0] & 31; result.nalTypes[type] = (result.nalTypes[type] || 0) + 1;
      if ([1, 2, 5].includes(type)) {
        const slice = sliceType(nal);
        if (type === 5 && !['I', 'SI'].includes(slice)) throw new Error('Slice IDR incompatível.');
        result.slices[slice]++;
      } else if ([3, 4, 19, 20, 21].includes(type)) result.unsupportedVcl++;
      else if (![6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].includes(type)) throw new Error('Tipo NAL não reconhecido.');
    }
    return result;
  }
  function spsProfiles(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    const { nals } = units(bytes), profiles = new Set();
    for (const nal of nals) {
      if (!nal.length || nal[0] & 0x80 || !(nal[0] & 31)) throw new Error('Cabeçalho NAL inválido.');
      if ((nal[0] & 31) !== 7) continue;
      if (nal.length < 4) throw new Error('SPS truncado.');
      profiles.add(Array.from(nal.subarray(1, 4), b => b.toString(16).padStart(2, '0')).join(''));
    }
    return [...profiles].sort();
  }
  return { analyze, spsProfiles, units };
});
