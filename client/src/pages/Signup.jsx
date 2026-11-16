import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthFooter } from '../layout/Footer.jsx';
import { todayInput } from '../format.js';
import PasswordRules, { passwordValid } from '../components/PasswordRules.jsx';

const EMPTY = { name: '', username: '', birthday: '', password: '', confirm: '' };

export default function Signup() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!passwordValid(form.password)) return setError('Password does not meet the rules');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      const body = { ...form };
      delete body.confirm; // only checked here, never sent
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
        <p className="muted">An admin or the team leader will approve it and put you in a group.</p>
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
            maxLength={30}
            pattern="[A-Za-z0-9_.]{3,30}"
            title="3-30 characters: letters, numbers, _ or ."
            required
          />
        </label>
        <label>
          Birthday
          <input type="date" max={today} value={form.birthday} onChange={set('birthday')} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} minLength={10} maxLength={128} required />
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
      <AuthFooter />
    </div>
  );
}
