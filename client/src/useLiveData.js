import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useSocket } from './socket/SocketContext.jsx';

// Loads `path` and reloads it whenever one of `events` arrives over the socket.
// Pass path = null to skip loading.
export function useLiveData(path, events = []) {
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(path));
  const latest = useRef(path);
  latest.current = path;

  const reload = useCallback(async () => {
    if (!latest.current) return;
    const requested = latest.current;
    try {
      const result = await api(requested);
      // Ignore responses for a path we've since navigated away from.
      if (requested === latest.current) { setData(result); setError(''); }
    } catch (err) {
      if (requested === latest.current) setError(err.message);
    } finally {
      if (requested === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(Boolean(path));
    setData(null);
    reload();
  }, [path, reload]);

  const eventKey = events.join('|');
  useEffect(() => {
    if (!socket || !eventKey) return undefined;
    const names = eventKey.split('|');
    names.forEach((e) => socket.on(e, reload));
    return () => names.forEach((e) => socket.off(e, reload));
  }, [socket, eventKey, reload]);

  return { data, error, loading, reload, setData };
}
