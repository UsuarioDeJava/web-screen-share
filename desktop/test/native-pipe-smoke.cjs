const{spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{NativeFrameParser}=require('../shared/native-video/native-frame-protocol.cjs');
const{validateNativeFraming}=require('./helpers/mft-encoded-result.cjs');
const executable=process.argv[2];assert.ok(executable);const report={complete:false,cases:[],scope:'Real private native stdout/stdin pipe, payload pattern from 1 byte through 256 KiB, no capture, encoder or video.'};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(scatter,mode){
  const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,WSS_TEST_NATIVE_SCATTER_WRITE:scatter?'1':'0'}});
  const parser=new NativeFrameParser(),frames=[];let stderr='',timedOut=false,paused=false,chunks=0;
  const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},5000);child.stdin.on('error',()=>{});child.stderr.on('data',data=>stderr+=data);
  try{
    for await(const chunk of child.stdout){
      chunks++;
      if(mode==='slow-reader'&&frames.length===1&&!paused){paused=true;await wait(450);}
      for(const frame of parser.push(chunk)){
        const size=[1,262144,4096][frame.sequence];assert.equal(frame.payload.length,size);for(let i=0;i<size;i++)assert.equal(frame.payload[i],(i+frame.sequence)&255);
        frames.push({bytes:size,sequence:frame.sequence});
        if(mode!=='normal'&&frame.sequence===1){if(mode==='bad-ack'){const ack=Buffer.alloc(4);ack.writeUInt32LE(2);child.stdin.write(ack);}continue;}
        const ack=Buffer.alloc(4);ack.writeUInt32LE(frame.sequence);child.stdin.write(ack);
      }
    }
    const code=await ended;assert.equal(timedOut,false);const native=JSON.parse(stderr);let truncated=false;try{parser.finish();}catch(error){assert.equal(mode,'slow-reader');truncated=true;}
    const p=native.pipe;assert.equal(p.scatterWrite,scatter);assert.equal(p.maximumOutstandingPackets,1);
    if(mode==='normal'){assert.equal(code,0);assert.equal(frames.length,3);assert.equal(p.acknowledgedFrames,3);assert.equal(p.faulted,false);assert.equal(p.writePendingAtExit,false);validateNativeFraming(p,frames,scatter);}
    else{assert.equal(code,1);assert.equal(p.faulted,true);assert.equal(native.rejectedAfterFault,true);assert.equal(p.acknowledgedFrames,1);assert.equal(p.framingPackets,2);assert.ok(frames.length<=2);assert.match(native.error,mode==='bad-ack'?/ACK sequence differs/:/ACK deadline/);if(mode==='slow-reader')assert.equal(paused,true);}
    return{scatter,mode,code,frames:frames.length,chunks,truncated,framingArrayBytes:p.framingArrayBytes,payloadBytesCopied:p.framingPayloadBytesCopied,writePendingAtExit:p.writePendingAtExit};
  }finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill();await ended;}child.stdin.destroy();}
}
(async()=>{for(const scatter of[false,true])for(const mode of['normal','bad-ack','stall','slow-reader']){const result=await run(scatter,mode);report.cases.push(result);console.log(JSON.stringify(result));}report.complete=true;})().catch(error=>{report.error=error.message;console.error(error.stack);process.exitCode=1;}).finally(()=>{if(process.env.WSS_TEST_REPORT_DIR){fs.mkdirSync(process.env.WSS_TEST_REPORT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.WSS_TEST_REPORT_DIR,'native-pipe-report.json'),JSON.stringify(report,null,2));}});
