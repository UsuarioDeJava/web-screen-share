const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// O instalador só leva os arquivos listados em build.files: todo require('./...') de um
// arquivo do app tem que estar lá (senão o app instalado nem abre).
test('pacote: todo arquivo que o app carrega está na lista do instalador', () => {
  const root = path.join(__dirname, '..');
  const files = require('../package.json').build.files;
  const listed = (file) => files.some((p) => p === file || (p.endsWith('/**') && file.startsWith(p.slice(0, -2))));
  const seen = new Set();
  const queue = files.filter((p) => !p.includes('*'));
  const missing = [];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const refs = [...source.matchAll(/(?:require\(|utilityProcess\.fork\(path\.join\(__dirname, )'\.?\/?([^'"]+?)'/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (!/^[\w./-]+$/.test(ref) || ref.startsWith('node:') || !/[./]/.test(ref) && !fs.existsSync(path.join(root, `${ref}.js`))) continue;
      const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref.endsWith('.js') ? ref : `${ref}.js`));
      if (!fs.existsSync(path.join(root, rel))) continue; // módulo do node_modules
      if (!listed(rel)) missing.push(`${rel} (de ${file})`);
      queue.push(rel);
    }
  }
  assert.deepEqual(missing, []);
});
