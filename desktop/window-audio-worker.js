// Som só do programa da janela transmitida (Windows 10 2004+ / 11): o "loopback por
// processo" do Windows (WASAPI, AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK) pega o que
// aquele programa (e os processos filhos dele) toca, e nada do resto do PC.
//
// Roda num processo separado (utilityProcess do Electron): se algo der errado aqui, o app
// continua e a transmissão fica com o som do PC. Conversa com o app por mensagens:
//   recebe { start: { hwnd } } e { stop: true }
//   manda  { ready: { rate, channels } }, { error: '...' } e { pcm } (PCM 16 bits, estéreo
//   intercalado, em pedaços de ~20 ms)
// Com WSS_FAKE_WINDOW_AUDIO=1 (testes fora do Windows), manda um tom de 440 Hz; com
// WSS_FAKE_WINDOW_AUDIO=error, finge que o Windows recusou.
const RATE = 48000;
const CHANNELS = 2;
const BYTES_PER_FRAME = CHANNELS * 2;
const port = process.parentPort;
let running = null; // { stop() }

function send(message) {
  try { port.postMessage(message); } catch {}
}

// ---------- tom de teste ----------

function fakeCapture() {
  let phase = 0;
  const frames = RATE / 50; // 20 ms
  const timer = setInterval(() => {
    const pcm = Buffer.alloc(frames * BYTES_PER_FRAME);
    for (let i = 0; i < frames; i += 1) {
      const v = Math.round(Math.sin(phase) * 0.3 * 32767);
      phase += (2 * Math.PI * 440) / RATE;
      pcm.writeInt16LE(v, i * 4);
      pcm.writeInt16LE(v, i * 4 + 2);
    }
    send({ pcm: new Uint8Array(pcm) });
  }, 20);
  send({ ready: { rate: RATE, channels: CHANNELS } });
  return { stop: () => clearInterval(timer) };
}

// ---------- Windows ----------

const hresult = (hr) => `0x${(hr >>> 0).toString(16).padStart(8, '0')}`;
function guid(text) {
  const h = text.replace(/[{}-]/g, '');
  const b = Buffer.alloc(16);
  b.writeUInt32LE(parseInt(h.slice(0, 8), 16), 0);
  b.writeUInt16LE(parseInt(h.slice(8, 12), 16), 4);
  b.writeUInt16LE(parseInt(h.slice(12, 16), 16), 6);
  Buffer.from(h.slice(16), 'hex').copy(b, 8);
  return b;
}

async function windowsCapture(hwnd) {
  const koffi = require('koffi');
  const PTR = koffi.sizeof('void *');
  const ole32 = koffi.load('ole32.dll');
  const mmdevapi = koffi.load('mmdevapi.dll');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const CoInitializeEx = ole32.func('__stdcall', 'CoInitializeEx', 'int32', ['void *', 'uint32']);
  const ActivateAudioInterfaceAsync = mmdevapi.func('__stdcall', 'ActivateAudioInterfaceAsync', 'int32', ['str16', 'void *', 'void *', 'void *', koffi.out(koffi.pointer('void *'))]);
  const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['void *', koffi.out(koffi.pointer('uint32'))]);
  const CreateEventW = kernel32.func('__stdcall', 'CreateEventW', 'void *', ['void *', 'int', 'int', 'void *']);
  const CloseHandle = kernel32.func('__stdcall', 'CloseHandle', 'int', ['void *']);

  const IID_IUnknown = guid('00000000-0000-0000-C000-000000000046');
  const IID_IAgileObject = guid('94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90');
  const IID_CompletionHandler = guid('41D949AB-9862-444A-80F6-C261334DA5EB');
  const IID_IAudioClient = guid('1CB9AD4C-DBFA-4C32-B178-C2F568A703B2');
  const IID_IAudioCaptureClient = guid('C8ADBD64-E71E-48A0-A4DE-185C395CD317');

  // Métodos COM: a função na posição index da tabela do objeto.
  const proto = (name, result, args) => koffi.proto('__stdcall', `WssWa${name}`, result, ['void *', ...args]);
  const P = {
    Release: proto('Release', 'uint32', []),
    GetActivateResult: proto('GetActivateResult', 'int32', [koffi.out(koffi.pointer('int32')), koffi.out(koffi.pointer('void *'))]),
    Initialize: proto('Initialize', 'int32', ['int32', 'uint32', 'int64', 'int64', 'void *', 'void *']),
    SetEventHandle: proto('SetEventHandle', 'int32', ['void *']),
    GetService: proto('GetService', 'int32', ['void *', koffi.out(koffi.pointer('void *'))]),
    Start: proto('Start', 'int32', []),
    Stop: proto('Stop', 'int32', []),
    GetBuffer: proto('GetBuffer', 'int32', [koffi.out(koffi.pointer('void *')), koffi.out(koffi.pointer('uint32')), koffi.out(koffi.pointer('uint32')), 'void *', 'void *']),
    ReleaseBuffer: proto('ReleaseBuffer', 'int32', ['uint32']),
    GetNextPacketSize: proto('GetNextPacketSize', 'int32', [koffi.out(koffi.pointer('uint32'))]),
  };
  const call = (obj, index, type, ...args) => {
    const table = koffi.decode(obj, 'void *');
    return koffi.call(koffi.decode(table, index * PTR, 'void *'), type, obj, ...args);
  };
  const check = (hr, what) => {
    if (hr < 0) throw new Error(`${what} (${hresult(hr)})`);
    return hr;
  };

  // O processo dono da janela (o som dele e dos filhos dele).
  const pidOut = [0];
  GetWindowThreadProcessId(BigInt(hwnd), pidOut);
  const pid = pidOut[0];
  if (!pid) throw new Error('janela não encontrada');
  CoInitializeEx(null, 0); // COINIT_MULTITHREADED (já iniciado também serve)

  // Quem recebe o "pronto" da ativação: um objeto COM mínimo (IUnknown + IAgileObject +
  // IActivateAudioInterfaceCompletionHandler). O Windows chama de outra thread; a koffi
  // traz a chamada pra cá.
  let activated = false;
  const QI = koffi.proto('__stdcall', 'WssWaQI', 'int32', ['void *', 'void *', 'void *']);
  const REF = koffi.proto('__stdcall', 'WssWaRef', 'uint32', ['void *']);
  const DONE = koffi.proto('__stdcall', 'WssWaDone', 'int32', ['void *', 'void *']);
  const callbacks = [
    koffi.register((self, riid, ppv) => {
      const id = Buffer.from(koffi.view(riid, 16));
      const ok = [IID_IUnknown, IID_IAgileObject, IID_CompletionHandler].some((g) => g.equals(id));
      koffi.encode(ppv, 'void *', ok ? self : null);
      return ok ? 0 : -2147467262; // E_NOINTERFACE
    }, koffi.pointer(QI)),
    koffi.register(() => 1, koffi.pointer(REF)),
    koffi.register(() => 1, koffi.pointer(REF)),
    koffi.register(() => { activated = true; return 0; }, koffi.pointer(DONE)),
  ];
  const vtable = koffi.alloc('void *', callbacks.length);
  koffi.encode(vtable, koffi.array('void *', callbacks.length), callbacks);
  const handler = koffi.alloc('void *', 1);
  koffi.encode(handler, 'void *', vtable);

  // PROPVARIANT (VT_BLOB) com AUDIOCLIENT_ACTIVATION_PARAMS: loopback do processo e filhos.
  const params = Buffer.alloc(12);
  params.writeInt32LE(1, 0); // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
  params.writeUInt32LE(pid, 4);
  params.writeInt32LE(0, 8); // PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE
  const variant = Buffer.alloc(24);
  variant.writeUInt16LE(65, 0); // VT_BLOB
  variant.writeUInt32LE(params.length, 8);
  variant.writeBigUInt64LE(koffi.address(params), 16);

  const opOut = [null];
  check(ActivateAudioInterfaceAsync('VAD\\Process_Loopback', IID_IAudioClient, variant, handler, opOut), 'ativar o som do programa');
  const op = opOut[0];
  const started = Date.now();
  while (!activated) {
    if (Date.now() - started > 5000) throw new Error('o Windows não respondeu');
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  const hrOut = [0];
  const clientOut = [null];
  check(call(op, 3, P.GetActivateResult, hrOut, clientOut), 'resultado da ativação');
  call(op, 2, P.Release);
  check(hrOut[0], 'ativação do som do programa');
  const client = clientOut[0];

  // PCM 16 bits, 48 kHz, estéreo (o Windows converte o que o programa tocar).
  const format = Buffer.alloc(18);
  format.writeUInt16LE(1, 0); // WAVE_FORMAT_PCM
  format.writeUInt16LE(CHANNELS, 2);
  format.writeUInt32LE(RATE, 4);
  format.writeUInt32LE(RATE * BYTES_PER_FRAME, 8);
  format.writeUInt16LE(BYTES_PER_FRAME, 12);
  format.writeUInt16LE(16, 14);
  const FLAGS = 0x00020000 | 0x00040000 | 0x80000000 | 0x08000000; // LOOPBACK | EVENTCALLBACK | AUTOCONVERTPCM | SRC_DEFAULT_QUALITY
  check(call(client, 3, P.Initialize, 0, FLAGS, 2000000, 0, format, null), 'preparar o som do programa'); // 200 ms de folga
  const event = CreateEventW(null, 0, 0, null);
  check(call(client, 13, P.SetEventHandle, event), 'evento do som');
  const captureOut = [null];
  check(call(client, 14, P.GetService, IID_IAudioCaptureClient, captureOut), 'captura do som');
  const capture = captureOut[0];
  check(call(client, 10, P.Start), 'começar o som do programa');
  send({ ready: { rate: RATE, channels: CHANNELS, pid } });

  // Lê o que chegou a cada 10 ms e manda em pedaços de ~20 ms.
  let pending = [];
  let pendingBytes = 0;
  let failed = false;
  const flush = () => {
    if (!pendingBytes) return;
    send({ pcm: new Uint8Array(Buffer.concat(pending, pendingBytes)) });
    pending = [];
    pendingBytes = 0;
  };
  const timer = setInterval(() => {
    if (failed) return;
    try {
      for (let guard = 0; guard < 64; guard += 1) {
        const next = [0];
        check(call(capture, 5, P.GetNextPacketSize, next), 'tamanho do pedaço');
        if (!next[0]) break;
        const data = [null];
        const frames = [0];
        const flags = [0];
        const hr = check(call(capture, 3, P.GetBuffer, data, frames, flags, null, null), 'ler o som');
        if (hr !== 0 || !frames[0]) break; // AUDCLNT_S_BUFFER_EMPTY
        const bytes = frames[0] * BYTES_PER_FRAME;
        // AUDCLNT_BUFFERFLAGS_SILENT: o que vem ali não vale, é silêncio.
        const chunk = flags[0] & 2 ? Buffer.alloc(bytes) : Buffer.from(new Uint8Array(koffi.view(data[0], bytes)).slice());
        call(capture, 4, P.ReleaseBuffer, frames[0]);
        pending.push(chunk);
        pendingBytes += bytes;
      }
      if (pendingBytes >= (RATE / 50) * BYTES_PER_FRAME) flush();
    } catch (err) {
      failed = true;
      send({ error: err.message });
    }
  }, 10);

  return {
    stop() {
      clearInterval(timer);
      try { call(client, 11, P.Stop); } catch {}
      try { call(capture, 2, P.Release); } catch {}
      try { call(client, 2, P.Release); } catch {}
      try { CloseHandle(event); } catch {}
    },
  };
}

// ---------- mensagens do app ----------

port.on('message', async (event) => {
  const msg = event.data || {};
  if (msg.stop) {
    if (running) running.stop();
    running = null;
    process.exit(0);
  }
  if (msg.start && !running) {
    try {
      if (process.env.WSS_FAKE_WINDOW_AUDIO === '1') running = fakeCapture();
      else if (process.env.WSS_FAKE_WINDOW_AUDIO === 'error') throw new Error('teste: o Windows recusou');
      else if (process.platform === 'win32' && /^\d+$/.test(String(msg.start.hwnd))) running = await windowsCapture(String(msg.start.hwnd));
      else throw new Error('só no Windows');
    } catch (err) {
      send({ error: err.message || String(err) });
    }
  }
});
