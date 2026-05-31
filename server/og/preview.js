// Render every card type to /tmp/og-samples/ for visual review.
// Run with: node server/og/preview.js

const fs = require('fs');
const path = require('path');
const os = require('os');
const { render } = require('./render');
const {
  gameCard,
  playerCard,
  standingsCard,
  tournamentOverviewCard,
  tournamentMatchCard,
  fallbackCard,
} = require('./templates');

const outDir = path.join(os.tmpdir(), 'og-samples');
fs.mkdirSync(outDir, { recursive: true });

async function save(name, node) {
  const png = await render(node);
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, png);
  console.log(`  ${name}.png  (${(png.length / 1024).toFixed(0)} KB)  →  ${file}`);
}

// team1/team2 are now arrays of {name, avatarUrl} — avatarUrl null uses initials.
(async () => {
  console.log(`Rendering OG samples to: ${outDir}\n`);

  // ── 1v1 game card ─────────────────────────────────────────────────────────
  await save(
    '01-game-1v1',
    gameCard({
      game_type: '1v1',
      league_name: 'Cornhole249',
      played_at: '2026-05-04T22:30:00Z',
      team1: [{ name: 'Andrew McKay', avatarUrl: null }],
      team2: [{ name: 'Wiggz', avatarUrl: null }],
      t1Score: 10,
      t2Score: 7,
      venue: '249 Park',
      weather: { emoji: '☀️', temp_c: 21, condition: 'Clear' },
    })
  );

  // ── 2v2 game card ─────────────────────────────────────────────────────────
  await save(
    '02-game-2v2',
    gameCard({
      game_type: '2v2',
      league_name: 'Steve\'s Last Stand',
      played_at: '2026-05-04T22:30:00Z',
      team1: [{ name: 'Andrew', avatarUrl: null }, { name: 'Dave', avatarUrl: null }],
      team2: [{ name: 'Wiggz', avatarUrl: null }, { name: 'Alex', avatarUrl: null }],
      t1Score: 9,
      t2Score: 10,
      venue: '249 Park',
      weather: { emoji: '⛅', temp_c: 18, condition: 'Partly Cloudy' },
    })
  );

  // ── Player card (heater) ──────────────────────────────────────────────────
  await save(
    '03-player-heater',
    playerCard({
      display_name: 'Andrew McKay',
      nickname: 'The Inevitable',
      avatar_url: null,
      gp: 41,
      wins: 28,
      losses: 13,
      win_pct: 68.3,
      plus_minus: 85,
      streak: 'W5',
      rank_1v1: 1,
      rank_2v2: 3,
    })
  );

  // ── Player card (cold streak) ─────────────────────────────────────────────
  await save(
    '04-player-cold',
    playerCard({
      display_name: 'Dave',
      nickname: 'The Underdog',
      avatar_url: null,
      gp: 12,
      wins: 3,
      losses: 9,
      win_pct: 25.0,
      plus_minus: -42,
      streak: 'L4',
      rank_1v1: 8,
      rank_2v2: 5,
    })
  );

  // ── Standings card ────────────────────────────────────────────────────────
  await save(
    '05-standings',
    standingsCard({
      league_name: 'Cornhole249',
      period_label: 'Standings · Season 2026',
      rows: [
        { display_name: 'Andrew McKay', avatar_url: null, gp: 41, wins: 28, losses: 13, pts: 56, win_pct: 68.3, plus_minus: 85, streak: 'W5' },
        { display_name: 'Wiggz',        avatar_url: null, gp: 36, wins: 22, losses: 14, pts: 44, win_pct: 61.1, plus_minus: 42, streak: 'L1' },
        { display_name: 'Dave',         avatar_url: null, gp: 37, wins: 18, losses: 19, pts: 36, win_pct: 48.6, plus_minus: -8, streak: 'W2' },
        { display_name: 'Alex',         avatar_url: null, gp: 32, wins: 14, losses: 18, pts: 28, win_pct: 43.8, plus_minus: -22, streak: 'L3' },
        { display_name: 'Matt',         avatar_url: null, gp: 32, wins: 10, losses: 22, pts: 20, win_pct: 31.3, plus_minus: -64, streak: 'L4' },
      ],
    })
  );

  // ── Tournament overview (in-progress, 8 teams, 1v1) ───────────────────────
  await save(
    '06-tournament-overview',
    tournamentOverviewCard({
      name: "Steve's Last Stand",
      game_type: '1v1',
      format: 'single_elim',
      status: 'in_progress',
      teams_count: 8,
      rounds: [
        [
          { team1: { name: 'Andrew', score: 10, won: true },  team2: { name: 'Steve',  score: 6 } },
          { team1: { name: 'Wiggz',  score: 7 },               team2: { name: 'Cat',    score: 10, won: true } },
          { team1: { name: 'Dave',   score: 10, won: true },  team2: { name: 'Joe',    score: 8 } },
          { team1: { name: 'Alex',   score: 9 },               team2: { name: 'Matt',   score: 10, won: true } },
        ],
        [
          { team1: { name: 'Andrew', score: 10, won: true },  team2: { name: 'Cat',    score: 7 } },
          null,
        ],
        [null],
      ],
    })
  );

  // ── Tournament overview (complete, champion crowned) ──────────────────────
  await save(
    '07-tournament-complete',
    tournamentOverviewCard({
      name: 'Cornhole249 — Summer Cup',
      game_type: '2v2',
      format: 'single_elim',
      status: 'complete',
      teams_count: 4,
      rounds: [
        [
          { team1: { name: 'Andrew & Dave', score: 10, won: true }, team2: { name: 'Steve & Joe',  score: 4 } },
          { team1: { name: 'Wiggz & Alex',  score: 7 },              team2: { name: 'Cat & Matt',   score: 10, won: true } },
        ],
        [
          { team1: { name: 'Andrew & Dave', score: 10, won: true }, team2: { name: 'Cat & Matt',   score: 8 } },
        ],
      ],
    })
  );

  // ── Tournament match card (semifinal upset) ───────────────────────────────
  await save(
    '08-tournament-match',
    tournamentMatchCard({
      tournament_name: "Steve's Last Stand",
      round_label: 'Semifinal',
      game_type: '1v1',
      team1: [{ name: 'Andrew', avatarUrl: null }],
      team2: [{ name: 'Cat', avatarUrl: null }],
      t1Score: 10,
      t2Score: 7,
    })
  );

  // ── Fallback card ─────────────────────────────────────────────────────────
  await save('09-fallback', fallbackCard());

  console.log('\nOpen with:  open ' + outDir);
})().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
