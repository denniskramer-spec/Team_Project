import { useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import TempPassword from '../../components/TempPassword.jsx';
import MemberForm from './MemberForm.jsx';

// Per-row "⋯" menu: edit, reset password, disable/enable.
// Only shows the actions the server says this user may take.
export default function MemberActions({ member, onChanged }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const p = member.permissions;
  const close = () => { setDialog(null); setBusy(false); };

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err.message);
      close();
    }
  };

  const resetPassword = () => run(async () => {
    const { tempPassword } = await api(`/members/${member.id}/reset-password`, { method: 'POST' });
    setDialog({ type: 'password', password: tempPassword });
    setBusy(false);
  });

  const setStatus = (status) => run(async () => {
    await api(`/members/${member.id}/status`, { method: 'POST', body: { status } });
    toast(status === 'disabled' ? `${member.name} was disabled` : `${member.name} was re-enabled`);
    close();
    onChanged?.();
  });

  const disabled = member.status === 'disabled';

  return (
    <>
      <Dropdown
        label={`Actions for ${member.name}`}
        items={[
          { label: 'Edit', icon: 'edit', onClick: () => setDialog({ type: 'edit' }), hidden: !p.edit || disabled },
          { label: 'Reset password', icon: 'key', onClick: () => setDialog({ type: 'confirm-reset' }), hidden: !p.resetPassword || disabled },
          { label: 'Disable account', icon: 'userX', danger: true, onClick: () => setDialog({ type: 'confirm-disable' }), hidden: !p.disable || disabled },
          { label: 'Re-enable account', icon: 'userCheck', onClick: () => setStatus('active'), hidden: !p.disable || !disabled },
        ]}
      />

      {dialog?.type === 'edit' && (
        <MemberForm
          member={member}
          onClose={close}
          onSaved={() => { toast('Member updated'); close(); onChanged?.(); }}
        />
      )}
      {dialog?.type === 'confirm-reset' && (
        <ConfirmDialog
          title="Reset password?"
          message={`${member.name} will be logged out everywhere and get a temporary password they must change at next login.`}
          confirmLabel="Reset password"
          busy={busy}
          onConfirm={resetPassword}
          onClose={close}
        />
      )}
      {dialog?.type === 'password' && (
        <TempPassword title="Password reset" username={member.username} password={dialog.password} onClose={close} />
      )}
      {dialog?.type === 'confirm-disable' && (
        <ConfirmDialog
          title={`Disable ${member.name}?`}
          message="They will be logged out immediately and cannot log in until re-enabled. Their data is kept."
          confirmLabel="Disable"
          danger
          busy={busy}
          onConfirm={() => setStatus('disabled')}
          onClose={close}
        />
      )}
    </>
  );
}
