import { useEffect, useState } from 'react';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES } from '../constants.js';

// Images picked, pasted or dropped into a form and not yet uploaded: the
// type and size checks, the cap, and object-URL thumbnails that are released
// when the files change. `onFiles` gets the new list; what was refused is in
// `error` (and goes to `onProblem`, for a toast).
export function useImageFiles({ files, onFiles, max = MAX_IMAGES, taken = 0, label = 'record', onProblem }) {
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState('');

  // Each URL is kept with its file, so the render right after a change never
  // points at a revoked URL (or another file's).
  useEffect(() => {
    const made = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(made);
    return () => made.forEach((p) => URL.revokeObjectURL(p.url));
  }, [files]);
  const previewOf = (file) => previews.find((p) => p.file === file)?.url;

  const add = (list) => {
    const incoming = Array.from(list ?? []).filter(Boolean);
    if (!incoming.length) return '';
    const good = [];
    let problem = '';
    for (const f of incoming) {
      if (!IMAGE_TYPES.includes(f.type)) { problem = 'Only PNG, JPEG, GIF or WebP images can be attached'; continue; }
      if (f.size > MAX_IMAGE_BYTES) { problem = 'Each image can be at most 5 MB'; continue; }
      good.push(f);
    }
    const room = max - taken - files.length;
    if (good.length > room) { problem = `At most ${max} images per ${label}`; good.length = Math.max(room, 0); }
    setError(problem);
    if (problem) onProblem?.(problem);
    if (good.length) onFiles([...files, ...good]);
    return problem;
  };
  const remove = (index) => onFiles(files.filter((_, n) => n !== index));

  // A pasted screenshot (Ctrl+V / Cmd+V) or files dropped on the box.
  const onPaste = (e) => {
    const items = Array.from(e.clipboardData?.items ?? []).filter((i) => i.kind === 'file');
    if (!items.length) return;
    e.preventDefault();
    add(items.map((i) => i.getAsFile()));
  };
  const onDrop = (e) => {
    e.preventDefault();
    add(e.dataTransfer.files);
  };

  return { previews, previewOf, add, remove, onPaste, onDrop, error, setError, accept: IMAGE_TYPES.join(',') };
}
