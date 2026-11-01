import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthFooter } from '../layout/Footer.jsx';
import { useToast } from '../components/Toast.jsx';
import PasswordRules, { passwordValid } from '../components/PasswordRules.jsx';

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  // The page the user came from (footer, user menu, Account page): Cancel
  // and a successful change both go back there.
  const back = useLocation().state?.back || '/';
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
      toast('Password changed');
      navigate(back, { replace: true });
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
          <input type="password" autoComplete="new-password" value={form.next} onChange={set('next')} minLength={8} maxLength={128} required />
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
            : <Link to={back} replace>Cancel</Link>}
        </p>
        <p className="muted small">Other devices will be logged out.</p>
      </form>
      <AuthFooter />
    </div>
  );
}
