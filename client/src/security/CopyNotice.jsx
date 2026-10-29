import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';

// Told once: copying bank or card details in the app is recorded
// (useCopyWatch.js). Closing without confirming hides it until the next
// visit; "I understand" is saved on the account and written to the log.
export default function CopyNotice() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || user.copyNoticeSeen || hidden) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await api('/auth/copy-notice', { method: 'POST' });
      await refresh();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Copying bank details is recorded"
      onClose={() => setHidden(true)}
      footer={<button type="button" className="btn primary" onClick={confirm} disabled={busy}>I understand</button>}
    >
      <p>To protect the team&apos;s and our clients&apos; money, the app records when someone copies or cuts <strong>bank or card details</strong> in it: IBANs, card numbers, account or routing numbers and crypto wallet addresses.</p>
      <p>What is kept: who copied, when, on which page, from which address and device, and the number <strong>masked</strong> (for example DE89••••3000). The full number is never stored. Copying anything else is not recorded.</p>
      <p className="muted small">Admins and the team leader can see these records under Admin → Security.</p>
    </Modal>
  );
}
