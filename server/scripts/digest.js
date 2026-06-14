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
const Anthropic               = require('@anthropic-ai/sdk');

// ── Week-label helper ─────────────────────────────────────────────────────────
// Digest runs Monday 08:00. "This week" = the 7 days just completed (Mon–Sun).
function weekLabel() {
  const now = new Date();
  const sun = new Date(now.getTime() - 24 * 60 * 60 * 1000);         // yesterday = Sunday
  const mon = new Date(sun.getTime() - 6 * 24 * 60 * 60 * 1000);     // Monday before that
  const fmt = (d) => d.toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  return `${fmt(mon)} – ${fmt(sun)}`;
}

// ── LLM copy generator ────────────────────────────────────────────────────────
// Generates one preheader + intro paragraph per league (not per recipient).
// Falls back gracefully if ANTHROPIC_API_KEY is missing or the call fails.
async function generateLeagueCopy({ leagueName, games, highlights, weekLabel }) {
  if (!process.env.ANTHROPIC_API_KEY) return { preheader: null, intro: null };

  const { streakLeader, biggestMargin, topPlayer, topWins } = highlights;
  const bullets = [];
  if (streakLeader && streakLeader.streak >= 2) {
    bullets.push(`${streakLeader.name} is on a ${streakLeader.streak}-game win streak`);
  }
  if (topPlayer && topWins >= 2) {
    bullets.push(`${topPlayer.name} went ${topWins}-${games.length - topWins > 0 ? games.length - topWins : 0} this week`);
  }
  if (biggestMargin && biggestMargin.margin >= 5) {
    const winName = biggestMargin.winners.map((p) => p.nickname || p.display_name).join(' & ');
    bullets.push(`${winName} dominated with a ${biggestMargin.winScore}–${biggestMargin.loseScore} win`);
  }
  bullets.push(`${games.length} game${games.length !== 1 ? 's' : ''} played this week`);

  const contextStr = bullets.map((b) => `- ${b}`).join('\n');

  try {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are writing copy for a weekly cornhole league email digest.

League: ${leagueName}
Week: ${weekLabel}
Highlights:
${contextStr}

Write two things:
1. PREHEADER: A punchy ~90-character inbox preview line. Competitive, fun tone. No emoji. No "Weekly Digest". Use just the nickname portion of any name given (e.g. "The Inevitable", not 'Andrew "The Inevitable"').
2. INTRO: One or two short sentences (max 40 words total). Energetic, trash-talk-friendly. Can use 1-2 emojis. Reference a specific highlight. Use the FULL name format provided (e.g., Andrew "The Inevitable").

Reply in this exact format (nothing else):
PREHEADER: <text>
INTRO: <text>`,
      }],
    });

    const text = msg.content[0]?.text || '';
    const preheaderMatch = text.match(/^PREHEADER:\s*(.+)$/m);
    const introMatch     = text.match(/^INTRO:\s*(.+(?:\n.+)?)$/m);

    return {
      preheader: preheaderMatch ? preheaderMatch[1].trim() : null,
      intro:     introMatch     ? introMatch[1].trim()     : null,
    };
  } catch (err) {
    console.warn('[digest] LLM copy generation failed:', err.message);
    return { preheader: null, intro: null };
  }
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
  const playerNames = new Map(); // uid → { display_name, nickname }
  let biggestMargin = null;

  // Returns "Display Name" or 'Display Name "Nickname"' for use in email copy
  function fullLabel(uid) {
    const p = playerNames.get(uid);
    if (!p) return 'Unknown';
    return p.nickname ? `${p.display_name} “${p.nickname}”` : p.display_name;
  }

  for (const game of games) {
    const t1 = game.teams[1] || [];
    const t2 = game.teams[2] || [];
    if (!t1.length || !t2.length) continue;

    // Track names and weekly wins
    for (const team of [t1, t2]) {
      for (const p of team) {
        playerNames.set(p.user_id, { display_name: p.display_name, nickname: p.nickname });
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
      topPlayer = { user_id: uid, name: fullLabel(uid), wins };
    }
  }

  // Active win streak leader (query last 20 games per player who played this week)
  let streakLeader = null;
  let maxStreak    = 0;
  for (const uid of playerWins.keys()) {
    const streak = await getActiveStreak(uid, league.id, db);
    if (streak > maxStreak) {
      maxStreak    = streak;
      streakLeader = { user_id: uid, name: fullLabel(uid), streak };
    }
  }

  // ── 4. Standings — 1v1 top 5 and 2v2 top 5 ──────────────────────────────
  async function standingsFor(gameType) {
    const { rows } = await sql`
      SELECT
        gp.user_id,
        u.display_name,
        COUNT(*)                          AS gp,
        SUM(gp.is_winner::int)            AS wins,
        COUNT(*) - SUM(gp.is_winner::int) AS losses
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      JOIN users u ON gp.user_id = u.id
      WHERE g.league_id = ${league.id}
        AND g.game_type = ${gameType}
      GROUP BY gp.user_id, u.display_name
      HAVING COUNT(*) >= 1
      ORDER BY SUM(gp.is_winner::int) DESC, COUNT(*) DESC
      LIMIT 5
    `.execute(db);
    return rows.map((r, i) => ({
      rank:    i + 1,
      name:    r.display_name,
      wins:    Number(r.wins),
      losses:  Number(r.losses),
      gp:      Number(r.gp),
      win_pct: Number(r.gp) > 0 ? Math.round((Number(r.wins) / Number(r.gp)) * 100) : 0,
    }));
  }

  const [standings1v1, standings2v2] = await Promise.all([
    standingsFor('1v1'),
    standingsFor('2v2'),
  ]);

  // ── 5. LLM-generated copy (once per league) ──────────────────────────────
  const { preheader, intro } = await generateLeagueCopy({
    leagueName: league.name,
    games,
    highlights: { streakLeader, biggestMargin, topPlayer, topWins },
    weekLabel:  label,
  });

  // ── 6. Eligible recipients ────────────────────────────────────────────────
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

  // ── 7. Send ───────────────────────────────────────────────────────────────
  for (const member of members) {
    try {
      await sendDigestEmail({
        to:        member.email,
        name:      member.display_name,
        userId:    member.id,
        league,
        games,
        highlights: { streakLeader, biggestMargin, topPlayer, topWins },
        standings1v1,
        standings2v2,
        preheader,
        intro,
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
