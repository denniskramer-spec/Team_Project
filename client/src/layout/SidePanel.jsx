import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocket, useSocketEvent } from '../socket/SocketContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { ROLE_LABELS } from '../components/RoleBadge.jsx';
import { formatAmount, formatBirthday, formatClock, timeAgo } from '../format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import AlertsPanel from '../alerts/AlertsPanel.jsx';
import { useAlerts } from '../alerts/AlertsContext.jsx';
import { useOpenDm } from '../channels/chat/useOpenDm.js';
import { useLiveData } from '../useLiveData.js';
import { ROLE_ORDER } from '../roles.js';
import { EVENTS, WRITE_REPORT_PATH } from '../constants.js';
import { STATE_PILL as STATE, useTodayPlan } from '../channels/report/reportState.js';
import { useReportStatus } from '../channels/report/ReportStatus.jsx';

// One member at a glance: who they are, when they were around, and (for
// the people this role may follow) today's report and projects.
function PeekCard({ id, onMessage, onClose }) {
  const { user } = useAuth();
  const [peek, setPeek] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/users/${id}/peek`).then((d) => setPeek(d.member)).catch((err) => setError(err.message));
  }, [id]);
  if (error) return <div className="peek"><div className="alert error">{error}</div></div>;
  if (!peek) return <div className="peek muted small">Loading...</div>;
  const t = peek.today;
  const me = String(peek.id) === String(user.id);
  return (
    <div className="peek">
      <dl className="peek-facts">
        <div><dt>ID</dt><dd><code>{peek.memberId}</code></dd></div>
        <div><dt>Role</dt><dd>{ROLE_LABELS[peek.role]}{peek.group ? ` · ${peek.group.name}` : ''}</dd></div>
        {peek.birthday && <div><dt>Birthday</dt><dd>{formatBirthday(peek.birthday)}{peek.birthdayInDays === 0 ? ' · today!' : peek.birthdayInDays <= 14 ? ` · in ${peek.birthdayInDays} days` : ''}</dd></div>}
        {peek.lastSeenAt && <div><dt>Last seen</dt><dd>{timeAgo(peek.lastSeenAt)}</dd></div>}
      </dl>
      {t && (
        <div className="peek-today">
          <div className="peek-row">
            <span className="muted small">Today's report</span>
            <span className={`status-pill ${STATE[t.state][0]}`}>{STATE[t.state][1]}{t.state === 'sent' ? ` ${formatClock(t.sentAt)}` : ''}</span>
          </div>
          {t.state !== 'missing' && (
            <div className="muted small">Plan {t.planDone}/{t.planTotal} · applied {formatAmount(t.applied)} · {t.calls} calls · {formatAmount(t.hours)} h</div>
          )}
          {peek.projects.length > 0 && (
            <ul className="peek-projects">
              {peek.projects.map((p) => (
                <li key={p.id}><span className={`rm-dot${p.written ? ' on' : ''}`} /><span className="peek-project-name">{p.name}</span><span className="muted small">{p.written ? (p.hours ? `${p.hours} h` : p.count ? `${p.count} tasks` : 'written') : 'not written'}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="peek-actions">
        {!me && <button className="btn primary small-btn" onClick={onMessage}><Icon name="message" size={14} /> Message</button>}
        <button className="btn small-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function MemberRow({ member, online, open, onPick }) {
  return (
    <li>
      <button type="button" className={`member-row${online ? '' : ' offline'}${open ? ' open' : ''}`} onClick={onPick} aria-expanded={open}>
        <Avatar name={member.name} role={member.role} online={online} size={24} />
        <div className="member-text">
          <span className={`member-name role-text-${member.role}`}>{member.name}</span>
          <span className="muted small">{online ? (member.group?.name ?? ROLE_LABELS[member.role]) : member.lastSeenAt ? `seen ${timeAgo(member.lastSeenAt)}` : (member.group?.name ?? ROLE_LABELS[member.role])}</span>
        </div>
      </button>
    </li>
  );
}

// The writer's own day, pinned at the top of the panel.
const NO_PLAN = [];
function MyDay() {
  const { data } = useReportStatus();
  const [plan, toggle] = useTodayPlan(data?.todayPlan ?? NO_PLAN, data?.period);
  if (!data?.canWrite) return null;
  const state = data.sentAt ? 'sent' : data.draft ? 'draft' : 'missing';
  return (
    <section className="panel-block">
      <div className="panel-section-head">
        <h4>My day</h4>
        <span className={`status-pill ${STATE[state][0]}`}>{STATE[state][1]}</span>
      </div>
      {plan.length > 0 && (
        <ul className="rm-checklist panel-plan">
          {plan.map((p, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={i}><label className="check"><input type="checkbox" checked={p.done} onChange={() => toggle(i)} /><span className={p.done ? 'is-done' : ''}>{p.text}</span></label></li>
          ))}
        </ul>
      )}
      <Link className={`btn small-btn${state === 'sent' ? '' : ' primary'}`} to={WRITE_REPORT_PATH}>
        <Icon name="file" size={14} /> {state === 'sent' ? 'Open report' : state === 'draft' ? 'Finish report' : 'Write daily report'}
      </Link>
    </section>
  );
}

// For managers: who still owes today's report, with a one-click reminder.
function TeamToday({ onMessage }) {
  const { data, error } = useLiveData('/reports/today', [EVENTS.REPORT_CHANGED]);
  const toast = useToast();
  const [nudged, setNudged] = useState(new Set());
  const rows = data?.rows ?? [];
  if (error) return <div className="alert error small">{error}</div>;
  if (!rows.length) return null;
  const owing = rows.filter((r) => r.state !== 'sent');
  const nudge = async (r) => {
    try {
      await api(`/users/${r.id}/nudge`, { method: 'POST' });
      setNudged((s) => new Set(s).add(String(r.id)));
      toast(`Reminder sent to ${r.name}`);
    } catch (err) { toast.error(err.message); }
  };
  return (
    <section className="panel-block">
      <div className="panel-section-head">
        <h4>Today's reports</h4>
        <span className="muted small">{rows.length - owing.length} of {rows.length} sent</span>
      </div>
      {!owing.length && <p className="muted small">Everyone has sent today's report.</p>}
      <ul className="today-list">
        {owing.map((r) => (
          <li key={r.id}>
            <Avatar name={r.name} role={r.role} size={20} />
            <span className="today-name">{r.name}</span>
            <span className={`status-pill ${STATE[r.state][0]}`}>{STATE[r.state][1]}</span>
            <button className="icon-btn" title={nudged.has(String(r.id)) ? 'Reminder sent' : 'Send a reminder'} aria-label={`Remind ${r.name}`} onClick={() => (nudged.has(String(r.id)) ? onMessage(r) : nudge(r))}>
              <Icon name={nudged.has(String(r.id)) ? 'tick' : 'bell'} size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Birthdays and project expiries in the next two weeks.
function Upcoming() {
  const { data } = useLiveData('/users/upcoming', [EVENTS.DIRECTORY_CHANGED, EVENTS.TASK_CHANGED]);
  const items = [
    ...(data?.birthdays ?? []).map((b) => ({ key: `b-${b.id}`, icon: 'cake', text: `${b.name}'s birthday`, when: b.inDays })),
    ...(data?.expiries ?? []).map((e) => ({ key: `e-${e.id}`, icon: 'briefcase', text: `${e.name}${e.owner ? ` · ${e.owner}` : ''} expires`, when: e.inDays })),
  ].sort((a, b) => a.when - b.when);
  if (!items.length) return null;
  const when = (d) => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
  return (
    <section className="panel-block">
      <div className="panel-section-head"><h4>Coming up</h4></div>
      <ul className="upcoming-list">
        {items.map((i) => <li key={i.key}><Icon name={i.icon} size={14} className="muted" /><span className="today-name">{i.text}</span><span className="muted small">{when(i.when)}</span></li>)}
      </ul>
    </section>
  );
}

function Members({ onMessage }) {
  const { online } = useSocket();
  const [peek, setPeek] = useState(null);

  const { data, error } = useLiveData('/users/directory', [EVENTS.DIRECTORY_CHANGED]);
  // Someone's last tab closed: only their "seen" time changes, so it is set
  // here instead of every client reloading the whole directory.
  const [seen, setSeen] = useState({});
  useSocketEvent(EVENTS.PRESENCE_OFFLINE, (id) => setSeen((s) => ({ ...s, [String(id)]: new Date().toISOString() })));
  const members = useMemo(
    () => (data?.users ?? []).map((m) => (seen[String(m.id)] ? { ...m, lastSeenAt: seen[String(m.id)] } : m)),
    [data, seen],
  );

  // Online members grouped by role (like Discord), then everyone offline.
  const sections = useMemo(() => {
    const on = members.filter((m) => online.has(m.id));
    const off = members.filter((m) => !online.has(m.id));
    return [
      ...ROLE_ORDER.map((role) => ({
        key: role,
        label: `${ROLE_LABELS[role]} — ${on.filter((m) => m.role === role).length}`,
        items: on.filter((m) => m.role === role),
        online: true,
      })).filter((s) => s.items.length),
      { key: 'offline', label: `Offline — ${off.length}`, items: off, online: false },
    ].filter((s) => s.items.length);
  }, [members, online]);

  if (error) return <div className="alert error">{error}</div>;
  return (
    <>
      <MyDay />
      <TeamToday onMessage={(r) => onMessage({ id: r.id, name: r.name, role: r.role, group: r.group })} />
      <Upcoming />
      {sections.map((s) => (
        <section key={s.key} className="member-section">
          <h4>{s.label}</h4>
          <ul>
            {s.items.map((m) => (
              <li key={m.id} className="member-item">
                <MemberRow member={m} online={s.online} open={peek === m.id} onPick={() => setPeek(peek === m.id ? null : m.id)} />
                {peek === m.id && <PeekCard id={m.id} onClose={() => setPeek(null)} onMessage={() => onMessage({ id: m.id, name: m.name, role: m.role, group: m.group?.name ?? null })} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// Section 4: hidden by default, slides in from the right when the arrow is clicked.
export default function SidePanel({ open, onToggle, tab, setTab }) {
  const { total } = useAlerts();
  // "Message" opens the conversation under Chat -> Direct messages.
  const message = useOpenDm();

  return (
    <>
      <aside className={`side-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="panel-tabs">
          <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Members</button>
          <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>
            Alerts{total > 0 && <span className="badge tab-badge">{total}</span>}
          </button>
          <button className="icon-btn panel-close" onClick={onToggle} aria-label="Close panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="panel-body">
          {/* Nothing loads or live-reloads for a panel nobody has opened. */}
          {open && tab === 'members' && <Members onMessage={message} />}
          {tab === 'alerts' && <AlertsPanel />}
        </div>
      </aside>
    </>
  );
}
