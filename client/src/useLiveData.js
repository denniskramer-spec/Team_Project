import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useReconnect, useSocket } from './socket/SocketContext.jsx';

// For pages that load on their own: call `track()` when a request starts; the
// function it returns says whether that request is still the latest one, so a
// slow older response cannot overwrite a newer one (e.g. Week, then Year).
export function useLatestRequest() {
  const seq = useRef(0);
  return useCallback(() => {
    seq.current += 1;
    const id = seq.current;
    return () => id === seq.current;
  }, []);
}

// `value`, once it has stopped changing for `ms` (for search boxes).
export function useDebounced(value, ms = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

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

  // Previous data stays on screen while the next path loads (no flash of an
  // empty page on every keystroke of a search).
  useEffect(() => {
    setLoading(Boolean(path));
    reload();
  }, [path, reload]);
  useReconnect(reload);

  const eventKey = events.join('|');
  useEffect(() => {
    if (!socket || !eventKey) return undefined;
    const names = eventKey.split('|');
    names.forEach((e) => socket.on(e, reload));
    return () => names.forEach((e) => socket.off(e, reload));
  }, [socket, eventKey, reload]);

  return { data, error, loading, reload, setData };
}
