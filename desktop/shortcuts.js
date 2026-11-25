// Registra somente os atalhos do contexto ativo e libera somente os que obteve.
function createShortcuts({ api, definitions, onChange = () => {} }) {
  const entries = new Map(definitions.map(definition => [definition.id, { ...definition, active: false, owned: false, failure: null }]));
  const snapshot = () => [...entries.values()].map(({ id, keys, label, context, active, owned, failure }) => ({
    id, keys, label, context, active, registered: owned && active && !failure,
    status: failure === 'release' ? 'release-failed' : !active ? 'inactive' : owned && !failure ? 'registered' : 'unavailable',
  }));
  function update(entry) {
    if (!entry.active) {
      if (entry.owned) {
        try { api.unregister(entry.accelerator); entry.owned = false; entry.failure = null; }
        catch { entry.failure = 'release'; }
      }
      return;
    }
    if (entry.owned) {
      try { if (api.isRegistered(entry.accelerator)) { entry.failure = null; return; } }
      catch { entry.failure = 'verify'; return; }
      entry.owned = false;
    }
    try {
      entry.owned = api.register(entry.accelerator, () => { if (entry.active) entry.action(); }) === true;
    } catch { entry.owned = false; }
    entry.failure = entry.owned ? null : 'register';
  }
  function change(work) {
    const before = JSON.stringify(snapshot()); work();
    const after = snapshot(); if (JSON.stringify(after) !== before) onChange(after);
    return after;
  }
  return {
    snapshot,
    registered: id => Boolean(entries.get(id)?.owned && entries.get(id)?.active && !entries.get(id)?.failure),
    setActive(ids, active) {
      return change(() => { for (const id of ids) {
        const entry = entries.get(id); if (!entry || entry.active === Boolean(active)) continue;
        entry.active = Boolean(active); update(entry);
      } });
    },
    retry() { return change(() => { for (const entry of entries.values()) update(entry); }); },
    dispose() { return change(() => { for (const entry of entries.values()) { entry.active = false; update(entry); } }); },
  };
}
module.exports = { createShortcuts };
