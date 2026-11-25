(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssNetworkHealth = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function tailnetAddress(address) {
    if (typeof address !== 'string') return false;
    if (/^fd7a:115c:a1e0:/i.test(address) && /^[a-f0-9:.]+$/i.test(address)) {
      try { return new URL(`http://[${address}]/`).hostname.toLowerCase().startsWith('[fd7a:115c:a1e0:'); }
      catch { return false; }
    }
    if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(address)) return false;
    const parts = address.split('.').map(Number);
    return parts.every(n => n <= 255) && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
  }
  function route(local, remote) {
    if (!local && !remote) return { kind: 'unknown', label: 'Rota ainda não identificada', protocol: '', vpn: 'unknown' };
    const relay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
    const vpn = [local, remote].some(c => tailnetAddress(c?.address || c?.ip));
    const direct = [local, remote].every(c => ['host', 'srflx', 'prflx'].includes(c?.candidateType));
    const protocol = [local?.relayProtocol, remote?.relayProtocol, local?.protocol, remote?.protocol]
      .find(p => ['udp', 'tcp', 'tls', 'ssltcp'].includes(p)) || '';
    return { kind: relay ? 'turn' : direct ? 'p2p' : 'unknown', protocol, vpn: vpn ? 'possible' : 'unknown',
      label: (relay ? 'Via TURN' : direct ? 'P2P WebRTC' : 'Rota ICE incompleta') + (protocol ? ` (${protocol.toUpperCase()})` : '')
        + (vpn ? '; faixa compatível com Tailscale/CGNAT: rota da VPN não verificada' : '; candidato ICE não comprova rede local') };
  }
  function selectedPair(report) {
    if (typeof report?.get !== 'function' || typeof report?.values !== 'function') return null;
    let selectedTransport = false, selected = null, nominated = null, nominations = 0;
    for (const r of report.values()) {
      if (r.type === 'transport' && r.selectedCandidatePairId) {
        selectedTransport = true;
        const pair = report.get(r.selectedCandidatePairId);
        if (pair?.type === 'candidate-pair' && pair.state === 'succeeded') return pair;
      }
      if (r.type === 'candidate-pair' && r.state === 'succeeded') {
        if (r.selected === true) selected = r;
        if (r.nominated === true) { nominated = r; nominations++; }
      }
    }
    return selectedTransport ? null : selected || (nominations === 1 ? nominated : null);
  }
  function routeFromStats(report) {
    const pair = selectedPair(report);
    return pair ? route(report.get(pair.localCandidateId), report.get(pair.remoteCandidateId)) : route();
  }
  async function inspectRoute(pc, { readStats = peer => peer.getStats(), timeoutMs = 1000,
    schedule = setTimeout, cancel = clearTimeout } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new RangeError('Prazo de rota inválido.');
    if (pc?.connectionState !== 'connected') return { ...route(), result: 'inactive' };
    let timer, expired = false;
    try {
      const stats = await Promise.race([Promise.resolve().then(() => readStats(pc)), new Promise((_, reject) => {
        timer = schedule(() => { expired = true; reject(new Error('Route deadline')); }, timeoutMs);
      })]);
      if (pc.connectionState !== 'connected') return { ...route(), result: 'inactive' };
      return { ...routeFromStats(stats), result: 'observed' };
    } catch { return { ...route(), result: expired ? 'timeout' : 'unavailable' }; }
    finally { if (timer !== undefined) cancel(timer); }
  }
  function percentiles(values) {
    const sorted = values.filter(v => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const p = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
    return { count: sorted.length, p50: p(0.5), p95: p(0.95), p99: p(0.99) };
  }
  return { route, tailnetAddress, percentiles, selectedPair, routeFromStats, inspectRoute };
});
