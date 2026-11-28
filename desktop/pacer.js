// Ritmo do repasse do OBS/câmera. O OBS manda cada quadro de uma vez: um quadro-chave de
// 10 Mb/s são centenas de pacotes no mesmo milissegundo. Num trecho de fila curta (o DERP do
// Tailscale, quando não há conexão direta, guarda uns 32 pacotes; roteador e CGNAT também
// descartam rajadas), o excesso some e o quadro não decodifica: tela preta pra todos.
// Aqui o vídeo sai espalhado, a `factor` vezes a taxa média dos últimos segundos, sem atrasar
// mais que MAX_DELAY. Começa folgado (menos atraso); se quem recebe avisar perda (relatório
// RTCP), fica mais suave; sem perda por um tempo, volta a folgar. O relógio é o tempo real
// (não o intervalo do timer), então funciona também com o timer de 15 ms do Windows.
const WINDOW = 2000; // ms da taxa média
const FACTOR_START = 2;
const FACTOR_MIN = 1.1;
const LOSS = 0.02; // perda num relatório que conta como perda
const CALM = 15000; // ms sem perda pra folgar de novo
const MIN_RATE = 8e6 / 8; // bytes/s
const MAX_DELAY = 400; // ms
const BURST = 12000; // bytes que saem de uma vez depois de uma pausa

function createPacer({ now = () => performance.now(), schedule = (fn) => setTimeout(fn, 1), cancel = clearTimeout } = {}) {
  let queue = [];
  let urgent = []; // reenvios: saem antes do resto, sem contar na taxa média
  let head = 0;
  let queued = 0;
  let credit = BURST;
  let last = now();
  let timer = null;
  let closed = false;
  let start = null;
  let lastPush = 0;
  let factor = FACTOR_START;
  let calmSince = now();
  const history = []; // [ms, bytes]
  let historyBytes = 0;

  function rate(t) {
    while (history.length && history[0][0] < t - WINDOW) historyBytes -= history.shift()[1];
    const span = Math.min(WINDOW, Math.max(500, t - start));
    // O que está na fila sai até MAX_DELAY depois de chegar o último (taxa fixa pra rajada).
    const deadline = Math.max(MAX_DELAY / 8, lastPush + MAX_DELAY - t);
    return Math.max(MIN_RATE, factor * historyBytes * 1000 / span, queued * 1000 / deadline);
  }

  function drain(backlog) {
    timer = null;
    if (closed) return;
    const t = now();
    const add = Math.max(0, t - last) / 1000 * rate(t);
    last = t;
    // Parado: no máximo uma rajada pequena. Esvaziando a fila: o que o tempo passado permite.
    credit = Math.min(credit + add, backlog ? Math.max(BURST, add) : BURST);
    while (urgent.length && credit > 0) {
      const item = urgent.shift();
      queued -= item.size;
      credit -= item.size;
      item.deliver();
    }
    while (head < queue.length && credit > 0) {
      const item = queue[head];
      queue[head++] = undefined;
      queued -= item.size;
      credit -= item.size;
      item.deliver();
    }
    if (head >= queue.length) { queue = []; head = 0; } else if (head > 4096) { queue = queue.slice(head); head = 0; }
    if (head < queue.length || urgent.length) timer = schedule(() => drain(true));
  }

  return {
    push(size, deliver, { resend = false } = {}) {
      if (closed) return;
      if (resend) urgent.push({ size, deliver });
      else {
        const t = now();
        if (start === null) start = t;
        lastPush = t;
        history.push([t, size]);
        historyBytes += size;
        queue.push({ size, deliver });
      }
      queued += size;
      if (!timer) drain(false);
    },
    // Fração perdida (0 a 1) do relatório de quem recebe.
    report(lost) {
      const t = now();
      if (lost > LOSS) { factor = Math.max(FACTOR_MIN, factor * 0.75); calmSince = t; }
      else if (t - calmSince > CALM) { factor = Math.min(FACTOR_START, factor + 0.1); calmSince = t; }
    },
    factor: () => factor,
    // Já está no mais suave: perda daqui pra frente é falta de banda (baixar o bitrate).
    gentlest: () => factor <= FACTOR_MIN,
    queued: () => queued,
    close() {
      closed = true;
      if (timer) cancel(timer);
      timer = null;
      queue = [];
      urgent = [];
      head = 0;
      queued = 0;
    },
  };
}

module.exports = { createPacer, FACTOR_START, FACTOR_MIN, MAX_DELAY, MIN_RATE };
