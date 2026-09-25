import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import PasswordRules, { passwordValid } from '../components/PasswordRules.jsx';

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const forced = user?.mustChangePassword;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!passwordValid(form.next)) return setError('New password does not meet the rules');
    if (form.next !== form.confirm) return setError('New passwords do not match');
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      navigate('/', { replace: true, state: { notice: 'Password changed' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>Change password</h1>
        {forced && (
          <div className="alert warning">You must set a new password before continuing.</div>
        )}
        {error && <div className="alert error">{error}</div>}
        <label>
          Current password
          <input type="password" autoComplete="current-password" autoFocus value={form.current} onChange={set('current')} required />
        </label>
        <label>
          New password
          <input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} required />
        </label>
        <PasswordRules password={form.next} />
        <label>
          Confirm new password
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
        <p className="muted small">
          {forced
            ? <button type="button" className="link" onClick={logout}>Log out</button>
            : <Link to="/">Cancel</Link>}
        </p>
        <p className="muted small">Other devices will be logged out.</p>
      </form>
    </div>
  );
}
