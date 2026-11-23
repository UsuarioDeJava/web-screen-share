// Configurações da sala que o dono muda pelo painel de administração, na hora (sem
// reiniciar). Ficam num arquivo (settings.json, na pasta de dados).
const fs = require('fs');
const path = require('path');

const DEFAULTS = Object.freeze({
  roomName: '', // nome da sala, na tela de entrada e no topo da lista ('' = "Sala")
  notice: '', // recado na tela de entrada (ex.: "peça sua conta pro fulano")
  chatHistory: 100, // quantas mensagens o chat guarda (0: não guarda nada)
  sharing: 'all', // quem pode transmitir: 'all' (todo mundo) ou 'admins' (só contas com administração)
  control: true, // dá pra liberar o controle remoto (teclado, mouse, gamepad)
  obs: true, // dá pra transmitir pelo OBS
  maxUsers: 0, // limite de pessoas na sala (0: sem limite; contas com administração sempre entram)
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
  let settings = { ...DEFAULTS };
  try {
    const saved = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (saved && typeof saved === 'object') {
      for (const [key, rule] of Object.entries(RULES)) {
        const value = rule(saved[key]);
        if (value !== undefined) settings[key] = value;
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') log(`AVISO: não deu pra ler as configurações da sala (${err.message}).`);
  }

  function save() {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 1));
      fs.renameSync(tmp, file);
    } catch (err) {
      log(`AVISO: não deu pra salvar as configurações da sala (${err.message}).`);
    }
  }

  return {
    get: () => ({ ...settings }),
    // Só muda o que veio e é válido; devolve o que mudou de fato.
    set(patch) {
      if (!patch || typeof patch !== 'object') return { error: 'Configuração inválida.' };
      const changed = {};
      for (const [key, value] of Object.entries(patch)) {
        if (!RULES[key]) continue;
        const clean = RULES[key](value);
        if (clean === undefined) return { error: `Valor inválido em "${key}".` };
        if (settings[key] !== clean) changed[key] = clean;
      }
      Object.assign(settings, changed);
      if (Object.keys(changed).length) save();
      return { ok: true, settings: { ...settings }, changed };
    },
  };
}

module.exports = { createRoomConfig, DEFAULTS };
