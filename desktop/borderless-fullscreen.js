// Tela cheia como janela sem bordas. Não chama setFullScreen(), preservando
// o caminho de renderização em janela. A janela deve ser criada com frame:false.
function createBorderlessFullscreen(win, screen, notify = () => {}, {
  schedule = callback => setTimeout(callback, 100), cancel = clearTimeout,
} = {}) {
  const owners = new Set();
  let previous = null;
  let displayId = null;
  let verification = null;

  function cancelVerification() {
    if (!verification) return;
    cancel(verification.handle);
    verification = null;
  }

  function targetDisplay() {
    const display = screen.getAllDisplays().find((d) => d.id === displayId)
      || screen.getDisplayMatching(win.getBounds());
    displayId = display.id;
    return display;
  }

  function publish() {
    notify({ fullscreen: owners.size > 0, maximized: win.isMaximized() });
  }

  function position() {
    if (!previous) return;
    cancelVerification();
    win.setBounds(targetDisplay().bounds);
    // Após restaurar maximização, a primeira escrita pode não mudar os bounds.
    // Confere uma vez após 100 ms; setImmediate ainda perdeu essa escrita no
    // Windows testado. Não adia a primeira entrada e não faz polling/recursão.
    const job = { handle: null };
    verification = job;
    job.handle = schedule(() => {
      if (verification !== job) return;
      verification = null;
      if (!previous || !owners.size || win.isDestroyed()) return;
      const target = targetDisplay().bounds, actual = win.getBounds();
      if (['x', 'y', 'width', 'height'].some(key => actual[key] !== target[key])) win.setBounds(target);
    });
  }

  function set(owner, on) {
    if (on) {
      if (owners.has(owner)) return;
      if (!owners.size) {
        previous = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
        displayId = screen.getDisplayMatching(win.getBounds()).id;
        if (previous.maximized) win.unmaximize();
        position();
        win.setAlwaysOnTop(win.isFocused());
      }
      owners.add(owner);
    } else {
      if (!owners.delete(owner)) return;
      if (!owners.size) {
        cancelVerification();
        const restore = previous;
        previous = null;
        win.setAlwaysOnTop(false);
        const b = restore.bounds;
        const visible = screen.getAllDisplays().some((display) => {
          const a = display.workArea || display.bounds;
          return b.x + b.width > a.x + 80 && b.x < a.x + a.width - 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 80;
        });
        const display = screen.getDisplayMatching(b);
        const a = display.workArea || display.bounds;
        const width = Math.min(b.width, a.width), height = Math.min(b.height, a.height);
        win.setBounds(visible ? b : { width, height, x: Math.max(a.x, Math.min(b.x, a.x + a.width - width)), y: Math.max(a.y, Math.min(b.y, a.y + a.height - height)) });
        if (restore.maximized) win.maximize();
      }
    }
    publish();
  }

  return {
    get active() { return owners.size > 0; },
    get restoreState() { return previous; },
    set,
    exit() { for (const owner of [...owners]) set(owner, false); },
    position,
    focus(on) { if (owners.size) win.setAlwaysOnTop(on); },
    publish,
  };
}

module.exports = { createBorderlessFullscreen };
