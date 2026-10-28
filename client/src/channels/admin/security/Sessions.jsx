import { useState } from 'react';
import { api } from '../../../api.js';
import { useOptions } from '../../../options.js';
import { useToast } from '../../../components/Toast.jsx';

// Ends every session of one account, on every device.
export default function Sessions() {
  const toast = useToast();
  const { list: users, error, loading } = useOptions('/users/directory', 'users', ['directory:changed']);
  const [user, setUser] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const end = async () => {
    setBusy(true);
    try {
      const r = await api(`/security/users/${user}/sign-out`, { method: 'POST' });
      toast(`${r.user.name} has been signed out everywhere`);
      setConfirm(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const picked = users.find((u) => u.id === user);

  return (
    <section className="card security-card">
      <div className="page-title">
        <h3>Sessions</h3>
        <span className="muted small">If an account may be in the wrong hands, end its sessions: every device is logged out at once and only the password gets back in. Pair it with a password reset from Users &amp; roles.</span>
      </div>
      {error && <div className="alert error">Could not load the accounts: {error}</div>}
      <div className="toolbar sessions-row">
        <select value={user} onChange={(e) => { setUser(e.target.value); setConfirm(false); }} aria-label="Account">
          <option value="">{loading ? 'Loading accounts...' : 'Choose an account'}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} · @{u.username}</option>)}
        </select>
        {!confirm && <button type="button" className="btn" disabled={!user} onClick={() => setConfirm(true)}>Sign out everywhere</button>}
        {confirm && (
          <span className="log-actions">
            <span className="small">Log {picked?.name} out of every device?</span>
            <button type="button" className="btn danger small-btn" onClick={end} disabled={busy}>{busy ? 'Ending…' : 'Yes, end sessions'}</button>
            <button type="button" className="btn small-btn" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
          </span>
        )}
      </div>
    </section>
  );
}
