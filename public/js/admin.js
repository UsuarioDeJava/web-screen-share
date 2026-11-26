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

  const TABS = [
    ['online', 'Na sala agora'],
    ['room', 'Sala'],
    ['server', 'Servidor e contêiner'],
    ['streams', 'Transmissões'],
    ['errors', 'Erros agrupados'],
  ];

  function build(root, onLogout) {
    root.replaceChildren();
    const wrap = el('div', 'admin-wrap');
    const head = el('header', 'admin-head');
    const titles = el('div');
    const title = el('h1', 'admin-title', 'Administração');
    // O título diz o que é a página; o nome da sala vai na linha de baixo.
    const sub = el('p', 'admin-sub', `Web Screen Share`);
    titles.append(title, sub);
    const actions = el('div', 'admin-head-actions');
    actions.append(button('Sair', 'btn admin-logout', onLogout));
    head.append(titles, actions);

    const nav = el('nav', 'admin-tabs');
    nav.setAttribute('role', 'tablist');
    const panels = {};
    const main = el('main', 'admin-main');
    for (const [id, label] of TABS) {
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
    select('room');
    return { panels, setRoomName: (name) => { sub.textContent = `${name || 'Web Screen Share'}`; } };
  }

  function buildOnline(panel, view) {
    const card = el('div', 'admin-card');
    card.append(el('h2', null, 'Na sala agora'));
    card.append(el('p', 'admin-hint', 'Desconectar tira a pessoa da sala agora (ela pode entrar de novo com o nick).'));
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

  function buildRoom(panel, view) {
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
    const notice = field('Recado na tela de entrada', input({ maxLength: 200, placeholder: 'Bem-vindos à sala' }));
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
      control.checked = s.control;
      obs.checked = s.obs;
      obs.disabled = !state.server.obs;
      obsHint.textContent = state.server.obs ? 'Desligando, ninguém começa a transmitir pelo OBS (quem já está no ar continua até parar).' : 'Este servidor não está com o OBS configurado (o MediaMTX vem na imagem Docker).';
      maxUsers.value = String(s.maxUsers);
      chatHistory.value = String(s.chatHistory);
    };
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

  function open() {
    close();
    const ui = build(root, logout);
    const view = { refresh: null };
    const renders = [
      buildOnline(ui.panels.online, view),
      buildRoom(ui.panels.room, view),
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
    view.refresh();
    timer = setInterval(view.refresh, 5000);
  }

  const root = document.getElementById('admin');
  const login = document.getElementById('login');
  const form = document.getElementById('admin-login');
  const error = document.getElementById('error');
  let current = null;
  let timer;

  function close() {
    clearInterval(timer);
    current = null;
    root.replaceChildren();
    root.hidden = true;
    login.hidden = false;
  }

  async function ask(action, data = {}) {
    try {
      const options = action === 'state' ? {} : {
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
    close();
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('password');
    const result = await ask('login', { password: password.value });
    error.textContent = result.error || '';
    if (result.ok) {
      form.reset();
      open();
    }
  });
  ask('state').then(state => {
    if (state.settings && !current) open();
    else if (state.error && state.error !== 'Entre com a senha do painel.') error.textContent = state.error;
  });
})();
