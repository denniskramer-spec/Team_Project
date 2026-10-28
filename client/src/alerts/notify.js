// Desktop notifications, shared by instruction alerts and chat popups.

export const desktopSupported = () => typeof Notification !== 'undefined';
export const canNotify = () => desktopSupported() && Notification.permission === 'granted';

// Whether the reader can see this window right now.
export const windowFocused = () => !document.hidden && document.hasFocus();

// Shows a desktop notification when the window is in the background (a
// focused window shows its own popup instead). Clicking it brings the window
// back and runs `onClick`.
export function notify(title, { body, tag, requireInteraction = false } = {}, onClick) {
  if (!canNotify() || windowFocused()) return null;
  const n = new Notification(title, { body, tag, requireInteraction });
  n.onclick = () => { window.focus(); onClick?.(); n.close(); };
  return n;
}
