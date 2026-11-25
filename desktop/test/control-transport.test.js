const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../shared/gamepad');
const wire = require('../shared/control-wire');
const source = fs.readFileSync(path.join(__dirname, '../../public/js/control-transport.js'), 'utf8');

function fixture(feedbackEnabled = false, binaryFast = true, protocolWire = wire, maxFastBufferedBytes = 16384, fastPacketLifeTimeMs = null, iceServers = Promise.resolve([])) {
  const sent = [], handlers = new Map(), pcs = [], timers = new Set(), delivered = [], resets = [];
  let time = 0;
  const feedback = [], feedbackStops = [];
  const socket = { connected: true, on(e, f) { if (!handlers.has(e)) handlers.set(e, new Set()); handlers.get(e).add(f); },
    off(e, f) { handlers.get(e)?.delete(f); }, emit(e, p) { sent.push({ event: e, payload: p }); } };
  class Channel {
    constructor(label) { this.label = label; this.readyState = 'connecting'; this.bufferedAmount = 0; this.sent = []; this.raw = []; }
    open() { this.readyState = 'open'; this.onopen?.(); }
    send(data) { if (this.readyState !== 'open' || this.throwSend) throw new Error('channel unavailable'); this.raw.push(data);
      this.sent.push(typeof data === 'string' ? JSON.parse(data) : wire.decodeFast(data, { mouse: true, gamepad: true }, 'grant')); }
    close() { this.readyState = 'closed'; this.onclose?.(); }
  }
  class PC {
    constructor(config) { this.config = config; this.channels = []; this.candidates = []; pcs.push(this); }
    createDataChannel(label, options) { const c = new Channel(label); c.options = options; this.channels.push(c); return c; }
    async createOffer() { return { type: 'offer', sdp: 'offer' }; }
    async createAnswer() { return { type: 'answer', sdp: 'answer' }; }
    async setLocalDescription(sdp) { this.localDescription = sdp; }
    async setRemoteDescription(sdp) { this.remoteDescription = sdp; }
    async addIceCandidate(c) { this.candidates.push(c); }
    async getStats() { return new Map(); }
    close() { this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
  }
  const context = vm.createContext({ WssGamepad: model, WssControlWire: protocolWire, WssNetworkHealth: require('../shared/network-health'),
    WssSignaling: require('../../public/js/signaling'),
    setInterval: f => { timers.add(f); return f; }, clearInterval: f => timers.delete(f), performance: { now: () => time } });
  vm.runInContext(source, context);
  const transport = context.WssControlTransport.create({ socket, iceServers, PeerConnection: PC,
    now: () => time, binaryFast, maxFastBufferedBytes, fastPacketLifeTimeMs, onInput: p => delivered.push(p), onReset: p => resets.push(p),
    onFeedback: feedbackEnabled ? value=>feedback.push(value) : null, onFeedbackStop: value=>feedbackStops.push(value) });
  const grant = { session: 'grant', peer: 'host', stream: 'screen', devices: { keyboard: true, mouse: true, gamepad: true } };
  const fire = (e, p) => { for (const f of handlers.get(e) || []) f(p); };
  return { transport, socket, sent, pcs, PC, Channel, grant, fire, timers, delivered, resets, feedback, feedbackStops, context,
    tick(at) { time = at; for (const f of timers) f(); } };
}

test('estatísticas de comandos preservam indício IPv6 e descartam rota quando o par desaparece', async () => {
  const f = fixture(), session = f.transport.guest(f.grant); await session.ready;
  let stats = new Map([
    ['transport', { type: 'transport', selectedCandidatePairId: 'pair' }],
    ['pair', { type: 'candidate-pair', state: 'succeeded', localCandidateId: 'local', remoteCandidateId: 'remote', currentRoundTripTime: 0.025 }],
    ['local', { candidateType: 'host', protocol: 'udp' }],
    ['remote', { candidateType: 'host', address: 'fd7a:115c:a1e0::1' }],
  ]);
  f.pcs[0].getStats = async () => stats;
  f.tick(2000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.transport.snapshot()[0].route, 'p2p');
  assert.equal(f.transport.snapshot()[0].vpn, 'possible');
  assert.equal(f.transport.snapshot()[0].networkRttMs, 25);
  stats = new Map();
  f.tick(4000); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.transport.snapshot()[0].route, 'unknown');
  assert.equal(f.transport.snapshot()[0].vpn, 'unknown');
  assert.equal(f.transport.snapshot()[0].networkRttMs, null);
  f.transport.destroy();
});

test('fallback inicial muda para P2P, limita fila e ignora conexão revogada', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  f.transport.send('screen', { kind: 'key', code: 'KeyA', down: true });
  assert.equal(f.sent.at(-1).event, 'control:packet');
  assert.equal(f.sent.at(-1).payload.packet.epoch, 1);
  const channel = new f.Channel('wss-control-events-v1'); f.pcs[0].ondatachannel({ channel }); channel.open();
  assert.equal(channel.sent[0].epoch, 2);
  assert.deepEqual(channel.sent[0].held.keys, ['KeyA']);
  const moves = new f.Channel('wss-control-moves-v1'); f.pcs[0].ondatachannel({ channel: moves }); moves.open();
  f.transport.send('screen', { kind: 'move', x: 0.2, y: 0.4 });
  assert.equal(moves.sent[0].lane, 'move');
  moves.bufferedAmount = 20000;
  f.transport.send('screen', { kind: 'move', x: 0.8, y: 0.9 });
  assert.equal(moves.sent.length, 1); // descarta movimento substituível, sem fallback global
  channel.bufferedAmount = 20000;
  f.transport.send('screen', { kind: 'key', code: 'KeyA', down: false });
  assert.equal(f.transport.snapshot()[0].transport, 'socket');
  const packet = f.sent.at(-1).payload.packet;
  assert.equal(packet.epoch, 3); assert.deepEqual([...packet.held.keys], []);
  f.fire('control:revoked', { stream: 'screen' });
  assert.equal(f.transport.snapshot().length, 0);
  const count = f.sent.length; channel.open(); f.tick(1000);
  assert.equal(f.sent.length, count);
  f.transport.destroy(); assert.equal(f.timers.size, 0);
});

test('negociação de comandos limita backlog e não bloqueia outra concessão ou fallback', async () => {
  const f = fixture(), first = f.transport.guest(f.grant); await first.ready;
  let release, answers = 0;
  f.pcs[0].setRemoteDescription = description => new Promise(resolve => { release = () => { f.pcs[0].remoteDescription = description; resolve(); }; });
  f.pcs[0].createAnswer = async () => { answers++; return { type: 'answer', sdp: 'answer' }; };
  f.fire('control:signal', { from: 'host', stream: 'screen', session: 'grant', data: { type: 'offer', sdp: 'offer' } });
  await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 200; i++) f.fire('control:signal', { from: 'host', stream: 'screen', session: 'grant',
    data: { type: 'candidate', candidate: { candidate: 'candidate:1 1 UDP 1 127.0.0.1 9 typ host' } } });
  const stalled = f.transport.snapshot()[0];
  assert.equal(stalled.signalingPending, 64); assert.equal(stalled.droppedSignals, 137);
  f.transport.send('screen', { kind: 'key', code: 'KeyA', down: true });
  assert.equal(f.sent.at(-1).event, 'control:packet', 'fallback não espera negociação');
  const other = f.transport.guest({ ...f.grant, session: 'second', stream: 'other', peer: 'otherhost' }); await other.ready;
  f.fire('control:signal', { from: 'otherhost', stream: 'other', session: 'second', data: { type: 'offer', sdp: 'other-offer' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.sent.some(p => p.event === 'control:signal' && p.payload.session === 'second' && p.payload.data.type === 'answer'));
  f.fire('control:revoked', { stream: 'screen', mine: false });
  assert.equal(first.pending.length, 0); release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(answers, 0); assert.equal(f.pcs[0].candidates.length, 0);
  assert.equal(f.sent.some(p => p.event === 'control:signal' && p.payload.session === 'grant' && p.payload.data.type === 'answer'), false);
  const late = new f.Channel('wss-control-events-v1'); f.pcs[0].ondatachannel({ channel: late });
  assert.equal(late.readyState, 'closed'); f.transport.destroy();
});

test('revogar durante createOffer impede configurar e publicar uma oferta atrasada', async () => {
  const f = fixture(); let release;
  f.PC.prototype.createOffer = () => new Promise(resolve => { release = resolve; });
  const session = f.transport.host({ ...f.grant, peer: 'player' });
  await new Promise(resolve => setImmediate(resolve));
  f.transport.revoke('player'); release({ type: 'offer', sdp: 'late-offer' }); await session.ready;
  assert.equal(f.pcs[0].localDescription, undefined);
  assert.equal(f.sent.some(p => p.event === 'control:signal' && p.payload.data.type === 'offer'), false);
  assert.equal(f.timers.size, 0); f.transport.destroy();
});

test('sinal inválido não entra na fila e falha de SDP mantém fallback e recuperação', async () => {
  const f = fixture(), session = f.transport.guest(f.grant); await session.ready;
  let calls = 0;
  f.pcs[0].setRemoteDescription = async description => { calls++; if (calls === 1) throw Error('fixture'); f.pcs[0].remoteDescription = description; };
  f.fire('control:signal', { from: 'host', stream: 'screen', session: 'grant', data: { type: 'offer', sdp: 'x'.repeat(65537) } });
  f.fire('control:signal', { from: 'forged', stream: 'screen', session: 'grant', data: { type: 'offer', sdp: 'offer' } });
  assert.equal(calls, 0); assert.equal(f.transport.snapshot()[0].signalingPending, 0);
  for (let i = 0; i < 2; i++) {
    f.fire('control:signal', { from: 'host', stream: 'screen', session: 'grant', data: { type: 'offer', sdp: 'offer' } });
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(calls, 2);
  assert.ok(f.sent.some(p => p.event === 'control:signal' && p.payload.data.type === 'answer'));
  assert.equal(f.transport.snapshot()[0].signalingPending, 0); f.transport.destroy();
});
test('concessão nova consulta o provedor ICE novamente sem recriar o peer existente', async () => {
  let calls = 0;
  const f = fixture(false, true, wire, 16384, null, async () => [{ urls: 'turn:fixture', username: 'u' + (++calls), credential: 'test' }]);
  const first = f.transport.host(f.grant); await first.ready;
  const second = f.transport.host({ ...f.grant, session: 'second', peer: 'other' }); await second.ready;
  assert.equal(calls, 2); assert.equal(f.pcs.length, 2);
  assert.equal(f.pcs[0].config.iceServers[0].username, 'u1');
  assert.equal(f.pcs[1].config.iceServers[0].username, 'u2');
  assert.notEqual(f.pcs[0].connectionState, 'closed'); f.transport.destroy();
});

test('fila rápida ocupada não acumula analógicos nem bloqueia botões e snapshot restaura o estado mais recente', async () => {
  const f = fixture(false, true, wire, 0), s = f.transport.guest(f.grant); await s.ready;
  const events = new f.Channel('wss-control-events-v1'), moves = new f.Channel('wss-control-moves-v1');
  for (const channel of [events, moves]) { f.pcs[0].ondatachannel({ channel }); channel.open(); }
  events.onmessage({ data: JSON.stringify({ meta: 'capabilities', analog: true, fastBinary: 1 }) });
  const pad = model.neutral(); f.transport.send('screen', { kind: 'gamepad', ...pad });
  moves.bufferedAmount = 68;
  for (let i = 1; i <= 100; i++) f.transport.send('screen', { kind: 'gamepad', axes: [i / 100, 0, 0, 0], buttons: pad.buttons });
  assert.equal(moves.sent.length, 0); assert.equal(f.transport.snapshot()[0].droppedFastSnapshots, 100);
  f.transport.send('screen', { kind: 'key', code: 'KeyA', down: true });
  assert.ok(events.sent.at(-1).held.keys.includes('KeyA'));
  assert.equal(events.sent.at(-1).held.pad.axes[0], 1);
  assert.equal(f.transport.snapshot()[0].transport, 'webrtc');
  moves.bufferedAmount = 0;
  f.transport.send('screen', { kind: 'gamepad', axes: [0.4, 0, 0, 0], buttons: pad.buttons });
  assert.equal(moves.sent.length, 1); assert.equal(moves.sent[0].input.axes[0], 0.4);
  f.transport.stop('screen'); f.tick(1000);
  assert.equal(moves.sent.length, 1, 'não reaplica nenhum analógico descartado');
  assert.equal(events.sent.filter(p => p.held).at(-1).held.pad.axes[0], 0);
  f.transport.destroy();
});

test('RTT elevado espaça eixos, preserva o estado final e libera botões imediatamente', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  const events = new f.Channel('wss-control-events-v1'), moves = new f.Channel('wss-control-moves-v1');
  for (const channel of [events, moves]) { f.pcs[0].ondatachannel({ channel }); channel.open(); }
  events.onmessage({ data: JSON.stringify({ meta: 'capabilities', analog: true }) });
  const pad = model.neutral();
  const send = x => f.transport.send('screen', { kind: 'gamepad', axes: [x, 0, 0, 0], buttons: pad.buttons });
  const pong = at => events.onmessage({ data: JSON.stringify({ meta: 'pong', at }) });
  send(0);
  f.tick(1000); f.tick(1020); pong(1000);
  send(0.1); send(0.2);
  assert.equal(moves.sent.length, 2);
  f.tick(2000); f.tick(2120);
  send(0.3); send(0.4);
  assert.equal(moves.sent.length, 3);
  f.tick(2152);
  assert.equal(events.sent.filter(p => p.held).at(-1).held.pad.axes[0], 0.4);
  send(0.5);
  assert.equal(moves.sent.at(-1).input.axes[0], 0.5);
  pad.buttons[0] = 1; send(0.6);
  pad.buttons[0] = 0; send(0.7);
  assert.deepEqual(events.sent.slice(-2).map(p => p.held.pad.buttons[0]), [1, 0]);
  pong(2000); f.tick(3000); f.tick(3020); pong(3000);
  send(0.8); send(0.9);
  assert.equal(moves.sent.length, 6);
  f.transport.destroy();
});

test('expiração rápida opt-in não combina modos SCTP e mantém canal confiável separado', async () => {
  for (const lifetime of [null, 0, -1, NaN, 1001, 50]) {
    const f = fixture(false, true, wire, 16384, lifetime), s = f.transport.host(f.grant); await s.ready;
    const [events, moves] = f.pcs[0].channels;
    assert.equal(events.options.ordered, true);
    assert.equal(events.options.maxPacketLifeTime, undefined); assert.equal(events.options.maxRetransmits, undefined);
    assert.equal(moves.options.ordered, false);
    assert.equal(moves.options.maxPacketLifeTime, lifetime === 50 ? 50 : undefined);
    assert.equal(moves.options.maxRetransmits, lifetime === 50 ? undefined : 0);
    f.transport.destroy();
  }
});

test('diagnóstico mantém ping pendente, mede RTT acima de um segundo e distingue timeout de resposta tardia', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  const events = new f.Channel('wss-control-events-v1'); f.pcs[0].ondatachannel({ channel: events }); events.open();
  const pings = () => events.sent.filter(p => p.meta === 'ping');
  f.tick(1000); f.tick(2000); f.tick(3500);
  assert.equal(pings().length, 1, 'não substitui o ping pendente');
  events.onmessage({ data: JSON.stringify({ meta: 'pong', at: 1000 }) });
  assert.equal(f.transport.snapshot()[0].commandRttMs, 2500);
  f.tick(4000); f.tick(9000);
  assert.equal(f.transport.snapshot()[0].commandProbeTimeouts, 1);
  assert.equal(pings().length, 3, 'novo ping após timeout');
  events.onmessage({ data: JSON.stringify({ meta: 'pong', at: 4000 }) });
  assert.equal(f.transport.snapshot()[0].commandLatency.count, 1, 'resposta expirada não cria observação');
  f.tick(9300); events.onmessage({ data: JSON.stringify({ meta: 'pong', at: 9000 }) });
  assert.equal(f.transport.snapshot()[0].commandRttMs, 300);
  assert.equal(f.transport.snapshot()[0].commandLatency.count, 2);
  f.transport.destroy();
});

test('vibração só chega ao convidado ativo da sessão e geração atual, com sequência e parada na troca de transporte', async () => {
  const f=fixture(true),s=f.transport.guest(f.grant);await s.ready;
  const channel=new f.Channel('wss-control-events-v1');f.pcs[0].ondatachannel({channel});channel.open();
  f.transport.send('screen',{kind:'gamepad',...model.neutral()});
  const packet={v:1,session:s.id,epoch:s.epoch,seq:1,strong:0.8,weak:0.2,duration:150};
  const receive=p=>channel.onmessage({data:JSON.stringify({meta:'feedback',packet:p})});
  receive({...packet,epoch:1});receive({...packet,session:'old'});assert.equal(f.feedback.length,0);
  receive({...packet,from:'estranho'});receive(packet);assert.equal(f.feedback.length,1);assert.equal(f.feedback[0].from,'host');
  f.pcs[0].close();const stops=f.feedbackStops.length;
  f.fire('control:feedback',{from:'stranger',stream:'screen',packet:{...packet,epoch:s.epoch,seq:2}});
  assert.equal(f.feedback.length,1);
  f.tick(100);f.fire('control:feedback',{from:'host',stream:'screen',packet:{...packet,epoch:s.epoch,seq:3}});
  assert.equal(f.feedback.length,2);
  f.transport.stop('screen');assert.equal(f.feedbackStops.length,stops+1);
  receive({...packet,epoch:s.epoch,seq:4});assert.equal(f.feedback.length,2);f.transport.destroy();
});

test('host exige suporte negociado, limita fila e fallback não acumula vibração antiga', async () => {
  const f=fixture(),s=f.transport.host(f.grant);await s.ready;const events=s.events;events.open();
  events.onmessage({data:JSON.stringify({v:1,session:s.id,epoch:2,seq:1,lane:'event',input:null,held:{keys:[],buttons:[],pad:model.neutral()}})});
  const value={strong:1,weak:0.4,duration:150};assert.equal(f.transport.feedback('host',value),false);
  events.onmessage({data:JSON.stringify({meta:'feedback-capabilities',supported:true})});
  assert.equal(f.transport.feedback('host',value),true);assert.equal(events.sent.at(-1).meta,'feedback');
  f.tick(50);events.bufferedAmount=20000;assert.equal(f.transport.feedback('host',value),false);events.bufferedAmount=0;
  f.fire('control:packet',{from:'host',stream:'screen',packet:{v:1,session:s.id,epoch:3,seq:1,lane:'event',input:null,held:{keys:[],buttons:[],pad:model.neutral()}}});
  f.socket.io={engine:{transport:{writable:false},writeBuffer:[]}};
  assert.equal(f.transport.feedback('host',value),false);
  f.socket.io.engine.transport.writable=true;
  f.socket.io.engine.transport.ws={bufferedAmount:20000};assert.equal(f.transport.feedback('host',value),false);
  f.socket.io.engine.transport.ws.bufferedAmount=0;assert.equal(f.transport.feedback('host',value),true);
  assert.equal(f.sent.at(-1).event,'control:feedback');assert.equal(f.sent.at(-1).payload.packet.epoch,3);f.transport.destroy();
});

test('exceção no envio migra uma vez para socket e conserva o estado completo', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  const channel = new f.Channel('wss-control-events-v1'); f.pcs[0].ondatachannel({ channel }); channel.open();
  channel.throwSend = true;
  f.transport.send('screen', { kind: 'button', button: 0, down: true });
  assert.equal(f.transport.snapshot()[0].transport, 'socket');
  assert.deepEqual([...f.sent.at(-1).payload.packet.held.buttons], [0]);
  f.transport.stop('screen');
  assert.deepEqual([...f.sent.at(-1).payload.packet.held.buttons], []);
  const count = f.sent.length; f.tick(2000); assert.equal(f.sent.length, count);
  f.transport.destroy();
});

test('receptor não confia em from do pacote, desconexão limpa tudo e fallback não duplica', async () => {
  const f = fixture(), s = f.transport.host({ ...f.grant, peer: 'player' }); await s.ready;
  assert.equal(f.pcs[0].channels[1].options.ordered, false);
  assert.equal(f.pcs[0].channels[1].options.maxRetransmits, 0);
  const packet = { v: 1, session: 'grant', epoch: 1, seq: 1, lane: 'event', input: null,
    held: { keys: ['KeyA'], buttons: [], pad: null } };
  const events = f.pcs[0].channels[0]; events.open();
  events.onmessage({ data: JSON.stringify({ ...packet, from: 'forged' }) });
  assert.equal(f.delivered[0].from, 'player');
  assert.equal(f.transport.legacyAllowed('player'), false);
  f.fire('control:packet', { from: 'stranger', stream: 'screen', packet: { ...packet, seq: 2, held: { keys: [], buttons: [], pad: null } } });
  assert.equal(f.delivered.length, 1);
  f.fire('control:packet', { from: 'player', stream: 'screen', packet });
  assert.equal(f.delivered.length, 1);
  f.fire('control:packet', { from: 'player', stream: 'screen', packet: { ...packet, epoch: 2, seq: 2 } });
  assert.equal(f.delivered.length, 2);
  assert.equal(f.transport.snapshot()[0].transport, 'socket');
  f.fire('disconnect'); assert.equal(f.transport.snapshot().length, 0); assert.ok(f.resets.length >= 3);
  f.transport.destroy();
});

test('rajada rápida inválida ou binária não bloqueia soltura confiável nem outra concessão', async () => {
  for(const binary of [false,true]){
    let decodes=0;
    const f=fixture(false,true,{...wire,decodeFast:(...args)=>{decodes++;return wire.decodeFast(...args)}}),s=f.transport.host({...f.grant,peer:'player'});await s.ready;
    vm.runInContext('qaParses=0;const qaParse=JSON.parse;JSON.parse=(...args)=>{qaParses++;return qaParse(...args)}',f.context);
    const other=f.transport.host({...f.grant,session:'other',peer:'second'});await other.ready;
    s.events.open();s.moves.open();other.events.open();
    const packet={v:1,session:'grant',epoch:1,seq:1,lane:'event',input:null,
      held:{keys:['KeyA'],buttons:[0],pad:model.neutral()}};
    s.events.onmessage({data:JSON.stringify(packet)});
    for(let i=0;i<10000;i++)s.moves.onmessage({data:binary?wire.encodeFast({...packet,seq:i+2,lane:'move',input:{kind:'move',x:0.5,y:0.5}}):'{'});
    assert.equal(f.transport.snapshot()[0].droppedIncomingPackets,9936);
    assert.equal(decodes,binary?64:0,'gate limita chamadas de decode, não só aplicação dos comandos');
    assert.equal(vm.runInContext('qaParses',f.context),binary?1:65,'JSON recusado pela cota não é parseado');
    s.events.onmessage({data:JSON.stringify({...packet,seq:10002,held:{keys:[],buttons:[],pad:null}})});
    assert.ok(f.delivered.some(p=>p.from==='player'&&p.kind==='key'&&!p.down));
    assert.ok(f.delivered.some(p=>p.from==='player'&&p.kind==='button'&&!p.down));
    other.events.onmessage({data:JSON.stringify({...packet,session:'other'})});
    assert.ok(f.delivered.some(p=>p.from==='second'&&p.kind==='key'&&p.down));
    assert.equal(f.transport.snapshot()[0].transport,'webrtc');f.transport.destroy();
  }
});

test('sem socket não armazena comandos para repetir após reconexão', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  f.socket.connected = false;
  f.transport.send('screen', { kind: 'wheel', dy: 1 });
  assert.equal(f.sent.length, 0);
  f.fire('disconnect'); f.socket.connected = true; f.tick(1000);
  assert.equal(f.sent.length, 0); f.transport.destroy();
});

test('fallback congestionado descarta snapshots antigos e envia o estado atual ao liberar', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  f.socket.io = { engine: { transport: { writable: false }, writeBuffer: [] } };
  f.transport.send('screen', { kind: 'key', code: 'KeyA', down: true });
  f.transport.send('screen', { kind: 'key', code: 'KeyA', down: false });
  assert.equal(f.sent.length, 0);
  assert.equal(f.transport.snapshot()[0].droppedSnapshots, 2);
  f.socket.io.engine.transport.writable = true; f.tick(100);
  assert.equal(f.sent.length, 1);
  assert.deepEqual([...f.sent[0].payload.packet.held.keys], []);
  f.transport.destroy();
});

test('peer antigo mantém gamepad confiável; peer novo separa eixos e digitais com recuperação por snapshot', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  const events = new f.Channel('wss-control-events-v1'), fast = new f.Channel('wss-control-moves-v1');
  f.pcs[0].ondatachannel({ channel: events }); f.pcs[0].ondatachannel({ channel: fast }); events.open(); fast.open();
  const pad = model.neutral();
  f.transport.send('screen', { kind: 'gamepad', ...pad });
  pad.axes[0] = 0.1; f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(fast.sent.length, 0); assert.ok(events.sent.at(-1).held.pad);
  events.onmessage({ data: JSON.stringify({ meta: 'capabilities', analog: true }) });
  const count = events.sent.length;
  pad.axes[0] = 0.5; pad.buttons[6] = 0.7;
  f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(events.sent.length, count); assert.equal(fast.sent.at(-1).lane, 'analog');
  assert.deepEqual(fast.sent.at(-1).input.triggers, [0.7, 0]); assert.equal(fast.sent.at(-1).input.buttons, undefined);
  pad.buttons[0] = 1; f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(events.sent.length, count + 1); assert.equal(events.sent.at(-1).held.pad.buttons[0], 1);
  const fastCount = fast.sent.length; fast.bufferedAmount = 20000;
  pad.axes[0] = 0.8; f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(fast.sent.length, fastCount);
  f.tick(100);
  assert.equal(events.sent.at(-1).held.pad.axes[0], 0.8); assert.equal(events.sent.at(-1).held.pad.buttons[0], 1);
  f.transport.destroy();
});

test('binário só é enviado após anúncio compatível; eventos e fallback continuam JSON', async () => {
  const f = fixture(), s = f.transport.guest(f.grant); await s.ready;
  const events = new f.Channel('wss-control-events-v1'), fast = new f.Channel('wss-control-moves-v1');
  f.pcs[0].ondatachannel({ channel: events }); f.pcs[0].ondatachannel({ channel: fast }); events.open(); fast.open();
  f.transport.send('screen', { kind: 'move', x: 0.2, y: 0.4 });
  assert.equal(typeof fast.raw.at(-1), 'string'); const jsonBytes = fast.raw.at(-1).length;
  events.onmessage({ data: JSON.stringify({ meta: 'capabilities', analog: true, fastBinary: 1 }) });
  f.transport.send('screen', { kind: 'move', x: 0.1234567890123456, y: 1 });
  assert.equal(fast.raw.at(-1).byteLength, 36); assert.equal(fast.sent.at(-1).input.x, 0.1234567890123456);
  const pad = model.neutral(); pad.buttons[0] = 1; f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(typeof events.raw.at(-1), 'string'); assert.equal(events.sent.at(-1).held.pad.buttons[0], 1);
  pad.axes[0] = 0.7312345678901234; pad.buttons[6] = 0.9876543210987654;
  f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(fast.raw.at(-1).byteLength, 68); assert.deepEqual(fast.sent.at(-1).input.axes, pad.axes);
  assert.equal(f.transport.snapshot()[0].binaryFastPacketsSent, 2);
  assert.equal(f.transport.snapshot()[0].fastPayloadBytesSent, jsonBytes + 36 + 68);
  events.onmessage({ data: JSON.stringify({ meta: 'capabilities', analog: true }) });
  pad.axes[0] = 0.5; f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(typeof fast.raw.at(-1), 'string', 'host antigo mantém JSON');
  f.pcs[0].close(); f.transport.send('screen', { kind: 'gamepad', ...pad });
  assert.equal(f.sent.at(-1).event, 'control:packet'); assert.equal(f.sent.at(-1).payload.packet.held.pad.axes[0], 0.5);
  f.transport.destroy();
  const legacy = fixture(false, false), guest = legacy.transport.guest(legacy.grant); await guest.ready;
  const oldEvents = new legacy.Channel('wss-control-events-v1'), oldFast = new legacy.Channel('wss-control-moves-v1');
  legacy.pcs[0].ondatachannel({ channel: oldEvents }); legacy.pcs[0].ondatachannel({ channel: oldFast }); oldEvents.open(); oldFast.open();
  oldEvents.onmessage({ data: JSON.stringify({ meta: 'capabilities', analog: true, fastBinary: 1 }) });
  legacy.transport.send('screen', { kind: 'move', x: 0.1, y: 0.2 });
  assert.equal(typeof oldFast.raw.at(-1), 'string', 'desabilitação local também é respeitada'); legacy.transport.destroy();
  const mixed = fixture(false, true, { ...wire, encodeFast: undefined, decodeFast: undefined });
  const mixedHost = mixed.transport.host(mixed.grant); await mixedHost.ready; mixedHost.events.open();
  assert.equal(mixedHost.events.sent[0].fastBinary, 0, 'helper antigo em cache não anuncia codec ausente'); mixed.transport.destroy();
});

test('receptor binário conserva sessão, sequência, botões e watchdog e recusa canal errado/revogado', async () => {
  const f = fixture(), s = f.transport.host({ ...f.grant, peer: 'player' }); await s.ready;
  const events = s.events, fast = s.moves; events.open(); fast.open();
  assert.equal(events.sent[0].fastBinary, 1); assert.equal(fast.binaryType, 'arraybuffer');
  const pad = model.neutral(); pad.buttons[0] = 1;
  events.onmessage({ data: JSON.stringify({ v: 1, session: 'grant', epoch: 2, seq: 1, lane: 'event',
    input: null, held: { keys: [], buttons: [], pad } }) });
  const packet = { v: 1, session: 'untrusted-ignored', epoch: 2, seq: 3, lane: 'analog',
    input: { kind: 'analog', axes: [0.7, 0, 0, 0], triggers: [0.5, 0.25] } };
  const data = wire.encodeFast(packet), before = f.delivered.length;
  events.onmessage({ data }); assert.equal(f.delivered.length, before, 'binário não pertence ao canal confiável');
  fast.onmessage({ data }); assert.equal(f.delivered.at(-1).axes[0], 0.7);
  assert.equal(f.delivered.at(-1).buttons[0], 1); assert.equal(f.delivered.at(-1).buttons[6], 0.5);
  assert.equal(f.delivered.at(-1).session, 'grant'); assert.equal(f.delivered.at(-1).from, 'player');
  const accepted = f.delivered.length;
  fast.onmessage({ data: wire.encodeFast({ ...packet, seq: 2 }) });
  fast.onmessage({ data: wire.encodeFast({ ...packet, epoch: 1, seq: 100 }) });
  assert.equal(f.delivered.length, accepted, 'reordenação/geração antiga não altera estado');
  f.tick(800); const expired = f.delivered.length;
  fast.onmessage({ data: wire.encodeFast({ ...packet, seq: 4 }) }); assert.equal(f.delivered.length, expired, 'binário não reativa watchdog expirado');
  f.fire('control:revoked', { mine: true, stream: 'screen' });
  fast.onmessage({ data: wire.encodeFast({ ...packet, seq: 5 }) }); assert.equal(f.delivered.length, expired);
  assert.equal(s.stats.binaryFastPacketsReceived, 1); f.transport.destroy();
});
