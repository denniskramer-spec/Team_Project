import { useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import InstructionFields, { MAX_CONTENT } from './InstructionFields.jsx';

const EMPTY = { title: '', content: '', priority: 'normal' };

// Send box for the leader and bosses. `target` is fixed by the current title.
export default function Composer({ target, groupId, recipient, audienceLabel, onSent }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!form.content.trim() || busy) return;
    setBusy(true);
    try {
      await api('/instructions', {
        method: 'POST',
        body: {
          ...form,
          target,
          group: target === 'group' ? groupId : undefined,
          recipient: target === 'member' ? recipient : undefined,
        },
      });
      setForm(EMPTY);
      toast(`Instruction sent to ${audienceLabel}`);
      onSent();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <div className="composer-head">
        <Icon name="megaphone" size={16} />
        <span>
          New instruction to <strong>{audienceLabel}</strong>
          {target === 'member' && <span className="muted small"> · only they see it</span>}
        </span>
      </div>
      <InstructionFields form={form} setForm={setForm} onSubmitShortcut={send} />
      <div className="composer-foot">
        <span className="muted small">{form.content.length}/{MAX_CONTENT} · Ctrl+Enter to send</span>
        <button className={`btn ${form.priority === 'urgent' ? 'danger' : 'primary'}`} disabled={busy || !form.content.trim()}>
          {busy ? 'Sending...' : form.priority === 'urgent' ? 'Send urgent' : 'Send'}
        </button>
      </div>
    </form>
  );
}
