import { Fragment } from 'react';

// Renders message text, turning http(s) links into anchors.
// Everything is rendered as text, so no markup from a message can run.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
// Punctuation that ends a sentence, not the address: "see https://x.y/z."
const TRAIL_RE = /[.,;:!?]+$/;

// A closing bracket belongs to the link only when the link opened it
// (https://en.wikipedia.org/wiki/Foo_(bar)).
function splitTrail(part) {
  let url = part;
  let tail = '';
  for (;;) {
    const m = url.match(TRAIL_RE);
    if (m) { tail = m[0] + tail; url = url.slice(0, -m[0].length); continue; }
    if (url.endsWith(')') && (url.split('(').length <= url.split(')').length - 1)) { tail = `)${tail}`; url = url.slice(0, -1); continue; }
    return { url, tail };
  }
}

export default function MessageText({ content }) {
  const parts = content.split(URL_RE);
  return (
    <p className="msg-text">
      {parts.map((part, i) => {
        // eslint-disable-next-line react/no-array-index-key
        if (i % 2 === 0) return <span key={i}>{part}</span>;
        const { url, tail } = splitTrail(part);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <Fragment key={i}>
            <a href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a>{tail}
          </Fragment>
        );
      })}
    </p>
  );
}
