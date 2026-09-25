import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// "⋯" button with a small action menu. items: [{ label, icon, onClick, danger, hidden }]
export default function Dropdown({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const visible = items.filter((i) => !i.hidden);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <div className="dropdown" ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={label} aria-expanded={open}>
        <Icon name="more" size={18} />
      </button>
      {open && (
        <div className="menu dropdown-menu" role="menu">
          {visible.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              className={`menu-item ${item.danger ? 'danger' : ''}`}
              onClick={() => { setOpen(false); item.onClick(); }}
            >
              {item.icon && <Icon name={item.icon} size={16} />} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
