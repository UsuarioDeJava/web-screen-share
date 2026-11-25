// Presets de qualidade compartilhados entre o transmissor e o visualizador.
// scaleResolutionDownBy: fator de redução da resolução enviada para este viewer.
// maxBitrate: limite de banda em bits/s. maxFramerate: limite de quadros por segundo.
window.QUALITY_PRESETS = {
  alta: { label: 'Alta', scaleResolutionDownBy: 1, maxBitrate: 8_000_000, maxFramerate: 60 },
  jogo1080: { label: 'Jogo · até 1080p60', scaleResolutionDownBy: 1, maxWidth: 1920, maxHeight: 1080, maxBitrate: 12_000_000, maxFramerate: 60 },
  jogo720: { label: 'Jogo · até 720p60', scaleResolutionDownBy: 1, maxWidth: 1280, maxHeight: 720, maxBitrate: 6_000_000, maxFramerate: 60 },
  media: { label: 'Média', scaleResolutionDownBy: 1.5, maxBitrate: 2_500_000, maxFramerate: 24 },
  baixa: { label: 'Baixa', scaleResolutionDownBy: 2, maxBitrate: 800_000, maxFramerate: 15 },
  minima: { label: 'Mínima', scaleResolutionDownBy: 3, maxBitrate: 300_000, maxFramerate: 10 },
};

window.DEFAULT_QUALITY = 'alta';
