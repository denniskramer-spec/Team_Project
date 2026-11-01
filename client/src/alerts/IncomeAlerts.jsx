import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocketEvent } from '../socket/SocketContext.jsx';
import { useAlerts } from './AlertsContext.jsx';
import { EVENTS } from '../constants.js';
import Icon from '../components/Icon.jsx';
import { formatAmount, formatClock } from '../format.js';
import { notify } from './notify.js';
import { playAlert } from './sound.js';

const MAX_POPUPS = 4;

const amountOf = (a) => `${a.currency} ${formatAmount(a.originalAmount ?? a.amount)}`;

// Income a member or a boss just recorded (socket/events.js incomeRecorded):
// for the team leader and the member's boss, top right, until dismissed.
// A member's own income waits for the team leader's approval, so the
// leader's popup says so. Clicking one opens Finance → Income.
export default function IncomeAlerts() {
  const { user } = useAuth();
  const { settings } = useAlerts() ?? {};
  const navigate = useNavigate();
  const [popups, setPopups] = useState([]);
  const dismiss = useCallback((id) => setPopups((list) => list.filter((p) => p.id !== id)), []);
  const open = () => { setPopups([]); navigate('/finance/income'); };

  useSocketEvent(EVENTS.INCOME_RECORDED, (alert) => {
    if (!['leader', 'boss'].includes(user?.role) || !alert?.id) return;
    setPopups((list) => (list.some((p) => p.id === alert.id) ? list : [...list.slice(-(MAX_POPUPS - 1)), alert]));
    if (settings?.sound) playAlert();
    if (settings?.desktop) notify(titleOf(alert, user), { body: textOf(alert), tag: `income-${alert.id}` }, open);
  });

  if (!popups.length) return null;
  return (
    <div className="income-alerts" aria-live="polite">
      {popups.map((p) => (
        <div key={p.id} className={`chat-popup income-alert${p.status === 'pending' ? ' is-pending' : ''}`} role="status">
          <button type="button" className="chat-popup-main" onClick={open} title="Open Finance → Income">
            <span className="income-alert-icon"><Icon name="coins" size={18} /></span>
            <span className="chat-popup-text">
              <span className="chat-popup-head">
                <span className="strong">{titleOf(p, user)}</span>
                <span className="muted small chat-popup-time">{formatClock(p.at)}</span>
              </span>
              <span className="chat-popup-content">{textOf(p)}</span>
            </span>
          </button>
          <button type="button" className="icon-btn chat-popup-close" onClick={() => dismiss(p.id)} aria-label="Dismiss"><Icon name="close" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function titleOf(a, user) {
  if (a.status !== 'pending') return `${a.recorder.name} recorded income`;
  return user?.role === 'leader' ? `${a.recorder.name} recorded income · approve it` : `${a.recorder.name} recorded income · waiting for the team leader`;
}

function textOf(a) {
  const forOther = String(a.member.id) !== String(a.recorder.id);
  return [amountOf(a), a.from, forOther ? `for ${a.member.name}` : ''].filter(Boolean).join(' · ');
}
