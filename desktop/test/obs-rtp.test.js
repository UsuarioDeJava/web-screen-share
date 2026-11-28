// Repasse do OBS/câmera: achar o começo de um quadro-chave nos pacotes RTP, os pedidos de
// quadro-chave (PLI/FIR) de quem assiste e o que o servidor relata (perda, NACK).
const test = require('node:test');
const assert = require('node:assert/strict');
const { keyframeStart, keyframeRequest, receiverLoss, nackedSequences } = require('../obs-rtp');

test('H.264: IDR e SPS sozinhos, em STAP-A e no primeiro pedaço do FU-A', () => {
  assert.equal(keyframeStart(Buffer.from([0x65, 1]), 'H264'), true, 'IDR');
  assert.equal(keyframeStart(Buffer.from([0x67, 1]), 'H264'), true, 'SPS');
  assert.equal(keyframeStart(Buffer.from([0x41, 1]), 'H264'), false, 'quadro comum');
  assert.equal(keyframeStart(Buffer.from([0x78, 0, 5, 0x67, 1, 2, 3, 4]), 'H264'), true, 'STAP-A com SPS');
  assert.equal(keyframeStart(Buffer.from([0x7c, 0x85, 1]), 'H264'), true, 'FU-A começando IDR');
  assert.equal(keyframeStart(Buffer.from([0x7c, 0x05, 1]), 'H264'), false, 'FU-A no meio');
});

test('AV1: o cabeçalho de sequência no começo do pacote (com e sem tamanho)', () => {
  assert.equal(keyframeStart(Buffer.from([0x18, 0x08, 0, 0]), 'AV1'), true, 'W=1');
  assert.equal(keyframeStart(Buffer.from([0x08, 3, 0x08, 0, 0, 5, 0x32]), 'AV1'), true, 'W=0, com tamanho');
  assert.equal(keyframeStart(Buffer.from([0x18, 0x32, 1]), 'AV1'), false, 'quadro comum');
  assert.equal(keyframeStart(Buffer.from([0x98, 0x08, 0]), 'AV1'), false, 'continuação (Z=1)');
});

test('pedido de quadro-chave: PLI e FIR, sozinhos ou em RTCP composto', () => {
  const rr = Buffer.from([0x81, 201, 0, 1, 0, 0, 0, 1]);
  const pli = Buffer.from([0x81, 206, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2]);
  const fir = Buffer.from([0x84, 206, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2]);
  const nack = Buffer.from([0x81, 205, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2]);
  assert.equal(keyframeRequest(pli), true);
  assert.equal(keyframeRequest(fir), true);
  assert.equal(keyframeRequest(Buffer.concat([rr, pli])), true, 'composto: RR + PLI');
  assert.equal(keyframeRequest(Buffer.concat([rr, nack])), false, 'NACK não é pedido de quadro-chave');
  assert.equal(keyframeRequest(Buffer.from([0x80, 96, 0, 1])), false, 'pacote de mídia');
});

// RTCP de mentira: cabeçalho (V=2, contagem/FMT, tipo, tamanho em palavras - 1) + corpo.
const rtcp = (countOrFmt, type, body) => {
  const h = Buffer.alloc(4);
  h[0] = 0x80 | countOrFmt; h[1] = type; h.writeUInt16BE((4 + body.length) / 4 - 1, 2);
  return Buffer.concat([h, body]);
};
const u32 = (...values) => { const b = Buffer.alloc(4 * values.length); values.forEach((v, i) => b.writeUInt32BE(v >>> 0, 4 * i)); return b; };
const block = (ssrc, fraction) => { const b = Buffer.alloc(24); b.writeUInt32BE(ssrc >>> 0, 0); b[4] = fraction; return b; };

test('perda relatada: RR (e SR) com o relatório do nosso SSRC, sozinho ou composto', () => {
  const mine = 0xdeadbeef;
  const rr = rtcp(2, 201, Buffer.concat([u32(1), block(42, 200), block(mine, 64)]));
  assert.equal(receiverLoss(rr, mine), 0.25, 'segundo relatório do RR');
  assert.equal(receiverLoss(rr, 7), null, 'sem relatório desse SSRC');
  const sr = rtcp(1, 200, Buffer.concat([u32(1, 0, 0, 0, 0, 0), block(mine, 128)]));
  assert.equal(receiverLoss(sr, mine), 0.5, 'SR com relatório');
  const pli = rtcp(1, 206, u32(1, mine));
  assert.equal(receiverLoss(Buffer.concat([pli, rtcp(1, 201, Buffer.concat([u32(1), block(mine, 0)]))]), mine), 0, 'composto, perda zero');
  assert.equal(receiverLoss(pli, mine), null);
  assert.equal(receiverLoss(Buffer.from([0x81, 201, 0, 7, 0]), mine), null, 'cortado: ignora');
});

test('NACK: o pacote pedido e os da máscara (com volta do número de sequência)', () => {
  const mine = 1234;
  const fci = (pid, blp) => { const b = Buffer.alloc(4); b.writeUInt16BE(pid, 0); b.writeUInt16BE(blp, 2); return b; };
  const nack = rtcp(1, 205, Buffer.concat([u32(1, mine), fci(100, 0b101), fci(65535, 0b1)]));
  assert.deepEqual(nackedSequences(nack, mine), [100, 101, 103, 65535, 0]);
  assert.deepEqual(nackedSequences(nack, 99), [], 'de outro SSRC');
  assert.deepEqual(nackedSequences(rtcp(1, 206, u32(1, mine)), mine), [], 'PLI não é NACK');
});
