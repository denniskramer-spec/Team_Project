import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { load, save } from '../storage.js';

// "Remember me" keeps only the username in this browser's localStorage so the
// form is pre-filled next time; the password is left to the browser's password
// manager. Unticking it forgets the username.
const REMEMBER_KEY = 'bm.login';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const remembered = load(REMEMBER_KEY, null);
  // Older versions also stored the password: drop it from storage.
  if (remembered?.password !== undefined) save(REMEMBER_KEY, { username: remembered.username });
  const [form, setForm] = useState({ username: remembered?.username ?? '', password: '' });
  const [remember, setRemember] = useState(Boolean(remembered));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(form.username, form.password);
      if (remember) save(REMEMBER_KEY, { username: form.username });
      else save(REMEMBER_KEY, null);
      const dest = u.mustChangePassword ? '/change-password' : location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>Welcome back</h1>
        <p className="muted">Log in to Business Manager</p>
        {location.state?.notice && <div className="alert success">{location.state.notice}</div>}
        {error && <div className="alert error">{error}</div>}
        <label>
          Username
          <input
            autoFocus={!remembered?.username}
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoFocus={Boolean(remembered?.username)}
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => { setRemember(e.target.checked); if (!e.target.checked) save(REMEMBER_KEY, null); }}
          />
          Remember my username on this device
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
        <p className="muted small">
          Need an account? <Link to="/signup">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
