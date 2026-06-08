#!/usr/bin/env node
/**
 * Weekly digest mailer.
 *
 * Run via Railway Cron service — create a separate "Cron" service in Railway
 * pointing to the same repo, with:
 *   Start command:  node server/scripts/digest.js
 *   Cron schedule:  0 13 * * 1
 *   Timezone env:   TZ=America/Toronto  (makes 13:00 UTC → 08:00 ET)
 *
 * What it does:
 *   1. Finds all active Pro leagues.
 *   2. For each league, loads games played in the past 7 days.
 *   3. Skips the league if no games were logged (quiet week).
 *   4. Computes highlights: active win streak leader, biggest win margin,
 *      player of the week (most wins).
 *   5. Queries current overall standings (top 10 by wins).
 *   6. Sends a digest email to every league member with a verified email
 *      who hasn't unsubscribed.
 *
 * Required env vars (same as the web server):
 *   DATABASE_URL, GMAIL_USER, GMAIL_APP_PASS, APP_URL, JWT_SECRET
 *   DIGEST_ADDRESS — physical mailing address for CAN-SPAM/CASL footer
 *                    e.g. "Hamilton, ON, Canada"
 */

// Force IPv4 DNS resolution — Railway containers lack IPv6 routing and
// Nodemailer's smtp.gmail.com lookup otherwise resolves to an IPv6 address.
require('dns').setDefaultResultOrder('ipv4first');

require('../instrument'); // Sentry init + dotenv
const { getDb, runMigrations, sql } = require('../db');
const { isPro }               = require('../lib/plan');
const { sendDigestEmail }     = require('../lib/email');

// ── Week-label helper ─────────────────────────────────────────────────────────
// Digest runs Monday 08:00. "This week" = the 7 days just completed (Mon–Sun).
function weekLabel() {
  const now    = new Date();
  const sun    = new Date(now); sun.setDate(now.getDate() - 1);   // yesterday = Sunday
  const mon    = new Date(sun); mon.setDate(sun.getDate() - 6);   // Monday before that
  const fmt    = (d) => d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

// ── Streak helper ─────────────────────────────────────────────────────────────
async function getActiveStreak(userId, leagueId, db) {
  const { rows } = await sql`
    SELECT gp.is_winner
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    WHERE gp.user_id = ${userId} AND g.league_id = ${leagueId}
    ORDER BY g.played_at DESC LIMIT 20
  `.execute(db);
  if (!rows.length || !rows[0].is_winner) return 0;
  let count = 0;
  for (const r of rows) {
    if (r.is_winner) count++; else break;
  }
  return count;
}

// ── Player display name helper ────────────────────────────────────────────────
function playerLabel(players) {
  return players.map((p) => p.nickname || p.display_name).join(' & ');
}

// ── Process one league ────────────────────────────────────────────────────────
async function processLeague(league, db, label) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // ── 1. This week's game participants ──────────────────────────────────────
  const { rows: parts } = await sql`
    SELECT
      g.id          AS game_id,
      g.played_at,
      g.game_type,
      gp.user_id,
      gp.team,
      gp.score,
      gp.is_winner,
      u.display_name,
      u.nickname
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    JOIN users u ON gp.user_id = u.id
    WHERE g.league_id = ${league.id}
      AND g.played_at >= ${since}
    ORDER BY g.played_at DESC, g.id, gp.team, gp.user_id
  `.execute(db);

  if (!parts.length) {
    console.log(`[digest] ${league.slug}: quiet week — skipping`);
    return;
  }

  // ── 2. Assemble games from flat participant rows ───────────────────────────
  const gameMap = new Map();
  for (const p of parts) {
    if (!gameMap.has(p.game_id)) {
      gameMap.set(p.game_id, {
        id: p.game_id,
        played_at: p.played_at,
        game_type: p.game_type,
        teams: { 1: [], 2: [] },
      });
    }
    const g = gameMap.get(p.game_id);
    g.teams[p.team].push({
      user_id:      p.user_id,
      display_name: p.display_name,
      nickname:     p.nickname,
      score:        Number(p.score),
      is_winner:    p.is_winner,
    });
  }
  const games = [...gameMap.values()];

  // ── 3. Highlights ─────────────────────────────────────────────────────────
  const playerWins  = new Map(); // uid → wins this week
  const playerNames = new Map(); // uid → display name
  let biggestMargin = null;

  for (const game of games) {
    const t1 = game.teams[1] || [];
    const t2 = game.teams[2] || [];
    if (!t1.length || !t2.length) continue;

    // Track names and weekly wins
    for (const team of [t1, t2]) {
      for (const p of team) {
        playerNames.set(p.user_id, p.nickname || p.display_name);
        if (!playerWins.has(p.user_id)) playerWins.set(p.user_id, 0);
        if (p.is_winner) playerWins.set(p.user_id, playerWins.get(p.user_id) + 1);
      }
    }

    // Biggest margin
    const score1  = t1.reduce((s, p) => s + p.score, 0);
    const score2  = t2.reduce((s, p) => s + p.score, 0);
    const margin  = Math.abs(score1 - score2);
    const winners = score1 >= score2 ? t1 : t2;
    const losers  = score1 >= score2 ? t2 : t1;
    if (!biggestMargin || margin > biggestMargin.margin) {
      biggestMargin = {
        margin,
        winScore: Math.max(score1, score2),
        loseScore: Math.min(score1, score2),
        winners,
        losers,
        played_at: game.played_at,
      };
    }
  }

  // Top player this week (most wins)
  let topPlayer = null;
  let topWins   = 0;
  for (const [uid, wins] of playerWins) {
    if (wins > topWins) {
      topWins   = wins;
      topPlayer = { user_id: uid, name: playerNames.get(uid), wins };
    }
  }

  // Active win streak leader (query last 20 games per player who played this week)
  let streakLeader = null;
  let maxStreak    = 0;
  for (const uid of playerWins.keys()) {
    const streak = await getActiveStreak(uid, league.id, db);
    if (streak > maxStreak) {
      maxStreak    = streak;
      streakLeader = { user_id: uid, name: playerNames.get(uid), streak };
    }
  }

  // ── 4. Overall standings (top 10 by wins) ────────────────────────────────
  const { rows: standingRows } = await sql`
    SELECT
      gp.user_id,
      u.display_name,
      u.nickname,
      COUNT(*)                       AS gp,
      SUM(gp.is_winner::int)         AS wins,
      COUNT(*) - SUM(gp.is_winner::int) AS losses
    FROM game_participants gp
    JOIN games g ON gp.game_id = g.id
    JOIN users u ON gp.user_id = u.id
    WHERE g.league_id = ${league.id}
    GROUP BY gp.user_id, u.display_name, u.nickname
    HAVING COUNT(*) >= 1
    ORDER BY SUM(gp.is_winner::int) DESC, COUNT(*) DESC
    LIMIT 10
  `.execute(db);

  const standings = standingRows.map((r, i) => ({
    rank:    i + 1,
    name:    r.nickname || r.display_name,
    wins:    Number(r.wins),
    losses:  Number(r.losses),
    gp:      Number(r.gp),
    win_pct: Number(r.gp) > 0 ? Math.round((Number(r.wins) / Number(r.gp)) * 100) : 0,
  }));

  // ── 5. Eligible recipients ────────────────────────────────────────────────
  const { rows: members } = await sql`
    SELECT u.id, u.email, u.display_name, u.nickname
    FROM league_memberships lm
    JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ${league.id}
      AND u.email IS NOT NULL
      AND u.email_verified_at IS NOT NULL
      AND u.digest_unsubscribed_at IS NULL
  `.execute(db);

  if (!members.length) {
    console.log(`[digest] ${league.slug}: no eligible recipients`);
    return;
  }

  console.log(`[digest] ${league.slug}: ${games.length} game(s), sending to ${members.length} recipient(s)`);

  // ── 6. Send ───────────────────────────────────────────────────────────────
  for (const member of members) {
    try {
      await sendDigestEmail({
        to:        member.email,
        name:      member.nickname || member.display_name,
        userId:    member.id,
        league,
        games,
        highlights: { streakLeader, biggestMargin, topPlayer, topWins },
        standings,
        weekLabel: label,
      });
    } catch (err) {
      console.error(`[digest] Failed to send to ${member.email}:`, err.message);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await runMigrations();
  const db    = getDb();
  const label = weekLabel();

  console.log(`[digest] Running weekly digest — ${label}`);

  // Find all leagues that might be Pro (exclude definitely-free ones with no override)
  const { rows: candidates } = await sql`
    SELECT id, slug, name, plan, plan_override,
           stripe_subscription_id, stripe_current_period_end
    FROM leagues
    WHERE plan != 'free' OR plan_override IS NOT NULL
  `.execute(db);

  const proLeagues = candidates.filter(isPro);
  console.log(`[digest] ${proLeagues.length} active Pro league(s)`);

  for (const league of proLeagues) {
    try {
      await processLeague(league, db, label);
    } catch (err) {
      console.error(`[digest] Error processing ${league.slug}:`, err);
    }
  }

  console.log('[digest] Done');
  process.exit(0);
}

main().catch((err) => {
  console.error('[digest] Fatal error:', err);
  process.exit(1);
});
