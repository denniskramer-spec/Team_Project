import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { EMOJI_CATEGORIES, searchEmoji } from './emoji.js';
import { load, save } from '../storage.js';

const RECENT_KEY = 'bm.recentEmoji';
const RECENT_MAX = 24;

// A messenger-style emoji picker: a search box, the recently used ones, then
// every category. `onPick(char)` gets the chosen emoji; the picker stays
// open so several can be added, and closes on Escape or a click outside.
export default function EmojiPicker({ onPick, onClose, anchor }) {
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState(() => load(RECENT_KEY, []));
  const ref = useRef(null);
  const input = useRef(null);
  const sections = useRef({});

  useEffect(() => { input.current?.focus(); }, []);
  // The parent usually passes a new onClose on every render; it is read through
  // a ref so the document listeners are attached once, not on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target) && !anchor?.current?.contains(e.target)) onCloseRef.current(); };
    const keys = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', keys, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', keys, true); };
  }, [anchor]);

  const results = useMemo(() => searchEmoji(query), [query]);
  const pick = (char) => {
    const next = [char, ...recent.filter((c) => c !== char)].slice(0, RECENT_MAX);
    setRecent(next);
    save(RECENT_KEY, next);
    onPick(char);
  };
  const jump = (name) => sections.current[name]?.scrollIntoView({ block: 'start' });

  const grid = (list, prefix) => (
    <div className="emoji-grid">
      {list.map((e, i) => (
        <button
          // eslint-disable-next-line react/no-array-index-key
          key={`${prefix}-${i}`}
          type="button"
          className="emoji-btn"
          title={e.words}
          aria-label={e.words || e.char}
          onClick={() => pick(e.char)}
        >
          {e.char}
        </button>
      ))}
    </div>
  );

  return (
    <div className="emoji-picker" ref={ref} role="dialog" aria-label="Pick an emoji">
      <div className="emoji-search">
        <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search emoji" aria-label="Search emoji" />
        <Icon name="search" size={16} />
      </div>
      {!query && (
        <div className="emoji-tabs" role="tablist" aria-label="Emoji categories">
          {EMOJI_CATEGORIES.map((c) => (
            <button key={c.name} type="button" className="emoji-tab" title={c.name} aria-label={c.name} onClick={() => jump(c.name)}>
              {c.emoji[0].char}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-scroll">
        {query ? (
          results.length
            ? grid(results, 'search')
            : <p className="muted small emoji-none">No emoji match “{query}”.</p>
        ) : (
          <>
            {recent.length > 0 && (
              <section>
                <h4 className="emoji-heading">Recently used</h4>
                {grid(recent.map((char) => ({ char, words: '' })), 'recent')}
              </section>
            )}
            {EMOJI_CATEGORIES.map((c) => (
              <section key={c.name} ref={(el) => { sections.current[c.name] = el; }}>
                <h4 className="emoji-heading">{c.name}</h4>
                {grid(c.emoji, c.name)}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
