// "Só o som deste programa" (app no Windows): o som chega do app em pedaços (PCM 16 bits,
// canais intercalados) e sai daqui como áudio normal, que vai na transmissão no lugar do
// som do PC. Guarda uns 40 ms antes de começar (os pedaços chegam com um pouco de
// variação); se acumular demais (a página engasgou), joga fora o mais velho pra não ir
// ficando atrasado.
class WssPcmPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = (options && options.outputChannelCount && options.outputChannelCount[0]) || 2;
    this.queue = []; // Int16Array, intercalados
    this.offset = 0; // onde estamos no primeiro pedaço (em amostras)
    this.frames = 0; // quadros guardados
    this.playing = false;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || !data.byteLength) return;
      const pcm = new Int16Array(new Uint8Array(data).buffer); // cópia alinhada
      this.queue.push(pcm);
      this.frames += pcm.length / this.channels;
      const max = sampleRate * 0.25;
      while (this.frames > max && this.queue.length > 1) {
        const old = this.queue.shift();
        this.frames -= (old.length - this.offset) / this.channels;
        this.offset = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    if (!this.playing && this.frames < sampleRate * 0.04) {
      for (const channel of out) channel.fill(0); // silêncio enquanto junta
      return true;
    }
    this.playing = true;
    for (let i = 0; i < n; i += 1) {
      const chunk = this.queue[0];
      if (!chunk) {
        this.playing = false; // acabou o que tinha: espera juntar de novo
        for (const channel of out) channel.fill(0, i);
        break;
      }
      for (let c = 0; c < out.length; c += 1) out[c][i] = chunk[this.offset + Math.min(c, this.channels - 1)] / 32768;
      this.offset += this.channels;
      this.frames -= 1;
      if (this.offset >= chunk.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('wss-pcm-player', WssPcmPlayer);
