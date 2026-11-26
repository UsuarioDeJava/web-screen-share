const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createReview}=require('../../server/incident-review');
const {createRoomConfig}=require('../../server/room-config');
const {createGuided}=require('../../server/guided-test');
const {snapshot}=require('../../public/js/diagnostic-fields');

test('linha do tempo correlaciona apenas o par, respeita revogação e exclui identificadores do pacote',()=>{
  const review=createReview(),at=Date.now(), data=snapshot({client:'App',version:'2.0.0',streams:[{direction:'envio',fps:60}]});
  review.remember('a',{at,peers:['b'],streams:data.streams});
  review.remember('b',{at,peers:['a','c'],streams:[{direction:'recepção',fps:45},{fps:99}]});
  review.remember('c',{at,peers:['b'],streams:[{fps:98}]});
  const timeline=review.capture('a',at,[{at,processCpu:10}]);
  assert.deepEqual(timeline.map(r=>r.fps),[undefined,60,45]);
  review.forget('b');
  assert.ok(!review.capture('a',at,[]).some(s=>s.role==='Outro lado'));
  const packet=review.packet({code:'manual',observedAt:at,snapshot:data,timeline,nick:'privado',description:'privado',session:'privado'});
  assert.ok(!JSON.stringify(packet).includes('privado'));
  review.observe('a',data,at);review.observe('b',data,at);
  const r={session:'a',at,code:'manual',snapshot:data};
  assert.deepEqual(review.state([r,r]).comparisons.map(c=>[c.affected,c.total]),[[1,2]]);
  assert.equal(review.track(r,'Corrigido','inválida'),false);
  assert.ok(review.track(r,'Corrigido','2.0.1'));
  assert.equal(createReview(review.saved()).state([]).investigations[0].fixed,'2.0.1');
  review.prune(at+60000);assert.equal(review.state([]).comparisons.length,0);
});
test('reversão por chave preserva as outras configurações e rejeita alterações obsoletas',()=>{
  const config=createRoomConfig();
  config.set({notice:'Teste'});const id=config.history()[0].id;
  config.set({maxUsers:4});
  assert.ok(config.undo(id).ok);assert.equal(config.get().maxUsers,4);assert.equal(config.get().notice,'');
  assert.ok(config.undo(id).error);
});
test('teste guiado requer dois aceites e interrompe a sinalização ao revogar',()=>{
  const users=new Map(),sockets=new Map(),events=[];
  const guided=createGuided({sockets:{sockets}},users);
  for(const id of ['a','b']) {
    const socket={id,data:{diagnosticsEnabled:false},handlers:{},on(k,f){this.handlers[k]=f;},emit(k,data){events.push({id,k,data});}};
    users.set(id,{});sockets.set(id,socket);guided.attach(socket);
  }
  assert.ok(guided.start('a','b').error);
  for(const s of sockets.values()) s.data.diagnosticsEnabled=true;
  assert.ok(guided.start('a','b').ok);
  const key=events[0].data.key, a=sockets.get('a').handlers,b=sockets.get('b').handlers;
  a['guided:accept']({key,yes:true});a['guided:sdp']({key,sdp:'teste'});
  assert.equal(events.length,2);
  b['guided:accept']({key,yes:true});assert.equal(events.filter(e=>e.k==='guided:start').length,2);
  b['diagnostics:consent'](false);a['guided:sdp']({key,sdp:'teste'});
  assert.equal(events.filter(e=>e.k==='guided:sdp').length,0);
  assert.equal(guided.state().last.status,'Interrompido');
});
