import { useState } from 'react';
import { api } from '../../api.js';
import { useDebounced, useLiveData } from '../../useLiveData.js';
import { useToast } from '../../components/Toast.jsx';
import { formatDay, formatAmount } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import StatusPicker, { STATUSES, StatusPill } from '../plan/StatusPicker.jsx';
import TaskForm from './TaskForm.jsx';

const dayCount = (task) => Math.round((new Date(task.endDate) - new Date(task.startDate)) / 86400000) + 1;

function TaskCard({ task, onChanged, onEdit, onDelete }) {
  const toast = useToast();
  const setStatus = async (status) => {
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status } });
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <li className={`card task-card ${task.status}`}>
      <div className="task-head">
        <div>
          <h3 className="task-name">{task.name}</h3>
          <div className="muted small">
            {formatDay(task.startDate)} → {formatDay(task.endDate)} · {dayCount(task)} {dayCount(task) === 1 ? 'day' : 'days'}
          </div>
        </div>
        <div className="task-salary">
          <span className="muted small">Salary</span>
          <strong>{formatAmount(task.salary)}</strong>
        </div>
        {task.canEdit && (
          <Dropdown
            label={`Actions for ${task.name}`}
            items={[
              { label: 'Edit task', icon: 'edit', onClick: onEdit },
              { label: 'Delete task', icon: 'trash', danger: true, onClick: onDelete },
            ]}
          />
        )}
      </div>
      <div className="task-foot">
        <div className="cell-user">
          <Avatar name={task.owner?.name ?? '?'} role={task.owner?.role ?? 'member'} size={28} />
          <div>
            <div className="small strong">{task.owner?.name}</div>
            <div className="muted small">{task.group?.name ?? '—'}</div>
          </div>
        </div>
        {task.canEdit
          ? <StatusPicker value={task.status} onChange={setStatus} size="small" />
          : <StatusPill status={task.status} />}
      </div>
      {task.note && <p className="task-note muted">{task.note}</p>}
    </li>
  );
}

// Section 3 for the Task channel. The title is either "All tasks" or one task.
export default function TaskChannel({ title }) {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const q = useDebounced(query);

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q.trim()) params.set('q', q.trim());
  const { data, error, reload } = useLiveData(`/tasks?${params}`, ['task:changed']);

  const all = data?.tasks ?? [];
  const tasks = title.key === 'all' ? all : all.filter((t) => String(t.id) === title.key);
  const single = title.key !== 'all';

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/tasks/${confirm.id}`, { method: 'DELETE' });
      toast('Task deleted');
      setConfirm(null);
      reload();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="page task-page">
      <div className="toolbar">
        {!single && (
          <>
            <div className="search">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Search task name" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search tasks" />
            </div>
            <label className="check inline-select">
              Progress
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </>
        )}
        <span className="muted small toolbar-count">
          {data?.scope === 'self' ? 'Your tasks' : data?.scope === 'group' ? 'Your group' : 'All tasks'}
        </span>
        <button className="btn primary" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> Sign up task
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {!single && data && (
        <div className="stat-row">
          <div className="stat role-border-member">
            <span className="stat-value">{data.totals.count}</span>
            <span className="muted small">{data.totals.count === 1 ? 'Task' : 'Tasks'}</span>
          </div>
          <div className="stat stat-good">
            <span className="stat-value">{data.totals.done}</span>
            <span className="muted small">Done</span>
          </div>
          <div className="stat role-border-leader">
            <span className="stat-value">{formatAmount(data.totals.salary)}</span>
            <span className="muted small">Total salary</span>
          </div>
        </div>
      )}

      {!tasks.length && !error && (
        <div className="empty-inline muted">
          <Icon name="check" size={20} />
          {single ? 'This task is no longer available.' : 'No tasks yet. Sign one up to get started.'}
        </div>
      )}

      <ul className="card-list">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onChanged={reload}
            onEdit={() => setForm(task)}
            onDelete={() => setConfirm(task)}
          />
        ))}
      </ul>

      {form && (
        <TaskForm
          task={form.id ? form : null}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`Delete "${confirm.name}"?`}
          message="The task and its details are removed. Income already recorded is kept."
          confirmLabel="Delete task"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
