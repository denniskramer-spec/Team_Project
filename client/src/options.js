import { useLiveData } from './useLiveData.js';

const EMPTY = [];

// The choices for a form field (groups, members, residents...): `key` names
// the list in the answer. Reloads on `events`, and says when the load failed,
// so a form can explain an empty select instead of silently refusing to
// submit. Pass path = null to skip loading.
export function useOptions(path, key, events = []) {
  const { data, error, loading, reload } = useLiveData(path, events);
  return { list: data?.[key] ?? EMPTY, error, loading, reload };
}

// Every group, kept current as groups are created and renamed.
export const useGroupOptions = (enabled = true) => useOptions(enabled ? '/groups/options' : null, 'groups', ['nav:changed']);
