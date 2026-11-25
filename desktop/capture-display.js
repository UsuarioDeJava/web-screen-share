// Resolve uma identidade na escolha da fonte. Depois disso, não faz fallback
// para outro monitor: ausência do escolhido significa indisponibilidade.
function resolveCaptureDisplay(choice, displays) {
  if (choice?.kind !== 'screen') return null;
  const id = String(choice.displayId ?? '');
  return displays.find(display => String(display.id) === id) || (!id && displays.length === 1 ? displays[0] : null);
}
function findSelectedDisplay(displayId, displays) {
  if (displayId == null || displayId === '') return null;
  return displays.find(display => String(display.id) === String(displayId)) || null;
}
// Snapshot da geometria do monitor selecionado. Não mantém referências mutáveis
// ao objeto do evento e nunca escolhe outro monitor como fallback.
function snapshotInputDisplay(display) {
  const b = display?.bounds;
  if (!Number.isInteger(display?.id) || display.id < 0 || !b
    || ![b.x, b.y, b.width, b.height].every(Number.isFinite) || b.width <= 0 || b.height <= 0) return null;
  return Object.freeze({ id: display.id, bounds: Object.freeze({ x: b.x, y: b.y, width: b.width, height: b.height }) });
}
module.exports = { resolveCaptureDisplay, findSelectedDisplay, snapshotInputDisplay };
