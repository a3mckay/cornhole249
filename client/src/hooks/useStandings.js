import { useState, useEffect } from 'react';
import { standingsApi } from '../api';

export function useStandings(type = '1v1', season = null) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const params = season ? { season } : {};
    const fetchFn = type === '1v1' ? standingsApi.oneVone : standingsApi.twoVtwo;
    fetchFn(params)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [type, season]);

  return { data, loading, error };
}
