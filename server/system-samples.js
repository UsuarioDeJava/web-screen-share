const fs = require('node:fs/promises');
const os = require('node:os');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

async function read(file) {
  try { return (await fs.readFile(file, 'utf8')).trim(); } catch { return null; }
}
const numeric = s => typeof s === 'string' && /^\d+$/.test(s) ? Number(s) : null;
async function containerStats(readFile = read) {
  const base = '/sys/fs/cgroup/';
  const [usage, limit, cpu, quota, net] = await Promise.all(['memory.current','memory.max','cpu.stat','cpu.max']
    .map(f => readFile(base + f)).concat(readFile('/proc/net/dev')));
  let memory = numeric(usage), memoryLimit = numeric(limit), cpuUs = numeric(cpu?.match(/^usage_usec (\d+)/m)?.[1]);
  let [q, period] = (quota || '').split(' ').map(Number);
  if (usage === null && cpuUs === null) {
    const [used, max, ns, time, interval] = await Promise.all(['memory/memory.usage_in_bytes','memory/memory.limit_in_bytes',
      'cpuacct/cpuacct.usage','cpu/cpu.cfs_quota_us','cpu/cpu.cfs_period_us'].map(f => readFile(base + f)));
    memory = numeric(used); memoryLimit = numeric(max);
    if (memoryLimit > Number.MAX_SAFE_INTEGER) memoryLimit = null;
    cpuUs = ns === null ? null : Number(ns) / 1000;
    q = Number(time); period = Number(interval);
  }
  let rx = null, tx = null;
  for (const line of (net || '').split('\n')) {
    const parts = line.trim().split(/:\s*/);
    if (parts.length !== 2 || parts[0] === 'lo') continue;
    const counters = parts[1].split(/\s+/).map(Number);
    if (Number.isFinite(counters[8])) { rx = (rx || 0) + counters[0]; tx = (tx || 0) + counters[8]; }
  }
  return { memory, memoryLimit, cpuUs, cpuLimit: q > 0 && period > 0 ? q / period : null, rx, tx };
}
function createSystemSamples(directory, countSharing) {
  const history = [];
  const inContainer = process.platform === 'linux' && (process.env.IN_CONTAINER === '1' || require('node:fs').existsSync('/.dockerenv'));
  const delay = monitorEventLoopDelay({resolution:20});
  delay.enable();
  let previous, busy = false;
  async function sample() {
    if (busy) return;
    busy = true;
    try {
      const [container, disk] = await Promise.all([inContainer ? containerStats() : null, fs.statfs?.(directory).catch(() => null)]);
      const cpus = os.cpus();
      const totals = cpus.reduce((v,c) => ({ idle: v.idle+c.times.idle,
        all: v.all+Object.values(c.times).reduce((a,b) => a+b,0) }), { idle:0, all:0 });
      const now = performance.now(), cpu = process.cpuUsage(), loop = performance.eventLoopUtilization();
      const seconds = previous ? (now - previous.now) / 1000 : 0;
      const rate = (cur, old) => seconds && Number.isFinite(cur) && Number.isFinite(old) && cur >= old ? (cur-old)/seconds : null;
      const containerRate = rate(container?.cpuUs,previous?.container?.cpuUs);
      history.push({ at: Date.now(), processMemory: process.memoryUsage().rss,
        processCpu: previous ? rate(cpu.user+cpu.system,previous.cpu.user+previous.cpu.system)/10000 : null,
        loopBusy: previous ? performance.eventLoopUtilization(loop, previous.loop).utilization * 100 : null,
        loopDelayMs: delay.count ? delay.percentile(95)/1e6 : null,
        systemMemory: os.totalmem()-os.freemem(), systemTotal: os.totalmem(),
        systemCpu: previous && totals.all > previous.totals.all ? 100*(1-(totals.idle-previous.totals.idle)/(totals.all-previous.totals.all)) : null,
        diskFree: disk ? disk.bavail*disk.bsize : null, sharing: countSharing(),
        container: container && { memory:container.memory, memoryLimit:container.memoryLimit, cpuLimit:container.cpuLimit,
          cpu:containerRate === null ? null : containerRate/10000, rx:rate(container.rx,previous?.container?.rx), tx:rate(container.tx,previous?.container?.tx) } });
      if (history.length > 120) history.shift();
      delay.reset();
      previous = { now,cpu,loop,totals,container };
    } finally { busy = false; }
  }
  const tick = () => sample().catch(() => {});
  tick();
  const timer = setInterval(tick, 5000);
  timer.unref();
  return { history, close() { clearInterval(timer); delay.disable(); } };
}
module.exports = { createSystemSamples, containerStats };
