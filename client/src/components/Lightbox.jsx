import { useState } from 'react';
import Modal from './Modal.jsx';

// A record's images as small thumbnails; clicking one opens the Lightbox.
//   images   [{ file, url, name }]
//   onOpen   (index) => void
export function ImageThumbs({ images, onOpen, label = 'Images' }) {
  if (!images?.length) return null;
  return (
    <ul className="image-thumbs small-thumbs" aria-label={label}>
      {images.map((img, n) => (
        <li key={img.file ?? img.url}>
          <button type="button" className="thumb-open" onClick={() => onOpen(n)}>
            <img src={img.url} alt={img.name} title={img.name} loading="lazy" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// One image at full size, with Previous / Next through the others
// (wrapping around at the ends). Mount it to open, drop it to close.
export default function Lightbox({ images, index = 0, title, onClose }) {
  const [at, setAt] = useState(index);
  const img = images[at];
  if (!img) return null;
  const step = (d) => setAt((n) => (n + d + images.length) % images.length);
  return (
    <Modal title={`${title} · ${at + 1} / ${images.length}`} onClose={onClose} width={900}>
      <div className="lightbox">
        <img src={img.url} alt={img.name} />
        {images.length > 1 && (
          <div className="lightbox-nav">
            <button className="btn small-btn" type="button" onClick={() => step(-1)}>Previous</button>
            <span className="muted small">{img.name}</span>
            <button className="btn small-btn" type="button" onClick={() => step(1)}>Next</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
