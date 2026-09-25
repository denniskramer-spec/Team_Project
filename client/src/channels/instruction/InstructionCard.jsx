import { forwardRef, useState } from 'react';
import { api } from '../../api.js';
import { useAlerts } from '../../alerts/AlertsContext.jsx';
import { useToast } from '../../components/Toast.jsx';
import { formatDate, timeAgo } from '../../format.js';
import Avatar from '../../components/Avatar.jsx';
import RoleBadge from '../../components/RoleBadge.jsx';
import Icon from '../../components/Icon.jsx';
import Dropdown from '../../components/Dropdown.jsx';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import InstructionFields from './InstructionFields.jsx';
import ReadersModal from './ReadersModal.jsx';

function EditDialog({ instruction, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: instruction.title, content: instruction.content, priority: instruction.priority });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/instructions/${instruction.id}`, { method: 'PATCH', body: form });
      toast('Instruction updated');
      onSaved();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Edit instruction"
      onClose={onClose}
      width={560}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy || !form.content.trim()}>{busy ? 'Saving...' : 'Save'}</button>
        </>
      )}
    >
      <div className="form-grid">
        <InstructionFields form={form} setForm={setForm} onSubmitShortcut={save} autoFocus />
      </div>
    </Modal>
  );
}

const InstructionCard = forwardRef(function InstructionCard({ instruction: i, focused, onChanged }, ref) {
  const { markRead } = useAlerts();
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const unread = i.isRecipient && !i.readAt;

  const acknowledge = async () => {
    setBusy(true);
    await markRead(i.id);
    setBusy(false);
    onChanged();
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/instructions/${i.id}`, { method: 'DELETE' });
      toast('Instruction deleted');
      setDialog(null);
      onChanged();
    } catch (err) {
      toast.error(err.message);
      setBusy(false);
    }
  };

  return (
    <article
      ref={ref}
      className={`card instruction ${unread ? 'unread' : ''} ${i.priority === 'urgent' ? 'urgent' : ''} ${focused ? 'focused' : ''}`}
    >
      <header className="instruction-head">
        <Avatar name={i.author?.name ?? '?'} role={i.author?.role ?? 'member'} size={36} />
        <div className="instruction-meta">
          <div>
            <span className={`strong role-text-${i.author?.role}`}>{i.author?.name ?? 'Deleted user'}</span>
            {' '}{i.author && <RoleBadge role={i.author.role} />}
          </div>
          <div className="muted small">
            <span title={formatDate(i.createdAt)}>{timeAgo(i.createdAt)}</span>
            {' · to '}{i.target === 'member' ? (i.recipient?.name ?? 'one member') : i.group?.name ?? 'everyone'}
            {i.editedAt && <span title={`Edited ${timeAgo(i.editedAt)}`}> · edited</span>}
          </div>
        </div>
        {i.target === 'member' && <span className="tag direct-tag">Direct</span>}
        {i.priority === 'urgent' && <span className="tag urgent-tag">Urgent</span>}
        {unread && <span className="tag new-tag">New</span>}
        {i.canModify && (
          <Dropdown
            label="Instruction actions"
            items={[
              { label: 'Edit', icon: 'edit', onClick: () => setDialog('edit') },
              { label: 'Delete', icon: 'trash', danger: true, onClick: () => setDialog('delete') },
            ]}
          />
        )}
      </header>

      {i.title && <h3 className="instruction-title">{i.title}</h3>}
      <p className="instruction-text">{i.content}</p>

      <footer className="instruction-foot">
        {i.isRecipient && (unread ? (
          <button className="btn small-btn primary" onClick={acknowledge} disabled={busy}>
            <Icon name="check" size={14} /> Got it
          </button>
        ) : (
          <span className="acked small"><Icon name="check" size={14} /> You acknowledged this {timeAgo(i.readAt)}</span>
        ))}
        {i.receipts && (
          <button className="link small receipts" onClick={() => setDialog('readers')}>
            Read by {i.receipts.read} of {i.receipts.total}
            <span className="receipt-bar" aria-hidden="true">
              <span style={{ width: `${i.receipts.total ? (i.receipts.read / i.receipts.total) * 100 : 0}%` }} />
            </span>
          </button>
        )}
      </footer>

      {dialog === 'edit' && <EditDialog instruction={i} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); onChanged(); }} />}
      {dialog === 'readers' && <ReadersModal instruction={i} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && (
        <ConfirmDialog
          title="Delete this instruction?"
          message="It will disappear for everyone who received it."
          confirmLabel="Delete"
          danger
          busy={busy}
          onConfirm={remove}
          onClose={() => setDialog(null)}
        />
      )}
    </article>
  );
});

export default InstructionCard;
