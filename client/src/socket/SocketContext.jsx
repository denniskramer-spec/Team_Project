import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../auth/AuthContext.jsx';

const SocketContext = createContext({ socket: null, online: new Set(), connected: false });

// One socket per logged-in session. Tracks which users are online and
// keeps the session in sync when an admin changes this user's account.
export function SocketProvider({ children }) {
  const { user, refresh } = useAuth();
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState(() => new Set());
  const [connected, setConnected] = useState(false);
  const userId = user && !user.mustChangePassword ? user.id : null;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!userId) return undefined;
    const s = io({ withCredentials: true });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', (reason) => {
      setConnected(false);
      // The server drops our socket after a role/group/status change.
      // Reload the session, and reconnect only if the account is still usable.
      if (reason === 'io server disconnect') {
        refreshRef.current().then((u) => { if (u && !u.mustChangePassword) s.connect(); });
      }
    });
    // The server refused the connection (expired session, disabled account...).
    // socket.io does not retry that on its own: reload the session, which logs
    // the user out if it is gone, and otherwise try again shortly.
    // A server still starting (database not connected yet) refuses too, and
    // /auth/me answers 503 then: that is no reason to give up. A session that
    // is really gone logs the user out, which closes this socket (cleanup).
    let retry = null;
    let closed = false;
    s.on('connect_error', () => {
      if (s.active) return; // a network error: socket.io is already retrying
      refreshRef.current().then((u) => {
        if (closed || u?.mustChangePassword) return;
        clearTimeout(retry);
        retry = setTimeout(() => s.connect(), 3000 + Math.random() * 4000);
      });
    });
    s.on('session:changed', () => refreshRef.current());
    s.on('presence:list', (ids) => setOnline(new Set(ids)));
    s.on('presence:online', (id) => setOnline((prev) => new Set(prev).add(id)));
    s.on('presence:offline', (id) => setOnline((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    }));

    setSocket(s);
    return () => {
      closed = true;
      clearTimeout(retry);
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setOnline(new Set());
    };
  }, [userId]);

  return (
    <SocketContext.Provider value={{ socket, online, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);

// Runs handler whenever the server emits `event` (latest handler is always used).
export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!socket) return undefined;
    const fn = (...args) => ref.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

// Like useSocketEvent, but a burst of events becomes one call, delayed a
// little at random so every open client does not hit the server in the same
// instant. For events that mean "reload this list" rather than "here is data".
export function useDebouncedSocketEvent(event, handler, { min = 300, jitter = 700 } = {}) {
  const timer = useRef(null);
  useSocketEvent(event, (...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => handler(...args), min + Math.random() * jitter);
  });
  useEffect(() => () => clearTimeout(timer.current), []);
}

// Runs handler after the socket reconnects (sleep, network blip). Events sent
// while it was down are lost, so pages reload what they show.
export function useReconnect(handler) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!socket) return undefined;
    const fn = () => ref.current();
    socket.io.on('reconnect', fn);
    return () => socket.io.off('reconnect', fn);
  }, [socket]);
}
