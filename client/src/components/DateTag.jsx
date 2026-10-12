import Icon from './Icon.jsx';
import { formatDate } from '../format.js';

// A date as a small tag: an icon and the short numeric date. `utc` for
// calendar days stored at UTC midnight (birthdays, task days, income dates);
// `icon` picks the glyph (calendar by default, cake for birthdays).
export default function DateTag({ value, utc = false, muted = true, title, icon = 'calendar' }) {
  if (!value) return <span className="muted">—</span>;
  const text = formatDate(value, { utc });
  return (
    <time className={`date ${muted ? '' : 'date-strong'}`} dateTime={new Date(value).toISOString()} title={title}>
      <Icon name={icon} size={12} />
      {text}
    </time>
  );
}
