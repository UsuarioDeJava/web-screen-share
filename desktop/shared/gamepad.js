(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssGamepad = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const labels = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Guide'];
  const permissions = (value) => ({ keyboard: value?.keyboard === true, mouse: value?.mouse === true, gamepad: value?.gamepad === true });
  const kindDevice = (kind) => kind === 'key' ? 'keyboard' : kind === 'gamepad' ? 'gamepad' : ['move', 'button', 'wheel'].includes(kind) ? 'mouse' : null;
  function validState(value) {
    return value && Array.isArray(value.axes) && value.axes.length === 4 && Array.from(value.axes).every((v) => Number.isFinite(v) && v >= -1 && v <= 1)
      && Array.isArray(value.buttons) && value.buttons.length === 17 && Array.from(value.buttons).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
  }
  function profile(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    return {
      buttons: labels.map((_, i) => Number.isInteger(value.buttons?.[i]) && value.buttons[i] >= 0 && value.buttons[i] < 64 ? value.buttons[i] : i),
      axes: [0, 1, 2, 3].map((i) => Number.isInteger(value.axes?.[i]) && value.axes[i] >= 0 && value.axes[i] < 16 ? value.axes[i] : i),
      invert: [0, 1, 2, 3].map((i) => value.invert?.[i] === true),
      deadzone: Number.isFinite(value.deadzone) ? Math.max(0, Math.min(0.5, value.deadzone)) : 0.12,
    };
  }
  function sample(pad, config) {
    const p = profile(config);
    return {
      buttons: p.buttons.map((index) => Math.max(0, Math.min(1, Number(pad.buttons[index]?.value) || 0))),
      axes: p.axes.map((index, i) => {
        let value = Math.max(-1, Math.min(1, Number(pad.axes[index]) || 0));
        value = Math.abs(value) <= p.deadzone ? 0 : Math.sign(value) * (Math.abs(value) - p.deadzone) / (1 - p.deadzone);
        return Math.round(value * (p.invert[i] ? -1 : 1) * 1000) / 1000;
      }),
    };
  }
  const neutral = () => ({ axes: [0, 0, 0, 0], buttons: Array(17).fill(0) });
  return { labels, permissions, kindDevice, validState, profile, sample, neutral };
});
