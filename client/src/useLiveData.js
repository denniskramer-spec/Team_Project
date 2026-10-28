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

  // One change on the server can emit several events in a burst (an income
  // settles reports, then the task, then the income itself), and every open
  // client hears them: a burst becomes one reload, spread out a little so the
  // clients do not all hit the server in the same instant.
  const timer = useRef(null);
  const scheduleReload = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(reload, RELOAD_DELAY_MS + Math.random() * RELOAD_JITTER_MS);
  }, [reload]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const eventKey = events.join('|');
  useEffect(() => {
    if (!socket || !eventKey) return undefined;
    const names = eventKey.split('|');
    names.forEach((e) => socket.on(e, scheduleReload));
    return () => names.forEach((e) => socket.off(e, scheduleReload));
  }, [socket, eventKey, scheduleReload]);

  return { data, error, loading, reload, setData };
}

const RELOAD_DELAY_MS = 150;
const RELOAD_JITTER_MS = 350;

// For pages that keep their own list state: the same coalesced reload for a
// set of socket events, plus a reload after a reconnect.
export function useLiveReload(reload, events = []) {
  const { socket } = useSocket();
  const ref = useRef(reload);
  ref.current = reload;
  const timer = useRef(null);
  useReconnect(() => ref.current());
  useEffect(() => () => clearTimeout(timer.current), []);
  const eventKey = events.join('|');
  useEffect(() => {
    if (!socket || !eventKey) return undefined;
    const fn = () => { clearTimeout(timer.current); timer.current = setTimeout(() => ref.current(), RELOAD_DELAY_MS + Math.random() * RELOAD_JITTER_MS); };
    const names = eventKey.split('|');
    names.forEach((e) => socket.on(e, fn));
    return () => names.forEach((e) => socket.off(e, fn));
  }, [socket, eventKey]);
}
