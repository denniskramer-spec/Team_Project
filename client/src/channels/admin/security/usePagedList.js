import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api.js';
import { useLatestRequest } from '../../../useLiveData.js';

// A list sorted newest first and loaded a page at a time (the security log,
// the deleted records). `pathFor(params)` adds the list's own filters to the
// query and returns the path; `filters` are those filter values: when one
// changes the list starts over, and an older answer that lands after the
// change is ignored, so a slow search never overwrites a newer one and "load
// older" never appends another filter's page. `rowsKey` names the page in
// the answer; whatever else the answer carries (the models, the kinds) comes
// back as `extra`.
export function usePagedList(pathFor, filters, rowsKey) {
  const [rows, setRows] = useState([]);
  const [extra, setExtra] = useState({});
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const cursor = useRef(null);
  const latestPath = useRef(pathFor);
  latestPath.current = pathFor;
  const track = useLatestRequest();

  const load = useCallback(async (more = false) => {
    const isLatest = track();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (more && cursor.current) { params.set('before', cursor.current.before); params.set('beforeId', cursor.current.beforeId); }
      const { [rowsKey]: page, cursor: next, hasMore: older, ...rest } = await api(latestPath.current(params));
      if (!isLatest()) return;
      cursor.current = next;
      setRows((prev) => (more ? [...prev, ...page] : page));
      setHasMore(older);
      setExtra(rest);
      setError('');
    } catch (err) {
      if (isLatest()) setError(err.message);
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [track, rowsKey]);

  const filterKey = filters.join('\u0000');
  useEffect(() => { load(false); }, [load, filterKey]);

  return { rows, setRows, extra, hasMore, loading, error, load };
}
