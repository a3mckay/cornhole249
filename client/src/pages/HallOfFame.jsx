import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { standingsApi, achievementsApi, usersApi } from '../api';

function AchievementModal({ leader, onClose }) {
  if (!leader) return null;
  const earned = leader.achievements.filter((a) => a.earned);
  const locked = leader.achievements.filter((a) => !a.earned);
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-xl p-5 my-auto"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <img
            src={leader.user.avatar_url}
            alt={leader.user.display_name}
            className="w-12 h-12 rounded-full border-2"
            style={{ borderColor: 'var(--color-secondary)' }}
            onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${leader.user.display_name}`; }}
          />
          <div>
            <div className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>
              {leader.user.display_name}
            </div>
            <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>
              {earned.length} / {leader.achievements.length} badges earned
            </div>
          </div>
          <button onClick={onClose} className="ml-auto text-xl leading-none" style={{ color: 'var(--color-text-secondary)' }}>✕</button>
        </div>

        {/* Earned badges */}
        {earned.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-ui font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-secondary)' }}>
              Earned
            </div>
            <div className="flex flex-col gap-2">
              {earned.map((a) => (
                <div key={a.key} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #FEF9EC, #FEF3C7)', border: '1px solid #D4A017' }}>
                  <span className="text-2xl">{a.icon}</span>
                  <div>
                    <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{a.label}</div>
                    <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{a.description}</div>
                  </div>
                  {a.earned_at && (
                    <div className="ml-auto text-xs font-ui whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                      {new Date(a.earned_at).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked badges */}
        {locked.length > 0 && (
          <div>
            <div className="text-xs font-ui font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Not Yet Earned
            </div>
            <div className="flex flex-col gap-1.5">
              {locked.map((a) => (
                <div key={a.key} className="flex items-center gap-3 px-3 py-1.5 rounded-xl opacity-50"
                  style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid var(--color-border)' }}>
                  <span className="text-xl grayscale">{a.icon}</span>
                  <div>
                    <div className="font-ui font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>🔒 {a.label}</div>
                    <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>{a.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SEASONS = [2025, 2024];

export default function HallOfFame() {
  const [champs, setChamps] = useState({});
  const [goats1v1, setGoats1v1] = useState({ wins: null, winPct: null, gp: null });
  const [goats2v2, setGoats2v2] = useState({ wins: null, winPct: null, gp: null });
  const [achieveLeaders, setAchieveLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalLeader, setModalLeader] = useState(null);

  useEffect(() => {
    async function load() {
      const [users, ...seasonData] = await Promise.all([
        usersApi.list(),
        ...SEASONS.flatMap((year) => [
          standingsApi.oneVone({ season: year }),
          standingsApi.twoVtwo({ season: year }),
        ]),
      ]);

      // Build champ map: { year: { '1v1': top1v1, '2v2': top2v2 } }
      const champMap = {};
      SEASONS.forEach((year, i) => {
        const s1v1 = seasonData[i * 2];
        const s2v2 = seasonData[i * 2 + 1];
        champMap[year] = {
          '1v1': s1v1?.[0] || null,
          '2v2': s2v2?.[0] || null,
        };
      });
      setChamps(champMap);

      // GOAT 1v1
      const all1v1 = await standingsApi.oneVone({});
      const topTied = (arr, key) => {
        if (!arr.length) return [];
        const best = arr[0][key];
        return arr.filter((r) => r[key] === best);
      };
      if (all1v1.length) {
        const byWins = [...all1v1].sort((a, b) => b.wins - a.wins);
        const byPct = [...all1v1].filter((r) => r.gp >= 3).sort((a, b) => b.win_pct - a.win_pct);
        const byGp = [...all1v1].sort((a, b) => b.gp - a.gp);
        setGoats1v1({
          wins: topTied(byWins, 'wins'),
          winPct: byPct.length ? topTied(byPct, 'win_pct') : [],
          gp: topTied(byGp, 'gp'),
        });
      }

      // GOAT 2v2
      const all2v2 = await standingsApi.twoVtwo({});
      if (all2v2.length) {
        const byWins = [...all2v2].sort((a, b) => b.wins - a.wins);
        const byPct = [...all2v2].filter((r) => r.gp >= 3).sort((a, b) => b.win_pct - a.win_pct);
        const byGp = [...all2v2].sort((a, b) => b.gp - a.gp);
        setGoats2v2({
          wins: topTied(byWins, 'wins'),
          winPct: byPct.length ? topTied(byPct, 'win_pct') : [],
          gp: topTied(byGp, 'gp'),
        });
      }

      // Achievement leaders — also store full achievement list for modal
      const achData = await Promise.all(
        users.map(async (u) => {
          const ach = await achievementsApi.forUser(u.id);
          return { user: u, achievements: ach, count: ach.filter((a) => a.earned).length };
        })
      );
      setAchieveLeaders(achData.sort((a, b) => b.count - a.count).slice(0, 5));
    }

    load().catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20 font-ui" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>;

  const TeamChamp = ({ team }) => {
    if (!team) return <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>No data</div>;
    const sortedIds = [...team.players].sort((a, b) => a.user_id - b.user_id).map((p) => p.user_id);
    const teamPath = `/teams/${sortedIds[0]}/${sortedIds[1]}`;
    return (
      <Link to={teamPath} className="flex items-center gap-2 hover:opacity-80">
        <div className="flex -space-x-2">
          {team.players.map((p) => (
            <img key={p.user_id} src={p.avatar_url} alt={p.display_name} className="w-10 h-10 rounded-full border-2"
              style={{ borderColor: '#D4A017' }}
              onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }} />
          ))}
        </div>
        <div>
          <div className="font-display text-base leading-tight" style={{ color: 'var(--color-text-primary)' }}>
            {team.players.map((p) => p.display_name).join(' & ')}
          </div>
          <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
            {team.wins}W–{team.losses}L · {team.win_pct}% · 2v2
          </div>
        </div>
        <span className="ml-auto text-2xl">👑</span>
      </Link>
    );
  };

  const GoatCard = ({ label, icon, data, stat, format, note, is2v2 }) => {
    const entries = Array.isArray(data) ? data : (data ? [data] : []);
    return (
      <div className="p-4 rounded-2xl text-center" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--color-border)' }}>
        <div className="text-3xl mb-1">{icon}</div>
        <div className="font-ui font-bold text-sm mb-2 uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
          {label}
          {note && <div className="normal-case text-xs opacity-60">{note}</div>}
        </div>
        {entries.length > 0 ? (
          <div className={`flex flex-col gap-2 ${entries.length > 1 ? 'items-center' : ''}`}>
            {entries.map((d, i) => is2v2 ? (
              <Link key={i} to={`/teams/${[...d.players].sort((a, b) => a.user_id - b.user_id).map((p) => p.user_id).join('/')}`} className="hover:opacity-80 block">
                <div className="flex justify-center -space-x-2 mb-1">
                  {d.players.map((p) => (
                    <img key={p.user_id} src={p.avatar_url} alt={p.display_name} className="w-8 h-8 rounded-full border-2"
                      style={{ borderColor: 'var(--color-secondary)' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.display_name}`; }} />
                  ))}
                </div>
                <div className="font-display text-sm leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                  {d.players.map((p) => p.display_name).join(' & ')}
                </div>
                {i === 0 && <div className="font-display text-2xl mt-1" style={{ color: 'var(--color-secondary)' }}>{format(d[stat])}</div>}
              </Link>
            ) : (
              <Link key={i} to={`/players/${d.user_id}`} className="hover:opacity-80 block">
                <img src={d.avatar_url} alt={d.display_name} className="w-12 h-12 rounded-full border-2 mx-auto mb-1"
                  style={{ borderColor: 'var(--color-secondary)' }}
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${d.display_name}`; }} />
                <div className="font-display text-lg" style={{ color: 'var(--color-text-primary)' }}>{d.display_name}</div>
                {i === 0 && <div className="font-display text-2xl mt-1" style={{ color: 'var(--color-secondary)' }}>{format(d[stat])}</div>}
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>N/A</div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div
        className="relative rounded-[20px] overflow-hidden mb-8 py-10 px-6 text-center"
        style={{ background: 'linear-gradient(135deg, #4A3728 0%, #D48B2D 100%)', boxShadow: '4px 4px 0px var(--color-border)' }}
      >
        <div className="text-6xl mb-2">🏆</div>
        <h1 className="font-display text-5xl text-white" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.3)' }}>
          Hall of Fame
        </h1>
        <p className="font-ui text-white/80 mt-2">The legends of Cornhole249</p>
      </div>

      {/* Season Champions */}
      <div className="card mb-6">
        <h2 className="font-display text-3xl mb-5" style={{ color: 'var(--color-text-primary)' }}>
          🥇 Season Champions
        </h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {SEASONS.map((year) => (
            <div key={year} className="p-4 rounded-2xl border" style={{ borderColor: 'var(--color-secondary)', background: 'rgba(212,139,45,0.05)' }}>
              <div className="font-ui font-bold text-sm mb-3 uppercase tracking-wide" style={{ color: 'var(--color-secondary)' }}>
                Season {year}
              </div>

              {/* 1v1 */}
              <div className="mb-3">
                <div className="text-xs font-ui font-semibold uppercase tracking-wide mb-1.5 opacity-60" style={{ color: 'var(--color-text-secondary)' }}>1v1</div>
                {champs[year]?.['1v1'] ? (
                  <Link to={`/players/${champs[year]['1v1'].user_id}`} className="flex items-center gap-3 hover:opacity-80">
                    <img src={champs[year]['1v1'].avatar_url} alt={champs[year]['1v1'].display_name} className="w-10 h-10 rounded-full border-2"
                      style={{ borderColor: '#D4A017' }}
                      onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${champs[year]['1v1'].display_name}`; }} />
                    <div>
                      <div className="font-display text-lg" style={{ color: 'var(--color-text-primary)' }}>{champs[year]['1v1'].display_name}</div>
                      <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>
                        {champs[year]['1v1'].wins}W–{champs[year]['1v1'].losses}L · {champs[year]['1v1'].win_pct}%
                      </div>
                    </div>
                    <span className="ml-auto text-2xl">👑</span>
                  </Link>
                ) : (
                  <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>No data</div>
                )}
              </div>

              {/* Divider */}
              <div className="h-px mb-3" style={{ background: 'var(--color-border)' }} />

              {/* 2v2 */}
              <div>
                <div className="text-xs font-ui font-semibold uppercase tracking-wide mb-1.5 opacity-60" style={{ color: 'var(--color-text-secondary)' }}>2v2</div>
                <TeamChamp team={champs[year]?.['2v2']} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GOAT Section */}
      <div className="card mb-6">
        <h2 className="font-display text-3xl mb-5" style={{ color: 'var(--color-text-primary)' }}>
          🐐 Greatest of All Time
        </h2>

        {/* 1v1 */}
        <div className="mb-2">
          <div className="text-sm font-ui font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--color-primary)' }}>1v1</div>
          <div className="grid sm:grid-cols-3 gap-4">
            <GoatCard label="Most Wins" icon="🏆" data={goats1v1.wins} stat="wins" format={(v) => `${v} wins`} />
            <GoatCard label="Best Win%" icon="📈" data={goats1v1.winPct} stat="win_pct" format={(v) => `${v}%`} note="(min 10 games)" />
            <GoatCard label="Most Games" icon="🎯" data={goats1v1.gp} stat="gp" format={(v) => `${v} games`} />
          </div>
        </div>

        <div className="h-px my-4" style={{ background: 'var(--color-border)' }} />

        {/* 2v2 */}
        <div>
          <div className="text-sm font-ui font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--color-secondary)' }}>2v2</div>
          <div className="grid sm:grid-cols-3 gap-4">
            <GoatCard label="Most Wins" icon="🏆" data={goats2v2.wins} stat="wins" format={(v) => `${v} wins`} is2v2 />
            <GoatCard label="Best Win%" icon="📈" data={goats2v2.winPct} stat="win_pct" format={(v) => `${v}%`} note="(min 5 games)" is2v2 />
            <GoatCard label="Most Games" icon="🎯" data={goats2v2.gp} stat="gp" format={(v) => `${v} games`} is2v2 />
          </div>
        </div>
      </div>

      {/* Achievement Leaders */}
      <div className="card">
        <h2 className="font-display text-3xl mb-2" style={{ color: 'var(--color-text-primary)' }}>
          🏅 Achievement Leaders
        </h2>
        <p className="text-sm font-ui mb-4" style={{ color: 'var(--color-text-secondary)' }}>
          Click a row to see their badges.
        </p>
        <div className="flex flex-col gap-2">
          {achieveLeaders.map(({ user, count, achievements }, i) => (
            <button
              key={user.id}
              onClick={() => setModalLeader({ user, count, achievements })}
              className="flex items-center gap-3 hover:opacity-80 text-left w-full p-2 rounded-xl transition-colors"
              style={{ background: 'rgba(0,0,0,0.02)' }}
            >
              <span className="font-display text-2xl w-8 text-center" style={{ color: 'var(--color-secondary)' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <img src={user.avatar_url} alt={user.display_name} className="w-10 h-10 rounded-full border-2"
                style={{ borderColor: 'var(--color-border)' }}
                onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.display_name}`; }} />
              <div className="flex-1">
                <div className="font-display text-xl" style={{ color: 'var(--color-text-primary)' }}>{user.display_name}</div>
                {user.nickname && <div className="text-sm font-ui" style={{ color: 'var(--color-text-secondary)' }}>"{user.nickname}"</div>}
              </div>
              {/* Badge icons preview */}
              <div className="flex gap-1 flex-wrap justify-end max-w-[120px]">
                {achievements.filter((a) => a.earned).slice(0, 5).map((a) => (
                  <span key={a.key} className="text-base" title={a.label}>{a.icon}</span>
                ))}
                {count > 5 && <span className="text-xs font-ui self-center" style={{ color: 'var(--color-text-secondary)' }}>+{count - 5}</span>}
              </div>
              <div className="text-right ml-2 flex-shrink-0">
                <div className="font-display text-2xl" style={{ color: 'var(--color-secondary)' }}>{count}</div>
                <div className="text-xs font-ui" style={{ color: 'var(--color-text-secondary)' }}>badges</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Achievement modal */}
      <AchievementModal leader={modalLeader} onClose={() => setModalLeader(null)} />
    </div>
  );
}
