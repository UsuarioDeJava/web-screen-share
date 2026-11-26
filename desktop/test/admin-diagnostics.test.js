const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createDiagnostics } = require('../../server/diagnostics');
const { containerStats } = require('../../server/system-samples');

test('contêiner interpreta limites e CPU em cgroups v1 e v2 e omite limites ilimitados', async () => {
  const read = values => async file => values[file.replace('/sys/fs/cgroup/','')] ?? null;
  const v2 = await containerStats(read({'memory.current':'12000','memory.max':'max','cpu.stat':'usage_usec 2500',
    'cpu.max':'150000 100000','/proc/net/dev':'eth0: 100 0 0 0 0 0 0 0 80 0 0 0 0 0 0 0'}));
  assert.deepEqual(v2,{ memory:12000, memoryLimit:null, cpuUs:2500, cpuLimit:1.5, rx:100, tx:80 });
  const v1 = await containerStats(read({'memory/memory.usage_in_bytes':'24000','memory/memory.limit_in_bytes':'65536',
    'cpuacct/cpuacct.usage':'350000','cpu/cpu.cfs_quota_us':'-1','cpu/cpu.cfs_period_us':'100000'}));
  assert.deepEqual(v1,{ memory:24000, memoryLimit:65536, cpuUs:350, cpuLimit:null, rx:null, tx:null });
});

test('diagnóstico exige consentimento automático, permite relato manual, agrupa e persiste só campos previstos', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'wss-diag-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const users = new Map([['a',{name:'Ana'}],['b',{name:'Bob'}]]);
  const options = { directory,users,allow:()=>true,countSharing:()=>1 };
  let d = createDiagnostics(options);
  t.after(()=>d.close());
  const handlers = {};
  const socket = { id:'a',data:{},on:(key,fn)=>{handlers[key]=fn;} };
  d.attach(socket);
  const snapshot = { client:'App', version:'2.0.0', settings:{codec:'h264',password:'secret',experiments:{gpuBudget:true}},
    streams:[{direction:'envio',fps:60,route:'turn',sdp:'private'}] };
  const send = msg=>new Promise(resolve=>handlers['diagnostics:report'](msg,resolve));
  const report = { id:randomUUID(),snapshot,code:'video_stalled',at:Date.now() };
  const live = ()=>handlers['diagnostics:live']({snapshot,peers:['b']});
  live();
  assert.equal(d.state().live.length,0);
  assert.ok((await send(report)).error);
  assert.ok((await send({...report,code:'manual'})).error);
  assert.ok((await send({...report,id:randomUUID(),code:'manual',confirmed:true,description:'tela parada'})).ok);
  handlers['diagnostics:consent'](true); live();
  assert.deepEqual(d.state().live[0].peers,['Bob']);
  assert.ok((await send(report)).ok);
  assert.ok((await send(report)).ok);
  assert.ok((await send({...report,id:randomUUID()})).ok);
  assert.equal(d.state().groups.find(g=>g.code==='video_stalled').count,2);
  assert.equal(d.state().groups.find(g=>g.code==='video_stalled').sessions,1);
  handlers['diagnostics:consent'](false); live();
  assert.equal(d.state().live.length,0);
  assert.ok((await send({...report,id:randomUUID()})).error);
  assert.ok(!JSON.stringify(d.details('video_stalled/App/2.0.0')).includes('secret'));
  assert.ok(!JSON.stringify(d.details('video_stalled/App/2.0.0')).includes('private'));
  await d.configure(1); await d.close(); d=createDiagnostics(options);
  assert.equal(d.state().retention,1); assert.equal(d.state().groups.length,2);
  assert.equal(await d.clear(),true); assert.deepEqual(d.state().groups,[]);
});
