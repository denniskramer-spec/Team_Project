import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// The images a record may carry: the same limits as the server's upload route.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EMPTY = [];

// Why a file cannot be attached, or '' when it can.
export function imageProblem(file) {
  if (!IMAGE_TYPES.includes(file.type)) return 'Only PNG, JPEG, GIF or WebP images';
  if (file.size > MAX_IMAGE_BYTES) return 'Each image can be at most 5 MB';
  return '';
}

// Preview URLs for new files, released once the list changes again. They
// are made in the effect that releases them: React may run an effect's
// cleanup and the effect again (StrictMode), and URLs made while rendering
// would then be revoked for good. Each URL is kept with its file, so a
// render never points at another file's.
export function useObjectUrls(files) {
  const [previews, setPreviews] = useState(EMPTY);
  useEffect(() => {
    const made = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(made);
    return () => made.forEach((p) => URL.revokeObjectURL(p.url));
  }, [files]);
  return previews;
}

// The same for one optional file.
export function useObjectUrl(file) {
  const files = useMemo(() => (file ? [file] : EMPTY), [file]);
  return useObjectUrls(files)[0]?.url ?? '';
}

// Image attachments for a form: drop files on the box, click it to pick
// them, or paste a screenshot anywhere in the modal. `existing` are images
// already saved ({ url, name }); `files` are new File objects.
export default function ImageDrop({ existing = [], onRemoveExisting, files, onFiles, max = 5, invalid = false }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const previews = useObjectUrls(files);
  const previewOf = (file) => previews.find((p) => p.file === file)?.url;

  const add = (list) => {
    const good = [];
    let problem = '';
    for (const f of Array.from(list ?? [])) {
      const why = imageProblem(f);
      if (why) problem = why;
      else good.push(f);
    }
    // A single-image field takes the new image in place of the old one.
    if (max === 1 && good.length) {
      setError(problem);
      onFiles([good[good.length - 1]]);
      return;
    }
    const room = max - existing.length - files.length;
    if (good.length > room) { problem = `At most ${max} ${max === 1 ? 'image' : 'images'} per record`; good.length = Math.max(room, 0); }
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
        <span>{max === 1 ? 'Drop a screenshot here, click to choose, or paste' : 'Drop screenshots here, click to choose, or paste'}</span>
        <span className="muted small">PNG, JPEG, GIF or WebP · {max === 1 ? 'one image' : `up to ${max} images`} · 5 MB each</span>
        <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} multiple={max > 1} hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
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
              {previewOf(f) && <img src={previewOf(f)} alt={f.name} title={f.name} />}
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
