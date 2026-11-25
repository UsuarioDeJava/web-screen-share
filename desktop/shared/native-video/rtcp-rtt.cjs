// RFC 3550 6.4.1: A - LSR - DLSR in compact NTP (16.16 seconds).
function compactNtp(unixMs){const seconds=Math.floor(unixMs/1000)+2208988800;return((seconds%65536)*65536+Math.floor((unixMs%1000)*65536/1000))>>>0;}
function roundTripMs(report,arrivalCompact){
  const{lastSenderReport:lsr,delaySinceSenderReport:dlsr}=report;
  if(!Number.isInteger(lsr)||lsr<=0||lsr>0xffffffff||!Number.isInteger(dlsr)||dlsr<0||dlsr>0xffffffff)return null;
  const elapsed=((arrivalCompact-lsr)>>>0)*1000/65536,delay=dlsr*1000/65536,rtt=elapsed-delay;
  if(elapsed>15000||delay>10000||rtt<0||rtt>5000)return null;
  return rtt;
}
class RtcpRoundTrip{
  constructor(){this.samples=[];this.total=0;this.rejected=0;this.smoothed=null;this.variation=0;this.lastKey=null;this.clock=null;this.clockJumps=0;}
  observe(report,wallMs=Date.now(),monoMs=performance.now()){
    if(this.clock&&Math.abs((wallMs-this.clock.wall)-(monoMs-this.clock.mono))>100){this.clock={wall:wallMs,mono:monoMs};this.clockJumps++;this.samples=[];this.smoothed=null;this.lastKey=null;return null;}
    if(!this.clock)this.clock={wall:wallMs,mono:monoMs};
    const key=report.lastSenderReport+':'+report.delaySinceSenderReport;if(key===this.lastKey)return null;
    const rtt=roundTripMs(report,compactNtp(wallMs));if(rtt===null){this.rejected++;return null;}
    this.lastKey=key;this.total++;
    if(this.smoothed===null){this.smoothed=rtt;this.variation=rtt/2;}
    else{this.variation=.75*this.variation+.25*Math.abs(this.smoothed-rtt);this.smoothed=.875*this.smoothed+.125*rtt;}
    this.samples.push(rtt);if(this.samples.length>128)this.samples.shift();return rtt;
  }
  repairDeadlineMs(){return this.smoothed===null?100:Math.min(250,Math.max(100,Math.ceil(this.smoothed+4*this.variation+20)));}
  snapshot(){const sorted=[...this.samples].sort((a,b)=>a-b);return{total:this.total,rejected:this.rejected,clockJumps:this.clockJumps,retained:sorted.length,minMs:sorted[0]??null,p50Ms:sorted[Math.floor(sorted.length/2)]??null,maxMs:sorted.at(-1)??null,smoothedMs:this.smoothed,variationMs:this.variation,repairDeadlineMs:this.repairDeadlineMs()};}
}
module.exports={compactNtp,roundTripMs,RtcpRoundTrip};
