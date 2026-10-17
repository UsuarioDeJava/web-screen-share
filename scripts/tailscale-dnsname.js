// Lê `tailscale status --json` da entrada padrão e imprime o nome MagicDNS
// desta máquina (sem o ponto final), pra usar com `tailscale cert`.
let data = '';
process.stdin.on('data', (chunk) => {
  data += chunk;
});
process.stdin.on('end', () => {
  try {
    const parsed = JSON.parse(data);
    const dnsName = (parsed.Self && parsed.Self.DNSName) || '';
    process.stdout.write(dnsName.replace(/\.$/, ''));
  } catch (err) {
    // Sem Tailscale rodando ou saída inesperada: não imprime nada.
  }
});
