(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../desktop/shared/video-policy'));
  else root.WssSignaling = factory(root.WssVideoPolicy);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (video) {
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
  function clean(data) {
    if (!data || typeof data !== 'object') return null;
    const voice = data.voice === true;
    if (data.voice != null && typeof data.voice !== 'boolean') return null;
    if (!voice && !id(data.stream)) return null;
    const out = { type: data.type, ...(voice ? { voice: true } : { stream: data.stream }) };
    if(!voice && ['watch','offer'].includes(data.type) && data.nativeVideo===true)out.nativeVideo=true;
    if (['watch', 'unwatch', 'quality'].includes(data.type)) {
      if (voice) return null;
      if (data.quality != null) {
        if (typeof data.quality !== 'string' || data.quality.length > 32) return null;
        out.quality = data.quality;
      }
      if (data.type === 'watch' && data.decoderCapabilities) out.decoderCapabilities = video.cleanCapabilities(data.decoderCapabilities);
      return out;
    }
    if (!Number.isSafeInteger(data.sid) || data.sid < 1) return null;
    out.sid = data.sid;
    if(data.type==='native-unavailable'){
      if(voice||!['unsupported','busy','failed'].includes(data.reason))return null;
      out.reason=data.reason;return out;
    }
    if (data.type === 'offer' || data.type === 'answer') {
      if (!data.sdp || data.sdp.type !== data.type || typeof data.sdp.sdp !== 'string' || data.sdp.sdp.length > 65536) return null;
      out.sdp = { type: data.type, sdp: data.sdp.sdp };
    } else if (data.type === 'candidate') {
      const c = data.candidate;
      if (!c || typeof c.candidate !== 'string' || c.candidate.length > 2048
        || (c.sdpMid != null && (typeof c.sdpMid !== 'string' || c.sdpMid.length > 32))
        || (c.sdpMLineIndex != null && (!Number.isInteger(c.sdpMLineIndex) || c.sdpMLineIndex < 0 || c.sdpMLineIndex > 65535))
        || (c.usernameFragment != null && (typeof c.usernameFragment !== 'string' || c.usernameFragment.length > 256))) return null;
      out.candidate = { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null };
      if (c.usernameFragment != null) out.candidate.usernameFragment = c.usernameFragment;
    } else return null;
    return out;
  }
  function cleanControl(data) {
    if (!data || typeof data !== 'object') return null;
    const wrapped = clean({ voice: true, sid: 1, type: data.type,
      sdp: { type: data.type, sdp: data.sdp }, candidate: data.candidate });
    if (!wrapped) return null;
    if (wrapped.type === 'candidate') {
      if (wrapped.candidate.sdpMLineIndex > 16) return null;
      return { type: 'candidate', candidate: wrapped.candidate };
    }
    return { type: wrapped.type, sdp: wrapped.sdp.sdp };
  }
  function createQueue({ handle, onError = () => {}, perPeer = 64, totalLimit = 256, peersLimit = 64 }) {
    let state = { rows: new Map(), total: 0 };
    async function drain(current, key, row) {
      if (row.busy) return;
      row.busy = true;
      while (row.jobs.length && state === current && current.rows.get(key) === row) {
        const job = row.jobs.shift();
        try { await handle(job); } catch (error) { onError(error); }
        finally { current.total--; }
      }
      row.busy = false;
      if (current.rows.get(key) === row && !row.jobs.length) current.rows.delete(key);
    }
    return {
      enqueue(key, job) {
        if (!id(key) || state.total >= totalLimit) return false;
        let row = state.rows.get(key);
        if (!row) {
          if (state.rows.size >= peersLimit) return false;
          state.rows.set(key, row = { jobs: [], busy: false });
        }
        if (row.jobs.length + Number(row.busy) >= perPeer) return false;
        row.jobs.push(job); state.total++; void drain(state, key, row); return true;
      },
      remove(key) {
        const row = state.rows.get(key); if (!row) return;
        state.total -= row.jobs.length; row.jobs.length = 0; state.rows.delete(key);
      },
      reset() {
        for (const row of state.rows.values()) row.jobs.length = 0;
        state.rows.clear(); state = { rows: new Map(), total: 0 };
      },
      get size() { return state.total; },
      sizeFor(key) { const row = state.rows.get(key); return row ? row.jobs.length + Number(row.busy) : 0; },
    };
  }
  return { clean, cleanControl, createQueue };
});
