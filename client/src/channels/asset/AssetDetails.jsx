import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import Modal from '../../components/Modal.jsx';
import Avatar from '../../components/Avatar.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';
import Icon from '../../components/Icon.jsx';
import AssetForm from './AssetForm.jsx';
import DateTag from '../../components/DateTag.jsx';

const Empty = () => <span className="muted">—</span>;

// One member's assets in a single dialog: the arrows (or the Left/Right keys)
// step from one asset to the next. People who may edit the asset get an Edit
// button that opens the usual form on top.
export default function AssetDetails({ member, assets, initialIndex = 0, onClose, onChanged }) {
  const { user } = useAuth();
  const [index, setIndex] = useState(initialIndex);
  const [editing, setEditing] = useState(false);
  const count = assets.length;
  // The list can shrink while the dialog is open (an asset was deleted elsewhere).
  const current = Math.min(index, count - 1);
  const asset = assets[current];
  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const next = () => setIndex((i) => (i + 1) % count);

  useEffect(() => {
    if (editing || count < 2) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, count]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!asset) return null;
  const owner = asset.owner ?? member;
  const isMe = owner && String(owner.id) === String(user.id);

  return (
    <>
      <Modal
        title={`${member.name}'s assets`}
        onClose={onClose}
        width={540}
        footer={(
          <>
            {count > 1 && (
              <div className="asset-nav">
                <button className="icon-btn" onClick={prev} aria-label="Previous asset" title="Previous (←)">
                  <Icon name="chevronLeft" size={18} />
                </button>
                <span className="asset-nav-count">{current + 1} / {count}</span>
                <button className="icon-btn" onClick={next} aria-label="Next asset" title="Next (→)">
                  <Icon name="chevronRight" size={18} />
                </button>
              </div>
            )}
            <button className="btn" onClick={onClose}>Close</button>
            {asset.canEdit && (
              <button className="btn primary" onClick={() => setEditing(true)}>
                <Icon name="edit" size={16} /> Edit asset
              </button>
            )}
          </>
        )}
      >
        <div className="asset-details-head">
          <span className="asset-details-icon"><Icon name="idcard" size={22} /></span>
          <div className="asset-details-title">
            <div className="strong">{asset.name}</div>
            <div className="muted small">
              {count > 1 ? `Asset ${current + 1} of ${count} · ` : ''}{asset.sentence}
            </div>
          </div>
        </div>
        {count > 1 && (
          <ol className="asset-tabs" aria-label="Assets">
            {assets.map((a, i) => (
              <li key={a.id}>
                <button className={`asset-tab ${i === current ? 'active' : ''}`} onClick={() => setIndex(i)} aria-current={i === current ? 'true' : undefined}>
                  {a.name}
                </button>
              </li>
            ))}
          </ol>
        )}
        <dl className="asset-details" key={asset.id}>
          <dt>Name</dt><dd>{asset.name}</dd>
          <dt>Age</dt><dd>{asset.age ?? <Empty />}</dd>
          <dt>Birthday</dt><dd><DateTag value={asset.birthday} utc muted={false}  icon="cake" /></dd>
          <dt>Nationality</dt><dd>{asset.nationality || <Empty />}</dd>
          <dt>Contact info</dt><dd>{asset.contact || <Empty />}</dd>
          <dt>English level</dt>
          <dd><span className={`level level-${asset.englishLevel.toLowerCase()}`}>{asset.englishLevel}</span></dd>
          <dt>Belongs to</dt>
          <dd>
            {owner ? (
              <div className="cell-user">
                <Avatar name={owner.name} role={owner.role} size={26} />
                <span className={`strong role-text-${owner.role}`}>
                  {owner.name} {isMe && <span className="muted small">(you)</span>}
                </span>
                <RoleBadge role={owner.role} />
              </div>
            ) : <Empty />}
          </dd>
          <dt>Group</dt><dd>{asset.group?.name ?? member.group?.name ?? <Empty />}</dd>
          <dt>Note</dt><dd className="asset-details-note">{asset.note || <Empty />}</dd>
          <dt>Added</dt><dd><DateTag value={asset.createdAt} muted={false} /></dd>
        </dl>
      </Modal>
      {editing && (
        <AssetForm
          asset={asset}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); onChanged?.(); }}
        />
      )}
    </>
  );
}
