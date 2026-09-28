import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// "⋯" button with a small action menu. items: [{ label, icon, onClick, danger, hidden }]
export default function Dropdown({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const button = useRef(null);
  const visible = items.filter((i) => !i.hidden);

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

  if (!visible.length) return null;

  return (
    <div className="dropdown" ref={ref}>
      <button ref={button} className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={label} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="menu dropdown-menu" role="menu">
          {visible.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => { setOpen(false); button.current?.focus(); item.onClick(); }}
            >
              {item.icon && <Icon name={item.icon} size={16} />} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
