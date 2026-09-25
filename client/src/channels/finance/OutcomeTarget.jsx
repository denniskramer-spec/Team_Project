// Who an outcome is for: one member, or a team cost of
// one group or of the whole team. Value: { team, member, group }.

export const targetFrom = (record) => ({
  team: Boolean(record) && !record.member,
  member: record?.member?.id ?? '',
  group: record?.group?.id ?? '',
});

// The body fields the server expects for a target.
export const targetBody = (t) => (t.team ? { team: true, group: t.group || undefined } : { member: t.member });

export default function TargetFields({ value, onChange, members, groups, wholeTeam }) {
  const pickTeam = () => onChange({ ...value, team: true, group: value.group || (wholeTeam ? '' : groups[0]?.id ?? '') });
  return (
    <div className="target-fields">
      <div className="target-pick">
        <span className="field-label">For</span>
        <div className="segmented small-segmented" role="radiogroup" aria-label="Outcome for">
          <button type="button" role="radio" aria-checked={!value.team} className={!value.team ? 'on' : ''} onClick={() => onChange({ ...value, team: false })}>Member</button>
          <button type="button" role="radio" aria-checked={value.team} className={value.team ? 'on' : ''} onClick={pickTeam}>Team</button>
        </div>
      </div>
      {value.team ? (
        <label>
          Group
          <select value={value.group} onChange={(e) => onChange({ ...value, group: e.target.value })} required={!wholeTeam}>
            {wholeTeam && <option value="">Whole team</option>}
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      ) : (
        <label>
          Member
          <select value={value.member} onChange={(e) => onChange({ ...value, member: e.target.value })} required autoFocus>
            <option value="">Choose a member</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.group ? ` · ${m.group}` : ''}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
