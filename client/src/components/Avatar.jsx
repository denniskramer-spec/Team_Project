const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// Round initials avatar, coloured by role, with an optional online/offline dot.
export default function Avatar({ name, role, online, size = 32 }) {
  return (
    <span className={`avatar role-bg-${role}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
      {online !== undefined && <span className={`presence ${online ? 'on' : 'off'}`} />}
    </span>
  );
}
