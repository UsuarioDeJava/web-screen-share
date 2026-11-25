class NativeRecoveryBudget {
  constructor(){this.attempts=[];this.failures=0;this.last=-Infinity;}
  clock(at){if(!Number.isFinite(at)||at<0||at<this.last)throw Error('invalid recovery clock');this.last=at;this.attempts=this.attempts.filter(t=>at-t<10000);}
  progress(){this.failures=0;}
  delay(at){this.clock(at);if(++this.failures>8)throw Error('native recovery failed without progress');
    const backoff=Math.min(4000,500*2**Math.min(3,this.failures-1));
    return Math.max(backoff,this.attempts.length>=3?this.attempts[0]+10001-at:0);
  }
  attempted(at){this.clock(at);if(this.attempts.length>=3)throw Error('native recovery attempt budget');this.attempts.push(at);}
}
module.exports={NativeRecoveryBudget};
