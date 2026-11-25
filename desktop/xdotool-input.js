// Processo persistente, um lote em voo e confirmação após execução. --shell não
// altera a pilha de janelas do xdotool; a saída é validada, nunca avaliada/logada.
const childProcess = require('node:child_process');
function createXdotoolInput({ keyNames, onFailure = () => {}, spawn = childProcess.spawn,
  check = childProcess.spawnSync, execute = childProcess.execFile, now = () => performance.now(),
  schedule = setTimeout, cancel = clearTimeout, ackMs = 250, maxAgeMs = 50, maxPending = 96 } = {}) {
  const found = check('xdotool', ['version'], { stdio: 'ignore', timeout: 1000, killSignal: 'SIGKILL', windowsHide: true });
  if (found.error || found.status !== 0) return null;
  const proc = spawn('xdotool', ['-'], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const keys = new Set(), buttons = new Set(), queue = [];
  let inFlight = null, timer = null, stopTimer = null, stopped = false, closed = false, output = '', lastTime = now(), notified = false;
  let finishClose;
  const settled = new Promise(resolve => { finishClose = resolve; });
  function clock() {
    const time = now();
    if (!Number.isFinite(time) || !Number.isFinite(lastTime) || time < lastTime) { stop('Relógio de entrada inválido.'); return null; }
    lastTime = time; return time;
  }
  function possibleHeld() {
    const heldKeys = new Set(keys), heldButtons = new Set(buttons);
    if (inFlight?.keyDown) heldKeys.add(inFlight.keyDown);
    if (inFlight?.buttonDown) heldButtons.add(inFlight.buttonDown);
    if (inFlight?.click) heldButtons.add(inFlight.click);
    return { keys: heldKeys, buttons: heldButtons };
  }
  let cleanup = null;
  function notify(message) {
    if (notified) return;
    notified = true;
    try { onFailure(message); } catch { /* O observador não pode impedir a neutralização. */ }
  }
  function stop(reason = null) {
    if (stopped) return;
    stopped = true; cancel(timer); timer = null; cleanup = possibleHeld();
    queue.length = 0; inFlight = null; output = '';
    proc.stdin.destroy();
    if (reason) notify(reason);
    // Somente o processo criado por este backend. Não drenar comandos antigos.
    if (!closed && proc.exitCode === null && proc.signalCode === null) {
      try { proc.kill('SIGKILL'); } catch { notify('Não foi possível encerrar o processo de entrada.'); }
      if (!closed) {
        stopTimer = schedule(() => { notify('O encerramento do processo de entrada não foi confirmado.'); finishClose(false); }, 1000);
        stopTimer?.unref?.();
      }
    }
    if (closed) releaseAfterExit();
  }
  function releaseAfterExit() {
    if (!cleanup) return;
    const held = cleanup; cleanup = null;
    const args = [];
    if (held.keys.size) args.push('keyup', '--delay', '0', ...held.keys);
    for (const button of held.buttons) args.push('mouseup', String(button));
    if (!args.length) { finishClose(true); return; }
    // Executado somente após close do produtor anterior. Sem shell e sem replays.
    try {
      execute('xdotool', args, { timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 4096, windowsHide: true }, error => {
        if (error) notify('Não foi possível confirmar a neutralização pelo xdotool.');
        finishClose(!error);
      });
    } catch { notify('Não foi possível neutralizar a entrada pelo xdotool.'); finishClose(false); }
  }
  function pump() {
    if (stopped || inFlight || !queue.length) return;
    const time = clock(); if (time === null) return;
    const command = queue.shift();
    if (time - command.at > maxAgeMs) return stop('A fila de entrada ficou atrasada.');
    inFlight = command;
    command.sentAt = time;
    timer = schedule(() => stop('O xdotool não confirmou a entrada no prazo.'), ackMs); timer?.unref?.();
    try {
      if (!proc.stdin.writable || !proc.stdin.write(command.line + ' getmouselocation --shell\n')) stop('O processo de entrada está congestionado.');
    } catch { stop('Falha ao escrever no processo de entrada.'); }
  }
  function enqueue(command) {
    if (stopped) return false;
    const time = clock(); if (time === null) return false;
    command.at = time;
    const tail = queue.at(-1);
    if (command.move && tail?.move) queue[queue.length - 1] = command;
    else {
      if (queue.length >= maxPending) { stop('A fila de entrada excedeu o limite.'); return false; }
      queue.push(command);
    }
    pump(); return !stopped;
  }
  function acknowledge() {
    const command = inFlight;
    if (!command) return stop('Confirmação de entrada inesperada.');
    const time = clock(); if (time === null) return;
    if (time - command.sentAt > ackMs) return stop('A confirmação da entrada chegou atrasada.');
    cancel(timer); timer = null; inFlight = null;
    if (command.keyDown) keys.add(command.keyDown);
    if (command.keyUp) keys.delete(command.keyUp);
    if (command.buttonDown) buttons.add(command.buttonDown);
    if (command.buttonUp) buttons.delete(command.buttonUp);
    for (const key of command.releaseKeys || []) keys.delete(key);
    for (const button of command.releaseButtons || []) buttons.delete(button);
    pump();
  }
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', data => {
    if (stopped) return;
    output += data;
    if (output.length > 512) return stop('Resposta de entrada excedeu o limite.');
    const frame = /^X=-?\d{1,20}\r?\nY=-?\d{1,20}\r?\nSCREEN=-?\d{1,20}\r?\nWINDOW=-?\d{1,20}\r?\n$/.test(output);
    if (frame) { output = ''; acknowledge(); }
    else if ((output.match(/\n/g) || []).length >= 4) stop('Resposta de entrada inválida.');
  });
  proc.on('error', () => stop('O processo de entrada falhou.'));
  proc.stdin.on('error', () => stop('A conexão com o processo de entrada falhou.'));
  proc.stdout.on('error', () => stop('Falha na confirmação do processo de entrada.'));
  proc.stdout.on('end', () => { if (!stopped) stop('A confirmação do processo de entrada foi encerrada.'); });
  proc.on('close', () => {
    closed = true;
    cancel(stopTimer); stopTimer = null;
    if (!stopped) stop('O processo de entrada foi encerrado.');
    releaseAfterExit();
  });
  const scroll = (notches, positive, negative) => {
    if (!Number.isFinite(notches)) return false;
    const count = Math.min(10, Math.abs(Math.round(notches)));
    if (!count) return true;
    const button = notches > 0 ? positive : negative;
    return enqueue({ mouse: true, click: button, line: `click --delay 0 --repeat ${count} ${button}` });
  };
  return {
    available: () => !stopped,
    settled,
    move(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const px = Math.round(x), py = Math.round(y);
      if (Math.abs(px) > 2147483647 || Math.abs(py) > 2147483647) return false;
      return enqueue({ mouse: true, move: true, line: `mousemove -- ${px} ${py}` });
    },
    button(button, down) {
      if (![0, 1, 2].includes(button) || typeof down !== 'boolean') return false;
      const native = [1, 2, 3][button];
      return enqueue({ mouse: true, [down ? 'buttonDown' : 'buttonUp']: native, line: `${down ? 'mousedown' : 'mouseup'} ${native}` });
    },
    wheel: notches => scroll(notches, 5, 4), hwheel: notches => scroll(notches, 7, 6),
    key(code, down) {
      if (!Object.hasOwn(keyNames, code) || typeof down !== 'boolean') return false;
      const key = keyNames[code];
      return enqueue({ keyboard: true, [down ? 'keyDown' : 'keyUp']: key, line: `${down ? 'keydown' : 'keyup'} --delay 0 ${key}` });
    },
    supports: code => Object.hasOwn(keyNames, code),
    releaseDevices(devices) {
      if (stopped) return;
      // Retira comandos ainda não enviados dos dispositivos revogados. Uma única
      // soltura prioritária fica depois do lote já aceito e antes dos demais.
      for (let i = queue.length - 1; i >= 0; i--) if (devices.keyboard && queue[i].keyboard || devices.mouse && queue[i].mouse) queue.splice(i, 1);
      const held = possibleHeld(), releaseKeys = devices.keyboard ? [...held.keys] : [], releaseButtons = devices.mouse ? [...held.buttons] : [];
      if (!releaseKeys.length && !releaseButtons.length) return;
      const time = clock(); if (time === null) return;
      // Separadas para que reset de teclado não apague uma soltura de mouse.
      // No máximo uma soltura prioritária por dispositivo, além da fila normal.
      if (releaseButtons.length) queue.unshift({ mouse: true, releaseButtons,
        line: releaseButtons.map(button => 'mouseup ' + button).join(' '), at: time });
      if (releaseKeys.length) queue.unshift({ keyboard: true, releaseKeys, line: 'keyup --delay 0 ' + releaseKeys.join(' '), at: time });
      pump();
    },
    close: () => stop(),
  };
}
module.exports = { createXdotoolInput };
