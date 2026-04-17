import React, { useState, useEffect } from 'react';
import { usersApi } from '../api';
import { standingsApi } from '../api';
import PlayerCard from '../components/PlayerCard';

export default function Players() {
  const [players, setPlayers] = useState([]);
  const [standings, setStandings] = useState({});
  const [loading, setLoading] = useState(true);
  const season = 2025;

  useEffect(() => {
    Promise.all([
      usersApi.list(),
      standingsApi.oneVone({ season }),
    ]).then(([users, s]) => {
      setPlayers(users);
      const map = {};
      s.forEach((row) => { map[row.user_id] = row; });
      setStandings(map);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {[1,2,3,4,5,6,7,8].map((i) => (
        <div key={i} className="card h-40 animate-pulse" style={{ background: 'var(--color-border)' }} />
      ))}
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-4xl mb-6" style={{ color: 'var(--color-text-primary)' }}>
        Players
      </h1>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {players.map((p) => (
          <PlayerCard
            key={p.id}
            player={p}
            stats={standings[p.id]}
          />
        ))}
      </div>
    </div>
  );
}
