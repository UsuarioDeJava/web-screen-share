const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function readConfig(file, onError = () => {}) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato inválido');
    return value;
  } catch (error) {
    if (error.code !== 'ENOENT') onError(`Configuração não carregada (${error.message}). O arquivo original foi preservado.`);
    return {};
  }
}

function writeConfig(file, value, io = fs) {
  io.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    io.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    io.renameSync(temporary, file);
  } finally {
    try { io.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
module.exports = { readConfig, writeConfig };
