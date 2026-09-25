// Renders message text, turning http(s) links into anchors.
// Everything is rendered as text, so no markup from a message can run.
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

export default function MessageText({ content }) {
  const parts = content.split(URL_RE);
  return (
    <p className="msg-text">
      {parts.map((part, i) => (i % 2 === 1 ? (
        // eslint-disable-next-line react/no-array-index-key
        <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>
      // eslint-disable-next-line react/no-array-index-key
      ) : <span key={i}>{part}</span>))}
    </p>
  );
}
