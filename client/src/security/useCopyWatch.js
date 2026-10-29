import { useEffect } from 'react';
import { api } from '../api.js';

// Copying or cutting text that may hold bank details (a long run of digits,
// an IBAN, a wallet address) sends it to the server, which decides whether
// it really does and, if so, writes a masked note in the security log
// (server/src/routes/copies.js). Everything else never leaves the page.
const MAYBE = /\d(?:[ -]?\d){7,}|[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,}|0x[0-9a-f]{40}|\bT[1-9A-HJ-NP-Za-km-z]{33}\b|\bbc1[a-z0-9]{25,}/i;
const MAX_TEXT = 5000;

function copiedText(event) {
  const el = event.target instanceof Element ? event.target.closest('input, textarea') : null;
  if (el && typeof el.selectionStart === 'number') return el.value.slice(el.selectionStart, el.selectionEnd);
  return window.getSelection()?.toString() ?? '';
}

export function useCopyWatch() {
  useEffect(() => {
    const onCopy = (event) => {
      const text = copiedText(event).slice(0, MAX_TEXT);
      if (!MAYBE.test(text)) return;
      api('/copies', { method: 'POST', body: { text, page: window.location.pathname } }).catch(() => {});
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
    };
  }, []);
}
