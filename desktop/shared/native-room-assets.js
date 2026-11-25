// Cookies ficam no processo principal. Somente páginas locais conhecidas recebem
// imagens privadas da origem configurada; redirects não carregam o Cookie adiante.
function installNativeRoomAssets({ session, getServer, getContents, pages }) {
  const allowedPages = new Set(pages), injected = new Set(); let closed = false;
  const filter = { urls: ['http://*/avatar/*', 'https://*/avatar/*'] };
  function trusted(details) {
    if (closed || details.resourceType !== 'image' || !['GET', 'HEAD'].includes(details.method)) return false;
    const contents = getContents(details.webContentsId);
    if (!contents || contents.isDestroyed() || !details.frame || details.frame !== contents.mainFrame) return false;
    try { const url = new URL(details.frame.url); url.search = ''; url.hash = ''; return allowedPages.has(url.href); }
    catch { return false; }
  }
  function avatar(url, server) {
    try {
      const parsed = new URL(url);
      return parsed.origin === server && !parsed.username && !parsed.password && !parsed.search
        && /^\/avatar\/[a-f0-9]{32}$/.test(parsed.pathname);
    } catch { return false; }
  }
  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (!trusted(details) && !injected.has(details.id)) return callback({ requestHeaders: details.requestHeaders });
    const headers = { ...details.requestHeaders };
    for (const name of Object.keys(headers)) if (name.toLowerCase() === 'cookie') delete headers[name];
    const server = getServer();
    if (!trusted(details) || !avatar(details.url, server) || injected.size >= 1024 && !injected.has(details.id)) return callback({ requestHeaders: headers });
    injected.add(details.id); // Reserva também o trabalho assíncrono de leitura.
    session.cookies.get({ url: server }).then(cookies => {
      if (injected.has(details.id) && trusted(details) && getServer() === server && avatar(details.url, server)) {
        const values = cookies.filter(c => ['__Host-wss-room', 'wss-room'].includes(c.name) && c.httpOnly
          && /^[a-f0-9]{64}$/.test(c.value) && (!c.secure || server.startsWith('https:')));
        if (values.length) headers.Cookie = values.map(c => c.name + '=' + c.value).join('; ');
      }
      if (!headers.Cookie) injected.delete(details.id);
      callback({ requestHeaders: headers });
    }, () => { injected.delete(details.id); callback({ requestHeaders: headers }); });
  });
  session.webRequest.onHeadersReceived(filter, (details, callback) => {
    // Não acompanhar redirects com Cookie injetado, inclusive para fora do filtro.
    if ([301, 302, 303, 305, 307, 308].includes(details.statusCode) && injected.has(details.id)) return callback({ cancel: true });
    if (!trusted(details) || !avatar(details.url, getServer())) return callback({});
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) if (['access-control-allow-origin', 'access-control-allow-credentials'].includes(key.toLowerCase())) delete headers[key];
    headers['Access-Control-Allow-Origin'] = ['null']; headers['Access-Control-Allow-Credentials'] = ['true'];
    callback({ responseHeaders: headers });
  });
  session.webRequest.onCompleted(filter, details => injected.delete(details.id));
  session.webRequest.onErrorOccurred(filter, details => injected.delete(details.id));
  return () => {
    closed = true; injected.clear();
    for (const event of ['onBeforeSendHeaders', 'onHeadersReceived', 'onCompleted', 'onErrorOccurred']) session.webRequest[event](null);
  };
}
module.exports = { installNativeRoomAssets };
