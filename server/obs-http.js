// O prazo cobre headers e corpo. Abortar fetch depois dos headers também cancela
// a leitura do corpo; buffers acima do limite não chegam ao parser/cliente.
function createObsHttp({ apiTimeoutMs = 5000, proxyTimeoutMs = 15000,
  apiMaxBytes = 2 * 1024 * 1024, proxyMaxBytes = 1024 * 1024,
  maxApiRequests = 32, maxProxyRequests = 32 } = {}) {
  for (const limit of [maxApiRequests, maxProxyRequests])
    if (!Number.isInteger(limit) || limit < 1 || limit > 1024) throw Error('Limite de consultas de mídia inválido');
  const active = new Set();
  const counts = { api: 0, proxy: 0 };
  let closed = false;
  async function request(url, options, { timeout, maxBytes, response, json = false, kind }) {
    if (closed) throw Error('Cliente de mídia encerrado');
    // Sem fila: reserva independente mantém o monitor/API utilizável sob carga WHEP.
    if (counts[kind] >= (kind === 'api' ? maxApiRequests : maxProxyRequests))
      throw Object.assign(Error('Cliente de mídia ocupado'), { code: 'OBS_BUSY' });
    counts[kind]++;
    const controller = new AbortController();
    const disconnected = () => { if (!response.writableEnded) controller.abort(); };
    active.add(controller);
    const timer = setTimeout(() => controller.abort(), timeout);
    timer.unref?.();
    response?.once('close', disconnected);
    try {
      if (response?.destroyed) controller.abort();
      const upstream = await fetch(url, { ...options, signal: controller.signal, redirect: 'error' });
      // Também limitar sem Content-Length e após descompressão pelo fetch.
      const chunks = [];
      let bytes = 0;
      if (upstream.body) for await (const chunk of upstream.body) {
        bytes += chunk.byteLength;
        if (bytes > maxBytes) throw Error('Resposta de mídia excedeu o limite');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks, bytes);
      if (json) {
        if (!upstream.ok) {
          const error = Error('API de mídia indisponível');
          error.status = upstream.status;
          throw error;
        }
        return JSON.parse(body.toString('utf8'));
      }
      return { status: upstream.status, headers: upstream.headers, body };
    } catch (error) {
      controller.abort();
      throw error;
    } finally {
      clearTimeout(timer);
      response?.removeListener('close', disconnected);
      active.delete(controller);
      counts[kind]--;
    }
  }
  return {
    api(url, headers) { return request(url, { headers }, { kind: 'api', timeout: apiTimeoutMs, maxBytes: apiMaxBytes, json: true }); },
    proxy(url, options, response) { return request(url, options, { kind: 'proxy', timeout: proxyTimeoutMs, maxBytes: proxyMaxBytes, response }); },
    close() { closed = true; for (const controller of active) controller.abort(); },
  };
}
module.exports = { createObsHttp };
