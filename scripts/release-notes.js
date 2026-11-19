// Notas de uma release do app de desktop: as novidades daquela versão (do CHANGELOG.md) e
// como baixar e instalar. Usado pelo workflow "Release notes".
//
//   node scripts/release-notes.js 1.8.0   -> as notas da 1.8.0
//   node scripts/release-notes.js --list  -> as versões que estão no CHANGELOG.md
const fs = require('fs');
const path = require('path');

const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const heading = /^## (\d+\.\d+\.\d+)\b.*$/gm;

function versions() {
  return [...changelog.matchAll(heading)].map((m) => m[1]);
}

// O texto da seção "## x.y.z", até a próxima versão.
function section(version) {
  const all = [...changelog.matchAll(heading)];
  const i = all.findIndex((m) => m[1] === version);
  if (i === -1) return null;
  const start = all[i].index + all[i][0].length;
  const end = i + 1 < all.length ? all[i + 1].index : changelog.length;
  return changelog.slice(start, end).trim();
}

function install(version) {
  return [
    'App de desktop do Web Screen Share: abre a sala do seu servidor e acrescenta o seletor de tela com o som do PC e as marcações (apontar, desenhar, reagir) aparecendo na sua tela de verdade enquanto você transmite.',
    '',
    `**Windows**: baixe \`Web-Screen-Share-Setup-${version}.exe\` (instala e cria o atalho) ou \`Web-Screen-Share-Portable-${version}.exe\` (roda sem instalar). O app não é assinado: se aparecer "O Windows protegeu o computador", clique em **Mais informações** e depois em **Executar assim mesmo**.`,
    '',
    `**Linux**: \`Web-Screen-Share-${version}.AppImage\` (dê permissão de execução). No Linux não tem o som do PC nem as marcações na tela.`,
    '',
    'Na primeira vez, o app pede o endereço do servidor (o mesmo que vocês abrem no navegador).',
    '',
    'Quando sair versão nova, o app avisa: a versão instalada (Setup ou AppImage) se atualiza pelo botão **Atualizar**; a portátil mostra o link pra baixar. O que muda na sala chega com a atualização do servidor (imagem `ghcr.io/usuariodejava/web-screen-share`).',
  ].join('\n');
}

// No GitHub, cada quebra de linha das notas vira quebra de verdade: junta as linhas de um
// mesmo parágrafo/item (o CHANGELOG.md quebra em ~90 colunas pra ler no editor).
function unwrap(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const starts = line.trim() === '' || /^\s*([-*] |#|---|\d+\. )/.test(line);
    const prev = out.length ? out[out.length - 1] : '';
    if (!starts && prev.trim() !== '' && !/^(#|---)/.test(prev)) out[out.length - 1] = `${prev} ${line.trim()}`;
    else out.push(line);
  }
  return out.join('\n');
}

function notes(version) {
  const news = section(version) && unwrap(section(version));
  const parts = [];
  if (news) parts.push(`## Novidades da ${version}`, '', news, '', '---', '');
  parts.push('## Como instalar', '', install(version), '');
  return parts.join('\n');
}

const arg = process.argv[2];
if (arg === '--list') process.stdout.write(`${versions().join('\n')}\n`);
else if (/^\d+\.\d+\.\d+$/.test(arg || '')) process.stdout.write(notes(arg));
else {
  console.error('Uso: node scripts/release-notes.js <versão> | --list');
  process.exit(1);
}
