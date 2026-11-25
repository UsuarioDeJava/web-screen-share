const {spawn}=require('node:child_process');
const {NativeFrameParser}=require('./shared/native-video/native-frame-protocol.cjs');
const {createSession}=require('./shared/native-video/session.cjs');
const {createStopEvent}=require('./shared/native-video/stop-event.cjs');
const {NativeRecoveryBudget}=require('./shared/native-video/native-recovery.cjs');
const rtc=require('node-datachannel');
let child,session,peer,configuration,closed=false,busy=false,stopping=false,restartTimer,frames=0,skipped=0,recoveries=0,lastKey=-Infinity,lastRate=-Infinity;
const recoveryBudget=new NativeRecoveryBudget();let stderr='',drainSent=false,currentRate=4000000,pendingRate=0,stopEvent,lastSessionSnapshot=null,parser;
const post=value=>{if(process.connected)process.send(value)};
function end(){if(closed)return;closed=true;clearTimeout(restartTimer);session?.close();if(child){stopping=true;try{stopEvent?.signal()}catch{}setTimeout(()=>child?.kill(),5000).unref();}else process.exit(0);}
function fatal(error){post({type:'error',error:String(error.message||error).slice(0,500)});end();}
function startPeer(){
  if(closed||!peer)return;const current=peer;const generation=++current.sid;
  session=createSession({rtc,iceServers:current.iceServers,initialBitRate:currentRate,onOffer:sdp=>post({type:'offer',viewer:current.viewer,sid:generation,sdp}),onState:state=>post({type:'state',viewer:current.viewer,sid:generation,state}),onFault(error){
    if(closed||peer!==current||current.sid!==generation)return;
    // A pacing/admission fault can close the peer before feedback() consumes a
    // reduction. Preserve it and apply it to the still-running encoder via ACK.
    const reduced=session?.snapshot().rate.target;
    if(Number.isInteger(reduced)&&reduced>=64000&&reduced<currentRate){currentRate=reduced;pendingRate=reduced;}
    let delay;try{delay=recoveryBudget.delay(performance.now())}catch{fatal(Error('Recuperação nativa sem progresso: '+error.message));return;}
    recoveries++;post({type:'recovering',viewer:current.viewer,sid:generation,reason:error.message,retryDelayMs:delay,snapshot:session?.snapshot()});
    restartTimer=setTimeout(()=>{try{recoveryBudget.attempted(performance.now());startPeer()}catch(error){fatal(error)}},delay);
  }});
}
function initialize(value){
  if(configuration)throw Error('native host already initialized');configuration=value;
  parser=new NativeFrameParser({version:4});
  stopEvent=createStopEvent();
  child=spawn(value.executable,['--run',value.hwnd,String(process.pid),String(value.ownerPid),value.ownerStarted],{windowsHide:true,env:{...process.env,WSS_NATIVE_STOP_EVENT:stopEvent.name},stdio:['pipe','pipe','pipe']});
  child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString()).slice(-65536)});
  child.on('error',fatal);child.stdin.on('error',error=>{if(!closed)fatal(error)});
  child.stdout.on('data',async bytes=>{
    try{
      const packets=parser.push(bytes);if(!packets.length)return;if(busy||packets.length!==1)throw Error('native frame admission exceeded');busy=true;
      const frame=packets[0];if(!stopping&&session){if(!await session.send(frame))skipped++;if(session.progress)recoveryBudget.progress();}else skipped++;
      const at=performance.now();let {key,rate}=!stopping&&session?session.feedback({allowKey:at-lastKey>=3000,allowRate:at-lastRate>=300}):{key:false,rate:0};
      if(!stopping&&pendingRate&&at-lastRate>=300){rate=rate?Math.min(rate,pendingRate):pendingRate;pendingRate=0;}
      if(key)lastKey=at;if(rate){lastRate=at;currentRate=rate;}
      const drain=stopping&&!drainSent;if(drain)drainSent=true;
      const ack=Buffer.alloc(12);ack.writeUInt32LE(frame.sequence);ack.writeUInt32LE((key?1:0)|(rate?2:0)|(drain?4:0),4);ack.writeUInt32LE(rate,8);child.stdin.write(ack);frames++;busy=false;
    }catch(error){busy=false;fatal(error);}
  });
  child.on('exit',(code,signal)=>{let report;try{report=JSON.parse(stderr.trim().split('\n').at(-1))}catch{}session?.close();stopEvent?.close();post({type:'stopped',code,signal,report,frames,skipped,recoveries,framing:parser.snapshot(),snapshot:session?.snapshot()||lastSessionSnapshot});rtc.cleanup();child=null;if(!stopping)post({type:'error',error:report?.error||'A captura nativa foi encerrada.'});process.exit(code===0?0:1);});
  post({type:'ready'});
}
process.on('message',value=>{try{
  if(!value||typeof value!=='object')return;
  if(value.type==='initialize')initialize(value);
  else if(value.type==='stop')end();
  else if(value.type==='offer'&&!closed){clearTimeout(restartTimer);session?.close();peer={viewer:value.viewer,sid:value.sid-1,iceServers:value.iceServers};startPeer();}
  else if(value.type==='close-peer'&&peer?.viewer===value.viewer){clearTimeout(restartTimer);session?.close();lastSessionSnapshot=session?.snapshot();session=null;peer=null;}
  else if(value.type==='answer'&&peer?.viewer===value.viewer&&peer.sid===value.sid)session?.answer(value.sdp);
  else if(value.type==='candidate'&&peer?.viewer===value.viewer&&peer.sid===value.sid)session?.candidate(value.candidate);
  else if(value.type==='snapshot')post({type:'snapshot',snapshot:{frames,skipped,recoveries,framing:parser?.snapshot(),session:session?.snapshot()}});
}catch(error){fatal(error)}});
process.on('disconnect',end);process.on('uncaughtException',fatal);
