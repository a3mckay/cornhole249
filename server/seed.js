require('dotenv').config();
const { runMigrations, getDb } = require('./db');
const { recalculateAllElos } = require('./lib/elo');
const { awardAchievement } = require('./lib/achievements');

const PLAYERS = [
  { display_name: 'Andrew', nickname: 'The Cannon', is_admin: 1 },
  { display_name: 'Jordan', nickname: 'Swish', is_admin: 0 },
  { display_name: 'Marcus', nickname: 'The Wall', is_admin: 0 },
  { display_name: 'Priya', nickname: 'Precision', is_admin: 0 },
  { display_name: 'Tyler', nickname: 'Chaos', is_admin: 0 },
  { display_name: 'Keisha', nickname: 'Clutch', is_admin: 0 },
  { display_name: 'Liam', nickname: 'Lucky', is_admin: 0 },
  { display_name: 'Sofia', nickname: 'The Surgeon', is_admin: 0 },
  { display_name: 'Derek', nickname: 'D-Money', is_admin: 0 },
  { display_name: 'Natalie', nickname: 'Ice', is_admin: 0 },
];

const VENUES = [
  { name: "Andrew's Backyard", lat: 43.2557, lng: -79.8711 },
  { name: 'Riverside Park', lat: 43.2630, lng: -79.8800 },
  { name: "Jordan's Place", lat: 43.2490, lng: -79.8650 },
];

const WEATHER_OPTIONS = [
  { condition: 'Clear', weather_code: 0, temp_c: 26, wind_kph: 10, precipitation_mm: 0 },
  { condition: 'Clear', weather_code: 1, temp_c: 24, wind_kph: 12, precipitation_mm: 0 },
  { condition: 'Partly Cloudy', weather_code: 2, temp_c: 21, wind_kph: 15, precipitation_mm: 0 },
  { condition: 'Overcast', weather_code: 3, temp_c: 18, wind_kph: 18, precipitation_mm: 0 },
  { condition: 'Rain', weather_code: 61, temp_c: 14, wind_kph: 22, precipitation_mm: 4 },
  { condition: 'Drizzle', weather_code: 51, temp_c: 16, wind_kph: 14, precipitation_mm: 1.5 },
  { condition: 'Heavy Rain', weather_code: 65, temp_c: 12, wind_kph: 30, precipitation_mm: 12 },
];

const TRASH_TALK = [
  "Not even close 😂",
  "Lucky bounce and you know it",
  "Rematch tmrw, this isn't over",
  "Unreal shot, respect",
  "Congrats I guess 🙄",
  "That's 3 in a row baby, fear me",
  "My grandma could throw better than that",
  "Board was definitely tilted, just saying",
  "I peaked too early this season fr",
  "Someone's getting carried out there lmao",
  "New week, same results for the king 👑",
  "Bag check required after that performance",
  "Weather got me, I swear",
  "Starting to think you're paying the scorekeeper",
  "That comeback though 🔥🔥",
  "The disrespect!! I demand a rematch",
  "Clean sweep incoming",
  "How is that legal?? Straight robbery",
  "Championship mindset. That's all.",
  "My bags, my rules 😤",
];

const COMMENT_LINES = [
  "That was wild",
  "Not surprised at all",
  "Classic result",
  "Rematch needed ASAP",
  "That one hurt to watch",
  "Easy money",
  "How though???",
  "Absolute choke job",
  "Big W",
  "This one goes in the history books",
  "Fluke. Total fluke.",
  "My money was right 💰",
  "That's the form right there",
  "Anyone else see that?",
  "Next level stuff",
];

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Player tendencies: higher = better
const SKILL = [0.75, 0.68, 0.62, 0.71, 0.45, 0.69, 0.52, 0.73, 0.48, 0.66];

function generateScore(winnerSkill, loserSkill) {
  const winnerScore = randomBetween(21, 31);
  const maxLoser = Math.min(winnerScore - 1, Math.floor(20 * (1 - (winnerSkill - loserSkill) * 0.5)));
  const loserScore = randomBetween(Math.max(0, maxLoser - 8), Math.max(0, maxLoser));
  return { winnerScore, loserScore };
}

function seed() {
  runMigrations();
  const db = getDb();

  console.log('[Seed] Seeding database...');

  // Insert players
  const userIds = [];
  for (let i = 0; i < PLAYERS.length; i++) {
    const p = PLAYERS[i];
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.display_name)}`;
    const result = db.prepare(
      `INSERT INTO users (display_name, nickname, avatar_url, is_admin, elo_rating) VALUES (?, ?, ?, ?, 1000)`
    ).run(p.display_name, p.nickname, avatarUrl, p.is_admin);
    userIds.push(result.lastInsertRowid);
  }
  console.log(`[Seed] Inserted ${userIds.length} players`);

  // Insert venues
  const venueIds = [];
  for (const v of VENUES) {
    const result = db.prepare(
      `INSERT INTO venues (name, lat, lng) VALUES (?, ?, ?)`
    ).run(v.name, v.lat, v.lng);
    venueIds.push(result.lastInsertRowid);
  }

  // Generate games across 2024 and 2025
  const startDate2024 = new Date('2024-03-01');
  const endDate2024 = new Date('2024-12-31');
  const startDate2025 = new Date('2025-01-15');
  const endDate2025 = new Date('2025-10-30');

  const gameInsert = db.prepare(
    `INSERT INTO games (game_type, played_at, season, venue_id, weather_json, submitted_by_user_id) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const partInsert = db.prepare(
    `INSERT INTO game_participants (game_id, user_id, team, score, is_winner) VALUES (?, ?, ?, ?, ?)`
  );

  const allGames = [];

  // Generate 1v1 games
  for (let g = 0; g < 65; g++) {
    const season = g < 30 ? 2024 : 2025;
    const dateRange = season === 2024 ? [startDate2024, endDate2024] : [startDate2025, endDate2025];
    const date = randomDate(...dateRange);

    // Pick two distinct players
    let p1idx = randomBetween(0, 9);
    let p2idx;
    do { p2idx = randomBetween(0, 9); } while (p2idx === p1idx);

    const skill1 = SKILL[p1idx];
    const skill2 = SKILL[p2idx];
    const p1Wins = Math.random() < skill1 / (skill1 + skill2);

    const { winnerScore, loserScore } = generateScore(
      p1Wins ? skill1 : skill2,
      p1Wins ? skill2 : skill1
    );

    const venueId = randomFrom(venueIds);
    const weather = randomFrom(WEATHER_OPTIONS);
    const submitter = userIds[0]; // Andrew

    const gameResult = gameInsert.run(
      '1v1',
      date.toISOString(),
      season,
      venueId,
      JSON.stringify(weather),
      submitter
    );
    const gameId = gameResult.lastInsertRowid;

    const p1Score = p1Wins ? winnerScore : loserScore;
    const p2Score = p1Wins ? loserScore : winnerScore;
    partInsert.run(gameId, userIds[p1idx], 1, p1Score, p1Wins ? 1 : 0);
    partInsert.run(gameId, userIds[p2idx], 2, p2Score, p1Wins ? 0 : 1);

    allGames.push({ id: gameId, date, season, type: '1v1' });
  }

  // Generate 2v2 games
  for (let g = 0; g < 45; g++) {
    const season = g < 20 ? 2024 : 2025;
    const dateRange = season === 2024 ? [startDate2024, endDate2024] : [startDate2025, endDate2025];
    const date = randomDate(...dateRange);

    // Pick 4 distinct players
    const playerIdxs = [];
    while (playerIdxs.length < 4) {
      const idx = randomBetween(0, 9);
      if (!playerIdxs.includes(idx)) playerIdxs.push(idx);
    }

    const [t1p1, t1p2, t2p1, t2p2] = playerIdxs;
    const avgSkill1 = (SKILL[t1p1] + SKILL[t1p2]) / 2;
    const avgSkill2 = (SKILL[t2p1] + SKILL[t2p2]) / 2;
    const team1Wins = Math.random() < avgSkill1 / (avgSkill1 + avgSkill2);

    const { winnerScore, loserScore } = generateScore(
      team1Wins ? avgSkill1 : avgSkill2,
      team1Wins ? avgSkill2 : avgSkill1
    );

    const venueId = randomFrom(venueIds);
    const weather = randomFrom(WEATHER_OPTIONS);

    const gameResult = gameInsert.run(
      '2v2',
      date.toISOString(),
      season,
      venueId,
      JSON.stringify(weather),
      userIds[0]
    );
    const gameId = gameResult.lastInsertRowid;

    const t1Score = team1Wins ? winnerScore : loserScore;
    const t2Score = team1Wins ? loserScore : winnerScore;
    partInsert.run(gameId, userIds[t1p1], 1, t1Score, team1Wins ? 1 : 0);
    partInsert.run(gameId, userIds[t1p2], 1, t1Score, team1Wins ? 1 : 0);
    partInsert.run(gameId, userIds[t2p1], 2, t2Score, team1Wins ? 0 : 1);
    partInsert.run(gameId, userIds[t2p2], 2, t2Score, team1Wins ? 0 : 1);

    allGames.push({ id: gameId, date, season, type: '2v2' });
  }

  console.log(`[Seed] Inserted ${allGames.length} games`);

  // Recalculate Elos
  const games = db.prepare(`SELECT * FROM games ORDER BY played_at ASC`).all();
  const participants = db.prepare(`SELECT * FROM game_participants`).all();
  const newElos = recalculateAllElos(games, participants);
  for (const [userId, elo] of Object.entries(newElos)) {
    db.prepare(`UPDATE users SET elo_rating = ? WHERE id = ?`).run(elo, parseInt(userId));
  }
  console.log('[Seed] Elos recalculated');

  // Add comments
  const sortedGames = allGames.sort((a, b) => new Date(a.date) - new Date(b.date));
  const commentInsert = db.prepare(`INSERT INTO comments (game_id, user_id, body, created_at) VALUES (?, ?, ?, ?)`);

  for (let i = 0; i < 50; i++) {
    const game = randomFrom(sortedGames);
    const commenter = randomFrom(userIds);
    const body = randomFrom(COMMENT_LINES);
    const commentDate = new Date(new Date(game.date).getTime() + randomBetween(300000, 86400000));
    commentInsert.run(game.id, commenter, body, commentDate.toISOString());
  }

  // Add trash talk posts
  const ttInsert = db.prepare(`INSERT INTO trash_talk (user_id, body, created_at) VALUES (?, ?, ?)`);
  const startOfYear = new Date('2025-01-01');
  for (let i = 0; i < 25; i++) {
    const user = randomFrom(userIds);
    const body = randomFrom(TRASH_TALK);
    const date = randomDate(startOfYear, new Date());
    ttInsert.run(user, body, date.toISOString());
  }
  console.log('[Seed] Comments and trash talk added');

  // Award achievements
  // first_blood
  awardAchievement(userIds[0], 'first_blood');

  // Win streaks for dominant players
  awardAchievement(userIds[0], 'win_streak_3'); // Andrew
  awardAchievement(userIds[0], 'win_streak_5');
  awardAchievement(userIds[3], 'win_streak_3'); // Priya
  awardAchievement(userIds[7], 'win_streak_3'); // Sofia
  awardAchievement(userIds[1], 'win_streak_3'); // Jordan

  // Shutouts
  awardAchievement(userIds[0], 'shutout');
  awardAchievement(userIds[3], 'shutout');

  // Giant slayer
  awardAchievement(userIds[6], 'giant_slayer'); // Liam beat someone

  // Rain warrior
  awardAchievement(userIds[5], 'rain_warrior'); // Keisha

  // Home turf — Andrew has tons of home wins
  awardAchievement(userIds[0], 'home_turf');

  // Trash talker
  awardAchievement(userIds[4], 'trash_talker'); // Tyler

  // Comeback kid
  awardAchievement(userIds[1], 'comeback_kid'); // Jordan

  console.log('[Seed] Achievements awarded');
  console.log('[Seed] ✅ Seed complete!');
}

function seedIfEmpty() {
  const db = getDb();
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c;
    if (count > 0) return;

    if (process.env.NODE_ENV === 'production') {
      const adminName = process.env.BOOTSTRAP_ADMIN_NAME;
      if (!adminName) {
        console.log('[Seed] Production mode: set BOOTSTRAP_ADMIN_NAME to create the first admin user.');
        return;
      }
      const nickname = process.env.BOOTSTRAP_ADMIN_NICKNAME || null;
      const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(adminName)}`;
      db.prepare(`INSERT INTO users (display_name, nickname, avatar_url, is_admin, elo_rating) VALUES (?, ?, ?, 1, 1000)`)
        .run(adminName, nickname, avatarUrl);
      console.log(`[Seed] Created admin user: ${adminName}`);
    } else {
      console.log('[Seed] Database empty, seeding...');
      seed();
    }
  } catch (e) {
    // Tables might not exist yet; migrations handle that
  }
}

if (require.main === module) {
  // Wipe and re-seed when run directly
  runMigrations();
  const db = getDb();
  db.exec(`
    DELETE FROM achievements;
    DELETE FROM comments;
    DELETE FROM trash_talk;
    DELETE FROM game_participants;
    DELETE FROM games;
    DELETE FROM tournament_matches;
    DELETE FROM tournaments;
    DELETE FROM venues;
    DELETE FROM users;
  `);
  seed();
}

module.exports = { seed, seedIfEmpty };
