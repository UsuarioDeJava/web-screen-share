// Ritmo do repasse do OBS: o quadro-chave sai espalhado, não de uma vez. Relógio de mentira.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPacer, MAX_DELAY } = require('../pacer');

function setup() {
  let t = 0;
  const timers = [];
  const sent = [];
  const pacer = createPacer({ now: () => t, schedule: (fn) => { timers.push(fn); return timers.length; }, cancel: () => {} });
  const push = (n, size = 1200, opts) => { for (let i = 0; i < n; i += 1) pacer.push(size, () => sent.push({ t, size, resend: Boolean(opts) }), opts); };
  // Avança o relógio em passos de `step` ms, rodando o timer (o de 15 ms do Windows, por exemplo).
  const run = (ms, step = 1) => {
    for (let end = t + ms; t < end;) {
      t += step;
      const due = timers.splice(0);
      due.forEach((fn) => fn());
    }
  };
  return { pacer, push, run, sent, at: (ms) => { t = ms; } };
}

test('um quadro grande sai espalhado; parado, sai na hora', () => {
  const s = setup();
  s.push(1);
  assert.equal(s.sent.length, 1, 'um pacote depois de parado: na hora');
  s.run(1000);
  s.push(400); // quadro-chave de ~480 kB
  const first = s.sent.length - 1;
  assert.ok(first <= 12, `no começo, só uma rajada pequena (${first})`);
  s.run(MAX_DELAY + 20);
  assert.equal(s.sent.length, 401, 'em no máximo MAX_DELAY, saiu tudo');
  const times = s.sent.slice(1).map((p) => p.t);
  assert.ok(times.at(-1) - times[0] >= 100, `espalhado no tempo (${times.at(-1) - times[0]} ms)`);
});

test('timer grosso (15 ms, Windows): a taxa é a mesma e cada leva continua pequena', () => {
  const fine = setup();
  const coarse = setup();
  for (const s of [fine, coarse]) { s.run(1000); s.push(300); }
  fine.run(400, 1);
  coarse.run(400, 15);
  const end = (s) => s.sent.at(-1).t;
  assert.equal(coarse.sent.length, 300);
  assert.ok(Math.abs(end(coarse) - end(fine)) <= 20, `mesmo tempo total (${end(fine)} x ${end(coarse)} ms)`);
  const perTick = new Map();
  coarse.sent.forEach((p) => perTick.set(p.t, (perTick.get(p.t) || 0) + 1));
  assert.ok(Math.max(...perTick.values()) < 60, `cada leva de 15 ms: no máximo ${Math.max(...perTick.values())} pacotes`);
});

test('perda relatada: fica mais suave até o mínimo; sem perda por um tempo, folga de novo', () => {
  const s = setup();
  const start = s.pacer.factor();
  s.pacer.report(0.2);
  assert.ok(s.pacer.factor() < start);
  assert.equal(s.pacer.gentlest(), false);
  for (let i = 0; i < 10; i += 1) s.pacer.report(0.2);
  assert.equal(s.pacer.gentlest(), true);
  const gentle = s.pacer.factor();
  s.pacer.report(0.01);
  assert.equal(s.pacer.factor(), gentle, 'perda pequena: não mexe');
  s.at(20000);
  s.pacer.report(0);
  assert.ok(s.pacer.factor() > gentle, 'calmo por 15 s: folga um pouco');
});

test('mais suave: o mesmo quadro demora mais pra sair (sem passar de MAX_DELAY)', () => {
  const time = (gentle) => {
    const s = setup();
    for (let i = 0; i < 20; i += 1) { s.run(33); s.push(40); } // ~11 Mb/s de média
    s.run(500);
    if (gentle) for (let i = 0; i < 10; i += 1) s.pacer.report(0.2);
    const from = s.sent.length;
    s.push(300);
    s.run(1000);
    return s.sent.at(-1).t - s.sent[from].t;
  };
  const fast = time(false);
  const slow = time(true);
  assert.ok(slow > fast, `${fast} ms -> ${slow} ms`);
  assert.ok(slow <= MAX_DELAY + 5, `não passa de MAX_DELAY (${slow} ms)`);
});

test('reenvio sai antes do que está na fila; fechar descarta tudo', () => {
  const s = setup();
  s.run(1000);
  s.push(100);
  s.push(1, 1200, { resend: true });
  s.run(5);
  const order = s.sent.findIndex((p) => p.resend);
  assert.ok(order >= 0 && order < 20, `reenvio na frente (posição ${order})`);
  s.push(200);
  s.pacer.close();
  const count = s.sent.length;
  s.run(1000);
  assert.equal(s.sent.length, count);
  assert.equal(s.pacer.queued(), 0);
});
