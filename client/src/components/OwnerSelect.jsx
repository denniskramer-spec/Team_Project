import { useAuth } from '../auth/AuthContext.jsx';
import { useOptions } from '../options.js';
import { ownsRecords } from '../roles.js';

// "Belongs to" for a record (a resident, a chat account). Members and bosses
// own what they record and only see the field when they may pick someone
// else; the leader and admins have to choose. `path` lists who may be chosen.
export default function OwnerSelect({ path, value, onChange }) {
  const { user } = useAuth();
  const canOwn = ownsRecords(user);
  const { list: members, error, loading } = useOptions(path, 'members');
  if (canOwn && members.length <= 1 && !error) return null;

  return (
    <label>
      Belongs to
      <select value={value} onChange={onChange} required={!canOwn}>
        <option value="">{canOwn ? 'Me' : loading ? 'Loading members...' : 'Choose a member'}</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>)}
      </select>
      {error && <span className="form-help alert-text">Could not load the members: {error}</span>}
    </label>
  );
}
