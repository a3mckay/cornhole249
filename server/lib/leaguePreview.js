const { sql } = require('../db');

const MEMBER_LIMIT = 8;

async function leaguePreview(db, leagueId) {
  const year = new Date().getFullYear();

  const league = await db
    .selectFrom('leagues')
    .selectAll()
    .where('id', '=', leagueId)
    .executeTakeFirst();
  if (!league) return null;

  const memberAvatars = await db
    .selectFrom('users')
    .innerJoin('league_memberships', (j) =>
      j.onRef('league_memberships.user_id', '=', 'users.id')
       .on('league_memberships.league_id', '=', leagueId)
    )
    .select(['users.display_name', 'users.avatar_url'])
    .orderBy('users.created_at')
    .limit(12)
    .execute();

  const { rows: countRows } = await sql`
    SELECT COUNT(*) as n FROM league_memberships WHERE league_id = ${leagueId}
  `.execute(db);
  const memberCount = parseInt(countRows[0].n);

  const { rows: top3Rows } = await sql`
    SELECT
      gp.user_id,
      u.display_name,
      u.avatar_url,
      COUNT(*) as gp,
      SUM(gp.is_winner) as wins,
      COUNT(*) - SUM(gp.is_winner) as losses
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
      AND g.game_type = '1v1'
      AND g.season = ${year}
      AND g.league_id = ${leagueId}
    JOIN users u ON gp.user_id = u.id
    GROUP BY gp.user_id, u.display_name, u.avatar_url
    ORDER BY SUM(gp.is_winner) * 2 DESC,
             SUM(gp.is_winner) * 1.0 / COUNT(*) DESC
    LIMIT 3
  `.execute(db);

  const top3 = top3Rows.map((r, i) => ({
    rank: i + 1,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    wins: parseInt(r.wins),
    losses: parseInt(r.losses),
    win_pct: parseInt(r.gp) > 0
      ? Math.round((parseInt(r.wins) / parseInt(r.gp)) * 1000) / 10
      : 0,
  }));

  const { rows: recentGames } = await sql`
    SELECT g.id, g.game_type, g.played_at, v.name as venue_name
    FROM games g
    LEFT JOIN venues v ON g.venue_id = v.id
    WHERE g.league_id = ${leagueId}
    ORDER BY g.played_at DESC
    LIMIT 3
  `.execute(db);

  const hydratedGames = await Promise.all(
    recentGames.map(async (g) => {
      const { rows: participants } = await sql`
        SELECT gp.team, gp.score, gp.is_winner, u.display_name, u.avatar_url
        FROM game_participants gp
        JOIN users u ON gp.user_id = u.id
        WHERE gp.game_id = ${g.id}
        ORDER BY gp.team
      `.execute(db);
      const team1 = participants.filter((p) => p.team === 1);
      const team2 = participants.filter((p) => p.team === 2);
      return {
        id: g.id,
        game_type: g.game_type,
        played_at: g.played_at,
        venue_name: g.venue_name,
        team1: team1.map((p) => ({ display_name: p.display_name, avatar_url: p.avatar_url })),
        team2: team2.map((p) => ({ display_name: p.display_name, avatar_url: p.avatar_url })),
        score1: team1[0]?.score ?? null,
        score2: team2[0]?.score ?? null,
        winner_team: team1[0]?.is_winner ? 1 : team2[0]?.is_winner ? 2 : null,
      };
    })
  );

  return {
    league_id: league.id,
    league_name: league.name,
    league_slug: league.slug,
    tagline: league.tagline,
    is_public: !!league.is_public,
    member_count: memberCount,
    member_limit: league.plan === 'free' ? MEMBER_LIMIT : null,
    is_full: league.plan === 'free' && memberCount >= MEMBER_LIMIT,
    member_avatars: memberAvatars,
    top3,
    recent_games: hydratedGames,
  };
}

module.exports = { leaguePreview };
