(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssGamepad = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const labels = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Guide'];
  const playLabels = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'];
  const presets = [{ id: 'xbox', name: 'Xbox' }, { id: 'playstation', name: 'PlayStation' }, { id: 'custom', name: 'GameSir / personalizado' }];
  const labelsFor = (value) => value?.layout === 'playstation' ? playLabels : labels;
  function defaultProfile(pad) {
    const id = String(pad?.id || '');
    return profile({ preset: /gamesir/i.test(id) ? 'custom' : /dualsense|dualshock|playstation|054c|sony.*controller|wireless controller/i.test(id) ? 'playstation' : 'xbox' });
  }
  function applyPreset(id, current) {
    const p = profile(current);
    return profile({ preset: id, layout: id === 'custom' ? p.layout : id, deadzone: p.deadzone, extraButtons: p.extraButtons });
  }
  const permissions = (value) => ({ keyboard: value?.keyboard === true, mouse: value?.mouse === true, gamepad: value?.gamepad === true });
  const kindDevice = (kind) => kind === 'key' ? 'keyboard' : kind === 'gamepad' ? 'gamepad' : ['move', 'button', 'wheel'].includes(kind) ? 'mouse' : null;
  function validState(value) {
    return value && Array.isArray(value.axes) && value.axes.length === 4 && Array.from(value.axes).every((v) => Number.isFinite(v) && v >= -1 && v <= 1)
      && Array.isArray(value.buttons) && value.buttons.length === 17 && Array.from(value.buttons).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
  }
  function profile(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return {
      preset: presets.some((p) => p.id === value.preset) ? value.preset : 'xbox',
      layout: value.preset === 'playstation' || (value.preset === 'custom' && value.layout === 'playstation') ? 'playstation' : 'xbox',
      extraButtons: Array.isArray(value.extraButtons) ? value.extraButtons.slice(0, 16)
        .filter((v) => v && Number.isInteger(v.source) && v.source >= 0 && v.source < 64 && Number.isInteger(v.target) && v.target >= 0 && v.target < 17)
        .map((v, i) => ({ source: v.source, target: v.target, name: typeof v.name === 'string' ? v.name.replace(/[\x00-\x1f]/g, '').slice(0, 24) : `M${i + 1}` })) : [],
      buttons: labels.map((_, i) => Number.isInteger(value.buttons?.[i]) && value.buttons[i] >= 0 && value.buttons[i] < 64 ? value.buttons[i] : i),
      axes: [0, 1, 2, 3].map((i) => Number.isInteger(value.axes?.[i]) && value.axes[i] >= 0 && value.axes[i] < 16 ? value.axes[i] : i),
      invert: [0, 1, 2, 3].map((i) => value.invert?.[i] === true),
      deadzone: Number.isFinite(value.deadzone) ? Math.max(0, Math.min(0.5, value.deadzone)) : 0.12,
    };
  }
  function sample(pad, config) {
    const p = profile(config);
    const valueOf = (index) => Math.max(0, Math.min(1, Number(pad.buttons[index]?.value) || 0));
    const buttons = p.buttons.map(valueOf);
    if (p.preset === 'custom') for (const binding of p.extraButtons) buttons[binding.target] = Math.max(buttons[binding.target], valueOf(binding.source));
    return {
      buttons,
      axes: p.axes.map((index, i) => {
        let value = Math.max(-1, Math.min(1, Number(pad.axes[index]) || 0));
        value = Math.abs(value) <= p.deadzone ? 0 : Math.sign(value) * (Math.abs(value) - p.deadzone) / (1 - p.deadzone);
        return Math.round(value * (p.invert[i] ? -1 : 1) * 1000) / 1000;
      }),
    };
  }
  const neutral = () => ({ axes: [0, 0, 0, 0], buttons: Array(17).fill(0) });
  return { labels, labelsFor, presets, defaultProfile, applyPreset, permissions, kindDevice, validState, profile, sample, neutral };
});
