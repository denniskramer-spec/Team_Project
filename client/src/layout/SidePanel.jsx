import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useSocket, useSocketEvent, useReconnect } from '../socket/SocketContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { ROLE_LABELS } from '../components/RoleBadge.jsx';
import { formatAmount, formatBirthday, timeAgo } from '../format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import AlertsPanel from '../alerts/AlertsPanel.jsx';
import { useAlerts } from '../alerts/AlertsContext.jsx';
import DmThread from './DmThread.jsx';

const ROLE_ORDER = ['admin', 'leader', 'boss', 'member'];
const clock = (v) => new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const STATE = { sent: ['active', 'Sent'], draft: ['pending', 'Draft'], missing: ['disabled', 'Missing'] };

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
            <span className={`status-pill ${STATE[t.state][0]}`}>{STATE[t.state][1]}{t.state === 'sent' ? ` ${clock(t.sentAt)}` : ''}</span>
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
function MyDay() {
  const { data, reload } = useSocketData('/reports/status', ['report:changed']);
  const { data: me } = useSocketData('/reports?type=daily&group=all', ['report:changed']);
  const toast = useToast();
  if (!data?.canWrite) return null;
  const plan = me?.mine?.todayPlan?.length ? me.mine.todayPlan : (me?.previousPlan?.items ?? []).map((text) => ({ text, done: false }));
  const toggle = async (i) => {
    try {
      const todayPlan = plan.map((p, n) => (n === i ? { ...p, done: !p.done } : p));
      await api('/reports', { method: 'PUT', body: { type: 'daily', scope: 'personal', todayPlan } });
      reload();
    } catch (err) { toast.error(err.message); }
  };
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
      <Link className={`btn small-btn${state === 'sent' ? '' : ' primary'}`} to="/report?write=1">
        <Icon name="file" size={14} /> {state === 'sent' ? 'Open report' : state === 'draft' ? 'Finish report' : 'Write daily report'}
      </Link>
    </section>
  );
}

// For managers: who still owes today's report, with a one-click reminder.
function TeamToday({ onMessage }) {
  const { data, reload } = useSocketData('/reports/today', ['report:changed']);
  const toast = useToast();
  const [nudged, setNudged] = useState(new Set());
  const rows = data?.rows ?? [];
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
  const { data } = useSocketData('/users/upcoming', ['directory:changed', 'task:changed']);
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

// Loads a path and reloads it on socket events and reconnects.
function useSocketData(path, events) {
  const [data, setData] = useState(null);
  const reload = useCallback(() => api(path).then(setData).catch(() => {}), [path]);
  useEffect(() => { reload(); }, [reload]);
  useReconnect(reload);
  const key = events.join('|');
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return undefined;
    const names = key.split('|');
    names.forEach((e) => socket.on(e, reload));
    return () => names.forEach((e) => socket.off(e, reload));
  }, [socket, key, reload]);
  return { data, reload };
}

function Members({ onMessage }) {
  const { online } = useSocket();
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [peek, setPeek] = useState(null);

  const loadMembers = () => api('/users/directory')
    .then((d) => { setMembers(d.users); setError(''); })
    .catch((err) => setError(err.message));

  useEffect(() => { loadMembers(); }, []);
  useSocketEvent('directory:changed', loadMembers);
  useSocketEvent('presence:offline', loadMembers);

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

// The Messages tab: direct message conversations, and one open thread.
function Messages({ open, setOpen, dms, reload }) {
  const { online } = useSocket();
  if (open) return <DmThread peer={open} onBack={() => { setOpen(null); reload(); }} />;
  if (!dms.length) return <p className="muted small">No direct messages yet. Pick someone in Members and press Message.</p>;
  return (
    <ul className="dm-conversations">
      {dms.map((d) => (
        <li key={d.titleKey}>
          <button type="button" className={`member-row dm-row${d.unread ? ' has-unread' : ''}`} onClick={() => d.peer && setOpen({ id: d.peer.id, name: d.peer.name, role: d.peer.role, group: d.peer.group })}>
            <Avatar name={d.peer?.name ?? '?'} role={d.peer?.role ?? 'member'} online={d.peer ? online.has(String(d.peer.id)) : undefined} size={24} />
            <div className="member-text">
              <span className={`member-name role-text-${d.peer?.role}`}>{d.peer?.name ?? 'Former member'}<span className="muted small dm-when"> · {timeAgo(d.last.at)}</span></span>
              <span className="muted small dm-preview">{d.last.mine ? 'You: ' : ''}{d.last.content}</span>
            </div>
            {d.unread > 0 && <span className="badge">{d.unread}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Section 4: hidden by default, slides in from the right when the arrow is clicked.
export default function SidePanel({ open, onToggle, tab, setTab }) {
  const { total } = useAlerts();
  const [thread, setThread] = useState(null);
  const { data: dmData, reload: reloadDms } = useSocketData('/chat/dms', ['chat:new']);
  const dms = dmData?.dms ?? [];
  const dmUnread = dmData?.unread ?? 0;

  const message = (peer) => { setThread(peer); setTab('messages'); };

  return (
    <>
      <button
        className={`panel-toggle ${open ? 'open' : ''}`}
        onClick={onToggle}
        aria-label={open ? 'Hide side panel' : 'Show side panel'}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevronRight' : 'chevronLeft'} size={18} />
        {!open && dmUnread > 0 && <span className="badge toggle-badge">{dmUnread}</span>}
      </button>
      <aside className={`side-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="panel-tabs">
          <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Members</button>
          <button className={tab === 'messages' ? 'active' : ''} onClick={() => setTab('messages')}>
            Messages{dmUnread > 0 && <span className="badge tab-badge">{dmUnread}</span>}
          </button>
          <button className={tab === 'alerts' ? 'active' : ''} onClick={() => setTab('alerts')}>
            Alerts{total > 0 && <span className="badge tab-badge">{total}</span>}
          </button>
          <button className="icon-btn panel-close" onClick={onToggle} aria-label="Close panel">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className={`panel-body${tab === 'messages' && thread ? ' panel-body-thread' : ''}`}>
          {tab === 'members' && <Members onMessage={message} />}
          {tab === 'messages' && <Messages open={thread} setOpen={setThread} dms={dms} reload={reloadDms} />}
          {tab === 'alerts' && <AlertsPanel />}
        </div>
      </aside>
    </>
  );
}
