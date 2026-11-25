const crypto = require('node:crypto');
// Autorizações de uso único vinculadas ao socket e à instância atual do usuário.
// A rota continua atrás do gate da sala; nenhum payload grande passa pelo Socket.IO.
function createAssetUploads({ getOwner, now = () => performance.now(), ttlMs = 60000,
  timeoutMs = 60000, maxPending = 256, maxActive = 8 } = {}) {
  const permits = new Map(), active = new Set();
  const digest = token => crypto.createHash('sha256').update(token).digest('hex');
  const valid = item => !item.cancelled && item.socket.connected && getOwner(item.socket) === item.owner;
  function issue(socket, kind, apply) {
    const owner = getOwner(socket), at = now();
    if (!owner || !socket.connected || !['avatar', 'cursor', 'ping'].includes(kind) || !Number.isFinite(at)) return { error: 'Entre na sala primeiro.' };
    for (const [key, item] of permits) if (!valid(item) || at < item.at || at >= item.until || item.socket === socket && item.kind === kind) permits.delete(key);
    if (permits.size >= maxPending) return { error: 'Muitos uploads pendentes. Tente novamente.' };
    cancel(socket, kind);
    const token = crypto.randomBytes(32).toString('hex');
    permits.set(digest(token), { socket, owner, kind, apply, at, until: at + ttlMs });
    return { ok: true, url: '/asset-upload', token };
  }
  function cancel(socket, kind) {
    for (const [key, item] of permits) if (item.socket === socket && (!kind || item.kind === kind)) permits.delete(key);
    for (const item of [...active]) if (item.socket === socket && (!kind || item.kind === kind)) { item.cancelled = true; item.abort?.(); }
  }
  const problem = (status, message) => Object.assign(Error(message), { status });
  function read(req, item) {
    return new Promise((resolve, reject) => {
      let storage = null, size = 0, done = false;
      const maximum = item.kind === 'avatar' ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
      const length = req.headers['content-length'];
      const capacity = length !== undefined && /^\d+$/.test(length) && Number(length) <= maximum ? Number(length) : maximum;
      const finish = (error, value) => {
        if (done) return; done = true; clearTimeout(timer);
        req.off('data', data); req.off('end', end); req.off('aborted', aborted);
        item.abort = null; storage = null;
        if (error) { req.resume(); reject(error); } else resolve(value);
      };
      const data = chunk => {
        if (size + chunk.length > maximum || size + chunk.length > capacity) return finish(problem(413, 'A imagem excede os limites de upload.'));
        // Um único buffer limitado, mesmo com milhares de fragmentos pequenos.
        // Não retém uma lista de chunks controlada pelo remetente.
        if (!storage) storage = Buffer.allocUnsafe(capacity);
        chunk.copy(storage, size); size += chunk.length;
      };
      const end = () => finish(null, !storage ? Buffer.alloc(0) : size === storage.length ? storage : Buffer.from(storage.subarray(0, size)));
      const aborted = () => finish(problem(400, 'Upload interrompido.'));
      const timer = setTimeout(() => finish(problem(408, 'O upload demorou demais.')), timeoutMs); timer.unref?.();
      item.abort = () => finish(problem(401, 'A sessão do upload foi encerrada.'));
      req.on('data', data); req.once('end', end); req.once('aborted', aborted);
      // IncomingMessage pode emitir aborted e depois error. Mantenha o handler
      // até close, mesmo depois de liberar o body, para não deixar error órfão.
      req.on('error', aborted);
      req.once('close', () => req.off('error', aborted));
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maximum)) finish(problem(413, 'A imagem excede os limites de upload.'));
    });
  }
  async function handle(req, res) {
    res.set('Cache-Control', 'no-store');
    const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
    const key = token && digest(token), item = key && permits.get(key), at = now();
    if (key) permits.delete(key); // Consome antes de ler: replay não inicia outro body.
    if (!item || !valid(item) || !Number.isFinite(at) || at < item.at || at >= item.until) {
      req.resume(); return res.set('Connection', 'close').status(401).json({ error: 'Autorização de upload inválida ou expirada.' });
    }
    if (active.size >= maxActive || [...active].filter(other => other.socket === item.socket).length >= 3) {
      req.resume(); return res.set('Connection', 'close').status(429).json({ error: 'Muitos uploads simultâneos. Tente novamente.' });
    }
    active.add(item);
    try {
      const body = await read(req, item);
      if (!valid(item)) return res.set('Connection', 'close').status(401).json({ error: 'A sessão do upload foi encerrada.' });
      const result = item.apply(body);
      return res.status(result.error ? 400 : 200).json(result);
    } catch (error) {
      if (!res.destroyed) res.set('Connection', 'close').status(error.status || 500).json({ error: error.status ? error.message : 'Não foi possível aplicar a imagem.' });
    } finally { active.delete(item); }
  }
  return { issue, cancel, revoke: socket => cancel(socket), http: (req, res) => { handle(req, res).catch(() => { if (!res.headersSent) res.status(500).json({ error: 'Falha no upload.' }); }); } };
}
module.exports = { createAssetUploads };
