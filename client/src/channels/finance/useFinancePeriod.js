import { useSearchParams } from 'react-router-dom';

export const RANGE = 'range';
export const TYPES = [['week', 'Week'], ['month', 'Month'], ['year', 'Year']];

// The period every Finance page shows, kept in the URL so Income, Outcome
// and Total share it:
//   ?t=week|year              the current week / year (the month when absent)
//   ?t=range&from=&to=        a duration, both days included
// ?g= (group) and ?m= (member) are set by the title list.
export function useFinancePeriod() {
  const [searchParams, setSearchParams] = useSearchParams();
  const t = searchParams.get('t');
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';
  const type = t === RANGE && from && to ? RANGE : TYPES.some(([k]) => k === t) ? t : 'month';
  const group = searchParams.get('g') || 'all';
  const member = searchParams.get('m') || '';

  const update = (changes) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setSearchParams(next, { replace: true });
  };

  const query = new URLSearchParams({ type, group });
  if (type === RANGE) { query.set('from', from); query.set('to', to); }
  if (member) query.set('member', member);

  return {
    type, from, to, group, member,
    query: query.toString(),
    setType: (value) => update({ t: value === 'month' ? '' : value, from: '', to: '' }),
    setRange: (start, end) => update({ t: RANGE, from: start, to: end }),
  };
}

// Who the page is about, for the toolbar's second line.
export function scopeLabel(data, { group, member }, memberName, noun) {
  if (member) return memberName ?? 'Member';
  if (data.scope === 'self') return `Your ${noun}`;
  if (data.scope === 'group') return 'Your group';
  return group === 'all' ? 'All members' : data.groups.find((g) => g.slug === group)?.name ?? group;
}
