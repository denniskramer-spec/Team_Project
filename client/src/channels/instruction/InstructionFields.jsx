// Subject + text + priority, shared by the composer and the edit dialog.
export const MAX_CONTENT = 5000;

export default function InstructionFields({ form, setForm, onSubmitShortcut, autoFocus }) {
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <>
      <input
        className="composer-subject"
        placeholder="Subject (optional)"
        value={form.title}
        onChange={set('title')}
        maxLength={120}
        aria-label="Subject"
      />
      <textarea
        className="composer-text"
        placeholder="Write the instruction..."
        value={form.content}
        onChange={set('content')}
        maxLength={MAX_CONTENT}
        rows={4}
        autoFocus={autoFocus}
        aria-label="Instruction"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmitShortcut?.(); }
        }}
      />
      <div className="segmented" role="radiogroup" aria-label="Priority">
        {[['normal', 'Normal'], ['urgent', 'Urgent']].map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={form.priority === value}
            className={`${form.priority === value ? 'on' : ''} ${value}`}
            onClick={() => setForm({ ...form, priority: value })}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
