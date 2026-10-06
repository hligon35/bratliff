/* Focus containment and background isolation shared by public dialogs. */
(() => {
  let active;
  const focusable = root => [...root.querySelectorAll('button, a[href], input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.getClientRects().length);
  function close() {
    if (!active) return;
    const previous = active;
    active = null;
    previous.inert.forEach(([el, value]) => { el.inert = value; });
    if (previous.trigger?.isConnected) previous.trigger.focus();
  }
  function open(dialog, onClose, trigger = document.activeElement) {
    close();
    const inert = [];
    let branch = dialog;
    while (branch.parentElement) {
      [...branch.parentElement.children].forEach(el => {
        if (el !== branch && !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) { inert.push([el, el.inert]); el.inert = true; }
      });
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
    active = { dialog, onClose, trigger, inert };
    (focusable(dialog)[0] || dialog).focus();
  }
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); active.onClose(); return; }
    if (event.key !== 'Tab') return;
    const nodes = focusable(active.dialog);
    if (!nodes.length) { event.preventDefault(); return; }
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (event.shiftKey && (document.activeElement === first || !active.dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !active.dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
  window.JPPDialog = Object.freeze({ open, close });
})();
