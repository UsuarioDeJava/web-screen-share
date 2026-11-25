// Usuário de testes (com contas): as contas com administração controlam de longe uma
// conta marcada pelo dono como "de testes". Dois lados, pelo mesmo socket da sala:
//  - agent(): na sala de quem é de testes, executa os comandos que chegam (tester:command)
//    e anota cada um no Log do app (depuração). Pra pessoa, nada aparece.
//  - panel(): na sala de quem tem administração, o painel com o estado dele e os comandos.
// Comando novo: uma entrada em LABELS, um handler no app.js e uma em COMMANDS no
// server/testers.js (o servidor só repassa os da lista).
(function () {
  'use strict';

  const LABELS = {
    state: 'ler o estado',
    sources: 'listar telas e janelas',
    'share-start': 'começar a transmitir',
    'share-stop': 'parar a transmissão',
    'control-grant': 'dar o controle',
    'control-revoke': 'tirar o controle',
    'voice-join': 'entrar na voz',
    'voice-leave': 'sair da voz',
    mute: 'microfone',
    deafen: 'som da voz',
  };
  const DEVICES = [['keyboard', 'Teclado'], ['mouse', 'Mouse'], ['gamepad', 'Gamepad']];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, className, onClick) {
    const b = el('button', className || 'btn', text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  const time = () => new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const describe = (type, args = {}) => {
    if (type === 'mute') return args.muted ? 'desligar o microfone' : 'ligar o microfone';
    if (type === 'deafen') return args.deafened ? 'desligar o som da voz' : 'ligar o som da voz';
    if (type === 'share-start' && args.name) return `transmitir "${args.name}"`;
    return LABELS[type] || type;
  };

  // ---------- quem é de testes: executa ----------

  function agent({ socket, handlers, log = () => {} }) {
    const stateOf = async () => {
      try { return handlers.state ? await handlers.state() : null; } catch { return null; }
    };
    socket.on('tester:command', async (msg, ack) => {
      const done = typeof ack === 'function' ? ack : () => {};
      const type = msg && typeof msg.type === 'string' ? msg.type : '';
      const args = msg && msg.args && typeof msg.args === 'object' ? msg.args : {};
      const from = String((msg && msg.from) || 'a administração').slice(0, 40);
      const handler = Object.prototype.hasOwnProperty.call(handlers, type) ? handlers[type] : null;
      const quiet = type === 'state';
      if (!handler) {
        log(`Comando desconhecido de ${from}: ${type} (atualize o app)`, 'warn');
        done({ error: 'Esta sala não conhece esse comando: atualize o app.' });
        return;
      }
      const what = describe(type, args);
      if (!quiet) log(`${from} mandou ${what}`);
      try {
        const result = (await handler(args)) || {};
        if (!quiet) log(`Feito: ${what}`);
        done({ ok: true, ...result, state: type === 'state' ? result.state : await stateOf() });
      } catch (err) {
        const error = (err && err.message) || 'Não deu certo.';
        if (!quiet) log(`Não deu pra ${what}: ${error}`, 'warn');
        done({ error, state: await stateOf() });
      }
    });
  }

  // ---------- quem tem administração: o painel ----------

  function panel({ socket, dialog, body, title, sub }) {
    let target = null; // { id, name }
    let state = null;
    let sources = [];
    let pollTimer = null;
    const history = [];

    const send = (type, args = {}) => new Promise((resolve) => {
      if (!target) { resolve({ error: 'Painel fechado.' }); return; }
      socket.emit('tester:command', { to: target.id, type, args }, (res) => resolve(res || { error: 'O servidor não respondeu.' }));
    });

    // ---- a montagem (uma vez) ----
    const status = el('p', 'tester-status');
    status.setAttribute('role', 'status');

    const shareBox = el('section', 'tester-section');
    shareBox.append(el('h4', null, 'Transmissão'));
    const shareNote = el('p', 'tester-note');
    const sourceRow = el('div', 'tester-row');
    const sourceSelect = el('select', 'tester-select');
    sourceSelect.setAttribute('aria-label', 'Tela ou janela');
    const refreshSources = button('Atualizar a lista', 'btn btn-small', () => loadSources());
    sourceRow.append(sourceSelect, refreshSources);
    const audioRow = el('div', 'tester-row');
    const audioSelect = el('select', 'tester-select');
    audioSelect.setAttribute('aria-label', 'Som da transmissão');
    for (const [value, label] of [['none', 'Sem som'], ['system', 'Com o som do PC'], ['window', 'Só o som do programa (janela)']]) {
      const o = el('option', null, label);
      o.value = value;
      audioSelect.append(o);
    }
    audioRow.append(audioSelect);
    const shareActions = el('div', 'tester-actions');
    const shareStart = button('Começar a transmitir', 'btn btn-primary btn-small', () => {
      const option = sourceSelect.selectedOptions[0];
      if (!option || !option.value) return;
      run('share-start', { source: option.value, name: option.textContent, audio: audioSelect.value === 'system', windowAudio: audioSelect.value === 'window' });
    });
    const shareStop = button('Parar', 'btn btn-small', () => run('share-stop'));
    shareActions.append(shareStart, shareStop);
    shareBox.append(shareNote, sourceRow, audioRow, shareActions);

    const controlBox = el('section', 'tester-section');
    controlBox.append(el('h4', null, 'Controle remoto'));
    const controlNote = el('p', 'tester-note');
    const controlRow = el('div', 'tester-row');
    const personSelect = el('select', 'tester-select');
    personSelect.setAttribute('aria-label', 'Quem recebe o controle');
    const deviceBoxes = {};
    const devices = el('div', 'control-devices');
    for (const [key, label] of DEVICES) {
      const row = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = key !== 'gamepad';
      deviceBoxes[key] = box;
      row.append(box, label);
      devices.append(row);
    }
    const grant = button('Dar o controle', 'btn btn-primary btn-small', () => {
      if (!personSelect.value) return;
      const chosen = Object.fromEntries(DEVICES.map(([key]) => [key, deviceBoxes[key].checked]));
      run('control-grant', { to: personSelect.value, devices: chosen });
    });
    controlRow.append(personSelect, devices, grant);
    const grants = el('ul', 'tester-grants');
    controlBox.append(controlNote, controlRow, grants);

    const voiceBox = el('section', 'tester-section');
    voiceBox.append(el('h4', null, 'Voz'));
    const voiceActions = el('div', 'tester-actions');
    const voiceToggle = button('Entrar na voz', 'btn btn-small', () => run(state && state.voice && state.voice.joined ? 'voice-leave' : 'voice-join'));
    const micToggle = button('Desligar o microfone', 'btn btn-small', () => run('mute', { muted: !(state && state.voice && state.voice.muted) }));
    const deafToggle = button('Desligar o som', 'btn btn-small', () => run('deafen', { deafened: !(state && state.voice && state.voice.deafened) }));
    voiceActions.append(voiceToggle, micToggle, deafToggle);
    voiceBox.append(voiceActions);

    const logBox = el('section', 'tester-section');
    logBox.append(el('h4', null, 'Últimos comandos'));
    const logList = el('ol', 'tester-log');
    logBox.append(logList);

    body.replaceChildren(status, shareBox, controlBox, voiceBox, logBox);

    // ---- o desenho ----
    // replace: troca a linha de "esperando…" pelo resultado do mesmo comando.
    function note(text, replace = false) {
      if (replace) history.shift();
      history.unshift(`${time()} · ${text}`);
      history.length = Math.min(history.length, 8);
      logList.replaceChildren(...history.map((line) => el('li', null, line)));
    }

    function renderSources() {
      const keep = sourceSelect.value;
      sourceSelect.replaceChildren();
      if (!sources.length) {
        const o = el('option', null, state && state.app ? 'Clique em Atualizar a lista' : 'Indisponível no navegador');
        o.value = '';
        sourceSelect.append(o);
        return;
      }
      for (const [kind, label] of [['screen', 'Telas'], ['window', 'Janelas']]) {
        const items = sources.filter((s) => s.kind === kind);
        if (!items.length) continue;
        const group = el('optgroup');
        group.label = label;
        for (const s of items) {
          const o = el('option', null, s.name || s.id);
          o.value = s.id;
          group.append(o);
        }
        sourceSelect.append(group);
      }
      if (keep && sources.some((s) => s.id === keep)) sourceSelect.value = keep;
    }

    function render() {
      if (!target) return;
      title.textContent = `Controlar ${target.name}`;
      const s = state;
      if (!s) {
        sub.textContent = 'Usuário de testes. Lendo o estado…';
        status.textContent = '';
      } else {
        const where = s.app ? `App ${s.appVersion || ''}`.trim() : 'Navegador';
        const share = s.sharing ? `transmitindo${s.sharingName ? ` "${s.sharingName}"` : ''}` : s.sharePending ? 'começando a transmitir…' : 'sem transmitir';
        const voice = !s.voice || !s.voice.joined ? 'fora da voz'
          : `na voz, microfone ${s.voice.noMic ? 'indisponível' : s.voice.muted ? 'desligado' : 'ligado'}${s.voice.deafened ? ', som desligado' : ''}`;
        sub.textContent = `Usuário de testes · ${where}`;
        status.textContent = `Agora: ${share} · ${voice}.`;
      }
      const app = Boolean(s && s.app);
      shareNote.textContent = !s ? '' : !app
        ? 'No navegador, quem escolhe a tela é a própria pessoa (o navegador pergunta). Pelo app, dá pra começar daqui.'
        : 'Só os nomes das telas e janelas, sem prévia. "Só o som do programa" vale pra janela, no Windows.';
      sourceSelect.disabled = !app;
      refreshSources.disabled = !app;
      audioSelect.disabled = !app;
      shareStart.disabled = !app || Boolean(s && (s.sharing || s.sharePending)) || !sourceSelect.value;
      shareStop.disabled = !s || !s.sharing;

      const people = (s && s.people) || [];
      const keep = personSelect.value;
      personSelect.replaceChildren(...(people.length ? people.map((p) => {
        const o = el('option', null, p.name);
        o.value = p.id;
        return o;
      }) : [Object.assign(el('option', null, 'Ninguém mais na sala'), { value: '' })]));
      if (keep && people.some((p) => p.id === keep)) personSelect.value = keep;
      const canControl = Boolean(s && s.canControl);
      controlNote.textContent = !s ? '' : canControl ? 'Escolha quem e o que pode usar (como no botão 🎮 dele).'
        : !app ? 'Controle remoto só pelo app.'
          : (s.controlNote || 'Pra dar o controle, ele precisa estar transmitindo a tela inteira pelo app.');
      personSelect.disabled = !canControl || !people.length;
      grant.disabled = !canControl || !people.length;
      for (const box of Object.values(deviceBoxes)) box.disabled = !canControl;
      const list = (s && s.grants) || [];
      grants.replaceChildren(...list.map((g) => {
        const li = el('li', 'tester-grant');
        const what = DEVICES.filter(([key]) => g.devices && g.devices[key]).map(([, label]) => label.toLowerCase()).join(', ');
        li.append(el('span', null, `${g.name}: ${what || 'nada'}`), button('Tirar', 'btn btn-small', () => run('control-revoke', { to: g.to })));
        return li;
      }));
      grants.hidden = !list.length;

      const v = (s && s.voice) || {};
      voiceToggle.textContent = v.joined ? 'Sair da voz' : 'Entrar na voz';
      voiceToggle.disabled = !s;
      micToggle.textContent = v.muted ? 'Ligar o microfone' : 'Desligar o microfone';
      micToggle.disabled = !v.joined || v.noMic;
      deafToggle.textContent = v.deafened ? 'Ligar o som' : 'Desligar o som';
      deafToggle.disabled = !v.joined;
    }

    // ---- os comandos ----
    let busy = false;
    async function run(type, args = {}) {
      if (busy) return;
      busy = true;
      const what = describe(type, args);
      note(`${what}…`);
      for (const b of body.querySelectorAll('button')) b.disabled = true;
      const res = await send(type, args);
      busy = false;
      if (res.state) state = res.state;
      note(res.error ? `${what}: ${res.error}` : `${what}: feito`, true);
      render();
      return res;
    }

    async function loadSources() {
      const res = await run('sources');
      if (res && Array.isArray(res.sources)) {
        sources = res.sources.filter((s) => s && typeof s.id === 'string');
        renderSources();
        render();
      }
    }

    async function poll() {
      clearTimeout(pollTimer);
      if (!target || !dialog.open) return;
      if (!busy && !document.hidden) {
        const res = await send('state');
        if (!target) return;
        if (res.state || res.ok) state = res.state || null;
        else if (res.error) status.textContent = res.error;
        render();
      }
      pollTimer = setTimeout(poll, 3000);
    }

    sourceSelect.addEventListener('change', render);
    dialog.addEventListener('close', () => {
      clearTimeout(pollTimer);
      target = null;
    });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

    return {
      open(user) {
        const changed = !target || target.id !== user.id;
        target = { id: user.id, name: user.name };
        if (changed) {
          state = null;
          sources = [];
          history.length = 0;
          logList.replaceChildren();
          renderSources();
        }
        render();
        if (!dialog.open) dialog.showModal();
        poll();
      },
      // Saiu da sala (ou não é mais de testes): o painel dele fecha.
      gone(id) { if (target && target.id === id && dialog.open) dialog.close(); },
      rename(id, name) { if (target && target.id === id) { target.name = name; render(); } },
      isOpenFor: (id) => Boolean(target && target.id === id && dialog.open),
    };
  }

  window.WssTester = { agent, panel, LABELS };
})();
