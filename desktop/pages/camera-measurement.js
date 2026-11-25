(() => {
  function summarize({ cameraFps, frames }) {
    if (!Number.isFinite(cameraFps) || cameraFps <= 0) {
      throw Error('Informe a taxa de aquisição da câmera em FPS.');
    }
    if (!Array.isArray(frames) || !frames.length) throw Error('Nenhum acionamento anotado.');
    let lastButton = -1;
    const samples = frames.map(({ button, image }, index) => {
      if (!Number.isSafeInteger(button) || button <= lastButton ||
          !(image === null || (Number.isSafeInteger(image) && image >= button))) {
        throw Error('Quadros inválidos na tentativa ' + (index + 1));
      }
      if (image !== null && index + 1 < frames.length && image >= frames[index + 1].button) {
        throw Error('Resposta ambígua após o próximo acionamento.');
      }
      lastButton = button;
      return image === null ? null : (image - button) * 1000 / cameraFps;
    });
    const ordered = samples.filter(value => value !== null).sort((a, b) => a - b);
    const percentile = fraction => ordered[Math.ceil(fraction * ordered.length) - 1] ?? null;
    return { frameMs: 1000 / cameraFps, attempts: samples.length,
      missing: samples.length - ordered.length,
      p50Ms: percentile(0.5), p95Ms: percentile(0.95) };
  }
  function readFramePairs(text) {
    return text.trim().split(/\r?\n/).map((line, index) => {
      const match = /^(\d+)\s+(\d+|-)$/u.exec(line.trim());
      if (!match) throw Error('Revise a linha ' + (index + 1) + '. Use dois quadros separados por espaço.');
      return { button: Number(match[1]), image: match[2] === '-' ? null : Number(match[2]) };
    });
  }

  const form = document.getElementById('camera-measurement');
  const result = document.getElementById('camera-result');
  form.addEventListener('input', () => { result.textContent = ''; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const frames = readFramePairs(form.elements.frames.value);
      const summary = summarize({ cameraFps: form.elements.fps.valueAsNumber, frames });
      const ms = value => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' ms';
      const observed = summary.attempts - summary.missing;
      const lines = [observed + ' de ' + summary.attempts + ' respostas observadas. Cada quadro equivale a ' + ms(summary.frameMs) + '.'];
      if (observed) lines.push('Mediana de ' + ms(summary.p50Ms) + ' e p95 de ' + ms(summary.p95Ms) + '.');
      result.textContent = lines.join(' ');
    } catch (error) {
      result.textContent = error.message;
    }
  });
})();
