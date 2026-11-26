// Usuário de testes: conta que o dono marca no painel e que qualquer conta com
// administração controla de longe, pela sala (transmitir, dar o controle, voz...). Pra
// quem usa a conta nada muda: só as contas com administração sabem quem é de testes.
//
// O servidor só repassa comandos de uma lista fechada, confere na hora que quem manda tem
// administração e que o destino é de testes (e não a própria conta), e anota cada comando
// no log. Quem executa é a sala do usuário de testes, que devolve o resultado (e anota no
// Log do app dele). Comando novo: uma entrada em COMMANDS aqui e um handler em tester.js.
const { ADMINS } = require('./account-auth');

const str = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const bool = (value) => value === true;
const SOURCE_ID = /^(screen|window):[\w:.-]{1,60}$/;

// args: limpa o que o comando aceita (o resto é descartado). null: comando inválido.
// log: o que vai pro log do servidor (false: não anota, como a leitura do estado).
const COMMANDS = {
  state: { args: () => ({}), log: false },
  sources: { args: () => ({}), log: () => 'pediu a lista de telas e janelas', timeout: 20000 },
  'share-start': {
    args: (a) => (SOURCE_ID.test(str(a.source, 80)) ? { source: a.source, name: str(a.name, 120), audio: bool(a.audio), windowAudio: bool(a.windowAudio) } : null),
    log: (a) => `começar a transmitir "${a.name || a.source}"${a.windowAudio ? ' (só o som do programa)' : a.audio ? ' (com o som do PC)' : ''}`,
    timeout: 25000,
  },
  'share-stop': { args: () => ({}), log: () => 'parar a transmissão' },
  'control-grant': {
    args: (a) => {
      const to = str(a.to, 40);
      const d = a.devices && typeof a.devices === 'object' ? a.devices : {};
      const devices = { keyboard: bool(d.keyboard), mouse: bool(d.mouse), gamepad: bool(d.gamepad) };
      return to && (devices.keyboard || devices.mouse || devices.gamepad) ? { to, devices } : null;
    },
    log: (a, name) => `dar o controle pra ${name(a.to)} (${['keyboard', 'mouse', 'gamepad'].filter((k) => a.devices[k]).map((k) => ({ keyboard: 'teclado', mouse: 'mouse', gamepad: 'gamepad' })[k]).join(', ')})`,
    timeout: 15000,
  },
  'control-revoke': { args: (a) => ({ to: str(a.to, 40) }), log: (a, name) => (a.to ? `tirar o controle de ${name(a.to)}` : 'tirar o controle de todo mundo') },
  'voice-join': { args: () => ({}), log: () => 'entrar na voz', timeout: 15000 },
  'voice-leave': { args: () => ({}), log: () => 'sair da voz' },
  mute: { args: (a) => ({ muted: bool(a.muted) }), log: (a) => (a.muted ? 'desligar o microfone' : 'ligar o microfone') },
  deafen: { args: (a) => ({ deafened: bool(a.deafened) }), log: (a) => (a.deafened ? 'desligar o som (ensurdecer)' : 'ligar o som') },
};
const MAX_REPLY = 64 * 1024;

function createTesters({ io, users, accounts, logEvent = () => {}, allow }) {
  // Quem está na sala com conta de testes: vai pras contas com administração (cada uma
  // tira a própria conta da lista, pra não se controlar).
  const list = () => [...users.values()].filter((u) => u.tester && u.account).map((u) => ({ id: u.id, account: u.account }));
  const broadcast = () => io.to(ADMINS).emit('tester:list', list());
  const reply = (ack) => (typeof ack === 'function' ? ack : () => {});
  const adminOf = (socket) => {
    const account = socket.data.account && accounts.get(socket.data.account.id);
    return account && account.admin ? account : null;
  };
  const nameOf = (id) => (users.get(id) || {}).name || 'alguém que saiu';

  function attach(socket) {
    socket.on('tester:list', (ack) => reply(ack)(adminOf(socket) ? list() : []));

    socket.on('tester:command', (msg, ack) => {
      const done = reply(ack);
      const by = adminOf(socket);
      if (!by) return done({ error: 'Só contas com administração.' });
      if (!allow(socket, 'tester', 40, 10000)) return done({ error: 'Calma aí: muitos comandos seguidos.' });
      const type = str(msg && msg.type, 30);
      const spec = Object.prototype.hasOwnProperty.call(COMMANDS, type) ? COMMANDS[type] : null;
      if (!spec) return done({ error: 'Comando desconhecido.' });
      const args = spec.args((msg && msg.args && typeof msg.args === 'object') ? msg.args : {});
      if (!args) return done({ error: 'Comando incompleto.' });
      const user = users.get(str(msg && msg.to, 40));
      const target = user && user.account ? accounts.get(user.account) : null;
      if (!target || !target.tester) return done({ error: 'Essa pessoa não é usuário de testes (ou já saiu da sala).' });
      if (target.id === by.id) return done({ error: 'Você não controla a sua própria conta.' });
      const peer = io.sockets.sockets.get(user.id);
      if (!peer) return done({ error: 'O usuário de testes já saiu da sala.' });
      const what = spec.log ? spec.log(args, nameOf) : '';
      if (what) logEvent(`Teste: ${by.nick} mandou ${user.name} ${what}`);
      peer.timeout(spec.timeout || 8000).emit('tester:command', { from: by.nick, type, args }, (err, res) => {
        let out;
        if (err) out = { error: 'O usuário de testes não respondeu.' };
        else if (!res || typeof res !== 'object' || JSON.stringify(res).length > MAX_REPLY) out = { error: 'Resposta inválida do usuário de testes.' };
        else out = res;
        if (what && out.error) logEvent(`Teste: ${user.name} não conseguiu ${what}: ${str(out.error, 200)}`);
        done(out);
      });
    });
  }

  return { attach, list, broadcast };
}

module.exports = { createTesters, COMMANDS };
