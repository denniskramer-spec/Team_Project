import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Icon from './Icon.jsx';

const ToastContext = createContext(() => {});
let nextId = 1;

// Short-lived notifications in the bottom-right corner.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const toast = useCallback((message, { type = 'success', duration = 4000 } = {}) => {
    const id = nextId++;
    setToasts((list) => [...list.slice(-3), { id, message, type }]);
    if (duration) setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const api = useMemo(() => Object.assign(toast, {
    error: (msg) => toast(msg, { type: 'error', duration: 6000 }),
  }), [toast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts">
        {/* Errors interrupt screen readers; confirmations wait their turn. */}
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
