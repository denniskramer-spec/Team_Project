// The three states of a project, shown as a pill.
export const STATUSES = [
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'done', label: 'Done' },
];

export const statusLabel = (key) => STATUSES.find((s) => s.key === key)?.label ?? key;

export function StatusPill({ status }) {
  return <span className={`status-badge project-${status}`}>{statusLabel(status)}</span>;
}
