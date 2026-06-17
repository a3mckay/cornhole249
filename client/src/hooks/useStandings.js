import { useState, useEffect } from 'react';
import { standingsApi } from '../api';

export function useStandings(type = '1v1', season = null, variant = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData([]);   // clear stale data immediately on type/season/variant change
    setLoading(true);
    setError(null);
    const params = season ? { season } : {};
    // Pool variant filter (ignored by cornhole leagues). 'all' / null = no filter.
    if (variant && variant !== 'all') params.variant = variant;

    let fetchFn;
    if (type === 'cutthroat') fetchFn = standingsApi.cutthroat;
    else if (type === '1v1') fetchFn = standingsApi.oneVone;
    else fetchFn = standingsApi.twoVtwo;

    fetchFn(params)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type, season, variant]);

  return { data, loading, error };
}
