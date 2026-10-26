const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// Round initials avatar, coloured by role, with an optional online/offline
// dot. With `src` the photo is shown instead of the initials.
export default function Avatar({ name, role, online, size = 26, src }) {
  return (
    <span className={`avatar role-bg-${role}${src ? ' has-photo' : ''}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? <img src={src} alt="" /> : initials(name)}
      {online !== undefined && <span className={`presence ${online ? 'on' : 'off'}`} />}
    </span>
  );
}
