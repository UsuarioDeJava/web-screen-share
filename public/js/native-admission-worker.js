// Receipt metadata only; never reads or copies encoded frame data.
self.onrtctransform=event=>{
  let lastRtp=null;
  event.transformer.readable.pipeThrough(new TransformStream({transform(frame,controller){
    const rtp=frame.getMetadata().rtpTimestamp;
    if(!Number.isInteger(rtp)||rtp<0||rtp>0xffffffff)throw Error('missing encoded receiver RTP timestamp');
    if(lastRtp!==null){const advance=(rtp-lastRtp)>>>0;if(!advance||advance>=0x80000000){self.postMessage({type:'late',rtp});return;}}
    lastRtp=rtp;
    controller.enqueue(frame);self.postMessage({type:'receipt',rtp});
  }})).pipeTo(event.transformer.writable).catch(error=>self.postMessage({type:'fault',error:error.message}));
};
