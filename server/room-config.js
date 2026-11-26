// Configurações da sala que o dono muda pelo painel de administração, na hora (sem
// reiniciar). Ficam num arquivo (settings.json, na pasta de dados).
const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  roomName: '', // nome da sala, na tela de entrada e no topo da lista ('' = "Sala")
  notice: '', // recado na tela de entrada (ex.: "bem-vindos")
  chatHistory: 100, // quantas mensagens o chat guarda (0: não guarda nada)
  sharing: 'all', // com contas: quem pode transmitir, 'all' (todo mundo) ou 'admins' (só contas com administração)
  control: true, // dá pra liberar o controle remoto (teclado, mouse, gamepad)
  obs: true, // dá pra transmitir pelo OBS
  maxUsers: 0, // limite de pessoas na sala (0: sem limite; com contas, quem tem administração sempre entra)
});

const text = (max) => (value) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : undefined);
const int = (min, max) => (value) => (Number.isInteger(value) && value >= min && value <= max ? value : undefined);
const bool = (value) => (typeof value === 'boolean' ? value : undefined);
const RULES = {
  roomName: text(40),
  notice: text(200),
  chatHistory: int(0, 1000),
  sharing: (value) => (value === 'all' || value === 'admins' ? value : undefined),
  control: bool,
  obs: bool,
  maxUsers: int(0, 500),
};

function createRoomConfig({ file, log = console.log } = {}) {
  let history = [];
  let settings = { ...DEFAULTS };
  try {
    const saved = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (saved && typeof saved === 'object') {
      history = Array.isArray(saved.history) ? saved.history.filter(h=>h && Object.hasOwn(RULES,h.key)).slice(-200) : [];
      for (const [key, rule] of Object.entries(RULES)) {
        const value = rule(saved[key]);
        if (value !== undefined) settings[key] = value;
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') log(`AVISO: não deu pra ler as configurações da sala (${err.message}).`);
  }

  function save(next) {
    if (!file) return true;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(next, null, 1));
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      log(`AVISO: não deu pra salvar as configurações da sala (${err.message}).`);
      return false;
    }
  }

  return {
    history: () => history.slice().reverse(),
    undo(id) {
      const entry=history.find(h=>h.id===id);
      if(!entry || history.findLast(h=>h.key===entry.key)!==entry || settings[entry.key]!==entry.after)
        return {error:'Uma alteração mais recente impede a reversão.'};
      return this.set({[entry.key]:entry.before});
    },
    get: () => ({ ...settings }),
    // Só muda o que veio e é válido; devolve o que mudou de fato.
    set(patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { error: 'Configuração inválida.' };
      const changed = {};
      for (const [key, value] of Object.entries(patch)) {
        if (!Object.hasOwn(RULES, key)) continue;
        const clean = RULES[key](value);
        if (clean === undefined) return { error: `Valor inválido em "${key}".` };
        if (settings[key] !== clean) changed[key] = clean;
      }
      if (Object.keys(changed).length) {
        const next = { ...settings, ...changed };
        const entries=Object.entries(changed).map(([key,after])=>({id:require('node:crypto').randomUUID(),at:Date.now(),key,before:settings[key],after}));
        const nextHistory=[...history,...entries].slice(-200);
        if (!save({...next,history:nextHistory})) return { error: 'Não foi possível salvar as configurações no servidor.' };
        history=nextHistory; settings = next;
      }
      return { ok: true, settings: { ...settings }, changed };
    },
  };
}

module.exports = { createRoomConfig, DEFAULTS };
