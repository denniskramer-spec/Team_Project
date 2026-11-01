import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// "⋯" button with a small action menu. items: [{ label, icon, onClick, danger, hidden }]
// `header(close)` draws extra content above the items (a row of quick
// reactions, say); `up` opens the menu above the button. Setting `openAt` to
// a fresh { x, y } (a right-click, say) opens the menu at that spot instead.
export default function Dropdown({ items, label = 'Actions', header, up = false, className = '', openAt = null }) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState(null); // where a right-click opened it
  const ref = useRef(null);
  const button = useRef(null);
  const menu = useRef(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!openAt) return;
    setPoint(openAt);
    setOpen(true);
  }, [openAt]);
  useEffect(() => { if (!open) setPoint(null); }, [open]);

  // Keep a menu opened at the pointer inside the window.
  useLayoutEffect(() => {
    const node = menu.current;
    if (!point || !node) return;
    const { width, height } = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - width - 8))}px`;
    node.style.top = `${Math.max(8, point.y + height > window.innerHeight - 8 ? point.y - height : point.y)}px`;
  }, [point]);

  // A menu pinned to the pointer would float away from its message on scroll.
  useEffect(() => {
    if (!point) return undefined;
    const shut = (e) => { if (!menu.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('scroll', shut, true);
    window.addEventListener('resize', shut);
    return () => {
      window.removeEventListener('scroll', shut, true);
      window.removeEventListener('resize', shut);
    };
  }, [point]);

  // Keyboard: the menu opens on its first item, the arrow keys (and Home /
  // End) move through it, Escape closes it and returns to the button.
  useEffect(() => {
    if (!open) return undefined;
    const entries = () => [...(ref.current?.querySelectorAll('[role="menuitem"]') ?? [])];
    entries()[0]?.focus();
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const keys = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
        return;
      }
      const list = entries();
      const at = list.indexOf(document.activeElement);
      const to = { ArrowDown: (at + 1) % list.length, ArrowUp: (at - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
      if (to === undefined || !list.length) return;
      e.preventDefault();
      list[to].focus();
    };
    const leave = (e) => { if (!ref.current?.contains(e.relatedTarget)) setOpen(false); };
    const node = ref.current;
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', keys, true);
    node?.addEventListener('focusout', leave);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', keys, true);
      node?.removeEventListener('focusout', leave);
    };
  }, [open]);

  if (!visible.length && !header) return null;
  const close = () => { setOpen(false); button.current?.focus(); };

  return (
    <div className={`dropdown${up ? ' up' : ''}${open ? ' open' : ''} ${className}`.trim()} ref={ref}>
      <button ref={button} className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div
          ref={menu}
          className={`menu dropdown-menu${point ? ' at-point' : ''}`}
          role="menu"
          style={point ? { left: point.x, top: point.y } : undefined}
        >
          {header?.(close)}
          {visible.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => { close(); item.onClick(); }}
            >
              {item.icon && <Icon name={item.icon} size={16} />} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
