// Transmissão pelo OBS (WHIP): o OBS publica num MediaMTX local e quem assiste puxa
// o vídeo por WHEP. Este módulo só repassa o HTTP; a mídia passa pelo TURN embutido.
const express = require('express');
const { createObsHttp } = require('./obs-http');

const PATH_PREFIX = 'obs_';
const PATH_ID = /^(?:obs_(?:[0-9a-f]{2})+|pub_[0-9a-f]{32})$/;
const SESSION_ID = /^[0-9a-f-]{36}$/;
const POLL_INTERVAL_MS = 2000;
const busyError = () => Object.assign(Error('Monitor de mídia ocupado'), { code: 'OBS_BUSY' });

// O MediaMTX só aceita [A-Za-z0-9_.-/] no nome do caminho; o nick (com acento,
// espaço etc.) vai em hexadecimal e volta na hora de mostrar.
const pathIdFor = (nick) => PATH_PREFIX + Buffer.from(nick, 'utf8').toString('hex');
const nickFor = (pathId) => Buffer.from(pathId.slice(PATH_PREFIX.length), 'hex').toString('utf8');

// authorizePublish(req, nick): com contas, de quem é a chave do OBS ("Bearer Token" no
// WHIP): devolve { nick } da conta, ou { status, error }. authorizeView(req): quem
// assiste está com uma sessão aberta? Sem as duas (contas desligadas), entra quem
// alcança a página, como antes.
function setupObs({ app, webrtcUrl, apiUrl, apiAuth, cleanName, turnLink, onStreamsChanged,
  credentialLimit = (_req, _res, next) => next(), publicationAuth = (_req, _res, next) => next(),
  publisherAuth = (_req, res) => res.status(401).end(), publicationInfo = () => null,
  onStreamUpdated = () => {}, httpClient = createObsHttp(),
  authorizePublish = (req, nick) => ({ nick }), authorizeView = () => true }) {
  const sdpBody = express.text({ type: ['application/sdp', 'application/trickle-ice-sdpfrag'], limit: '512kb' });
  // A API do MediaMTX exige usuário e senha (gerados pelo entrypoint a cada início).
  const apiHeaders = apiAuth ? { Authorization: `Basic ${Buffer.from(apiAuth).toString('base64')}` } : {};
  const pendingApi = new Map();
  let closed = false;
  function api(route) {
    if (closed) return Promise.reject(Error('Monitor de mídia encerrado'));
    if (pendingApi.has(route)) return pendingApi.get(route);
    // Sem fila: os painéis não podem acumular consultas administrativas ilimitadas.
    if (pendingApi.size >= 32) return Promise.reject(busyError());
    const promise = httpClient.api(apiUrl + route, apiHeaders);
    pendingApi.set(route, promise);
    const done = () => { if (pendingApi.get(route) === promise) pendingApi.delete(route); };
    promise.then(done, done);
    return promise;
  }

  function forward(req, res, target, extraHeaders = {}) {
    forwardInner(req, res, target, extraHeaders).catch(error => {
      if (res.destroyed || res.writableEnded) return;
      if (!res.headersSent && error.code === 'OBS_BUSY') res.set('Retry-After', '1').status(503).type('text/plain').send('Servidor de mídia ocupado');
      else if (!res.headersSent) res.status(502).type('text/plain').send('Servidor de mídia indisponível');
      else res.end();
    });
  }

  async function forwardInner(req, res, target, extraHeaders) {
    const upstream = await httpClient.proxy(webrtcUrl + target, {
      method: req.method,
      // O token de publicação é validado pelo Node e não deve vazar ao MediaMTX,
      // que possui sua própria autenticação administrativa.
      headers: req.get('content-type') ? { 'Content-Type': req.get('content-type') } : {},
      body: typeof req.body === 'string' ? req.body : undefined,
    }, res);
    if (res.destroyed || res.writableEnded) return;
    const location = upstream.headers.get('location');
    if (location) res.set('Location', `/mtx${location}`);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    if (upstream.status === 201) res.set(extraHeaders);
    res.status(upstream.status).send(upstream.body);
  }

  // No OBS: Configurações > Transmissão > Serviço "WHIP", servidor .../obs/SeuNick.
  // O Link leva o TURN (UDP: o OBS não faz TURN por TCP) por onde a mídia vai chegar.
  app.post('/obs/:nick', credentialLimit, publicationAuth, sdpBody, (req, res) => {
    const auth = authorizePublish(req, cleanName(req.params.nick));
    const nick = auth && cleanName(auth.nick);
    if (!nick) {
      res.status((auth && auth.status) || 400).type('text/plain').send((auth && auth.error) || 'Nick inválido');
      return;
    }
    forward(req, res, `/${pathIdFor(nick)}/whip`, { Link: turnLink(req) });
  });
  app.post('/obs-publish/:publisherId([a-f0-9]{32})', credentialLimit, publisherAuth, sdpBody, (req, res) => {
    forward(req, res, `/pub_${req.params.publisherId}/whip`, { Link: turnLink(req) });
  });

  app.post('/mtx/:pathId/whep', sdpBody, (req, res) => {
    if (!PATH_ID.test(req.params.pathId)) {
      res.status(404).end();
      return;
    }
    if (!authorizeView(req)) {
      res.status(401).type('text/plain').send('Entre com a sua conta');
      return;
    }
    forward(req, res, `/${req.params.pathId}/whep`);
  });

  const session = (req, res) => {
    const { pathId, kind, id } = req.params;
    if (!PATH_ID.test(pathId) || !SESSION_ID.test(id)) {
      res.status(404).end();
      return;
    }
    forward(req, res, `/${pathId}/${kind}/${id}`);
  };
  const sessionAuth = (req, res, next) => req.params.kind === 'whip'
    ? credentialLimit(req, res, () => (req.params.pathId.startsWith('pub_') ? publisherAuth : publicationAuth)(req, res, next)) : next();
  app.patch('/mtx/:pathId/:kind(whip|whep)/:id', sessionAuth, sdpBody, session);
  app.delete('/mtx/:pathId/:kind(whip|whep)/:id', sessionAuth, session);

  // Estatísticas do trecho OBS -> servidor, pro painel (i) de quem assiste. Por quem
  // assiste essas perdas não aparecem: o servidor remonta o vídeo antes de repassar.
  app.get('/mtx/:pathId/stats', async (req, res) => {
    const { pathId } = req.params;
    if (!PATH_ID.test(pathId)) {
      res.status(404).end();
      return;
    }
    if (!authorizeView(req)) {
      res.status(401).end();
      return;
    }
    res.set('Cache-Control', 'no-store');
    // Só pergunta ao MediaMTX por transmissões no ar: senão ele registra um ERR no log
    // a cada consulta de quem ficou com o painel (i) aberto depois que ela acabou.
    if (!streams.has(pathId)) {
      res.status(404).json({ error: 'sem transmissão' });
      return;
    }
    try {
      const result = await stats(pathId, streams.get(pathId));
      if (!res.destroyed) res.status(result.status).json(result.body);
    } catch (error) {
      if (res.destroyed) return;
      if (error.code === 'OBS_BUSY') return res.status(503).set('Retry-After', '1').json({ error: 'monitor de mídia ocupado' });
      res.status(error.status === 404 ? 404 : 502).json({ error: error.status === 404 ? 'sem transmissão' : 'servidor de mídia indisponível' });
    }
  });

  const pendingStats = new Map();
  function stats(pathId, stream) {
    if (pendingStats.has(pathId)) return pendingStats.get(pathId);
    if (pendingStats.size >= 30) return Promise.reject(busyError());
    const promise = (async () => {
      const path = await api(`/v3/paths/get/${pathId}`);
      if (!path || !path.source || path.source.type !== 'webRTCSession') {
        return { status: 404, body: { error: 'sem transmissão' } };
      }
      if (typeof path.source.id !== 'string' || path.source.id.length > 128) throw Error('Sessão de mídia inválida');
      const session = await api(`/v3/webrtcsessions/get/${encodeURIComponent(path.source.id)}`);
      // Uma consulta atrasada não ressuscita a transmissão removida/recriada.
      if (!session || closed || streams.get(pathId) !== stream) {
        return { status: 404, body: { error: 'sem transmissão' } };
      }
      return { status: 200, body: {
        bytes: session.inboundBytes,
        packets: session.inboundRTPPackets,
        lost: session.inboundRTPPacketsLost,
        framesInError: path.inboundFramesInError,
      } };
    })();
    pendingStats.set(pathId, promise);
    const done = () => { if (pendingStats.get(pathId) === promise) pendingStats.delete(pathId); };
    promise.then(done, done);
    return promise;
  }

  const streams = new Map(); // pathId -> participante virtual da sala

  async function poll() {
    let items;
    try {
      items = (await api('/v3/paths/list?itemsPerPage=1000')).items;
      if (!Array.isArray(items)) throw Error('Lista de mídia inválida');
    } catch {
      return; // MediaMTX ainda subindo ou reiniciando
    }
    if (closed) return;
    const live = new Set(items.filter((p) => p && PATH_ID.test(p.name) && p.available).map((p) => p.name));
    const added = [];
    const removed = [];
    for (const pathId of live) {
      if (streams.has(pathId)) continue;
      const info = pathId.startsWith('pub_') ? publicationInfo(pathId) : null;
      const stream = { id: `obs:${pathId}`, name: info?.name || (pathId.startsWith('obs_') ? cleanName(nickFor(pathId)) : '') || 'OBS',
        ownerId: info?.ownerId || null, sharing: true, kind: 'obs', stream: pathId, startedAt: Date.now() };
      streams.set(pathId, stream);
      added.push(stream);
    }
    for (const [pathId, stream] of streams) {
      if (live.has(pathId)) continue;
      streams.delete(pathId);
      removed.push(stream);
    }
    if (added.length || removed.length) onStreamsChanged(added, removed);
  }

  let polling = false;
  async function tick() {
    if (closed || polling) return;
    polling = true;
    try { await poll(); } finally { polling = false; }
  }
  const timer = setInterval(tick, POLL_INTERVAL_MS);
  timer.unref?.();
  tick();

  return {
    list: () => [...streams.values()],
    ready: async () => {
      try {
        return Array.isArray((await api('/v3/paths/list?itemsPerPage=1000')).items);
      } catch {
        return false;
      }
    },
    close() { closed = true; clearInterval(timer); httpClient.close(); },
    refreshOwner(pathId) {
      const stream = streams.get(pathId);
      if (!stream || !pathId.startsWith('pub_')) return;
      const info = publicationInfo(pathId);
      const ownerId = info?.ownerId || null, name = info?.name || stream.name;
      if (stream.ownerId === ownerId && stream.name === name) return;
      stream.ownerId = ownerId; stream.name = name; onStreamUpdated(stream);
    },
  };
}

module.exports = { setupObs };
