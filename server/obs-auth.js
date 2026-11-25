const crypto = require('node:crypto');
function createObsAuth(token) {
  const enabled = token !== undefined && token !== '';
  if (enabled && (typeof token !== 'string' || !/^[\x21-\x7e]{32,256}$/.test(token)))
    throw Error('OBS_PUBLISH_TOKEN deve conter de 32 a 256 caracteres ASCII, sem espaços.');
  const digest = enabled ? crypto.createHash('sha256').update(token).digest() : null;
  function accepts(authorization) {
    if (!enabled) return true;
    if (typeof authorization !== 'string') return false;
    const match = /^Bearer ([\x21-\x7e]{1,256})$/i.exec(authorization);
    return Boolean(match && crypto.timingSafeEqual(crypto.createHash('sha256').update(match[1]).digest(), digest));
  }
  return {
    enabled,
    accepts,
    middleware(req, res, next) {
      res.set('Cache-Control', 'no-store');
      if (accepts(req.get('authorization'))) return next();
      return res.status(401).set('WWW-Authenticate', 'Bearer realm="obs"').json({ error: 'Token de publicação OBS ausente ou inválido.' });
    },
  };
}
module.exports = { createObsAuth };
