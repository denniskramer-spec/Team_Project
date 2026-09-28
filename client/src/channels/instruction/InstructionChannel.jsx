import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useAlerts } from '../../alerts/AlertsContext.jsx';
import { useReconnect, useSocketEvent } from '../../socket/SocketContext.jsx';
import Icon from '../../components/Icon.jsx';
import Composer from './Composer.jsx';
import InstructionCard from './InstructionCard.jsx';

// Who may send on this title: the leader to everyone or any group,
// a boss only on their own group's title.
function sendTarget(user, title, member) {
  // A member picked in the tree: the instruction goes to that person.
  if (member) {
    const ownGroup = member.group?.id ? String(member.group.id) === String(user.group?.id) : false;
    if (user.role === 'leader' || (user.role === 'boss' && ownGroup)) {
      return { target: 'member', recipient: member.id, label: member.name };
    }
    return null;
  }
  if (user.role === 'leader') {
    return title.key === 'all' ? { target: 'all', label: 'everyone' } : { target: 'group', groupId: title.groupId, label: title.name };
  }
  if (user.role === 'boss' && title.groupId && String(title.groupId) === String(user.group?.id)) {
    return { target: 'group', groupId: title.groupId, label: title.name };
  }
  return null;
}

export default function InstructionChannel({ title }) {
  const { user } = useAuth();
  const { markAllRead } = useAlerts();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const memberId = searchParams.get('m') || '';
  const [member, setMember] = useState(null);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const cardRefs = useRef(new Map());
  const olderLoaded = useRef(false);
  // Which list is showing. Picking another member in the tree keeps this
  // component mounted, so responses for the previous one must be dropped.
  const scope = `${title.key}|${memberId}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const send = sendTarget(user, title, member);

  // Who is selected in the tree, for the composer label and the header.
  useEffect(() => {
    if (!memberId) { setMember(null); return; }
    api('/users/directory')
      .then((d) => setMember(d.users.find((u) => String(u.id) === memberId) ?? null))
      .catch(() => setMember(null));
  }, [memberId]);

  // A new list starts empty rather than showing the previous member's items.
  useEffect(() => {
    olderLoaded.current = false;
    setItems([]);
    setHasMore(false);
    setLoading(true);
  }, [scope]);

  // Reload the newest page; keep any older pages already loaded.
  const loadFirst = useCallback(async () => {
    const requested = scopeRef.current;
    try {
      const query = memberId ? `member=${memberId}` : `title=${encodeURIComponent(title.key)}`;
      const d = await api(`/instructions?${query}`);
      if (requested !== scopeRef.current) return;
      setItems((prev) => {
        const fresh = new Set(d.instructions.map((i) => i.id));
        const oldest = d.instructions.at(-1)?.createdAt;
        const older = prev.filter((i) => !fresh.has(i.id) && oldest && i.createdAt <= oldest);
        return [...d.instructions, ...older];
      });
      // Older pages stay loaded, so only trust hasMore when none are.
      if (!olderLoaded.current) setHasMore(d.hasMore);
      setError('');
    } catch (err) {
      if (requested === scopeRef.current) setError(err.message);
    } finally {
      if (requested === scopeRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title.key, memberId]);

  useEffect(() => { loadFirst(); }, [loadFirst]);
  useReconnect(loadFirst);

  const loadMore = async () => {
    const oldest = items.at(-1)?.createdAt;
    if (!oldest || loadingMore) return;
    const requested = scopeRef.current;
    setLoadingMore(true);
    try {
      const query = memberId ? `member=${memberId}` : `title=${encodeURIComponent(title.key)}`;
      const d = await api(`/instructions?${query}&before=${encodeURIComponent(oldest)}&beforeId=${items.at(-1).id}`);
      if (requested !== scopeRef.current) return;
      setItems((prev) => [...prev, ...d.instructions.filter((i) => !prev.some((p) => p.id === i.id))]);
      setHasMore(d.hasMore);
      olderLoaded.current = true;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const belongsHere = (e) => (memberId
    ? String(e.recipientId ?? '') === memberId
    : e.titleKey === title.key && (e.target !== 'member' || String(e.recipientId ?? '') === String(user.id)));
  useSocketEvent('instruction:new', (e) => { if (belongsHere(e)) loadFirst(); });
  useSocketEvent('instruction:changed', ({ id }) => { if (items.some((i) => String(i.id) === String(id))) loadFirst(); });
  useSocketEvent('instruction:deleted', ({ id }) => setItems((prev) => prev.filter((i) => String(i.id) !== String(id))));

  // Scroll to and highlight an instruction opened from an alert.
  useEffect(() => {
    if (!focusId || loading) return undefined;
    const el = cardRefs.current.get(focusId);
    if (!el) return undefined;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Drop only ?focus, keeping the member or group picked in the tree.
    const id = setTimeout(() => setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('focus');
      return next;
    }, { replace: true }), 2500);
    return () => clearTimeout(id);
  }, [focusId, loading, items, setSearchParams]);

  const unreadHere = items.filter((i) => i.isRecipient && !i.readAt).length;

  return (
    <div className="page instruction-page">
      {send ? (
        <Composer target={send.target} groupId={send.groupId} recipient={send.recipient} audienceLabel={send.label} onSent={loadFirst} />
      ) : user.role === 'boss' && title.key === 'all' && user.group ? (
        <div className="note">
          <Icon name="megaphone" size={16} />
          <span>
            Bosses send instructions to their own group.{' '}
            <Link to={`/instruction/${user.group.slug}`}>Go to {user.group.name}</Link>
          </span>
        </div>
      ) : null}

      <div className="toolbar">
        <span className="muted small">
          {memberId
            ? `Instructions for ${member?.name ?? 'this member'}`
            : title.key === 'all' ? 'Instructions for everyone and for you' : `Instructions for ${title.name}`}
        </span>
        {unreadHere > 1 && (
          <button className="btn small-btn toolbar-right" onClick={async () => { await markAllRead(); loadFirst(); }}>
            <Icon name="check" size={14} /> Mark all as read
          </button>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {!loading && !items.length && !error && (
        <div className="empty-inline muted"><Icon name="megaphone" size={20} /> No instructions here yet.</div>
      )}

      <div className="instruction-list">
        {items.map((i) => (
          <InstructionCard
            key={i.id}
            ref={(el) => { if (el) cardRefs.current.set(String(i.id), el); else cardRefs.current.delete(String(i.id)); }}
            instruction={i}
            focused={String(i.id) === focusId}
            onChanged={loadFirst}
          />
        ))}
      </div>
      {hasMore && (
        <button className="btn load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading...' : 'Load older instructions'}
        </button>
      )}
    </div>
  );
}
