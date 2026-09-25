import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';

// Shows a generated password once, with a copy button.
export default function TempPassword({ title, username, password, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = `Username: ${username}\nTemporary password: ${password}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      footer={<button className="btn primary" onClick={onClose}>Done</button>}
    >
      <p className="modal-text">
        Share these details with the member. The password is shown only once, and they will be asked to change it when they log in.
      </p>
      <div className="credential">
        <div><span className="muted small">Username</span><code>{username}</code></div>
        <div><span className="muted small">Temporary password</span><code>{password}</code></div>
        <button className="btn" onClick={copy}><Icon name="copy" size={16} /> {copied ? 'Copied' : 'Copy'}</button>
      </div>
    </Modal>
  );
}
