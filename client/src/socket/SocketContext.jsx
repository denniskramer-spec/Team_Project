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
