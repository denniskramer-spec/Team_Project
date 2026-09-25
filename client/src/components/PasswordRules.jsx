// Mirrors the server's rules in server/src/utils/validate.js.
export const passwordChecks = (pw) => [
  { ok: pw.length >= 8, label: 'At least 8 characters' },
  { ok: /[A-Za-z]/.test(pw), label: 'A letter' },
  { ok: /\d/.test(pw), label: 'A number' },
];

export const passwordValid = (pw) => passwordChecks(pw).every((c) => c.ok);

export default function PasswordRules({ password }) {
  return (
    <ul className="pw-rules">
      {passwordChecks(password).map((c) => (
        <li key={c.label} className={c.ok ? 'ok' : ''}>{c.ok ? '✓' : '•'} {c.label}</li>
      ))}
    </ul>
  );
}
