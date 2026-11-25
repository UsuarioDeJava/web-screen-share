const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn,fork}=require('node:child_process');
function cleanIce(value){
  if(!Array.isArray(value)||value.length>8)throw Error('Configuração ICE inválida.');const out=[];
  for(const row of value){const urls=typeof row?.urls==='string'?[row.urls]:row?.urls;if(!Array.isArray(urls)||urls.length>8)throw Error('Servidores ICE inválidos.');
    for(const url of urls){if(typeof url!=='string'||url.length>2048)throw Error('URL ICE inválida.');
      const m=/^(stun|turn|turns):(?:\/\/)?(\[[^\]]+\]|[^:?/]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/.exec(url);if(!m)throw Error('URL ICE não suportada pelo motor nativo.');
      if(m[1]==='stun'){out.push(url);continue;}
      if(typeof row.username!=='string'||row.username.length>256||typeof row.credential!=='string'||row.credential.length>512)throw Error('Credencial TURN inválida.');
      const port=Number(m[3]||(m[1]==='turns'?5349:3478));if(port<1||port>65535)throw Error('Porta TURN inválida.');
      out.push({hostname:m[2].replace(/^\[|\]$/g,''),port,username:row.username,password:row.credential,relayType:m[1]==='turns'?'TurnTls':m[4]==='tcp'?'TurnTcp':'TurnUdp'});
    }
  }if(out.length>16)throw Error('Limite de servidores ICE.');return out;
}
function createNativeVideo({pickSource,enabled,notify,executable=path.join(__dirname,'native/bin/native-video-worker.exe').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep)}){
  let active=null,epoch=0,preparing=false;
  function caps(){return{enabled:enabled(),available:process.platform==='win32'&&process.arch==='x64'&&fs.existsSync(executable),windowOnly:true,videoOnly:true,viewerLimit:1};}
  function stop(){epoch++;const row=active;active=null;if(row){row.stopping=true;row.resolveSnapshot?.(null);if(row.child.connected)row.child.send({type:'stop'},()=>{});setTimeout(()=>{if(row.child.exitCode===null)row.child.kill()},6000).unref();}}
  function send(row,value){
    if(active!==row||!row.child.connected)throw Error('A sessão nativa terminou.');
    const bytes=Buffer.byteLength(JSON.stringify(value));if(row.pendingCommands>=32||row.pendingBytes+bytes>131072){stop();throw Error('Fila de comandos nativos excedida.');}
    row.pendingCommands++;row.pendingBytes+=bytes;
    const accepted=row.child.send(value,error=>{row.pendingCommands--;row.pendingBytes-=bytes;if(error&&active===row){notify({token:row.token,type:'error',error:'O canal do motor nativo falhou.'});stop();}});
    if(!accepted){stop();throw Error('Fila de comandos nativos excedida.');}
  }
  async function prepare(){
    if(preparing)throw Error('O seletor nativo já está aberto.');const c=caps();if(!c.enabled||!c.available)throw Error('Motor nativo indisponível neste app.');
    preparing=true;stop();const attempt=epoch;
    try{
      const choice=await pickSource({nativeWindow:true});if(!choice||epoch!==attempt)return null;
      const match=/^window:(\d+):/.exec(choice.source.id);if(!match)throw Error('Escolha uma janela para o vídeo nativo.');
      const description=await new Promise((resolve,reject)=>{
        const child=spawn(executable,['--describe',match[1],String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});let data='',error='';
        const timer=setTimeout(()=>{child.kill();reject(Error('Tempo esgotado ao verificar a janela.'));},5000);
        child.stdout.on('data',b=>{data+=b;if(data.length>65536){child.kill();reject(Error('Descrição nativa excedida.'));}});child.stderr.on('data',b=>error=(error+b).slice(-2048));
        child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);try{if(code!==0)throw Error(error||'Janela indisponível.');resolve(JSON.parse(data));}catch(e){reject(e)}});
      });
      if(epoch!==attempt)return null;
      const child=fork(path.join(__dirname,'native-video-host.cjs'),[],{execPath:process.execPath,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','ignore','pipe','ipc'],serialization:'json'});
      const row={child,token:crypto.randomUUID(),viewer:null,sid:0,pendingCommands:0,pendingBytes:0};active=row;
      child.stderr.on('data',()=>{});child.on('error',error=>{if(active===row){notify({token:row.token,type:'error',error:error.message});stop();}});
      child.on('message',value=>{if(!value||typeof value!=='object')return;if(active!==row){if(row.stopping&&value.type==='stopped')notify({...value,token:row.token});return;}if(value.type==='snapshot')row.resolveSnapshot?.(value.snapshot);
        if(value.type==='offer'){if(value.viewer!==row.viewer||!Number.isSafeInteger(value.sid)||value.sid<row.sid)return;row.sid=value.sid;}
        if(['offer','state','recovering','error','stopped'].includes(value.type))notify({...value,token:row.token});if(value.type==='error')stop();});
      child.on('exit',()=>{if(active===row){notify({token:row.token,type:'error',error:'O processo de vídeo nativo terminou.'});active=null;}});
      send(row,{type:'initialize',executable,hwnd:match[1],ownerPid:description.ownerPid,ownerStarted:description.ownerStarted});
      return{token:row.token,name:choice.source.name,width:1280,height:720,frameRate:60,videoOnly:true};
    }finally{preparing=false;}
  }
  function command(value){
    const row=active;if(!row||value?.token!==row.token){if(['stop','close-peer'].includes(value?.type))return false;throw Error('Sessão nativa inválida.');}
    if(value.type==='stop'){stop();return true;}
    if(value.type==='snapshot'){
      if(row.snapshotRequest)return row.snapshotRequest;
      row.snapshotRequest=new Promise(resolve=>{const timer=setTimeout(()=>row.resolveSnapshot(null),500);row.resolveSnapshot=result=>{clearTimeout(timer);row.resolveSnapshot=null;row.snapshotRequest=null;resolve(result);};});
      const request=row.snapshotRequest;send(row,{type:'snapshot'});return request;
    }
    if(typeof value.viewer!=='string'||!value.viewer||value.viewer.length>128)throw Error('Receptor inválido.');
    if(value.type==='close-peer'){if(row.viewer===value.viewer){send(row,{type:'close-peer',viewer:value.viewer});row.viewer=null;}return true;}
    if(!Number.isSafeInteger(value.sid)||value.sid<1)throw Error('Sessão de sinalização inválida.');
    if(value.type==='offer'){
      if(value.supported!==true)throw Error('O navegador do receptor não suporta a admissão de vídeo nativo.');
      if(row.viewer&&row.viewer!==value.viewer)throw Error('O vídeo nativo experimental aceita um receptor por vez.');
      const iceServers=cleanIce(value.iceServers);row.viewer=value.viewer;row.sid=value.sid;send(row,{type:'offer',viewer:value.viewer,sid:value.sid,iceServers});
    }else if(row.viewer===value.viewer&&row.sid===value.sid){
      if(value.type==='answer'){if(typeof value.sdp!=='string'||value.sdp.length>65536)throw Error('SDP inválido.');send(row,{type:'answer',viewer:value.viewer,sid:value.sid,sdp:value.sdp});}
      else if(value.type==='candidate'){const c=value.candidate;if(typeof c?.candidate!=='string'||c.candidate.length>2048||typeof c.sdpMid!=='string'||c.sdpMid.length>32)throw Error('Candidato ICE inválido.');send(row,{type:'candidate',viewer:value.viewer,sid:value.sid,candidate:{candidate:c.candidate,sdpMid:c.sdpMid}});}
      else throw Error('Comando nativo inválido.');
    }return true;
  }
  return{caps,prepare,command,stop};
}
module.exports={createNativeVideo,cleanIce};
