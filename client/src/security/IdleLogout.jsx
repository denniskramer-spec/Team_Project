import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Modal from '../components/Modal.jsx';

// Logs out after the server's idle time (SESSION_IDLE_MINUTES) without a
// click, key press, scroll or touch in any of the app's tabs, after a
// minute's warning. While someone is active but not loading anything, the
// session is kept alive with a light request every few minutes, or the
// server would end it under them.
const LAST_ACTIVE_KEY = 'bm.lastActive';
const WARN_MS = 60 * 1000;
const KEEP_ALIVE_MS = 5 * 60 * 1000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];

const readLastActive = () => {
  try { return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0; } catch { return 0; }
};

export default function IdleLogout() {
  const { user, session, logout } = useAuth();
  const idleMs = (session?.idleMinutes ?? 30) * 60 * 1000;
  const lastActive = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [left, setLeft] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    lastActive.current = Date.now();
    let lastWrite = 0;
    const onActive = () => {
      const now = Date.now();
      lastActive.current = now;
      // Other tabs see this tab's activity (one write every few seconds).
      if (now - lastWrite > 5000) {
        lastWrite = now;
        try { localStorage.setItem(LAST_ACTIVE_KEY, String(now)); } catch { /* storage off: this tab alone */ }
      }
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActive, { passive: true }));

    const tick = setInterval(() => {
      const now = Date.now();
      const last = Math.max(lastActive.current, readLastActive());
      const idle = now - last;
      if (idle >= idleMs) {
        clearInterval(tick);
        logout();
        return;
      }
      setLeft(idle >= idleMs - WARN_MS ? Math.ceil((idleMs - idle) / 1000) : null);
      if (idle < KEEP_ALIVE_MS && now - lastPing.current > KEEP_ALIVE_MS) {
        lastPing.current = now;
        api('/auth/me').catch(() => {});
      }
    }, 1000);

    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActive));
      clearInterval(tick);
    };
  }, [user, idleMs, logout]);

  if (left === null) return null;
  const stay = () => { lastActive.current = Date.now(); setLeft(null); };
  return (
    <Modal
      title="Still there?"
      onClose={stay}
      footer={<>
        <button type="button" className="btn" onClick={logout}>Log out</button>
        <button type="button" className="btn primary" onClick={stay}>Stay logged in</button>
      </>}
    >
      <p>You haven&apos;t used the app for a while. For safety you&apos;ll be logged out in <strong>{left} s</strong>.</p>
    </Modal>
  );
}
