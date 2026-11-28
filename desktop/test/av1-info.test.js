// AV1 de 10 bits não aparece no navegador: o app lê a profundidade de cor do cabeçalho de
// sequência (nos pacotes RTP do OBS) pra avisar quem transmite.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sequenceHeader, rtpSequenceHeader } = require('../av1-info');

// Cabeçalhos de sequência reais (SVT-AV1), tirados de vídeos do ffmpeg.
const SVT_8 = Buffer.from('0000002d4cffb3c6af9004', 'hex');
const SVT_10 = Buffer.from('0000002d4cffb3c6af9404', 'hex');

test('cabeçalho de sequência: perfil e bits', () => {
  assert.deepEqual(sequenceHeader(SVT_8), { profile: 0, bitDepth: 8 });
  assert.deepEqual(sequenceHeader(SVT_10), { profile: 0, bitDepth: 10 });
  assert.equal(sequenceHeader(Buffer.from([0])), null, 'cortado: não chuta');
});

test('pacote RTP AV1: acha o cabeçalho no primeiro OBU (com e sem tamanho)', () => {
  const obu = (body, withSize) => Buffer.concat([Buffer.from([withSize ? 0x0a : 0x08]), withSize ? Buffer.from([body.length]) : Buffer.alloc(0), body]);
  // W=1: um OBU só, sem tamanho na frente.
  assert.deepEqual(rtpSequenceHeader(Buffer.concat([Buffer.from([0x18]), obu(SVT_10)])), { profile: 0, bitDepth: 10 });
  // W=0: cada OBU com o tamanho (leb128) na frente.
  const first = obu(SVT_8);
  assert.deepEqual(rtpSequenceHeader(Buffer.concat([Buffer.from([0x08, first.length]), first, Buffer.from([3, 0x32, 1, 2])])), { profile: 0, bitDepth: 8 });
  // O OBU com obu_has_size_field.
  assert.deepEqual(rtpSequenceHeader(Buffer.concat([Buffer.from([0x18]), obu(SVT_10, true)])), { profile: 0, bitDepth: 10 });
  assert.equal(rtpSequenceHeader(Buffer.concat([Buffer.from([0x98]), obu(SVT_10)])), null, 'Z=1: continuação, não é começo de OBU');
  assert.equal(rtpSequenceHeader(Buffer.from([0x18, 0x32, 1, 2, 3])), null, 'outro tipo de OBU (quadro)');
});

test('cabeçalho de sequência só no começo (NVENC): o app coloca de volta em cada quadro-chave', () => {
  const { createSequenceHeaderRepeater } = require('../av1-info');
  const rtp = (ts, payload, seq = 0) => { const h = Buffer.alloc(12); h[0] = 0x80; h[1] = 96; h.writeUInt16BE(seq, 2); h.writeUInt32BE(ts, 4); return Buffer.concat([h, payload]); };
  const seqObu = Buffer.concat([Buffer.from([0x08]), SVT_8]);
  const key = Buffer.from([0x30, 0x10, 1, 2, 3]); // OBU_FRAME: show_existing_frame=0, frame_type=0 (chave)
  const inter = Buffer.from([0x30, 0x30, 1, 2, 3]); // frame_type=1
  const r = createSequenceHeaderRepeater();
  const first = [rtp(1000, Buffer.concat([Buffer.from([0x10]), seqObu])), rtp(1000, Buffer.concat([Buffer.from([0x10]), key]))];
  for (const p of first) assert.equal(r.packet(p), p, 'o primeiro quadro-chave já tem o cabeçalho');
  assert.deepEqual(r.info(), { profile: 0, bitDepth: 8 });
  const p3 = rtp(4000, Buffer.concat([Buffer.from([0x10]), inter]));
  assert.equal(r.packet(p3), p3, 'quadro comum: igual');
  const p4 = rtp(7000, Buffer.concat([Buffer.from([0x50]), key])); // Y=1 (continua no próximo)
  const out = r.packet(p4);
  assert.notEqual(out, p4);
  assert.equal(r.injected(), 1);
  assert.deepEqual(out.subarray(0, 12), p4.subarray(0, 12), 'mesmo cabeçalho RTP');
  const payload = out.subarray(12);
  assert.equal(payload[0], 0x48, 'Y continua, W=0 (todos com tamanho), N=1');
  assert.deepEqual(payload.subarray(1, 2 + seqObu.length), Buffer.concat([Buffer.from([seqObu.length]), seqObu]), 'o cabeçalho de sequência vem primeiro');
  assert.deepEqual(payload.subarray(2 + seqObu.length), Buffer.concat([Buffer.from([key.length]), key]), 'e o quadro-chave depois, inteiro');
  const p5 = rtp(7000, Buffer.from([0x90, 9, 9, 9]));
  assert.equal(r.packet(p5), p5, 'o resto do mesmo quadro: igual');
  const p6 = rtp(7000, Buffer.concat([Buffer.from([0x10]), key]));
  assert.equal(r.packet(p6), p6, 'no mesmo quadro, não coloca duas vezes');
});
