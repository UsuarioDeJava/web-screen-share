// Transmissão pelo OBS (WHIP): o OBS publica num MediaMTX local e quem assiste puxa
// o vídeo por WHEP. Este módulo só repassa o HTTP; a mídia passa pelo TURN embutido.
const express = require('express');

const PATH_PREFIX = 'obs_';
const PATH_ID = /^obs_(?:[0-9a-f]{2})+$/;
const SESSION_ID = /^[0-9a-f-]{36}$/;
const POLL_INTERVAL_MS = 2000;

// O MediaMTX só aceita [A-Za-z0-9_.-/] no nome do caminho; o nick (com acento,
// espaço etc.) vai em hexadecimal e volta na hora de mostrar.
const pathIdFor = (nick) => PATH_PREFIX + Buffer.from(nick, 'utf8').toString('hex');
const nickFor = (pathId) => Buffer.from(pathId.slice(PATH_PREFIX.length), 'hex').toString('utf8');

function setupObs({ app, webrtcUrl, apiUrl, apiAuth, cleanName, turnLink, onStreamsChanged }) {
  const sdpBody = express.text({ type: ['application/sdp', 'application/trickle-ice-sdpfrag'], limit: '512kb' });
  // A API do MediaMTX exige usuário e senha (gerados pelo entrypoint a cada início).
  const apiHeaders = apiAuth ? { Authorization: `Basic ${Buffer.from(apiAuth).toString('base64')}` } : {};
  const api = (route) => fetch(apiUrl + route, { headers: apiHeaders });

  function forward(req, res, target, extraHeaders = {}) {
    forwardInner(req, res, target, extraHeaders).catch((err) => {
      console.error(`Erro repassando ${req.method} ${target} pro MediaMTX:`, err.message || err);
      if (!res.headersSent) res.status(502).type('text/plain').send('Servidor de mídia indisponível');
      else res.end();
    });
  }

  async function forwardInner(req, res, target, extraHeaders) {
    let upstream;
    try {
      upstream = await fetch(webrtcUrl + target, {
        method: req.method,
        // Sem o Authorization: o token do OBS é ignorado (entra quem alcança a página,
        // como na sala) e o MediaMTX o trataria como credencial.
        headers: req.get('content-type') ? { 'Content-Type': req.get('content-type') } : {},
        body: typeof req.body === 'string' ? req.body : undefined,
      });
    } catch {
      res.status(502).type('text/plain').send('Servidor de mídia indisponível');
      return;
    }
    const location = upstream.headers.get('location');
    if (location) res.set('Location', `/mtx${location}`);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    if (upstream.status === 201) res.set(extraHeaders);
    res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
  }

  // No OBS: Configurações > Transmissão > Serviço "WHIP", servidor .../obs/SeuNick.
  // O Link leva o TURN (UDP: o OBS não faz TURN por TCP) por onde a mídia vai chegar.
  app.post('/obs/:nick', sdpBody, (req, res) => {
    const nick = cleanName(req.params.nick);
    if (!nick) {
      res.status(400).type('text/plain').send('Nick inválido');
      return;
    }
    forward(req, res, `/${pathIdFor(nick)}/whip`, { Link: turnLink(req) });
  });

  app.post('/mtx/:pathId/whep', sdpBody, (req, res) => {
    if (!PATH_ID.test(req.params.pathId)) {
      res.status(404).end();
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
  app.patch('/mtx/:pathId/:kind(whip|whep)/:id', sdpBody, session);
  app.delete('/mtx/:pathId/:kind(whip|whep)/:id', session);

  // Estatísticas do trecho OBS -> servidor, pro painel (i) de quem assiste. Por quem
  // assiste essas perdas não aparecem: o servidor remonta o vídeo antes de repassar.
  app.get('/mtx/:pathId/stats', async (req, res) => {
    const { pathId } = req.params;
    if (!PATH_ID.test(pathId)) {
      res.status(404).end();
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
      const pathRes = await api(`/v3/paths/get/${pathId}`);
      const path = pathRes.ok ? await pathRes.json() : null;
      if (!path || !path.source || path.source.type !== 'webRTCSession') {
        res.status(404).json({ error: 'sem transmissão' });
        return;
      }
      const sessionRes = await api(`/v3/webrtcsessions/get/${encodeURIComponent(path.source.id)}`);
      const session = sessionRes.ok ? await sessionRes.json() : null;
      if (!session) {
        res.status(404).json({ error: 'sem transmissão' });
        return;
      }
      res.json({
        bytes: session.inboundBytes,
        packets: session.inboundRTPPackets,
        lost: session.inboundRTPPacketsLost,
        framesInError: path.inboundFramesInError,
      });
    } catch {
      res.status(502).json({ error: 'servidor de mídia indisponível' });
    }
  });

  const streams = new Map(); // pathId -> participante virtual da sala

  async function poll() {
    let items;
    try {
      const res = await api('/v3/paths/list?itemsPerPage=1000');
      items = (await res.json()).items || [];
    } catch {
      return; // MediaMTX ainda subindo ou reiniciando
    }
    const live = new Set(items.filter((p) => PATH_ID.test(p.name) && p.available).map((p) => p.name));
    const added = [];
    const removed = [];
    for (const pathId of live) {
      if (streams.has(pathId)) continue;
      const stream = { id: `obs:${pathId}`, name: cleanName(nickFor(pathId)) || 'OBS', sharing: true, kind: 'obs', stream: pathId, startedAt: Date.now() };
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

  setInterval(poll, POLL_INTERVAL_MS);
  poll();

  return {
    list: () => [...streams.values()],
    ready: async () => {
      try {
        return (await api('/v3/paths/list')).ok;
      } catch {
        return false;
      }
    },
  };
}

module.exports = { setupObs };
