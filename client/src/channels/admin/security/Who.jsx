import Avatar from '../../../components/Avatar.jsx';

// The person behind a log entry, or the name that was tried when there is
// no account behind it (a failed login).
export default function Who({ user, username }) {
  if (!user) return <span className="muted">{username ? `@${username}` : 'anonymous'}</span>;
  return (
    <span className="cell-user">
      <Avatar name={user.name} role={user.role} size={22} />
      <span><span className="strong">{user.name}</span> <span className="muted small">@{user.username}</span></span>
    </span>
  );
}
