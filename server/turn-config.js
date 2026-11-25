// Configuração do coturn embutido. Não imprimir valores de ambiente em erros.
function integer(env, name, fallback, min, max) {
  const raw = env[name];
  const value = raw === undefined || raw === '' ? fallback
    : typeof raw === 'string' && /^(0|[1-9][0-9]*)$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw Error(`${name} deve ser um inteiro entre ${min} e ${max}.`);
  return value;
}
function createTurnConfig(env) {
  const secret = env.LOCAL_TURN_SECRET;
  if (typeof secret !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(secret))
    throw Error('LOCAL_TURN_SECRET deve conter de 1 a 256 caracteres ASCII sem espaços.');
  const port = integer(env, 'LOCAL_TURN_PORT', 3478, 1, 65535);
  const total = integer(env, 'TURN_TOTAL_QUOTA', 128, 1, 16384);
  const user = integer(env, 'TURN_USER_QUOTA', Math.min(16, total), 1, total);
  const maxBps = integer(env, 'TURN_MAX_BPS', 0, 0, 1000000000);
  const capacity = integer(env, 'TURN_BPS_CAPACITY', 0, 0, 1000000000);
  if (maxBps && capacity && capacity < maxBps)
    throw Error('TURN_BPS_CAPACITY deve ser pelo menos TURN_MAX_BPS quando ambos estão ativos.');
  return [
    `listening-port=${port}`, 'relay-ip=127.0.0.1', 'min-port=49152', 'max-port=65535',
    'no-tls', 'no-dtls', 'no-cli', 'no-tcp-relay', 'fingerprint', 'use-auth-secret',
    `static-auth-secret=${secret}`, 'realm=web-screen-share',
    `total-quota=${total}`, `user-quota=${user}`, `max-bps=${maxBps}`, `bps-capacity=${capacity}`,
    'allow-loopback-peers', 'denied-peer-ip=0.0.0.0-255.255.255.255',
    'denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'allowed-peer-ip=127.0.0.1',
    'simple-log', 'no-stdout-log', 'log-file=/tmp/turnserver.log', 'pidfile=/tmp/turnserver.pid', '',
  ].join('\n');
}
if (require.main === module) {
  try { process.stdout.write(createTurnConfig(process.env)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createTurnConfig };
