// Repasse do OBS/câmera: achar o começo de um quadro-chave nos pacotes RTP e os pedidos de
// quadro-chave (PLI/FIR) de quem assiste.
const test = require('node:test');
const assert = require('node:assert/strict');
const { keyframeStart, keyframeRequest } = require('../obs-rtp');

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
