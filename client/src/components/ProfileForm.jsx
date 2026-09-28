import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from './Toast.jsx';
import { toDateInput, todayInput } from '../format.js';
import Modal from './Modal.jsx';

// Lets any user edit their own name and birthday.
export default function ProfileForm({ onClose }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name, birthday: toDateInput(user.birthday) });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateProfile({ name: form.name, birthday: form.birthday || null });
      toast('Profile updated');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Edit profile"
      onClose={onClose}
      width={420}
      footer={(
        <>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" form="profile-form" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </>
      )}
    >
      <form id="profile-form" className="form-grid" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <label>
          Full name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} required />
        </label>
        <label>
          Birthday
          <input
            type="date"
            max={todayInput()}
            value={form.birthday}
            onChange={(e) => setForm({ ...form, birthday: e.target.value })}
          />
        </label>
        <p className="muted small form-note">Your group and role are managed by your team leader or admin.</p>
      </form>
    </Modal>
  );
}
