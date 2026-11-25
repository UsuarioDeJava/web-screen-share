const assert=require('node:assert/strict'), crypto=require('node:crypto');
const {analyze,spsProfiles}=require('../../shared/native-video/h264-slices');
function inspectPackets(encoding) {
  // Elimina o payload antes de validar/salvar inclusive quando o parsing reprova.
  const pending=(encoding?.packets || []).map(p=>{const base64=p.bitstreamBase64;delete p.bitstreamBase64;return {p,base64}});
  inspectPending(pending);
}
function inspectNative(native) {
  const pending=[];
  for(const e of native?.encoders || [])for(const p of e.encoding?.packets || []){
    const base64=p.bitstreamBase64;delete p.bitstreamBase64;pending.push({p,base64});
  }
  inspectPending(pending);
}
function inspectPending(pending) {
  for(const {p,base64} of pending) {
    assert.equal(typeof base64,'string'); assert.ok(base64.length>0 && base64.length<=349528);
    const bytes=Buffer.from(base64,'base64'); assert.equal(bytes.toString('base64'),base64);
    assert.equal(bytes.length,p.bytes); assert.ok(bytes.length>0 && bytes.length<=262144);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),p.sha256);
    p.inspection=analyze(bytes); p.spsProfiles=spsProfiles(bytes);
  }
}
function validateEncoding(e) {
  assert.equal(e.complete,true); assert.equal(e.originalTextureIdentityConfirmed,true); assert.equal(e.subresource,0);
  assert.equal(e.inputBufferLength,1280*720*3/2); assert.equal(e.inputFrames,1); assert.equal(e.outputFrames,1);
  assert.equal(e.rawBufferLockCalls,0); assert.equal(e.drainComplete,true); assert.equal(e.flushHR,'00000000'); assert.equal(e.endStreamingHR,'00000000');
  assert.ok(e.outputStreamFlags&0x300); assert.ok(e.eventTypes.length>=3 && e.eventTypes.length<=128);
  assert.ok(e.eventTypes.every(t=>[601,602,603].includes(t)));
  assert.ok(e.eventTypes.indexOf(601)>=0 && e.eventTypes.indexOf(602)>e.eventTypes.indexOf(601));
  assert.equal(e.eventTypes.at(-1),603); assert.equal(e.eventTypes.filter(t=>t===602).length,1); assert.equal(e.eventTypes.filter(t=>t===603).length,1);
  assert.equal(e.packets.length,1);
  const p=e.packets[0]; assert.equal(p.bitstreamBase64,undefined); assert.match(p.sha256,/^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(p.bytes) && p.bytes>0 && p.bytes<=262144);
  assert.equal(p.sampleTimeTicks,10000000); assert.equal(p.sampleDurationTicks,166666);
  assert.ok(p.inspection.nalTypes[7]>=1 && p.inspection.nalTypes[8]>=1 && p.inspection.nalTypes[5]>=1);
  assert.equal(p.inspection.unsupportedVcl,0); assert.ok(p.inspection.slices.I>=1);
  for(const type of ['P','B','SP','SI']) assert.equal(p.inspection.slices[type],0);
  assert.equal(p.spsProfiles.length,1); assert.match(p.spsProfiles[0],/^42[a-f0-9]{4}$/);
  return {bytes:p.bytes,spsProfiles:p.spsProfiles,slices:p.inspection.slices};
}
function validateSequence(e){
  assert.equal(e.complete,true);assert.equal(e.targetFrames,12);assert.equal(e.inputFrames,12);assert.equal(e.outputFrames,12);assert.equal(e.packets.length,12);assert.equal(e.inputs.length,12);
  assert.equal(e.outputTextureCount,2);assert.equal(e.outputViewCount,2);assert.equal(e.processorCount,1);assert.equal(e.conversionCalls,12);
  assert.equal(e.inFlightLimit,2);assert.ok(e.maximumInFlight>=1&&e.maximumInFlight<=2);assert.equal(e.slotUses.length,2);assert.ok(e.slotUses.every(n=>Number.isInteger(n)&&n>=0));assert.equal(e.slotUses.reduce((a,b)=>a+b),12);
  assert.equal(e.repeatedCapturedFrame,true);assert.equal(e.rawReadbackCalls,0);assert.equal(e.rawUploadCalls,0);
  assert.equal(e.trackedSampleReleases,12);assert.equal(e.allInputSamplesReleased,true);assert.equal(e.drainComplete,true);assert.equal(e.flushHR,'00000000');assert.equal(e.endStreamingHR,'00000000');
  assert.ok(Number.isInteger(e.releasedBeforeShutdown)&&e.releasedBeforeShutdown>=10&&e.releasedBeforeShutdown<=12);
  let reused=0;const used=new Set(),uses=[0,0];
  for(let i=0;i<12;i++){
    const input=e.inputs[i],p=e.packets[i];assert.ok([0,1].includes(input.slot));uses[input.slot]++;assert.equal(input.originalTextureIdentityConfirmed,true);assert.equal(input.subresource,0);assert.equal(input.inputBufferLength,1280*720*3/2);assert.equal(input.timeTicks,10000000+i*166666);
    assert.equal(input.reusedAfterReleaseNotification,used.has(input.slot));if(used.has(input.slot))reused++;used.add(input.slot);
    assert.equal(p.sampleTimeTicks,input.timeTicks);assert.equal(p.sampleDurationTicks,166666);assert.equal(p.bitstreamBase64,undefined);
    assert.equal(p.inspection.unsupportedVcl,0);assert.equal(p.inspection.slices.B,0);assert.ok(p.inspection.slices.I+p.inspection.slices.P>=1);
    if(i===0){assert.ok(p.inspection.nalTypes[5]>=1&&p.inspection.nalTypes[7]>=1&&p.inspection.nalTypes[8]>=1);assert.match(p.spsProfiles[0],/^42[a-f0-9]{4}$/);}
  }
  assert.equal(e.slotReusesAfterNotification,reused);assert.ok(reused>=10);assert.deepEqual(e.slotUses,uses);
}
function validateLive(e,capture,{pressure=false,variableCadence=false,outputWidth=1280,outputHeight=720,absoluteSourceClock=false,parentDrain=false,captureShared=false,seconds=4}={}){assert.ok((outputWidth===1280&&outputHeight===720)||(outputWidth===640&&outputHeight===360));assert.equal(e.outputWidth??1280,outputWidth);assert.equal(e.outputHeight??720,outputHeight);if(outputWidth===640)assert.equal(e.gpuRectanglesConfirmed,true);
  assert.equal(e.complete,true);assert.equal(e.liveSource,true);assert.equal(e.repeatedCapturedFrame,false);assert.ok(Number.isInteger(seconds)&&seconds>=1&&seconds<=90);assert.equal(e.seconds,seconds);assert.equal(e.absoluteSourceClock??false,absoluteSourceClock);assert.equal(e.parentRequestedDrain??false,parentDrain);if(parentDrain)assert.ok(e.drainStartedMs>=500&&e.drainStartedMs<seconds*1000);
  const n=e.inputFrames;assert.ok(Number.isInteger(n)&&n>=(parentDrain?21:80)&&n<=Math.max(600,seconds*60));assert.equal(e.outputFrames,n);assert.equal(e.inputs.length,n);assert.equal(e.packets.length,n);
  assert.equal(e.conversionCalls,n);assert.equal(e.outputTextureCount,2);assert.equal(e.outputViewCount,2);assert.equal(e.processorCount,1);
  assert.equal(e.inFlightLimit,2);assert.ok(e.maximumInFlight>=1&&e.maximumInFlight<=2);assert.equal(e.rawUploadCalls,0);assert.equal(e.rawReadbackCalls,0);
  assert.equal(e.trackedSampleReleases,n);assert.equal(e.allInputSamplesReleased,true);assert.ok(e.releasedBeforeShutdown>=n-2&&e.releasedBeforeShutdown<=n);
  assert.equal(e.drainComplete,true);assert.equal(e.flushHR,'00000000');assert.equal(e.endStreamingHR,'00000000');
  if(e.stageTiming){assert.equal(e.stageTiming.enabled,true);assert.ok(e.stageTiming.maximumPendingInputs>=1&&e.stageTiming.maximumPendingInputs<=2);assert.equal(e.stageTiming.pendingAtExit,0);}
  if(e.eventDriven){assert.equal(e.eventReceiver.callbackSettled,true);assert.equal(e.eventReceiver.finished,true);assert.equal(e.eventReceiver.pendingRequest,false);assert.equal(e.eventReceiver.bufferedEvents,0);assert.ok(e.eventReceiver.maximumBufferedEvents<=1);assert.equal(e.eventReceiver.failed,false);assert.equal(e.eventWait.synchronousGetEventCalls,0);if(e.polling){assert.equal(e.polling.emptyPolls,0);assert.equal(e.polling.sleepTotalMs,0);}}
  const used=new Set(),uses=[0,0];let reused=0,lastSource=-1;
  for(let i=0;i<n;i++){
    const input=e.inputs[i],p=e.packets[i];assert.ok([0,1].includes(input.slot));uses[input.slot]++;
    assert.equal(input.reusedAfterReleaseNotification,used.has(input.slot));if(used.has(input.slot))reused++;used.add(input.slot);
    assert.equal(input.originalTextureIdentityConfirmed,true);assert.equal(input.subresource,0);assert.equal(input.inputBufferLength,outputWidth*outputHeight*3/2);
    assert.ok(Number.isSafeInteger(input.sourceTicks)&&input.sourceTicks>lastSource);lastSource=input.sourceTicks;
    assert.equal(input.timeTicks,absoluteSourceClock?input.sourceTicks:10000000+input.sourceTicks-e.inputs[0].sourceTicks);assert.equal(p.sampleTimeTicks,input.timeTicks);assert.ok((variableCadence?[166666,333333]:[166666]).includes(input.sampleDurationTicks??166666));assert.equal(p.sampleDurationTicks,input.sampleDurationTicks??166666);
    assert.ok(Number.isFinite(input.arrivalToSelectionMs)&&input.arrivalToSelectionMs>=0);
    if(e.stageTiming){for(const value of[input.gpuConversionSubmitMs,input.processInputCallMs,p.inputToOutputObservedMs,p.callbackToOutputObservedMs])assert.ok(Number.isFinite(value)&&value>=0);assert.ok(p.inputToOutputObservedMs>=input.processInputCallMs);assert.ok(p.callbackToOutputObservedMs+.001>=input.arrivalToSelectionMs+input.gpuConversionSubmitMs);}
    assert.equal(p.bitstreamBase64,undefined);assert.equal(p.inspection.unsupportedVcl,0);assert.equal(p.inspection.slices.B,0);assert.ok(p.inspection.slices.I+p.inspection.slices.P>=1);
    if(i===0){assert.ok(p.inspection.nalTypes[5]>=1&&p.inspection.nalTypes[7]>=1&&p.inspection.nalTypes[8]>=1);assert.match(p.spsProfiles[0],/^42[a-f0-9]{4}$/);}
  }
  assert.deepEqual(e.slotUses,uses);assert.equal(e.slotReusesAfterNotification,reused);assert.ok(reused>=n-2);
  assert.ok(e.buckets.length>=(parentDrain?1:seconds)&&e.buckets.length<=seconds+1);assert.ok(e.buckets.every(x=>Number.isInteger(x)&&x>=0));assert.equal(e.buckets.reduce((a,b)=>a+b,0),n);assert.ok((parentDrain?e.buckets.slice(1,-1):e.buckets.slice(1,seconds)).every(x=>x>=20));
  if(captureShared){assert.equal(capture,null);return{frames:n,buckets:e.buckets};}
  assert.equal(capture.complete,true);assert.equal(capture.poolSize,3);assert.equal(capture.pendingFrameLimit,1);assert.equal(capture.maximumPendingFrames,1);
  assert.equal(capture.parentOwnedSyntheticOnly,true);assert.equal(capture.cursorCaptured,false);assert.equal(capture.captureSessionStoppedBeforeEncoding,false);assert.equal(capture.stopped,true);
  assert.equal(capture.sourceClosed,false);assert.equal(capture.identityCheckIntervalMs,100);assert.equal(capture.resourcesReleased,true);
  assert.equal(capture.selectedFrames,n+e.staleSourceFramesDiscarded);assert.equal(capture.receivedFrames,capture.disposedFrames);
  assert.ok(capture.receivedFrames>=capture.selectedFrames+capture.replacedPendingFrames&&capture.receivedFrames<=capture.selectedFrames+capture.replacedPendingFrames+1);
  assert.equal(e.pressureStallMs,pressure?250:0);
  if(pressure){assert.ok(capture.replacedPendingFrames>=5);assert.ok(e.firstSelectionAgeAfterStallMs>=0&&e.firstSelectionAgeAfterStallMs<100);}
  return {frames:n,replaced:capture.replacedPendingFrames,buckets:e.buckets};
}
function validateNativeFraming(pipe,packets,scatter){
  const bytes=packets.reduce((sum,p)=>sum+p.bytes,0),n=packets.length;
  assert.equal(pipe.scatterWrite,scatter);assert.equal(pipe.framingPackets,n);
  assert.equal(pipe.framingPayloadBytesCopied,scatter?0:bytes);
  assert.equal(pipe.framingArrayBytes,32*n+(scatter?0:bytes));assert.equal(pipe.streamWriteCalls,n*(scatter?2:1));
  assert.equal(pipe.maximumOutstandingPackets,1);return{frames:n,payloadBytes:bytes,framingArrayBytes:pipe.framingArrayBytes};
}
module.exports={inspectPackets,inspectNative,validateEncoding,validateSequence,validateLive,validateNativeFraming};
