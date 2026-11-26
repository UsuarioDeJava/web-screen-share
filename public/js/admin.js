(function () {
  'use strict';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, className = 'btn', onClick = null) {
    const b = el('button', className, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function input(attrs = {}) {
    const i = el('input', 'admin-input');
    Object.assign(i, attrs);
    return i;
  }
  function message(node, text, ok = false) {
    node.textContent = text || '';
    node.classList.toggle('is-bad', Boolean(text) && !ok);
    node.classList.toggle('is-ok', Boolean(text) && ok);
  }
  const when = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  // Senha pra passar pra alguém: fácil de ler e de digitar (sem 0/O, 1/l).
  function readablePassword(length = 10) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => chars[b % chars.length]).join('');
  }
  // Conta normal: sem administração, não é de testes nem a do dono.
  const plain = (a) => !a.root && !a.admin && !a.tester;

  // Com contas (ACCOUNTS=on), as abas Contas e Minha conta entram.
  const TABS = [
    ['accounts', 'Contas', true],
    ['online', 'Na sala agora'],
    ['room', 'Sala'],
    ['me', 'Minha conta', true],
    ['server', 'Servidor e contêiner'],
    ['streams', 'Transmissões'],
    ['errors', 'Erros agrupados'],
  ];

  function build(root, onLogout, me) {
    root.replaceChildren();
    const wrap = el('div', 'admin-wrap');
    const head = el('header', 'admin-head');
    const titles = el('div');
    const title = el('h1', 'admin-title', 'Administração');
    // O título diz o que é a página; o nome da sala vai na linha de baixo.
    const sub = el('p', 'admin-sub', `Web Screen Share`);
    titles.append(title, sub);
    const actions = el('div', 'admin-head-actions');
    if (me) actions.append(el('span', 'admin-hint', `Conta: ${me.nick}`));
    actions.append(button('Sair', 'btn admin-logout', onLogout));
    head.append(titles, actions);

    const nav = el('nav', 'admin-tabs');
    nav.setAttribute('role', 'tablist');
    const panels = {};
    const main = el('main', 'admin-main');
    for (const [id, label, onlyAccounts] of TABS) {
      if (onlyAccounts && !me) continue;
      const tab = button(label, 'admin-tab');
      tab.dataset.tab = id;
      tab.setAttribute('role', 'tab');
      tab.addEventListener('click', () => select(id));
      nav.append(tab);
      const panel = el('section', `admin-panel admin-panel-${id}`);
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = true;
      panels[id] = panel;
      main.append(panel);
    }
    function select(id) {
      for (const tab of nav.children) tab.setAttribute('aria-selected', String(tab.dataset.tab === id));
      for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== id;
    }
    wrap.append(head, nav, main);
    root.append(wrap);
    select(me ? 'accounts' : 'room');
    return { panels, setRoomName: (name) => { sub.textContent = `${name || 'Web Screen Share'}`; } };
  }

  function buildAccounts(panel, view, me) {
    const owner = Boolean(me.root);
    const card = el('div', 'admin-card');
    card.append(el('h2', null, 'Criar conta'));
    card.append(el('p', 'admin-hint', owner
      ? 'Só o nick e uma senha provisória: no primeiro acesso a pessoa troca por uma dela. Não pode repetir nick.'
      : 'Só o nick e uma senha provisória: no primeiro acesso a pessoa troca por uma dela. Não pode repetir nick. Contas com administração ou de testes, só o dono do servidor cria.'));
    const row = el('div', 'admin-create');
    const nick = input({ placeholder: 'Nick', maxLength: 24, autocomplete: 'off' });
    nick.setAttribute('aria-label', 'Nick da conta nova');
    const pass = input({ placeholder: 'Senha provisória', maxLength: 200, autocomplete: 'off' });
    pass.setAttribute('aria-label', 'Senha provisória');
    const gen = button('Gerar', 'btn admin-gen', () => { pass.value = readablePassword(); });
    row.append(nick, pass, gen);
    const adminLabel = el('label', 'admin-check');
    const adminBox = input({ type: 'checkbox' });
    adminBox.className = '';
    adminLabel.append(adminBox, el('span', null, 'Conta com administração (também abre este painel)'));
    const testerLabel = el('label', 'admin-check');
    const testerBox = input({ type: 'checkbox' });
    testerBox.className = '';
    testerLabel.append(testerBox, el('span', null, 'Usuário de testes'));
    const testerHint = el('small', 'admin-hint admin-check-hint', 'Pra quem usa, é uma conta normal. Quem tem administração vê o selo Teste nela e controla de longe, pela sala: transmissão, controle remoto e voz.');
    adminLabel.hidden = !owner;
    testerLabel.hidden = !owner;
    testerHint.hidden = !owner;
    const create = button('Criar conta', 'btn btn-primary admin-create-btn');
    const msg = el('p', 'admin-msg');
    msg.setAttribute('role', 'status');
    create.addEventListener('click', async () => {
      const password = pass.value || readablePassword();
      create.disabled = true;
      const res = await ask('account-create', { nick: nick.value, password, admin: owner && adminBox.checked, tester: owner && testerBox.checked });
      create.disabled = false;
      if (res.error) { message(msg, res.error); return; }
      message(msg, `Conta de ${res.account.nick} criada. Senha provisória: ${password} (passe pra pessoa; no primeiro acesso ela troca).`, true);
      nick.value = '';
      pass.value = '';
      adminBox.checked = false;
      testerBox.checked = false;
      view.refresh();
    });
    card.append(row, adminLabel, testerLabel, testerHint, create, msg);

    const listCard = el('div', 'admin-card');
    listCard.append(el('h2', null, 'Contas'));
    const list = el('ul', 'admin-list admin-accounts');
    const listMsg = el('p', 'admin-msg');
    listMsg.setAttribute('role', 'status');
    listCard.append(list, listMsg);
    panel.append(card, listCard);

    return function render(state) {
      const meId = me.id;
      const rows = state.accounts.slice().sort((a, b) => (b.root - a.root) || a.nick.localeCompare(b.nick, 'pt-BR'));
      list.replaceChildren(...rows.map((a) => {
        const li = el('li', 'admin-row');
        li.dataset.account = a.id;
        const who = el('div', 'admin-who');
        who.append(el('span', 'admin-avatar', [...a.nick][0] || '?'));
        const name = el('div', 'admin-name');
        name.append(el('b', null, a.nick));
        const badges = el('span', 'admin-badges');
        if (a.root) badges.append(el('span', 'admin-badge is-root', 'Admin'));
        else if (a.admin) badges.append(el('span', 'admin-badge is-admin', 'Administração'));
        if (a.tester) badges.append(el('span', 'admin-badge is-test', 'Teste'));
        if (a.mustChange) badges.append(el('span', 'admin-badge is-temp', 'Senha provisória'));
        if (a.online) badges.append(el('span', 'admin-badge is-online', 'Na sala'));
        if (a.id === meId) badges.append(el('span', 'admin-badge', 'Você'));
        name.append(badges);
        who.append(name);
        const tools = el('div', 'admin-tools');
        const editor = el('div', 'admin-editor');
        editor.hidden = true;
        const openEditor = (build) => {
          editor.replaceChildren();
          editor.hidden = false;
          build(editor);
        };
        const self = a.id === meId;
        const manage = owner || plain(a);
        if (!manage && !self) tools.append(el('small', 'admin-hint', 'Só o dono do servidor mexe nesta conta.'));
        if (manage || self) tools.append(button('Renomear', 'btn btn-small', () => openEditor((box) => {
          const field = input({ value: a.nick, maxLength: 24 });
          field.setAttribute('aria-label', `Nick novo pra ${a.nick}`);
          const save = button('Salvar', 'btn btn-primary btn-small');
          const cancel = button('Cancelar', 'btn btn-small', () => { editor.hidden = true; });
          const out = el('span', 'admin-msg');
          save.addEventListener('click', async () => {
            const res = await ask('account-rename', { id: a.id, nick: field.value });
            if (res.error) { message(out, res.error); return; }
            editor.hidden = true;
            message(listMsg, `Agora é ${res.account.nick}.`, true);
            view.refresh();
          });
          box.append(field, save, cancel, out);
          field.focus();
          field.select();
        })));
        if (!self && manage) tools.append(button('Senha nova', 'btn btn-small', () => openEditor((box) => {
          const field = input({ value: readablePassword(), maxLength: 200 });
          field.setAttribute('aria-label', `Senha provisória nova pra ${a.nick}`);
          const save = button('Dar essa senha', 'btn btn-primary btn-small');
          const cancel = button('Cancelar', 'btn btn-small', () => { editor.hidden = true; });
          const out = el('span', 'admin-msg');
          save.addEventListener('click', async () => {
            const password = field.value;
            const res = await ask('account-update', { id: a.id, password });
            if (res.error) { message(out, res.error); return; }
            editor.hidden = true;
            message(listMsg, `Senha provisória de ${a.nick}: ${password} (no próximo acesso a pessoa troca; quem estava conectado com ela saiu).`, true);
            view.refresh();
          });
          box.append(field, save, cancel, out);
          field.select();
        })));
        if (!a.root && owner) {
          const testLabel = el('label', 'admin-check admin-check-small');
          const testBox = input({ type: 'checkbox', checked: a.tester });
          testBox.className = '';
          testBox.addEventListener('change', async () => {
            const res = await ask('account-update', { id: a.id, tester: testBox.checked });
            if (res.error) { testBox.checked = !testBox.checked; message(listMsg, res.error); return; }
            message(listMsg, `${a.nick} ${testBox.checked ? 'agora é' : 'não é mais'} usuário de testes.`, true);
            view.refresh();
          });
          testLabel.append(testBox, el('span', null, 'Testes'));
          tools.append(testLabel);
        }
        if (!a.root && manage) {
          const adminLabel = el('label', 'admin-check admin-check-small');
          const box = input({ type: 'checkbox', checked: a.admin });
          box.className = '';
          box.disabled = a.id === meId;
          box.addEventListener('change', async () => {
            const res = await ask('account-update', { id: a.id, admin: box.checked });
            if (res.error) { box.checked = !box.checked; message(listMsg, res.error); return; }
            message(listMsg, `${a.nick} ${box.checked ? 'agora tem' : 'não tem mais'} administração.`, true);
            view.refresh();
          });
          adminLabel.append(box, el('span', null, 'Administração'));
          adminLabel.hidden = !owner;
          tools.append(adminLabel);
          const remove = button('Apagar', 'btn btn-small btn-danger-soft', async () => {
            if (!window.confirm(`Apagar a conta de ${a.nick}? Ela sai da sala na hora e não entra mais.`)) return;
            const res = await ask('account-delete', { id: a.id });
            if (res.error) { message(listMsg, res.error); return; }
            message(listMsg, `Conta de ${a.nick} apagada.`, true);
            view.refresh();
          });
          remove.disabled = a.id === meId;
          tools.append(remove);
        }
        li.append(who, tools, editor);
        return li;
      }));
    };
  }

  function buildOnline(panel, view, me) {
    const card = el('div', 'admin-card');
    card.append(el('h2', null, 'Na sala agora'));
    card.append(el('p', 'admin-hint', me
      ? 'Desconectar tira a pessoa da sala agora (ela pode entrar de novo com a conta; pra não entrar mais, dê uma senha nova ou apague a conta).'
      : 'Desconectar tira a pessoa da sala agora (ela pode entrar de novo com o nick).'));
    const list = el('ul', 'admin-list');
    const msg = el('p', 'admin-msg');
    msg.setAttribute('role', 'status');
    card.append(list, msg);
    panel.append(card);
    return function render(state) {
      if (!state.online.length) {
        list.replaceChildren(el('li', 'admin-empty', 'Ninguém na sala agora. Quem entrar aparece aqui, com o botão Desconectar.'));
        return;
      }
      list.replaceChildren(...state.online.map((u) => {
        const li = el('li', 'admin-row');
        const who = el('div', 'admin-who');
        who.append(el('span', 'admin-avatar', [...u.name][0] || '?'));
        const name = el('div', 'admin-name');
        name.append(el('b', null, u.name));
        const badges = el('span', 'admin-badges');
        if (u.sharing) badges.append(el('span', 'admin-badge is-live', 'Transmitindo'));
        if (u.voice) badges.append(el('span', 'admin-badge is-online', 'Na voz'));
        if (u.admin) badges.append(el('span', 'admin-badge is-admin', 'Administração'));
        if (u.tester) badges.append(el('span', 'admin-badge is-test', 'Teste'));
        if (u.since) badges.append(el('span', 'admin-badge', `desde ${when(u.since)}`));
        name.append(badges);
        who.append(name);
        const tools = el('div', 'admin-tools');
        tools.append(button('Desconectar', 'btn btn-small btn-danger-soft', async () => {
          if (!window.confirm(`Desconectar ${u.name} da sala?`)) return;
          const res = await ask('kick', { id: u.id });
          message(msg, res.error || `${u.name} foi desconectado.`, !res.error);
          view.refresh();
        }));
        li.append(who, tools);
        return li;
      }));
    };
  }

  // ---------- configurações da sala ----------

  function buildRoom(panel, view, me) {
    const card = el('div', 'admin-card');
    card.append(el('h2', null, 'Configurações da sala'));
    card.append(el('p', 'admin-hint', 'Valem na hora, pra todo mundo, e ficam salvas no servidor.'));
    const form = el('div', 'admin-form');
    const field = (label, control, hint) => {
      const row = el('label', 'admin-field');
      row.append(el('span', 'admin-label', label), control);
      if (hint) row.append(el('small', 'admin-hint', hint));
      form.append(row);
      return control;
    };
    const roomName = field('Nome da sala', input({ maxLength: 40, placeholder: 'Web Screen Share' }), 'Aparece na tela de entrada e no topo da lista de pessoas.');
    const notice = field('Recado na tela de entrada', input({ maxLength: 200, placeholder: me ? 'Ex.: peça a sua conta pro fulano' : 'Bem-vindos à sala' }));
    const sharing = el('select', 'admin-input');
    for (const [value, label] of [['all', 'Todo mundo'], ['admins', 'Só contas com administração']]) {
      const o = el('option', null, label);
      o.value = value;
      sharing.append(o);
    }
    if (me) field('Quem pode transmitir', sharing, 'Vale pra transmitir pela sala, pelo app e pelo OBS.');
    const check = (label, hint) => {
      const row = el('label', 'admin-check');
      const box = input({ type: 'checkbox' });
      box.className = '';
      row.append(box, el('span', null, label));
      form.append(row);
      if (hint) form.append(el('small', 'admin-hint admin-check-hint', hint));
      return box;
    };
    const control = check('Controle remoto', 'Deixa quem transmite liberar teclado, mouse e gamepad pros outros. Desligando, os controles liberados acabam na hora.');
    const obs = check('Transmissão pelo OBS', '');
    // O texto depende de o servidor ter o OBS (preenchido no render).
    const obsHint = el('small', 'admin-hint admin-check-hint');
    form.append(obsHint);
    const maxUsers = field('Limite de pessoas na sala', input({ type: 'number', min: 0, max: 500, step: 1 }), '0: sem limite.');
    const chatHistory = field('Mensagens guardadas no chat', input({ type: 'number', min: 0, max: 1000, step: 1 }), 'Quem entra vê as últimas mensagens (0: o chat não guarda nada).');
    const actions = el('div', 'admin-actions');
    const save = button('Salvar', 'btn btn-primary');
    const clear = button('Apagar o histórico do chat', 'btn btn-danger-soft');
    const msg = el('p', 'admin-msg');
    msg.setAttribute('role', 'status');
    actions.append(save, clear);
    card.append(form, actions, msg);
    panel.append(card);
    let dirty = false;
    form.addEventListener('input', () => { dirty = true; message(msg, ''); });
    form.addEventListener('change', () => { dirty = true; });
    save.addEventListener('click', async () => {
      const settings = {
        roomName: roomName.value,
        notice: notice.value,
        ...(me ? { sharing: sharing.value } : {}),
        control: control.checked,
        obs: obs.checked,
        maxUsers: Math.max(0, Math.min(500, Math.round(Number(maxUsers.value) || 0))),
        chatHistory: Math.max(0, Math.min(1000, Math.round(Number(chatHistory.value) || 0))),
      };
      save.disabled = true;
      const res = await ask('settings', { settings });
      save.disabled = false;
      if (res.error) { message(msg, res.error); return; }
      dirty = false;
      message(msg, 'Salvo.', true);
      view.refresh();
    });
    clear.addEventListener('click', async () => {
      if (!window.confirm('Apagar todas as mensagens do chat, pra todo mundo?')) return;
      const res = await ask('chat-clear', {});
      message(msg, res.error || 'O histórico do chat foi apagado.', !res.error);
    });
    return function render(state) {
      if (dirty) return; // não atropela o que está sendo editado
      const s = state.settings;
      roomName.value = s.roomName;
      notice.value = s.notice;
      sharing.value = s.sharing === 'admins' ? 'admins' : 'all';
      control.checked = s.control;
      obs.checked = s.obs;
      obs.disabled = !state.server.obs;
      obsHint.textContent = state.server.obs ? 'Desligando, ninguém começa a transmitir pelo OBS (quem já está no ar continua até parar).' : 'Este servidor não está com o OBS configurado (o MediaMTX vem na imagem Docker).';
      maxUsers.value = String(s.maxUsers);
      chatHistory.value = String(s.chatHistory);
    };
  }

  function buildMe(panel, me) {
    const card = el('div', 'admin-card');
    card.append(el('h2', null, 'Trocar a minha senha'));
    const current = input({ type: 'password', placeholder: 'Senha atual', maxLength: 200, autocomplete: 'current-password' });
    const next = input({ type: 'password', placeholder: 'Senha nova (pelo menos 6 caracteres)', maxLength: 200, autocomplete: 'new-password' });
    const again = input({ type: 'password', placeholder: 'Repita a senha nova', maxLength: 200, autocomplete: 'new-password' });
    for (const [i, label] of [[current, 'Senha atual'], [next, 'Senha nova'], [again, 'Repita a senha nova']]) i.setAttribute('aria-label', label);
    const save = button('Trocar senha', 'btn btn-primary');
    const msg = el('p', 'admin-msg');
    msg.setAttribute('role', 'status');
    const fields = el('div', 'admin-fields');
    fields.append(current, next, again);
    card.append(fields, save, msg);
    if (me.root) card.append(el('p', 'admin-hint', 'Esqueceu a senha do Admin? Reinicie o container com a variável ADMIN_RESET_PASSWORD=1: uma senha nova aparece no log (depois tire a variável).'));
    panel.append(card);
    save.addEventListener('click', async () => {
      if (next.value.length < 6) { message(msg, 'A senha nova precisa de pelo menos 6 caracteres.'); return; }
      if (next.value !== again.value) { message(msg, 'As duas senhas novas não estão iguais.'); return; }
      save.disabled = true;
      const res = await ask('password', { current: current.value, next: next.value });
      save.disabled = false;
      if (res.error) { message(msg, res.error); return; }
      current.value = '';
      next.value = '';
      again.value = '';
      message(msg, 'Senha trocada. As sessões da sua conta na sala foram desconectadas.', true);
    });
    return () => {};
  }

  function buildServer(panel) {
    const card = el('div', 'admin-card');
    card.append(el('h2', null, 'Servidor'));
    const dl = el('dl', 'admin-facts');
    card.append(dl);
    card.append(el('p', 'admin-hint', 'As configurações ficam em settings.json na pasta de dados do servidor.'));
    panel.append(card);
    return function render(state) {
      const facts = [
        ['Versão', state.server.version],
        ['Ligado desde', when(state.server.startedAt)],
        ['Transmissão pelo OBS', state.server.obs ? (state.settings.obs ? 'disponível' : 'desligada nas configurações') : 'não configurada'],
        ['Na sala agora', String(state.online.length)],
      ];
      dl.replaceChildren(...facts.flatMap(([k, v]) => [el('dt', null, k), el('dd', null, v)]));
    };
  }

  // ---------- abrir / fechar ----------

  function open(first) {
    close();
    const me = mode.accounts && first && first.me ? first.me : null;
    // A conta Admin não usa a sala: a sessão que veio da sala (mesmo navegador) sai de lá.
    if (me && me.root) try { localStorage.removeItem('wss-session'); } catch {}
    const ui = build(root, logout, me);
    const view = { refresh: null };
    const renders = [
      ...(me ? [buildAccounts(ui.panels.accounts, view, me), buildMe(ui.panels.me, me)] : []),
      buildOnline(ui.panels.online, view, me),
      buildRoom(ui.panels.room, view, me),
      buildServer(ui.panels.server),
      window.WssAdminDiagnostics({panels:ui.panels, el, button, ask, when, refresh:()=>view.refresh()}),
    ];
    const error = el('p', 'admin-msg is-bad admin-load-error');
    error.hidden = true;
    root.querySelector('.admin-main').prepend(error);
    let loading = null;
    view.refresh = async () => {
      if (loading) return loading;
      loading = ask('state', {}).then((state) => {
        loading = null;
        if (current !== view) return;
        if (state.error) {
          error.textContent = state.error;
          error.hidden = false;
          return;
        }
        error.hidden = true;
        ui.setRoomName(state.settings.roomName);
        for (const render of renders) render(state);
      });
      return loading;
    };
    current = view;
    root.hidden = false;
    login.hidden = true;
    if (first && first.settings) {
      ui.setRoomName(first.settings.roomName);
      for (const render of renders) render(first);
    } else view.refresh();
    timer = setInterval(view.refresh, 5000);
  }

  const root = document.getElementById('admin');
  const login = document.getElementById('login');
  const form = document.getElementById('admin-login');
  const error = document.getElementById('error');
  const newpassForm = document.getElementById('admin-newpass');
  const newpassError = document.getElementById('newpass-error');
  let current = null;
  let timer;
  let mode = { accounts: false };
  let ticket = null; // primeiro acesso: a sessão provisória, pra criar a senha

  function close() {
    clearInterval(timer);
    current = null;
    root.replaceChildren();
    root.hidden = true;
    login.hidden = false;
    form.hidden = false;
    newpassForm.hidden = true;
  }

  async function ask(action, data = {}) {
    try {
      const options = action === 'state' || action === 'mode' ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WSS-Admin': '1' },
        body: JSON.stringify(data),
      };
      const response = await fetch('/admin/api/' + action, { ...options, cache: 'no-store' });
      const result = await response.json();
      if (response.status === 401 && current) {
        close();
        error.textContent = result.error;
      }
      return result;
    } catch {
      return { error: 'Não foi possível acessar o servidor.' };
    }
  }

  async function logout() {
    const result = await ask('logout');
    if (result.error) { window.alert(result.error); return; }
    // Saiu: nesta aba, não entra de novo sozinho com a sessão da sala.
    try { sessionStorage.setItem('wss-admin-out', '1'); } catch {}
    close();
  }
  const enter = () => ask('state').then((state) => {
    if (state.settings) open(state);
    else error.textContent = state.error || 'Não foi possível abrir o painel.';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('password');
    const nick = document.getElementById('nick');
    const result = await ask('login', mode.accounts ? { nick: nick.value, password: password.value } : { password: password.value });
    error.textContent = result.error || '';
    if (result.mustChange) {
      ticket = result.ticket;
      password.value = '';
      form.hidden = true;
      newpassForm.hidden = false;
      document.getElementById('newpass-nick').textContent = result.nick;
      newpassError.textContent = '';
      document.getElementById('newpass').focus();
      return;
    }
    if (result.ok) {
      form.reset();
      try { sessionStorage.removeItem('wss-admin-out'); } catch {}
      enter();
    }
  });
  newpassForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const next = document.getElementById('newpass').value;
    if (next.length < 6) { newpassError.textContent = 'A senha precisa de pelo menos 6 caracteres.'; return; }
    if (next !== document.getElementById('newpass2').value) { newpassError.textContent = 'As duas senhas não estão iguais.'; return; }
    const result = await ask('new-password', { ticket, next });
    if (!result.ok) { newpassError.textContent = result.error || 'Não deu pra salvar a senha.'; return; }
    ticket = null;
    newpassForm.reset();
    enter();
  });

  // Com contas: nick e senha (de uma conta com administração); se este navegador estiver
  // na sala com uma conta assim, entra direto com a sessão dela.
  function useAccounts() {
    for (const id of ['login-sub', 'nick-label', 'nick']) document.getElementById(id).hidden = false;
    document.getElementById('nick').required = true;
    document.getElementById('password-label').textContent = 'Senha';
  }
  ask('mode').then(async (value) => {
    mode = value && typeof value.accounts === 'boolean' ? value : { accounts: false };
    if (mode.accounts) useAccounts();
    const state = await ask('state');
    if (state.settings && !current) { open(state); return; }
    let session = null, out = false;
    try { session = localStorage.getItem('wss-session'); out = sessionStorage.getItem('wss-admin-out') === '1'; } catch {}
    if (mode.accounts && session && !out) {
      const result = await ask('login', { session });
      if (result.ok) { enter(); return; }
    }
    if (state.error && !/^Entre com/.test(state.error)) error.textContent = state.error;
    (mode.accounts ? document.getElementById('nick') : document.getElementById('password')).focus();
  });
})();
