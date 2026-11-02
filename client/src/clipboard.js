// Copies text to the clipboard. navigator.clipboard only exists in a secure
// context (HTTPS or localhost), so when the app is opened from another
// computer at http://<IP>:3000 it falls back to a hidden textarea and
// execCommand('copy'). Throws when neither works.
export async function copyText(text) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // The copy watch skips this one: the caller notes a button copy itself.
  area.dataset.copyHelper = '';
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
  const focused = document.activeElement;
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } finally {
    area.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
  if (!ok) throw new Error('Copy failed');
}
