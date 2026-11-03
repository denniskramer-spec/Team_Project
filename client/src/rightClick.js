// Right-click does nothing anywhere in the app: no browser menu, and the
// text selection stays as it is. The app's own right-click menus (a chat
// message's ⋯ menu) still open, since they handle the event themselves.
// Text boxes keep the browser's menu (paste, spell-check), and so do links
// written in chat messages ("open in new tab", "copy link"); the app's own
// navigation links do not.
const NATIVE_MENU = 'input, textarea, select, [contenteditable="true"], .msg-body a[href]';
const nativeMenu = (e) => e.target instanceof Element && Boolean(e.target.closest(NATIVE_MENU));

export function blockRightClick() {
  document.addEventListener('contextmenu', (e) => { if (!nativeMenu(e)) e.preventDefault(); });
  document.addEventListener('mousedown', (e) => { if (e.button === 2 && !nativeMenu(e)) e.preventDefault(); });
}
