import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import Modal from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';
import Icon from '../../components/Icon.jsx';
import DateTag from '../../components/DateTag.jsx';
import ResidentForm, { LAPTOP_SOURCES, ACCESS_TYPES, labelOf, Yes } from './ResidentForm.jsx';
import { countryLabel } from '../../countries.js';

const Empty = () => <span className="muted">—</span>;

// One member's residents in a single dialog: the arrows (or the Left/Right
// keys) step from one to the next. People who may edit the resident get an
// Edit button that opens the usual form on top.
export default function ResidentDetails({ member, residents, initialIndex = 0, onClose, onChanged }) {
  const { user } = useAuth();
  // The shown resident is remembered by id, not by position: the list behind
  // the dialog is live and sorted by name on the server, so a position would
  // drift to someone else after a rename or a deletion elsewhere.
  const [currentId, setCurrentId] = useState(() => residents[initialIndex]?.id);
  const [editing, setEditing] = useState(false);
  const count = residents.length;
  const found = residents.findIndex((r) => String(r.id) === String(currentId));
  const current = found >= 0 ? found : 0;
  const resident = residents[current];
  const step = (by) => setCurrentId(residents[(current + by + count) % count].id);
  const stepRef = useRef(step);
  stepRef.current = step;

  // The resident on screen was deleted elsewhere: the form on top (if any)
  // was about them, so it closes rather than saving into whoever is next.
  useEffect(() => { if (found < 0) setEditing(false); }, [found]);

  useEffect(() => {
    if (editing || count < 2) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') stepRef.current(-1);
      if (e.key === 'ArrowRight') stepRef.current(1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, count]);

  if (!resident) return null;
  const owner = resident.owner ?? member;
  const isMe = owner && String(owner.id) === String(user.id);

  return (
    <>
      <Modal
        title={`${member.name}'s residents`}
        onClose={onClose}
        width={540}
        footer={(
          <>
            {count > 1 && (
              <div className="asset-nav">
                <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous resident" title="Previous (←)"><Icon name="chevronLeft" size={18} /></button>
                <span className="asset-nav-count">{current + 1} / {count}</span>
                <button className="icon-btn" onClick={() => step(1)} aria-label="Next resident" title="Next (→)"><Icon name="chevronRight" size={18} /></button>
              </div>
            )}
            <button className="btn" onClick={onClose}>Close</button>
            {resident.canEdit && (
              <button className="btn primary" onClick={() => setEditing(true)}><Icon name="edit" size={16} /> Edit resident</button>
            )}
          </>
        )}
      >
        <div className="asset-details-head">
          <Avatar name={resident.name} role="member" size={36} src={resident.photo?.url} />
          <div className="asset-details-title">
            <div className="strong">{resident.name}</div>
            <div className="muted small">{count > 1 ? `Resident ${current + 1} of ${count} · ` : ''}{resident.sentence}</div>
          </div>
        </div>
        {count > 1 && (
          <ol className="asset-tabs" aria-label="Residents">
            {residents.map((r, i) => (
              <li key={r.id}>
                <button className={`asset-tab ${i === current ? 'active' : ''}`} onClick={() => setCurrentId(r.id)} aria-current={i === current ? 'true' : undefined}>{r.name}</button>
              </li>
            ))}
          </ol>
        )}
        <dl className="asset-details" key={resident.id}>
          <dt>Name</dt><dd>{resident.name}</dd>
          <dt>Age</dt><dd>{resident.age ?? <Empty />}</dd>
          <dt>Country</dt><dd>{resident.country ? countryLabel(resident.country) : <Empty />}</dd>
          <dt>Citizenship</dt><dd>{resident.citizenship ? countryLabel(resident.citizenship) : <Empty />}</dd>
          <dt>Source</dt><dd>{resident.source || <Empty />}</dd>
          <dt>First contact</dt><dd>{resident.firstContact ? <><DateTag value={resident.firstContact} utc muted={false} />{resident.firstContactVia ? ` via ${resident.firstContactVia}` : ''}</> : <Empty />}</dd>
          <dt>Laptop</dt><dd>{resident.hasLaptop ? <Yes label={labelOf(LAPTOP_SOURCES, resident.laptopSource) || 'Yes'} /> : <Empty />}</dd>
          <dt>Access</dt><dd>{resident.accessSetUp ? <Yes label={resident.accessType ? `Set up · ${labelOf(ACCESS_TYPES, resident.accessType)}` : 'Set up'} /> : <Empty />}</dd>
          <dt>Divide</dt><dd>{resident.sharePercent ? `${resident.sharePercent}%` : <Empty />}</dd>
          <dt>Belongs to</dt>
          <dd>
            {owner ? (
              <div className="cell-user">
                <Avatar name={owner.name} role={owner.role} size={24} />
                <span className={`strong role-text-${owner.role}`}>{owner.name} {isMe && <span className="muted small">(you)</span>}</span>
                <RoleBadge role={owner.role} />
              </div>
            ) : <Empty />}
          </dd>
          <dt>Group</dt><dd>{resident.group?.name ?? member.group?.name ?? <Empty />}</dd>
          <dt>Notes</dt><dd className="asset-details-note">{resident.notes || <Empty />}</dd>
          <dt>Added</dt><dd><DateTag value={resident.createdAt} muted={false} /></dd>
        </dl>
      </Modal>
      {/* Keyed by the resident, so the form can never carry one resident's fields over to another. */}
      {editing && (
        <ResidentForm key={resident.id} resident={resident} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged?.(); }} />
      )}
    </>
  );
}
