const express = require('express');
function createRoomAccess({ sessions, secure, publicationProtected = false }) {
  function sameOrigin(req, polling = false) {
    try {
      const expected = new URL(`${req.socket?.encrypted || secure ? 'https' : 'http'}://${req.headers.host}`).origin;
      return req.headers.origin ? req.headers.origin === expected
        : polling && req.headers['sec-fetch-site'] === 'same-origin';
    } catch { return false; }
  }
  function origin(req, res, next) {
    if (!sessions.enabled || sameOrigin(req)) return next();
    res.statusCode = 403; res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Origem não permitida.', code: 'ROOM_ORIGIN_DENIED' }));
  }
  const router = express.Router();
  router.get('/status', (req, res) => res.set('Cache-Control', 'no-store').json(sessions.status(req.headers.cookie)));
  router.post('/login', origin, express.json({ limit: '1kb', strict: true }), (req, res) => {
    const result = sessions.authenticate({ key: req.body?.key, cookie: req.headers.cookie, address: req.socket.remoteAddress });
    res.set('Cache-Control', 'no-store');
    if (result.cookie) res.set('Set-Cookie', result.cookie);
    if (result.retryAfter) res.set('Retry-After', String(result.retryAfter));
    res.status(result.status).json(result.ok ? { ok: true } : { error: result.status === 429
      ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : result.status === 503
        ? 'Não há sessão disponível agora.' : 'Chave de acesso inválida.' });
  });
  router.post('/logout', origin, (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Set-Cookie': sessions.logout(req.headers.cookie) }).json({ ok: true });
  });
  function publication(req) {
    const path = req.path || new URL(req.url, 'http://fixture').pathname;
    // Credenciais individuais são obrigatórias nessas rotas, inclusive se o
    // publicador legado não tiver token global configurado.
    if (req.method === 'POST' && /^\/obs-publish\/[a-f0-9]{32}$/.test(path)
      || ['PATCH', 'DELETE'].includes(req.method) && /^\/mtx\/pub_[a-f0-9]{32}\/whip\/[a-f0-9-]{36}$/i.test(path)) return true;
    if (!publicationProtected) return false;
    return req.method === 'POST' && /^\/obs\/[^/]+$/.test(path)
      || ['PATCH', 'DELETE'].includes(req.method) && /^\/mtx\/obs_[a-f0-9]+\/whip\/[a-f0-9-]{36}$/i.test(path);
  }
  function http(req, res, next) {
    if (!sessions.enabled) return next();
    if (['GET', 'HEAD'].includes(req.method)
      && (['/', '/index.html', '/version'].includes(req.path) || /^\/(js|css)\//.test(req.path))) return next();
    if (publication(req)) return next(); // O middleware OBS confere o Bearer.
    if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) return origin(req, res, next);
    sessions.http(req, res, next);
  }
  function engine(req, res, next) {
    if (!sessions.enabled) return next();
    if (!sameOrigin(req, true)) return origin(req, res, next);
    sessions.http(req, res, next);
  }
  return { router, http, engine, sameOrigin };
}
module.exports = { createRoomAccess };
