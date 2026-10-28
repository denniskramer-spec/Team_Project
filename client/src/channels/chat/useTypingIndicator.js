import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket, useSocketEvent } from '../../socket/SocketContext.jsx';
import { EVENTS, TYPING_THROTTLE_MS } from '../../constants.js';

const TYPING_TIMEOUT_MS = 4000;

// "X is typing" for one chat: who is typing right now, and telling the
// others that we are (throttled, so a fast typist is one event every two
// seconds, not one per key).
export function useTypingIndicator(titleKey, selfId) {
  const { socket } = useSocket();
  const [typing, setTyping] = useState([]);
  const lastSent = useRef(0);

  useSocketEvent(EVENTS.CHAT_TYPING, ({ titleKey: key, user: who }) => {
    if (key !== titleKey || who.id === selfId) return;
    setTyping((prev) => [...prev.filter((u) => u.id !== who.id), { ...who, at: Date.now() }]);
  });

  // Drop indicators that have gone quiet.
  useEffect(() => {
    if (!typing.length) return undefined;
    const id = setInterval(() => {
      setTyping((prev) => prev.filter((u) => Date.now() - u.at < TYPING_TIMEOUT_MS));
    }, 1000);
    return () => clearInterval(id);
  }, [typing.length]);

  // Their message has arrived: they are no longer "typing".
  const stopped = useCallback((userId) => setTyping((prev) => prev.filter((u) => u.id !== userId)), []);

  const noteTyping = useCallback(() => {
    const now = Date.now();
    if (!socket || now - lastSent.current < TYPING_THROTTLE_MS) return;
    lastSent.current = now;
    socket.emit(EVENTS.CHAT_TYPING, { titleKey });
  }, [socket, titleKey]);

  return { typing, noteTyping, stopped };
}
