import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_PX = 120;

// Keeps the newest message in view unless the reader has scrolled up, and
// counts the messages that arrive below them meanwhile. `stick` is a ref the
// screen may set (true after sending, false while older messages load).
export function useStickyScroll(messages) {
  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const stick = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(0);

  const toBottom = (behavior) => bottomRef.current?.scrollIntoView({ behavior, block: 'end' });

  useLayoutEffect(() => {
    if (stick.current) toBottom();
  }, [messages]);

  // Pictures finish loading after the scroll and push the list down: stay
  // at the bottom. `load` does not bubble, so it is caught on the way down.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    const grew = () => { if (stick.current) toBottom(); };
    el.addEventListener('load', grew, true);
    return () => el.removeEventListener('load', grew, true);
  }, []);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stick.current = bottom;
    setAtBottom(bottom);
    if (bottom) setNewBelow(0);
  };

  const jumpToBottom = () => {
    stick.current = true;
    setNewBelow(0);
    toBottom('smooth');
  };

  // Older messages are added on top: keep the reader where they were.
  const keepPosition = async (fn) => {
    const el = listRef.current;
    const before = el?.scrollHeight ?? 0;
    stick.current = false;
    await fn();
    requestAnimationFrame(() => { if (el) el.scrollTop += el.scrollHeight - before; });
  };

  return {
    listRef, bottomRef, stick, atBottom, newBelow, onScroll, jumpToBottom, keepPosition,
    bump: () => setNewBelow((n) => n + 1),
    reset: () => setNewBelow(0),
  };
}
