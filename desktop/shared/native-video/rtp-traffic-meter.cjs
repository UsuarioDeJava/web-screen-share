const assert = require('node:assert/strict');
// Test-only accounting at the RTP API boundary. Does not observe SRTP/OS queues.
class RtpTrafficMeter {
  constructor() {
    this.start = null; this.lastAt = null; this.sample = null;
    this.window = { originalPackets: 0, originalRtpBytes: 0, repairPackets: 0, repairRtpBytes: 0 };
    this.total = { ...this.window };
  }
  note(bytes, now, kind = 'original') {
    assert.ok(Number.isInteger(bytes) && bytes >= 12 && bytes <= 1112, 'invalid RTP byte count');
    assert.ok(Number.isFinite(now) && now >= 0 && (this.lastAt === null || now >= this.lastAt), 'invalid RTP send clock');
    assert.ok(kind === 'original' || kind === 'repair', 'invalid RTP traffic kind');
    if (this.start === null) this.start = now;
    this.lastAt = now;
    const packets = kind + 'Packets', rtpBytes = kind + 'RtpBytes';
    this.window[packets]++; this.window[rtpBytes] += bytes;
    this.total[packets]++; this.total[rtpBytes] += bytes;
    if (now - this.start >= 500) {
      this.sample = { ...this.window, startedAt: this.start, endedAt: now, durationMs: now - this.start };
      this.start = now;
      for (const key of Object.keys(this.window)) this.window[key] = 0;
    }
  }
  rates(now) {
    assert.ok(Number.isFinite(now) && now >= 0, 'invalid RTP measurement clock');
    const fresh = this.sample && now >= this.sample.endedAt && now - this.sample.endedAt <= 1500;
    const rate = kind => fresh ? (this.sample[kind + 'RtpBytes'] + this.sample[kind + 'Packets'] * 52) * 8000 / this.sample.durationMs : 0;
    const originalEstimatedBitRate = rate('original'), repairEstimatedBitRate = rate('repair');
    return { originalEstimatedBitRate, repairEstimatedBitRate, totalEstimatedBitRate: originalEstimatedBitRate + repairEstimatedBitRate };
  }
  snapshot(now) {
    return { ...this.total, ...this.rates(now), sample: this.sample ? { ...this.sample } : null,
      pendingWindow: { ...this.window }, startedAt: this.start, lastAt: this.lastAt,
      minimumSampleMs: 500, maximumSampleAgeMs: 1500, estimatedExtraBytesPerPacket: 52,
      scope: 'Accepted RTP API sends; RTP bytes exact, extra UDP/IP/SRTP overhead estimated. Repairs separate. No RTCP, SCTP, physical link or native queue measurement.' };
  }
}
module.exports = { RtpTrafficMeter };
