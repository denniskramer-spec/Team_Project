import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ACCEPT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

// Image attachments for a form: drop files on the box, click it to pick
// them, or paste a screenshot anywhere in the modal. `existing` are images
// already saved ({ url, name }); `files` are new File objects.
export default function ImageDrop({ existing = [], onRemoveExisting, files, onFiles, max = 5, invalid = false }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState([]);

  // Object URLs for the new files, released when they change.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const add = (list) => {
    const incoming = Array.from(list ?? []);
    const room = max - existing.length - files.length;
    const good = [];
    let problem = '';
    for (const f of incoming) {
      if (!ACCEPT.includes(f.type)) { problem = 'Only PNG, JPEG, GIF or WebP images'; continue; }
      if (f.size > MAX_BYTES) { problem = 'Each image can be at most 5 MB'; continue; }
      good.push(f);
    }
    if (good.length > room) { problem = `At most ${max} images per record`; good.length = Math.max(room, 0); }
    setError(problem);
    if (good.length) onFiles([...files, ...good]);
  };

  // Pasting a screenshot (Ctrl+V / Cmd+V) anywhere while the form is open.
  useEffect(() => {
    const paste = (e) => {
      const items = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === 'file');
      if (!items.length) return;
      e.preventDefault();
      add(items.map((i) => i.getAsFile()).filter(Boolean));
    };
    document.addEventListener('paste', paste);
    return () => document.removeEventListener('paste', paste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, existing.length]);

  const drop = (e) => {
    e.preventDefault();
    setOver(false);
    add(e.dataTransfer.files);
  };

  return (
    <div className="image-drop-wrap">
      <div
        className={`image-drop${over ? ' over' : ''}${invalid ? ' invalid' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        role="button" tabIndex={0}
        aria-label="Add images"
      >
        <Icon name="plus" size={18} />
        <span>Drop screenshots here, click to choose, or paste</span>
        <span className="muted small">PNG, JPEG, GIF or WebP · up to {max} images · 5 MB each</span>
        <input ref={input} type="file" accept={ACCEPT.join(',')} multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {error && <div className="alert error">{error}</div>}
      {(existing.length > 0 || files.length > 0) && (
        <ul className="image-thumbs" aria-label="Attached images">
          {existing.map((img) => (
            <li key={img.url}>
              <img src={img.url} alt={img.name} title={img.name} />
              {onRemoveExisting && (
                <button type="button" className="thumb-remove" onClick={() => onRemoveExisting(img)} aria-label={`Remove ${img.name}`}>
                  <Icon name="close" size={12} />
                </button>
              )}
            </li>
          ))}
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="is-new">
              <img src={previews[i]} alt={f.name} title={f.name} />
              <button type="button" className="thumb-remove" onClick={() => onFiles(files.filter((_, n) => n !== i))} aria-label={`Remove ${f.name}`}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
