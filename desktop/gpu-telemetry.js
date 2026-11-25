const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const QUERY = 'index,pci.device_id,memory.total,memory.free,utilization.encoder,encoder.stats.sessionCount,encoder.stats.averageFps,encoder.stats.averageLatency';
function parseGpuTelemetry(output) {
  const lines = String(output).trim().split(/\r?\n/);
  if (!lines.length || lines.length > 16) throw Error('Invalid GPU response');
  return lines.map(line => {
    const values = line.split(',').map(v => v.trim());
    if (values.length !== 8 || !/^\d+$/.test(values[0]) || !/^0x[\da-f]{8}$/i.test(values[1])) throw Error('Invalid GPU row');
    const number = (i, max) => {
      if (/^(?:N\/A|\[Not Supported\])$/i.test(values[i])) return null;
      if (!/^\d+(?:\.\d+)?$/.test(values[i])) throw Error('Invalid GPU value');
      const n = Number(values[i]);
      if (!Number.isFinite(n) || n > max) throw Error('GPU value out of range');
      return n;
    };
    const total = number(2, 1048576), free = number(3, 1048576);
    if (total === 0 || total != null && free != null && free > total) throw Error('Invalid GPU memory');
    return { vendorId: 0x10de, deviceId: parseInt(values[1].slice(2, 6), 16),
      memoryTotalMiB: total, memoryFreeMiB: free, encoderUtilization: number(4, 100),
      encoderSessions: number(5, 65536), encoderAverageFps: number(6, 100000),
      encoderLatencyMs: (() => { const n = number(7, 100000000); return n == null ? null : n / 1000; })(),
      sessionLimit: null };
  });
}
function createGpuTelemetry({ execute = promisify(execFile), now = Date.now, platform = process.platform } = {}) {
  let pending = null, cached = null, cachedAt = -Infinity;
  const unknown = () => ({ available: false, source: 'unavailable', sampledAt: now(), devices: [] });
  return {
    read() {
      const age = now() - cachedAt;
      if (cached && age >= 0 && age < (cached.available ? 3000 : 30000)) return Promise.resolve(structuredClone(cached));
      if (!pending) {
        const started = now();
        pending = (async () => {
          if (!['win32', 'linux'].includes(platform)) return unknown();
          const command = platform === 'win32' ? path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe') : '/usr/bin/nvidia-smi';
          try {
            const { stdout } = await execute(command, ['--query-gpu=' + QUERY, '--format=csv,noheader,nounits'],
              { timeout: 3000, maxBuffer: 8192, windowsHide: true, encoding: 'utf8' });
            const devices = parseGpuTelemetry(stdout);
            return { available: true, source: 'nvidia-smi', sampledAt: started, devices: devices.slice(0, 4) };
          } catch { return unknown(); }
        })().then(result => { cachedAt = started; cached = result; return result; }).finally(() => { pending = null; });
      }
      return pending.then(structuredClone);
    },
  };
}
module.exports = { createGpuTelemetry, parseGpuTelemetry };
