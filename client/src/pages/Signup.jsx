import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';
import { todayInput } from '../format.js';
import PasswordRules, { passwordValid } from '../components/PasswordRules.jsx';

const EMPTY = { name: '', username: '', birthday: '', group: '', password: '', confirm: '' };

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/groups/options').then((d) => setGroups(d.groups)).catch(() => setGroups([]));
  }, []);

  if (user) return <Navigate to="/" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!passwordValid(form.password)) return setError('Password does not meet the rules');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const { confirm, ...body } = form;
      const { message } = await signup(body);
      navigate('/login', { replace: true, state: { notice: message } });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const today = todayInput();

  return (
    <div className="center-screen">
      <form className="auth-card" onSubmit={submit}>
        <h1>Create an account</h1>
        <p className="muted">An admin, team leader or boss will approve it.</p>
        {error && <div className="alert error">{error}</div>}
        <label>
          Full name
          <input autoFocus value={form.name} onChange={set('name')} maxLength={60} required />
        </label>
        <label>
          Username
          <input
            autoComplete="username"
            value={form.username}
            onChange={set('username')}
            pattern="[A-Za-z0-9_.]{3,30}"
            title="3-30 characters: letters, numbers, _ or ."
            required
          />
        </label>
        <div className="row">
          <label>
            Birthday
            <input type="date" max={today} value={form.birthday} onChange={set('birthday')} />
          </label>
          <label>
            Group
            <select value={form.group} onChange={set('group')}>
              <option value="">No group yet</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        </div>
        <label>
          Password
          <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
        </label>
        <PasswordRules password={form.password} />
        <label>
          Confirm password
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        </label>
        <button className="btn primary" disabled={busy}>{busy ? 'Creating...' : 'Sign up'}</button>
        <p className="muted small">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
