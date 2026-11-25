const crypto=require('node:crypto');
const {NativeTransportAdmission}=require('./native-transport-admission.cjs');
const {RtpPacer}=require('./rtp-pacer.cjs');
const {H264Packetizer,nackSequences,RtpRepairCache}=require('./rtp-repair.cjs');
const {keyframeFeedback}=require('./rtcp-keyframe.cjs');
const {receiverReport}=require('./rtcp-receiver-report.cjs');
const {RtcpRoundTrip}=require('./rtcp-rtt.cjs');
const {NativeRateControl}=require('./native-rate-control.cjs');
const {RtpTrafficMeter}=require('./rtp-traffic-meter.cjs');
const {Monitor}=require('./decoder-health');
const {analyze,spsProfiles}=require('./h264-slices');

// One generation owns all admission credits, pacing jobs and repair packets.
// A fault destroys the peer; recovery negotiates a fresh peer and waits for IDR.
function createSession({rtc,iceServers=[],initialBitRate=4000000,onOffer,onState=()=>{},onFault=()=>{},now=()=>performance.now()}){
  let closed=false,failed=false,ready=false,awaitKey=true,needKey=true,lastKey=-Infinity;
  const ssrc=crypto.randomBytes(4).readUInt32LE()||1;
  const pc=new rtc.PeerConnection('wss-native',{iceServers,enableIceTcp:false,disableAutoNegotiation:true,forceMediaTransport:true});
  const video=new rtc.Video('video','SendOnly');video.addH264Codec(96,'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42c020');video.addSSRC(ssrc,'wss-native','native-stream','video');
  const track=pc.addTrack(video),config=new rtc.RtpPacketizationConfig(ssrc,'wss-native',96,90000);
  track.setMediaHandler(new rtc.RtcpSrReporter(config));
  const packer=new H264Packetizer(ssrc,crypto.randomBytes(2).readUInt16LE(),{aggregate:true}),repair=new RtpRepairCache({adaptiveDeadline:true}),rtt=new RtcpRoundTrip();
  // Browser loss detection can request a packet around 200 ms after sending,
  // even at 50 ms RTT. Keep the existing byte/packet/15% budgets, not just RTT.
  repair.setDeadline(250);
  const rate=new NativeRateControl(),traffic=new RtpTrafficMeter(),health=new Monitor();
  const bitstream={frames:0,pSlices:0,iSlices:0,bSlices:0,rejected:0};
  if(!Number.isInteger(initialBitRate)||initialBitRate<64000||initialBitRate>4000000)throw Error('invalid initial native rate');rate.target=initialBitRate;
  let gatherTimer,connectTimer;const channels=[];
  function close(){if(closed)return;closed=true;clearTimeout(gatherTimer);clearTimeout(connectTimer);gate.close();pacer.close();repair.close();for(const ch of channels)try{ch.close()}catch{}try{track.close()}catch{}try{pc.close()}catch{}}
  function fault(error){if(closed||failed)return;failed=true;close();onFault(error instanceof Error?error:Error(String(error)));}
  const gate=new NativeTransportAdmission({now,onFault:fault,confirmationDeadlineMs:300});
  // Encoder target is an average, not a serialization deadline for every IDR.
  // A short IDR burst still shares the same one-frame/byte/deadline admission.
  const pacer=new RtpPacer({now,keyframeBurst:true,rate:()=>Math.max(256000,rate.target),onError:fault,send(packet,kind,at){gate.assertFresh();if(!track.sendMessageBinary(packet))throw Error('native RTP send rejected');gate.assertFresh();traffic.note(packet.length,now(),kind);if(kind==='original')repair.put(packet,at);}});
  const receipt=pc.createDataChannel('native-admission',{protocol:'wss-admission-v1'});channels.push(receipt);
  receipt.onMessage(bytes=>gate.receive(bytes));receipt.onError(fault);
  const receiptV2=pc.createDataChannel('native-admission-v2',{protocol:'wss-admission-v2',unordered:true,maxRetransmits:0});channels.push(receiptV2);
  receiptV2.onMessage(bytes=>gate.receive(bytes,{cumulative:true}));receiptV2.onError(()=>{}); // optional for older receivers
  const progress=pc.createDataChannel('decoder-health',{protocol:'wss-health-v1',unordered:true,maxRetransmits:0});channels.push(progress);
  progress.onMessage(bytes=>health.receive(bytes,now()));progress.onError(fault);
  pc.onStateChange(state=>{if(closed)return;onState(state);if(state==='failed'||state==='closed')fault(Error('native peer '+state));if(state==='connected'){clearTimeout(connectTimer);ready=true;needKey=true;}});
  track.onError(fault);
  track.onMessage(bytes=>{
    if(closed)return;const at=now(),measured=traffic.rates(at).originalEstimatedBitRate;
    if(keyframeFeedback(bytes,ssrc))needKey=true;
    const rr=receiverReport(bytes,ssrc);if(rr){rtt.observe(rr,Date.now(),at);rate.observe(rr,measured,at);}
    const sequences=nackSequences(bytes,ssrc);if(sequences?.length){rate.observeNack(sequences.filter(s=>repair.wasRecentlySent(s)),measured,at);for(const seq of sequences)pacer.offerRepair(seq,t=>{const p=repair.take(seq,t);if(!p&&repair.wasRecentlySent(seq))needKey=true;return p;},t=>repair.peekSize(seq,t));}
  });
  pc.onGatheringStateChange(state=>{if(closed||state!=='complete')return;clearTimeout(gatherTimer);const offer=pc.localDescription();if(offer?.sdp?.length<=65536)onOffer({type:'offer',sdp:offer.sdp});else fault(Error('native SDP budget'));});
  gatherTimer=setTimeout(()=>fault(Error('native ICE gathering deadline')),6000);
  connectTimer=setTimeout(()=>fault(Error('native connection deadline')),12000);
  pc.setLocalDescription('offer');
  return{
    get progress(){return !closed&&gate.counts.confirmed>=10;},
    answer(sdp){if(!closed)pc.setRemoteDescription(sdp,'answer');},
    candidate(c){if(!closed)pc.addRemoteCandidate(c.candidate,c.sdpMid||'video');},
    async send(frame){
      if(closed||!ready||!track.isOpen()||!receipt.isOpen()&&!receiptV2.isOpen())return false;
      try{
        const inspection=analyze(frame.payload);
        if(inspection.slices.B||inspection.slices.SP||inspection.slices.SI||inspection.unsupportedVcl||spsProfiles(frame.payload).some(p=>!p.startsWith('42'))){bitstream.rejected++;throw Error('native encoder violated baseline/no-B contract');}
        bitstream.frames++;bitstream.pSlices+=inspection.slices.P;bitstream.iSlices+=inspection.slices.I;bitstream.bSlices+=inspection.slices.B;
        const timestamp=Math.round(frame.sampleTimeTicks*.009)>>>0,packets=packer.pack(frame.payload,timestamp),keyframe=packer.lastIsKey;
        if(awaitKey&&!keyframe)return false;
        if(keyframe)awaitKey=false;
        const at=now();await gate.acquire(timestamp,packets.reduce((n,p)=>n+p.length,0),at+120);
        // The same arrival time starts pacing and confirmation. No independent 180ms waits.
        const oldest=gate.pending.values().next().value;
        const deadline=Math.min(at+120,oldest.at+gate.deadlineMs);
        await pacer.sendFrame(packets,{keyframe,deadline,beforeFirst(){if(keyframe){repair.beginKeyframe(packets[0].readUInt16BE(2));pacer.clearRepairs();}}});
        health.noteSent(now());return true;
      }catch(error){fault(error);return false;}
    },
    feedback({allowKey=true,allowRate=true}={}){const at=now();if(closed||!ready)return{key:false,rate:0};const key=allowKey&&(needKey||health.needsRecovery(at))&&at-lastKey>=3000;if(key){needKey=false;lastKey=at;health.markRequest(at);}return{key,rate:allowRate?rate.take(at):0};},
    snapshot(){return{closed,failed,ready,awaitKey,bitstream:{...bitstream},admission:gate.snapshot(),pacing:pacer.snapshot(),repair:repair.snapshot(now()),rtt:rtt.snapshot(),rate:rate.snapshot(),transportQueueBoundVerified:false};},close,
  };
}
module.exports={createSession};
