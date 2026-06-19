/**
 * Cross-sport "house" analytics — pure aggregation, no DB.
 *
 * A *house* is the set of leagues owned by one user (Andrew's locked decision:
 * grouping is by owner/venue, computed at query time — no grouping table). This
 * module turns a flat list of game-participant rows (already filtered to a
 * house's leagues, each tagged with its league's `sport`) into the cross-sport
 * boards described in MULTISPORT_MERGE_PLAN.md §3.
 *
 * Design goal: **sport-agnostic.** Sports are discovered from the data
 * (`row.sport`), so adding a new sport needs zero changes here — once a league
 * of that sport has games, it flows through automatically. ELO is intentionally
 * NOT compared across sports (it isn't comparable); instead every board is built
 * on each player's **percentile within a sport**, then aggregated.
 *
 * Input rows: { game_id, league_id, sport, user_id, team, is_winner }
 *   (is_winner is 1/0; team is 1/2; one row per participant per game.)
 */

// A player needs at least this many games in a sport to be ranked in it.
const MIN_GAMES_FOR_PERCENTILE = 1;
// "Winning record" threshold for jack-of-all-trades (win %).
const BASELINE_WIN_PCT = 50;
// Minimum meetings before an opponent counts as a nemesis candidate.
const MIN_MEETINGS_FOR_NEMESIS = 2;

/**
 * Percentile rank of every value in `byPlayer` (Map user_id -> winPct), using
 * average-rank for ties. Returns Map user_id -> percentile (0..100).
 * Single-player sport => that player sits at 100 (top by default).
 */
function percentiles(winPctByPlayer) {
  const entries = [...winPctByPlayer.entries()];
  const n = entries.length;
  const out = new Map();
  if (n === 0) return out;
  if (n === 1) {
    out.set(entries[0][0], 100);
    return out;
  }
  // Sort ascending by winPct.
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  // Average-rank for ties: group equal winPcts and assign the mean index.
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1][1] === sorted[i][1]) j++;
    const avgIndex = (i + j) / 2; // 0-based
    const pct = (avgIndex / (n - 1)) * 100;
    for (let k = i; k <= j; k++) out.set(sorted[k][0], pct);
    i = j + 1;
  }
  return out;
}

/**
 * Core aggregation. Returns per-player per-sport stats + percentiles and the
 * pairwise opponent ledger, which every board is derived from.
 */
function aggregate(rows) {
  // sport -> user_id -> { wins, gp }
  const bySport = new Map();
  // Group rows by game so we can pair opponents.
  const games = new Map(); // game_id -> { sport, parts: [row] }
  const sportsSeen = new Set();

  for (const r of rows) {
    sportsSeen.add(r.sport);
    if (!bySport.has(r.sport)) bySport.set(r.sport, new Map());
    const players = bySport.get(r.sport);
    if (!players.has(r.user_id)) players.set(r.user_id, { wins: 0, gp: 0 });
    const ps = players.get(r.user_id);
    ps.gp += 1;
    ps.wins += r.is_winner ? 1 : 0;

    if (!games.has(r.game_id)) games.set(r.game_id, { sport: r.sport, parts: [] });
    games.get(r.game_id).parts.push(r);
  }

  // Per-sport percentiles.
  const sportPercentiles = new Map(); // sport -> Map(user_id -> percentile)
  for (const [sport, players] of bySport) {
    const winPct = new Map();
    for (const [uid, s] of players) {
      if (s.gp >= MIN_GAMES_FOR_PERCENTILE) winPct.set(uid, s.wins / s.gp);
    }
    sportPercentiles.set(sport, percentiles(winPct));
  }

  // Player -> sport -> { percentile, wins, gp }
  const playerSports = new Map();
  for (const [sport, players] of bySport) {
    const pcts = sportPercentiles.get(sport);
    for (const [uid, s] of players) {
      if (!playerSports.has(uid)) playerSports.set(uid, new Map());
      playerSports.get(uid).set(sport, {
        percentile: pcts.has(uid) ? pcts.get(uid) : null,
        // Win rate (0..100) is the headline metric for the overview boards —
        // it's the number players actually understand. percentile is retained
        // for any field-normalized view but no longer drives the rankings.
        win_pct: s.gp > 0 ? (s.wins / s.gp) * 100 : null,
        wins: s.wins,
        gp: s.gp,
        losses: s.gp - s.wins,
      });
    }
  }

  // Pairwise opponent ledger: directed wins, keyed `${a}` -> `${b}` -> {wins, games, bySport}.
  // We store both directions for easy nemesis lookup.
  const ledger = new Map(); // a -> Map(b -> { aWins, games, bySport: Map(sport->{aWins,games}) })
  function bump(a, b, aWon, sport) {
    if (!ledger.has(a)) ledger.set(a, new Map());
    const m = ledger.get(a);
    if (!m.has(b)) m.set(b, { aWins: 0, games: 0, bySport: new Map() });
    const e = m.get(b);
    e.games += 1;
    e.aWins += aWon ? 1 : 0;
    if (!e.bySport.has(sport)) e.bySport.set(sport, { aWins: 0, games: 0 });
    const se = e.bySport.get(sport);
    se.games += 1;
    se.aWins += aWon ? 1 : 0;
  }
  for (const { sport, parts } of games.values()) {
    const t1 = parts.filter((p) => p.team === 1);
    const t2 = parts.filter((p) => p.team === 2);
    for (const a of t1) for (const b of t2) {
      bump(a.user_id, b.user_id, !!a.is_winner, sport);
      bump(b.user_id, a.user_id, !!b.is_winner, sport);
    }
  }

  return { bySport, sportPercentiles, playerSports, ledger, sports: [...sportsSeen] };
}

/** Average of a player's win % across the sports they've played. */
function avgWinPct(sportMap) {
  const vals = [...sportMap.values()].map((v) => v.win_pct).filter((p) => p != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Build every overview board from aggregated data.
 * `hydrate(user_id)` maps an id to display fields (injected so this stays
 * DB-free and testable).
 */
function buildOverview(agg, hydrate = (id) => ({ user_id: id })) {
  const { playerSports, sports } = agg;

  const rankings = [];        // house ranking by avg percentile
  const bestAtEverything = []; // by min percentile across ≥2 sports
  const jackOfAllTrades = [];  // most sports at ≥ baseline percentile
  const affinity = [];         // per player: sport they over-perform in

  for (const [uid, sportMap] of playerSports) {
    const played = [...sportMap.entries()]
      .filter(([, v]) => v.win_pct != null);
    const playedSports = played.map(([s]) => s);
    const avg = avgWinPct(sportMap);
    if (avg == null) continue;

    rankings.push({
      ...hydrate(uid),
      avg_win_pct: round1(avg),
      sports_played: playedSports.length,
      per_sport: Object.fromEntries(played.map(([s, v]) => [s, round1(v.win_pct)])),
    });

    // Best at everything: needs ≥2 sports; score = worst (min) win %.
    if (played.length >= 2) {
      const minPct = Math.min(...played.map(([, v]) => v.win_pct));
      bestAtEverything.push({ ...hydrate(uid), min_win_pct: round1(minPct), sports_played: played.length });
    }

    // Jack of all trades: count sports with a winning record (≥ baseline win %).
    const atBaseline = played.filter(([, v]) => v.win_pct >= BASELINE_WIN_PCT).length;
    if (atBaseline > 0) {
      jackOfAllTrades.push({ ...hydrate(uid), sports_at_baseline: atBaseline, sports_played: played.length, avg_win_pct: round1(avg) });
    }

    // Sport affinity: largest positive (win % - personal average win %).
    let best = null;
    for (const [s, v] of played) {
      const over = v.win_pct - avg;
      if (best == null || over > best.over) best = { sport: s, over, win_pct: v.win_pct };
    }
    if (best && played.length >= 2) {
      affinity.push({ ...hydrate(uid), sport: best.sport, win_pct: round1(best.win_pct), over_performance: round1(best.over) });
    }
  }

  rankings.sort((a, b) => b.avg_win_pct - a.avg_win_pct);
  rankings.forEach((r, i) => { r.rank = i + 1; });
  bestAtEverything.sort((a, b) => b.min_win_pct - a.min_win_pct);
  jackOfAllTrades.sort((a, b) => b.sports_at_baseline - a.sports_at_baseline || b.avg_win_pct - a.avg_win_pct);
  affinity.sort((a, b) => b.over_performance - a.over_performance);

  return { sports, rankings, best_at_everything: bestAtEverything, jack_of_all_trades: jackOfAllTrades, sport_affinity: affinity };
}

/** Cross-sport head-to-head between two players over the whole house. */
function buildH2H(agg, p1, p2, hydrate = (id) => ({ user_id: id })) {
  const m = agg.ledger.get(p1);
  const e = m && m.get(p2);
  const bySport = {};
  let p1Wins = 0, games = 0;
  if (e) {
    games = e.games;
    p1Wins = e.aWins;
    for (const [sport, se] of e.bySport) {
      bySport[sport] = { p1_wins: se.aWins, p2_wins: se.games - se.aWins, games: se.games };
    }
  }
  return {
    player1: hydrate(p1),
    player2: hydrate(p2),
    games,
    p1_wins: p1Wins,
    p2_wins: games - p1Wins,
    by_sport: bySport,
  };
}

/** A player's nemesis: the opponent they have the worst record against. */
function buildNemesis(agg, userId, hydrate = (id) => ({ user_id: id })) {
  const m = agg.ledger.get(userId);
  if (!m) return null;
  let worst = null;
  for (const [opp, e] of m) {
    if (e.games < MIN_MEETINGS_FOR_NEMESIS) continue;
    const winRate = e.aWins / e.games; // user's win rate vs this opponent
    if (worst == null || winRate < worst.winRate ||
        (winRate === worst.winRate && e.games > worst.games)) {
      worst = { opp, winRate, games: e.games, aWins: e.aWins };
    }
  }
  if (!worst) return null;
  const bySport = {};
  for (const [sport, se] of m.get(worst.opp).bySport) {
    bySport[sport] = { wins: se.aWins, losses: se.games - se.aWins, games: se.games };
  }
  return {
    player: hydrate(userId),
    nemesis: hydrate(worst.opp),
    games: worst.games,
    wins: worst.aWins,
    losses: worst.games - worst.aWins,
    win_rate: round1(worst.winRate * 100),
    by_sport: bySport,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = {
  aggregate,
  buildOverview,
  buildH2H,
  buildNemesis,
  percentiles,
  MIN_GAMES_FOR_PERCENTILE,
  BASELINE_WIN_PCT,
  MIN_MEETINGS_FOR_NEMESIS,
};
