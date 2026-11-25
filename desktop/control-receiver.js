const { BrowserWindow, session } = require('electron');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

function createControlReceiver({ getServer, getMain, allowed, fault }) {
  let window = null, loading = null, generation=0, cookieJobs=Promise.resolve();
  const partition='wss-control-'+randomUUID();
  const grants = new Map();
  const snapshots=new Map();
  let revision = 0;
  const state = () => ({ revision, grants: [...grants.values()] });
  function publish() { revision++; if (window && !window.isDestroyed()) window.webContents.send('desktop:receiver-state', state()); }
  function close() {
    generation++;
    grants.clear();snapshots.clear(); revision++;
    const old = window; window = null;
    if (old && !old.isDestroyed()) old.destroy();
  }
  function failed(epoch=generation) {
    if(epoch!==generation)return;
    const pending = [...grants.values()]; close();
    for (const grant of pending) fault({ from:grant.peer, session:grant.session });
  }
  async function ensure() {
    const epoch=generation;
    if (loading?.epoch===epoch) return loading.promise;
    if (window && !window.isDestroyed()) return;
    const job={epoch,promise:null};
    job.promise = (async () => {
      const server = getServer(), url = new URL('/native-control.html', server).href;
      const isolated = session.fromPartition(partition);
      isolated.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
      isolated.setPermissionCheckHandler(()=>false);
      cookieJobs=cookieJobs.catch(()=>{}).then(async()=>{
      if(epoch!==generation)throw Error('Receptor cancelado.');
      await isolated.clearStorageData({storages:['cookies','localstorage']});
      if(epoch!==generation)throw Error('Receptor cancelado.');
      for (const cookie of await session.defaultSession.cookies.get({url:server})) {
        if (!['wss-room','__Host-wss-room'].includes(cookie.name) || !cookie.httpOnly || !/^[a-f0-9]{64}$/.test(cookie.value)) continue;
        await isolated.cookies.set({url:server,name:cookie.name,value:cookie.value,path:'/',httpOnly:true,secure:cookie.secure,sameSite:'strict',
          ...(cookie.expirationDate ? {expirationDate:cookie.expirationDate} : {})});
      }
      });
      await cookieJobs;
      if (epoch!==generation||getServer()!==server) throw Error('Servidor alterado ou receptor cancelado.');
      const next = new BrowserWindow({show:false,webPreferences:{session:isolated,preload:path.join(__dirname,'preload.js'),
        contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false,additionalArguments:['--wss-control-receiver']}});
      window = next;
      next.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      next.webContents.on('will-navigate',(event,target)=>{if(target!==url)event.preventDefault();});
      next.webContents.on('render-process-gone',()=>failed(epoch));
      next.on('closed',()=>{if(window===next)failed(epoch);});
      await next.loadURL(url);
      if(window!==next||next.isDestroyed()||next.webContents.getURL()!==url)throw Error('Receptor não carregou.');
      if(next.webContents.getOSProcessId()===getMain()?.getOSProcessId())throw Error('Receptor compartilhou o processo da interface.');
    })().catch(error=>{failed(epoch);throw error;}).finally(()=>{if(loading===job)loading=null;});
    loading=job;
    return job.promise;
  }
  return {
    trusted(event) {
      try { return Boolean(window && !window.isDestroyed() && event.sender===window.webContents
        && event.senderFrame===window.webContents.mainFrame && event.senderFrame.url===new URL('/native-control.html',getServer()).href
        && window.webContents.getOSProcessId()!==getMain()?.getOSProcessId()); }
      catch { return false; }
    },
    state,
    async host(grant) {
      if(!grant||!['owner','peer','stream','session','token'].every(key=>typeof grant[key]==='string'&&grant[key].length>0&&grant[key].length<=128)
        || !/^[a-f0-9]{64}$/.test(grant.token) || !allowed(grant.peer,grant.session))throw Error('Concessão inválida.');
      if(grants.size>=16&&!grants.has(grant.peer))throw Error('Limite de concessões.');
      const saved={...grant,options:{binaryFast:grant.options?.binaryFast!==false,
        maxFastBufferedBytes:[0,512,2048,16384].includes(grant.options?.maxFastBufferedBytes)?grant.options.maxFastBufferedBytes:16384,
        fastPacketLifeTimeMs:Number.isInteger(grant.options?.fastPacketLifeTimeMs)&&grant.options.fastPacketLifeTimeMs>0&&grant.options.fastPacketLifeTimeMs<=1000?grant.options.fastPacketLifeTimeMs:null}};
      grants.set(grant.peer,saved);
      await ensure();
      if(!allowed(grant.peer,grant.session)||grants.get(grant.peer)!==saved)throw Error('Concessão revogada.');
      publish();
      return {ok:true,processId:window.webContents.getOSProcessId()};
    },
    sync(people) {
      let changed=false;
      for(const [peer,grant]of grants)if(!people.some(p=>p.id===peer&&p.session===grant.session)){grants.delete(peer);snapshots.delete(peer);changed=true;}
      if(!grants.size){close();return;}
      if(changed)publish();
    },
    event(type,value) { if(window&&!window.isDestroyed())window.webContents.send('desktop:receiver-event',{type,value}); },
    report(value) {if(grants.get(value.from)?.session===value.session)snapshots.set(value.from,{...value});},
    snapshot() {return [...grants.values()].map(grant=>({...snapshots.get(grant.peer),session:grant.session,peer:grant.peer,
      stream:grant.stream,role:'host',independentReceiver:true,transport:snapshots.get(grant.peer)?.transport||'socket'}));},
    owns(peer,sessionId) { return grants.get(peer)?.session===sessionId; },
    close,
  };
}
module.exports={createControlReceiver};
