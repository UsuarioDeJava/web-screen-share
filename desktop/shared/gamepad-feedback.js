(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssGamepadFeedback = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function create({ getPad, canPlay, schedule = setTimeout, cancel = clearTimeout }) {
    let actuator = null, timer = null, generation = 0;
    function stop() {
      generation++; if (timer != null) cancel(timer); timer = null;
      const previous = actuator; actuator = null;
      if (previous) try {
        Promise.resolve(typeof previous.reset === 'function' ? previous.reset()
          : previous.playEffect('dual-rumble', { duration: 0, strongMagnitude: 0, weakMagnitude: 0 })).catch(() => {});
      } catch {}
    }
    return { stop,
      apply(value) {
        if (!value || !Number.isFinite(value.strong) || value.strong < 0 || value.strong > 1
          || !Number.isFinite(value.weak) || value.weak < 0 || value.weak > 1
          || !Number.isInteger(value.duration) || value.duration < 0 || value.duration > 200) return false;
        if (!canPlay() || !(value.strong || value.weak) || value.duration < 20) { stop(); return false; }
        const pad = getPad(), next = pad?.vibrationActuator || pad?.hapticActuators?.[0];
        if (typeof next?.playEffect !== 'function' || (next.effects?.length && !next.effects.includes('dual-rumble'))) { stop(); return false; }
        if (actuator && actuator !== next) stop();
        if (timer != null) cancel(timer);
        actuator = next; const run = ++generation;
        timer = schedule(() => { if (generation === run) stop(); }, value.duration + 50);
        try {
          Promise.resolve(next.playEffect('dual-rumble', { duration: value.duration, startDelay: 0,
            strongMagnitude: value.strong, weakMagnitude: value.weak })).catch(() => { if (generation === run) stop(); });
          return true;
        } catch { stop(); return false; }
      },
    };
  }
  return { create };
});
