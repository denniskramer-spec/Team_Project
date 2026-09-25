import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { ROLE_LABELS } from '../components/RoleBadge.jsx';
import { playAlert } from './sound.js';

const REPEAT_MS = 5000;
const MAX_REPEATS = 6;

// Blocking alarm for urgent instructions: stays on screen and repeats the
// alarm sound until the recipient acknowledges it.
export default function UrgentAlarm({ alert, remaining, soundOn, onAck, onView }) {
  useEffect(() => {
    if (!soundOn) return undefined;
    let count = 0;
    const id = setInterval(() => {
      count += 1;
      if (count >= MAX_REPEATS) clearInterval(id);
      playAlert('urgent');
    }, REPEAT_MS);
    return () => clearInterval(id);
  }, [alert.id, soundOn]);

  return createPortal(
    <div className="modal-backdrop urgent-backdrop">
      <div className="modal urgent-alarm" role="alertdialog" aria-modal="true" aria-labelledby="urgent-title">
        <div className="urgent-head">
          <span className="urgent-icon"><Icon name="bell" size={22} /></span>
          <div>
            <div id="urgent-title" className="urgent-label">Urgent instruction</div>
            <div className="muted small">
              {alert.target === 'member' ? 'To you' : alert.groupName ? `To ${alert.groupName}` : 'To everyone'}
            </div>
          </div>
        </div>
        <div className="modal-body">
          <div className="cell-user">
            <Avatar name={alert.author.name} role={alert.author.role} size={40} />
            <div>
              <div className="strong">{alert.author.name}</div>
              <div className="muted small">{ROLE_LABELS[alert.author.role]}</div>
            </div>
          </div>
          {alert.title && <h3 className="urgent-subject">{alert.title}</h3>}
          <p className="urgent-text">{alert.preview}{alert.preview.length >= 200 ? '…' : ''}</p>
        </div>
        <div className="modal-foot">
          {remaining > 0 && <span className="muted small urgent-more">{remaining} more urgent</span>}
          <button className="btn" onClick={onView}>Open instruction</button>
          <button className="btn danger" onClick={onAck} autoFocus><Icon name="check" size={16} /> Got it</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
