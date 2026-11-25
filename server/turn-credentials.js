const crypto = require('node:crypto');
function createTurnCredentials({ secret, ttlSeconds = 3600, now = Date.now, random = () => crypto.randomBytes(16).toString('hex') }) {
  if (typeof secret !== 'string' || !secret || !Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86400)
    throw new Error('Configuração de credenciais TURN inválida.');
  return {
    ttlSeconds,
    cacheSeconds: Math.min(300, ttlSeconds - 30),
    issue() {
      const username = `${Math.floor(now() / 1000) + ttlSeconds}:wss-${random()}`;
      return { username, credential: crypto.createHmac('sha1', secret).update(username).digest('base64') };
    },
  };
}
module.exports = { createTurnCredentials };
