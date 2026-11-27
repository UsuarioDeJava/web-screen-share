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
