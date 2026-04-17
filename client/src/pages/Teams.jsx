import React, { useState, useEffect } from 'react';
import { standingsApi } from '../api';
import TeamCard from '../components/TeamCard';

export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    standingsApi.twoVtwo({})
      .then((data) => setTeams(data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="card h-40 animate-pulse" style={{ background: 'var(--color-border)' }} />
      ))}
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-4xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
        Teams
      </h1>
      <p className="font-ui mb-6" style={{ color: 'var(--color-text-secondary)' }}>
        All-time 2v2 partnerships sorted by wins.
      </p>

      {teams.length === 0 ? (
        <div className="text-center py-16 font-ui" style={{ color: 'var(--color-text-secondary)' }}>
          No 2v2 games recorded yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {teams.map((team) => (
            <TeamCard key={team.key} team={team} />
          ))}
        </div>
      )}
    </div>
  );
}
