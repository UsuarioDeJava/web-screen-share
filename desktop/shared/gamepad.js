(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WssGamepad = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const labels = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', '↑', '↓', '←', '→', 'Guide'];
  const playLabels = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS'];
  const presets = [{ id: 'xbox', name: 'Xbox' }, { id: 'playstation', name: 'PlayStation' }, { id: 'custom', name: 'GameSir / personalizado' }];
  const labelsFor = (value) => value?.layout === 'playstation' ? playLabels : labels;
  // O nome do botão físico (no mapeamento "standard" do navegador, a ordem é sempre a
  // mesma): mostrado nas listas do mapeamento no lugar de "Botão 0, Botão 1...". Em
  // controles fora do padrão a ordem é do fabricante: fica o número.
  const xboxNames = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View (Back)', 'Menu (Start)', 'L3', 'R3',
    '↑ Cima', '↓ Baixo', '← Esquerda', '→ Direita', 'Xbox (Guide)'];
  const playNames = ['✕ Cruz', '○ Círculo', '□ Quadrado', '△ Triângulo', 'L1', 'R1', 'L2', 'R2', 'Create (Share)', 'Options', 'L3', 'R3',
    '↑ Cima', '↓ Baixo', '← Esquerda', '→ Direita', 'PS', 'Touchpad'];
  // Botões do controle como teclas do teclado (ex.: A → Espaço): o código da tecla pela
  // posição física (KeyboardEvent.code), como o teclado do controle remoto.
  const KEY_CODE = /^[A-Za-z][A-Za-z0-9]{0,23}$/;
  const KEY_NAMES = { Space: 'Espaço', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: 'Backspace', CapsLock: 'Caps Lock',
    ShiftLeft: 'Shift esquerdo', ShiftRight: 'Shift direito', ControlLeft: 'Ctrl esquerdo', ControlRight: 'Ctrl direito',
    AltLeft: 'Alt', AltRight: 'Alt Gr', MetaLeft: 'Windows', MetaRight: 'Windows direito', ArrowUp: '↑', ArrowDown: '↓',
    ArrowLeft: '←', ArrowRight: '→', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'Page Up',
    PageDown: 'Page Down', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: 'Ç / ;',
    Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/', IntlBackslash: '\\ (ABNT)', IntlRo: '/ (ABNT)',
    NumpadEnter: 'Enter (numérico)', NumpadAdd: '+ (numérico)', NumpadSubtract: '- (numérico)', NumpadMultiply: '* (numérico)',
    NumpadDivide: '/ (numérico)', NumpadDecimal: ', (numérico)', ContextMenu: 'Menu' };
  function keyName(code) {
    if (typeof code !== 'string' || !code) return '';
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    let m = /^Key([A-Z])$/.exec(code); if (m) return m[1];
    m = /^Digit(\d)$/.exec(code); if (m) return m[1];
    m = /^Numpad(\d)$/.exec(code); if (m) return `${m[1]} (numérico)`;
    return code;
  }
  // As teclas apertadas agora (pelos botões ligados a elas).
  function keysDown(pad, config) {
    const down = new Set();
    for (const k of config.keys || []) if ((Number(pad?.buttons?.[k.source]?.value) || 0) > 0.5) down.add(k.code);
    return down;
  }
  function physicalName(index, value, standard = true) {
    const names = value?.layout === 'playstation' ? playNames : xboxNames;
    return standard && index >= 0 && index < names.length ? names[index] : `Botão ${index}`;
  }
  function defaultProfile(pad) {
    const id = String(pad?.id || '');
    // O Xbox vem antes: "Xbox Wireless Controller" também tem "Wireless Controller", que é o
    // nome que o DualShock 4 mostra (Vendor 054c).
    return profile({ preset: /gamesir/i.test(id) ? 'custom' : /xbox|xinput|045e/i.test(id) ? 'xbox'
      : /dualsense|dualshock|playstation|054c|sony.*controller|wireless controller/i.test(id) ? 'playstation' : 'xbox' });
  }
  function applyPreset(id, current) {
    const p = profile(current);
    return profile({ preset: id, layout: id === 'custom' ? p.layout : id, deadzone: p.deadzone, triggers: p.triggers, extraButtons: p.extraButtons, keys: p.keys });
  }
  // "Nenhum": a saída não vai pro controle de quem transmite (-1 nos botões, type 'none' nos gatilhos).
  const NONE = -1;
  const GUIDE = 16;
  const permissions = (value) => ({ keyboard: value?.keyboard === true, mouse: value?.mouse === true, gamepad: value?.gamepad === true });
  const kindDevice = (kind) => kind === 'key' ? 'keyboard' : kind === 'gamepad' ? 'gamepad' : ['move', 'button', 'wheel'].includes(kind) ? 'mouse' : null;
  function validState(value) {
    return value && Array.isArray(value.axes) && value.axes.length === 4 && Array.from(value.axes).every((v) => Number.isFinite(v) && v >= -1 && v <= 1)
      && Array.isArray(value.buttons) && value.buttons.length === 17 && Array.from(value.buttons).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
  }
  function profile(value = {}) {
    if (!value || typeof value !== 'object') value = {};
    // Versão 2: o botão Guide (Xbox/PS) começa bloqueado (abriria a Game Bar ou a Steam no PC
    // de quem transmite). Perfis salvos antes da versão 2 passam a bloquear também; dá pra
    // liberar escolhendo o botão de novo.
    const buttons = labels.map((_, i) => Number.isInteger(value.buttons?.[i]) && value.buttons[i] >= NONE && value.buttons[i] < 64 ? value.buttons[i] : i);
    if (value.v !== 2) buttons[GUIDE] = NONE;
    return {
      v: 2,
      preset: presets.some((p) => p.id === value.preset) ? value.preset : 'xbox',
      layout: value.preset === 'playstation' || (value.preset === 'custom' && value.layout === 'playstation') ? 'playstation' : 'xbox',
      keys: Array.isArray(value.keys) ? value.keys.slice(0, 16)
        .filter((k) => k && Number.isInteger(k.source) && k.source >= 0 && k.source < 64 && typeof k.code === 'string' && KEY_CODE.test(k.code))
        .map((k) => ({ source: k.source, code: k.code })) : [],
      extraButtons: Array.isArray(value.extraButtons) ? value.extraButtons.slice(0, 16)
        .filter((v) => v && Number.isInteger(v.source) && v.source >= 0 && v.source < 64 && Number.isInteger(v.target) && v.target >= 0 && v.target < 17)
        .map((v, i) => ({ source: v.source, target: v.target, name: typeof v.name === 'string' ? v.name.replace(/[\x00-\x1f]/g, '').slice(0, 24) : `M${i + 1}` })) : [],
      triggerLimits: [0, 1].map((i) => Number.isFinite(value.triggerLimits?.[i]) ? Math.max(0, Math.min(1, value.triggerLimits[i])) : 1),
      triggers: [0, 1].map((i) => {
        const t = value.triggers?.[i];
        const type = ['button', 'axis', 'none'].includes(t?.type) ? t.type : 'mapped';
        const source = Number.isInteger(t?.source) && t.source >= 0 && t.source < (type === 'axis' ? 16 : 64) ? t.source : 6 + i;
        const min = Number.isFinite(t?.min) && t.min >= (type === 'axis' ? -1 : 0) && t.min <= 1 ? t.min : type === 'axis' ? -1 : 0;
        const max = Number.isFinite(t?.max) && t.max >= (type === 'axis' ? -1 : 0) && t.max <= 1 ? t.max : 1;
        return { type, source, min: Math.abs(max - min) >= 0.01 ? min : type === 'axis' ? -1 : 0, max: Math.abs(max - min) >= 0.01 ? max : 1 };
      }),
      buttons,
      axes: [0, 1, 2, 3].map((i) => Number.isInteger(value.axes?.[i]) && value.axes[i] >= 0 && value.axes[i] < 16 ? value.axes[i] : i),
      invert: [0, 1, 2, 3].map((i) => value.invert?.[i] === true),
      deadzone: Number.isFinite(value.deadzone) ? Math.max(0, Math.min(0.5, value.deadzone)) : 0.12,
    };
  }
  function sample(pad, config) {
    return sampleProfile(pad, profile(config));
  }
  function createSampler(config, { reuseOutput = false } = {}) {
    const normalized = profile(config);
    // Opt-in para leitura interna: o próximo sample sobrescreve o resultado.
    // Quem retém/envia um estado deve copiar os vetores antes da próxima leitura.
    const output = reuseOutput ? neutral() : null;
    const taken = normalized.keys.length ? new Set(normalized.keys.map((k) => k.source)) : null;
    // keysActive: as teclas vão (gamepad e teclado liberados); senão o botão volta a ser do controle.
    return (pad, keysActive = false) => sampleProfile(pad, normalized, output, keysActive ? taken : null);
  }
  let takenNow = null; // botões físicos que agora vão como tecla (não como botão do controle)
  const buttonValue = (pad, index) => index < 0 || takenNow?.has(index) ? 0 : Math.max(0, Math.min(1, Number(pad.buttons[index]?.value) || 0));
  function sampleProfile(pad, p, output = null, taken = null) {
    takenNow = taken;
    try { return sampleButtons(pad, p, output); } finally { takenNow = null; }
  }
  function sampleButtons(pad, p, output) {
    const result = output || { buttons: Array(17), axes: Array(4) }, buttons = result.buttons;
    for (let i = 0; i < 17; i++) buttons[i] = buttonValue(pad, p.buttons[i]);
    for (let i = 0; i < 2; i++) {
      const trigger = p.triggers[i];
      const raw = trigger.type === 'none' ? 0 : trigger.type === 'axis' ? Number(pad.axes[trigger.source]) : buttonValue(pad, trigger.type === 'button' ? trigger.source : p.buttons[6 + i]);
      buttons[6 + i] = Number.isFinite(raw) ? Math.round(Math.max(0, Math.min(1, (raw - trigger.min) / (trigger.max - trigger.min))) * 1e6) / 1e6 : 0;
    }
    if (p.preset === 'custom') for (const binding of p.extraButtons) buttons[binding.target] = Math.max(buttons[binding.target], buttonValue(pad, binding.source));
    for (let i = 0; i < 2; i++) buttons[6 + i] *= p.triggerLimits[i];
    for (let i = 0; i < 4; i++) {
      let value = Math.max(-1, Math.min(1, Number(pad.axes[p.axes[i]]) || 0));
      value = Math.abs(value) <= p.deadzone ? 0 : Math.sign(value) * (Math.abs(value) - p.deadzone) / (1 - p.deadzone);
      result.axes[i] = Math.round(value * (p.invert[i] ? -1 : 1) * 1000) / 1000;
    }
    return result;
  }
  const neutral = () => ({ axes: [0, 0, 0, 0], buttons: Array(17).fill(0) });
  // Comparação de estados já normalizados pelo sampler; não substitui validação
  // de pacotes. Preserva toda a precisão, sem serializar a cada leitura física.
  function sameState(a, b) {
    if (!a || !b || a.axes?.length !== 4 || b.axes?.length !== 4 || a.buttons?.length !== 17 || b.buttons?.length !== 17) return false;
    for (let i = 0; i < 4; i++) if (a.axes[i] !== b.axes[i]) return false;
    for (let i = 0; i < 17; i++) if (a.buttons[i] !== b.buttons[i]) return false;
    return true;
  }
  return { NONE, GUIDE, labels, labelsFor, physicalName, keyName, keysDown, presets, defaultProfile, applyPreset, permissions, kindDevice, validState, profile, sample, createSampler, neutral, sameState };
});
