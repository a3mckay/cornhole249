/**
 * CSV data export routes — all Pro-gated via mountLeaguePro in index.js.
 *
 * GET /api/l/:slug/export/standings  — rank, name, W, L, games, win%, avg +/-
 * GET /api/l/:slug/export/games      — full game log
 * GET /api/l/:slug/export/players    — roster with contact info + stats
 * GET /api/l/:slug/export/stats      — per-player stat summary
 */

const express = require('express');
const router = express.Router();
const { getDb, sql } = require('../db');

// ── CSV helpers ──────────────────────────────────────────────────────────────

function escapeCSVField(val) {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCSV(rows, columns) {
  const header = columns.map((c) => escapeCSVField(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCSVField(row[c.key])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

function sendCSV(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// ── GET /standings ───────────────────────────────────────────────────────────

router.get('/standings', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT
        u.display_name                                              AS name,
        COUNT(*) FILTER (WHERE gp.is_winner)                        AS wins,
        COUNT(*) FILTER (WHERE NOT gp.is_winner)                    AS losses,
        COUNT(*)                                                     AS games,
        ROUND(100.0 * COUNT(*) FILTER (WHERE gp.is_winner)
              / NULLIF(COUNT(*), 0), 1)                             AS win_pct,
        ROUND(AVG(gp.score - opp.opp_score), 1)                    AS avg_diff
      FROM game_participants gp
      JOIN games g  ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
      JOIN users u  ON gp.user_id  = u.id
      JOIN (
        SELECT game_id, team, MAX(score) AS opp_score
        FROM game_participants GROUP BY game_id, team
      ) opp ON opp.game_id = gp.game_id AND opp.team != gp.team
      GROUP BY u.id, u.display_name
      ORDER BY wins DESC, losses ASC
    `.execute(db);

    const data = rows.map((r, i) => ({
      rank:     i + 1,
      name:     r.name,
      wins:     parseInt(r.wins),
      losses:   parseInt(r.losses),
      games:    parseInt(r.games),
      win_pct:  r.win_pct != null ? `${r.win_pct}%` : '0%',
      avg_diff: r.avg_diff != null ? parseFloat(r.avg_diff).toFixed(1) : '0.0',
    }));

    sendCSV(res, 'standings.csv', toCSV(data, [
      { key: 'rank',     label: 'Rank' },
      { key: 'name',     label: 'Name' },
      { key: 'wins',     label: 'W' },
      { key: 'losses',   label: 'L' },
      { key: 'games',    label: 'GP' },
      { key: 'win_pct',  label: 'Win%' },
      { key: 'avg_diff', label: 'Avg +/-' },
    ]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /games ───────────────────────────────────────────────────────────────

router.get('/games', async (req, res) => {
  try {
    const db = getDb();

    const [{ rows: games }, { rows: participants }] = await Promise.all([
      sql`
        SELECT g.id, g.played_at, g.game_type, g.score_team1, g.score_team2,
               v.name AS venue_name
        FROM games g
        LEFT JOIN venues v ON g.venue_id = v.id
        WHERE g.league_id = ${req.leagueId}
        ORDER BY g.played_at DESC
      `.execute(db),
      sql`
        SELECT gp.game_id, gp.team, gp.is_winner, u.display_name
        FROM game_participants gp
        JOIN users u ON gp.user_id = u.id
        JOIN games g  ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
      `.execute(db),
    ]);

    // Group participants by game
    const byGame = {};
    for (const p of participants) {
      if (!byGame[p.game_id]) byGame[p.game_id] = { team1: [], team2: [], winner_team: null };
      if (p.team === 1) {
        byGame[p.game_id].team1.push(p.display_name);
        if (p.is_winner) byGame[p.game_id].winner_team = 1;
      } else {
        byGame[p.game_id].team2.push(p.display_name);
        if (p.is_winner) byGame[p.game_id].winner_team = 2;
      }
    }

    const data = games.map((g) => {
      const gd = byGame[g.id] || { team1: [], team2: [], winner_team: null };
      const team1Name = gd.team1.join(' & ');
      const team2Name = gd.team2.join(' & ');
      return {
        date:    new Date(g.played_at).toLocaleDateString('en-CA'),
        format:  g.game_type === '2v2' ? '2v2' : '1v1',
        team1:   team1Name,
        score1:  g.score_team1 ?? '',
        score2:  g.score_team2 ?? '',
        team2:   team2Name,
        venue:   g.venue_name || '',
        winner:  gd.winner_team === 1 ? team1Name : gd.winner_team === 2 ? team2Name : '',
      };
    });

    sendCSV(res, 'games.csv', toCSV(data, [
      { key: 'date',   label: 'Date' },
      { key: 'format', label: 'Format' },
      { key: 'team1',  label: 'Team 1' },
      { key: 'score1', label: 'Score 1' },
      { key: 'score2', label: 'Score 2' },
      { key: 'team2',  label: 'Team 2' },
      { key: 'venue',  label: 'Venue' },
      { key: 'winner', label: 'Winner' },
    ]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /players ─────────────────────────────────────────────────────────────

router.get('/players', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT
        u.display_name                                              AS name,
        u.email,
        lm.role,
        lm.joined_at,
        COUNT(*) FILTER (WHERE gp.is_winner)                        AS wins,
        COUNT(*) FILTER (WHERE gp.is_winner = false)                AS losses
      FROM league_memberships lm
      JOIN users u ON lm.user_id = u.id
      LEFT JOIN game_participants gp ON gp.user_id = u.id
        AND gp.game_id IN (SELECT id FROM games WHERE league_id = ${req.leagueId})
      WHERE lm.league_id = ${req.leagueId}
      GROUP BY u.id, u.display_name, u.email, lm.role, lm.joined_at
      ORDER BY lm.joined_at ASC
    `.execute(db);

    const data = rows.map((r) => {
      const w = parseInt(r.wins) || 0;
      const l = parseInt(r.losses) || 0;
      return {
        name:     r.name,
        email:    r.email || '',
        role:     r.role,
        joined:   new Date(r.joined_at).toLocaleDateString('en-CA'),
        wins:     w,
        losses:   l,
        win_pct:  w + l > 0 ? `${Math.round(100 * w / (w + l))}%` : 'N/A',
      };
    });

    sendCSV(res, 'players.csv', toCSV(data, [
      { key: 'name',    label: 'Name' },
      { key: 'email',   label: 'Email' },
      { key: 'role',    label: 'Role' },
      { key: 'joined',  label: 'Joined' },
      { key: 'wins',    label: 'W' },
      { key: 'losses',  label: 'L' },
      { key: 'win_pct', label: 'Win%' },
    ]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /stats ───────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await sql`
      SELECT
        u.display_name                                              AS name,
        COUNT(*) FILTER (WHERE gp.is_winner)                        AS wins,
        COUNT(*) FILTER (WHERE NOT gp.is_winner)                    AS losses,
        COUNT(*)                                                     AS games,
        ROUND(100.0 * COUNT(*) FILTER (WHERE gp.is_winner)
              / NULLIF(COUNT(*), 0), 1)                             AS win_pct,
        ROUND(AVG(gp.score - opp.opp_score), 1)                    AS avg_diff
      FROM game_participants gp
      JOIN games g  ON gp.game_id = g.id AND g.league_id = ${req.leagueId}
      JOIN users u  ON gp.user_id  = u.id
      JOIN (
        SELECT game_id, team, MAX(score) AS opp_score
        FROM game_participants GROUP BY game_id, team
      ) opp ON opp.game_id = gp.game_id AND opp.team != gp.team
      GROUP BY u.id, u.display_name
      ORDER BY u.display_name ASC
    `.execute(db);

    const data = rows.map((r) => ({
      name:     r.name,
      wins:     parseInt(r.wins),
      losses:   parseInt(r.losses),
      games:    parseInt(r.games),
      win_pct:  r.win_pct != null ? `${r.win_pct}%` : '0%',
      avg_diff: r.avg_diff != null ? parseFloat(r.avg_diff).toFixed(1) : '0.0',
    }));

    sendCSV(res, 'stats.csv', toCSV(data, [
      { key: 'name',     label: 'Name' },
      { key: 'wins',     label: 'W' },
      { key: 'losses',   label: 'L' },
      { key: 'games',    label: 'GP' },
      { key: 'win_pct',  label: 'Win%' },
      { key: 'avg_diff', label: 'Avg +/-' },
    ]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
