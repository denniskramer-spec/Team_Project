import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useDebounced, useLiveData } from '../../useLiveData.js';
import { formatDay, formatAmount } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import Icon from '../../components/Icon.jsx';
import TaskForm from './TaskForm.jsx';
import { StatusPill } from './ProjectStatus.jsx';

// Whole days since a date, as "today", "1 day ago", "11 days ago".
function daysAgo(value) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return 'today';
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

const short = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
// A report's day (2026-10-23) as "Fri Oct 23".
const dayLabel = (period) => new Date(`${period}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// One project in the list on the left.
function ProjectItem({ project, selected, showOwner, onPick }) {
  const needsWork = project.status === 'active' && !project.writtenToday;
  return (
    <li>
      <button type="button" className={`project-item${selected ? ' on' : ''}`} onClick={onPick} aria-current={selected ? 'true' : undefined}>
        <span className="project-item-head">
          <span className="strong project-item-title">{project.name}</span>
          <span className="project-price">{project.priceLabel}</span>
        </span>
        <span className="muted small">
          {[project.source, project.resident?.name, showOwner ? project.owner?.name : null].filter(Boolean).join(' · ') || '—'}
        </span>
        <span className="muted small">Started {short(project.startDate)}{project.earned > 0 && <> · <span className="earned">earned {formatAmount(project.earned)}</span></>}</span>
        <span className="project-item-foot">
          {needsWork && <span className="tag warn-tag">Not written today</span>}
          {project.status !== 'active' && <StatusPill status={project.status} />}
          <span className="muted small">{project.endDate ? `Expires ${short(project.endDate)}` : 'Open-ended'}</span>
        </span>
      </button>
    </li>
  );
}

// The day-by-day work on the selected project, from the owner's daily reports.
function WorkLog({ projectId, version }) {
  const [log, setLog] = useState(null);
  const [earned, setEarned] = useState(0);
  useEffect(() => {
    let live = true;
    setLog(null);
    api(`/tasks/${projectId}/log`).then((d) => { if (live) { setLog(d.log); setEarned(d.earned ?? 0); } }).catch(() => { if (live) setLog([]); });
    return () => { live = false; };
  }, [projectId, version]);

  return (
    <section className="card work-log">
      <div className="report-section-head">
        <h3>Work log</h3>
        <span className="muted small">{log ? `${log.length} ${log.length === 1 ? 'day' : 'days'}${earned > 0 ? ` · earned ${formatAmount(earned)}` : ''}` : 'Loading...'}</span>
      </div>
      {log?.length === 0 && <p className="muted small">No work written yet. It comes from the daily report.</p>}
      {log?.length > 0 && (
        <table className="table work-table">
          <tbody>
            {log.map((entry) => (
              <tr key={entry.period}>
                <th scope="row">{dayLabel(entry.period)}{(entry.hours || entry.count) ? <span className="muted small work-hours">{entry.hours ? `${entry.hours} h` : `${entry.count} tasks`}{entry.amount ? ` · ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(entry.amount)}` : ''}</span> : null}</th>
                <td>
                  <ul className="work-lines">
                    {entry.lines.map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Detail({ project, isOwner, showOwner, onEdit, version }) {
  const needsWork = isOwner && project.status === 'active' && !project.writtenToday;
  return (
    <div className="project-detail">
      <section className="card">
        <div className="project-head">
          <div>
            <h2 className="project-title">{project.name} <StatusPill status={project.status} /></h2>
            {showOwner && (
              <div className="cell-user project-owner">
                <Avatar name={project.owner?.name ?? '?'} role={project.owner?.role ?? 'member'} size={18} />
                <span className="small">{project.owner?.name}{project.group ? ` · ${project.group.name}` : ''}</span>
              </div>
            )}
            {project.note && <p className="muted project-note">{project.note}</p>}
          </div>
          {project.canEdit && (
            <button className="btn small-btn" onClick={onEdit}><Icon name="edit" size={14} /> Edit</button>
          )}
        </div>
        <dl className="fact-grid">
          <div><dt>Source</dt><dd>{project.source || '—'}</dd></div>
          <div>
            <dt>Profile / Resident</dt>
            <dd>
              {project.resident
                ? <span className="cell-user"><Avatar name={project.resident.name} role="member" size={18} src={project.resident.photo?.url} />{project.resident.name}</span>
                : '—'}
            </dd>
          </div>
          <div><dt>Price</dt><dd>{project.priceLabel}{project.methodLabel && <span className="muted small">via {project.methodLabel}</span>}</dd></div>
          <div><dt>Started</dt><dd>{short(project.startDate)}<span className="muted small">{daysAgo(project.startDate)}</span></dd></div>
          <div>
            <dt>Expires</dt>
            <dd>
              {project.endDate ? formatDay(project.endDate) : 'Open-ended'}
              {project.endDate && <span className="muted small">{new Date(project.endDate) < new Date() ? 'Expired' : `Expires ${formatDay(project.endDate)}`}</span>}
            </dd>
          </div>
          <div><dt>Days worked</dt><dd>{project.daysWorked} {project.daysWorked === 1 ? 'day' : 'days'}{project.hours > 0 && <span className="muted small">{formatAmount(project.hours)} h</span>}</dd></div>
          <div><dt>Earned so far</dt><dd className="earned">{formatAmount(project.earned)}<span className="muted small">from the hours and tasks reported</span></dd></div>
        </dl>
      </section>

      {needsWork && (
        <div className="note project-cta">
          <Icon name="file" size={18} />
          <div>
            <strong>Write today's work in your daily report</strong>
            <div className="muted small">The daily report has a box for each active project — what you write there shows up here.</div>
          </div>
          <Link className="btn primary" to="/report/me"><Icon name="file" size={14} /> Write daily report</Link>
        </div>
      )}

      <WorkLog projectId={project.id} version={version} />
    </div>
  );
}

// Section 3 for the Projects channel: the list on the left, one project's
// details and work log on the right. The title is "All projects" or one project.
export default function TaskChannel({ title }) {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [picked, setPicked] = useState(title.key === 'all' ? '' : title.key);
  const q = useDebounced(query);

  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  const { data, error, reload } = useLiveData(`/tasks?${params}`, ['task:changed']);

  const projects = data?.tasks ?? [];
  const selected = projects.find((p) => String(p.id) === picked) ?? projects[0] ?? null;
  const showOwner = data?.scope !== 'self';
  const totals = data?.totals;

  return (
    <div className="page project-page">
      <div className="toolbar">
        <div className="page-title">
          <h2>Projects</h2>
          {totals && (
            <span className="muted small">
              {totals.active} active
              {totals.withoutToday > 0 && (
                <> · <span className="warn-text">{totals.withoutToday} without today's work</span> — {data.scope === 'self' ? 'write it in your daily report' : 'written in the daily report'}</>
              )}
            </span>
          )}
        </div>
        <button className="btn primary toolbar-right" onClick={() => setForm({})}>
          <Icon name="plus" size={16} /> New project
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {data && !projects.length && !q && (
        <div className="empty-inline muted">
          <Icon name="briefcase" size={20} />
          No projects yet. Register one to get started.
        </div>
      )}

      {data && (projects.length > 0 || q) && (
        <div className="project-layout">
          <aside className="project-list">
            <div className="search">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Search projects" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search projects" />
            </div>
            {!projects.length && <p className="muted small">No projects match "{q}".</p>}
            <ul>
              {projects.map((p) => (
                <ProjectItem
                  key={p.id}
                  project={p}
                  selected={selected?.id === p.id}
                  showOwner={showOwner}
                  onPick={() => setPicked(String(p.id))}
                />
              ))}
            </ul>
          </aside>
          {selected && (
            <Detail
              project={selected}
              isOwner={String(selected.owner?.id) === String(user.id)}
              showOwner={showOwner}
              onEdit={() => setForm(selected)}
              version={`${selected.daysWorked}-${selected.writtenToday}-${data.tasks.length}`}
            />
          )}
        </div>
      )}

      {form && (
        <TaskForm
          task={form.id ? form : null}
          options={data?.options}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload(); }}
        />
      )}
    </div>
  );
}
