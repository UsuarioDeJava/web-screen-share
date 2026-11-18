const DEFAULT_PREFERENCES = Object.freeze({
  fullscreen: 'native', hardwareAcceleration: true, overlay: true,
  logging: true, logLimit: 2000,
});

function normalizePreferences(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  const result = { ...DEFAULT_PREFERENCES };
  if (['native', 'borderless', 'windowed'].includes(value.fullscreen)) result.fullscreen = value.fullscreen;
  for (const key of ['hardwareAcceleration', 'overlay', 'logging']) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  if ([500, 1000, 2000, 5000].includes(value.logLimit)) result.logLimit = value.logLimit;
  return result;
}

function startupPreferences(saved, env = process.env) {
  const result = normalizePreferences(saved);
  if (env.WSS_WINDOWED_FULLSCREEN === '1') result.fullscreen = 'windowed';
  if (env.WSS_BORDERLESS_FULLSCREEN === '1') result.fullscreen = 'borderless';
  if (env.WSS_DISABLE_HARDWARE_ACCELERATION === '1') result.hardwareAcceleration = false;
  return result;
}

module.exports = { DEFAULT_PREFERENCES, normalizePreferences, startupPreferences };
