// Presets de qualidade compartilhados entre o transmissor e o visualizador.
// scaleResolutionDownBy: fator de redução da resolução enviada para este viewer.
// maxBitrate: limite de banda em bits/s. maxFramerate: limite de quadros por segundo.
window.QUALITY_PRESETS = {
  alta: { label: 'Alta', scaleResolutionDownBy: 1, maxBitrate: 8_000_000, maxFramerate: 30 },
  media: { label: 'Média', scaleResolutionDownBy: 1.5, maxBitrate: 2_500_000, maxFramerate: 24 },
  baixa: { label: 'Baixa', scaleResolutionDownBy: 2, maxBitrate: 800_000, maxFramerate: 15 },
  minima: { label: 'Mínima', scaleResolutionDownBy: 3, maxBitrate: 300_000, maxFramerate: 10 },
};

window.DEFAULT_QUALITY = 'alta';
