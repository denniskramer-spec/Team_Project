import Icon from '../../components/Icon.jsx';

export const STATUSES = [
  { key: 'not_done', label: 'Not done', icon: 'dot' },
  { key: 'progress', label: 'In progress', icon: 'target' },
  { key: 'done', label: 'Done', icon: 'check' },
];

export const statusLabel = (key) => STATUSES.find((s) => s.key === key)?.label ?? key;

export function StatusPill({ status }) {
  return <span className={`status-tag ${status}`}>{statusLabel(status)}</span>;
}

// Three-way switch for a plan's result.
export default function StatusPicker({ value, onChange, disabled, size = 'normal' }) {
  return (
    <div className={`segmented status-picker ${size}`} role="radiogroup" aria-label="Plan result">
      {STATUSES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="radio"
          aria-checked={value === s.key}
          disabled={disabled}
          className={`${value === s.key ? 'on' : ''} ${s.key}`}
          onClick={() => onChange(s.key)}
        >
          <Icon name={s.icon} size={14} /> {s.label}
        </button>
      ))}
    </div>
  );
}
