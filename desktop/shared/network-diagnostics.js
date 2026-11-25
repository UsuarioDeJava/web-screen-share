// Mede a rota do servidor configurado e, se preciso, a capacidade UDP/NAT local. Nunca retorna inventário de
// peers, credenciais ou saída bruta do CLI à página remota.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { isIP } = require('node:net');
const path = require('node:path');
const { percentiles } = require('./network-health');
function parsePing(output) {
  const samples = [];
  for (const line of String(output).split(/\r?\n/)) {
    const match = /\bvia (.+?) in ([\d.]+)(µs|us|ms|s)\b/.exec(line);
    if (!match) continue;
    const ms = Number(match[2]) * (match[3] === 's' ? 1000 : match[3] === 'ms' ? 1 : 0.001);
    if (!Number.isFinite(ms)) continue;
    const relay = /^DERP\(([^)]+)\)$/.exec(match[1]);
    const direct = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}:\d+$|^\[[a-fA-F0-9:]+\]:\d+$/.test(match[1]);
    samples.push({ ms, route: relay ? 'derp' : direct ? 'direct' : 'unknown', relay: relay?.[1] || null });
  }
  return { samples, latency: percentiles(samples.map(s => s.ms)), route: samples.at(-1)?.route || 'unknown', relay: samples.at(-1)?.relay || null };
}
function createNetworkDiagnostics({ run = promisify(execFile), now = () => performance.now(), platform = process.platform,
  programFiles = process.env.ProgramFiles || 'C:\\Program Files' } = {}) {
  let pending = null, cached = null;
  async function inspect(origin) {
    let host;
    try { const url = new URL(origin); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); host = url.hostname.toLowerCase().replace(/^\[|\]$/g, ''); }
    catch { return { available: false, reason: 'Endereço do servidor inválido.' }; }
    if (['localhost', '127.0.0.1', '::1'].includes(host)) return { available: false, reason: 'Servidor local; não há trecho Tailscale para medir.' };
    if (cached?.host === host && now() >= cached.at && now() - cached.at < 15000) return cached.value;
    if (pending) return pending.host === host ? pending.promise : { available: false, reason: 'Outro diagnóstico de rota está em andamento.' };
    const command = platform === 'win32' ? path.join(programFiles, 'Tailscale', 'tailscale.exe') : 'tailscale';
    const promise = (async () => {
      try {
        const { stdout } = await run(command, ['status', '--json'], { timeout: 4000, maxBuffer: 256 * 1024, windowsHide: true });
        const status = JSON.parse(stdout);
        const peers = Object.values(status.Peer || {});
        const peer = peers.find(p => [p.DNSName?.replace(/\.$/, '').toLowerCase(), p.HostName?.toLowerCase(), ...(p.TailscaleIPs || [])].includes(host));
        if (!peer) return { available: false, reason: 'Servidor não identificado entre os peers do Tailscale; a rota da VPN continua desconhecida.' };
        const target = peer.TailscaleIPs?.find(ip => isIP(ip));
        if (!target) return { available: false, reason: 'Peer sem endereço Tailscale válido.' };
        let output;
        try {
          output = (await run(command, ['ping', '--c', '3', '--timeout', '2s', '--until-direct=false', target],
            { timeout: 8500, maxBuffer: 16384, windowsHide: true })).stdout;
        } catch (error) { output = error.stdout || ''; }
        const measured = parsePing(output);
        let localNat = null;
        if (measured.route !== 'direct') {
          try {
            const result = await run(command, ['netcheck','--format=json'], {timeout:7000,maxBuffer:65536,windowsHide:true});
            const data = JSON.parse(result.stdout);
            localNat = Object.fromEntries(['UDP','MappingVariesByDestIP','UPnP','PMP','PCP']
              .map(key => [key, typeof data?.[key] === 'boolean' ? data[key] : null]));
          } catch { /* O resultado do ping continua válido se o CLI não expuser netcheck. */ }
        }
        return { available: true, ...measured, localNat, reason: measured.samples.length ? '' : 'O peer não respondeu ao teste de rota.' };
      } catch { return { available: false, reason: 'Tailscale indisponível, sem permissão ou sem resposta. A rota da VPN não foi verificada.' }; }
    })();
    pending = { host, promise };
    try { const value = await promise; cached = { host, at: now(), value }; return value; }
    finally { pending = null; }
  }
  return { inspect };
}
module.exports = { createNetworkDiagnostics, parsePing };
