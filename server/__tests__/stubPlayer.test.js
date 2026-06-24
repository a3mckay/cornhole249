/**
 * Stub-player onboarding flow:
 *   - admin creates a placeholder player + one-time claim link
 *   - recipient claims the link (session sign-in, token single-use)
 *   - claimed user sets up email + password to keep access
 *
 * Exercises POST /api/leagues/:slug/members/stub, POST /auth/claim,
 * and POST /auth/setup-credentials.
 */

let rawTestDb;
let kyselyTestDb;

jest.mock('../db', () => {
  const Database = require('better-sqlite3');
  const { Kysely, SqliteDialect, sql } = require('kysely');
  const { SCHEMA_SQL } = require('./fixtures');

  rawTestDb = new Database(':memory:');
  rawTestDb.pragma('foreign_keys = OFF');
  rawTestDb.exec(SCHEMA_SQL);

  kyselyTestDb = new Kysely({ dialect: new SqliteDialect({ database: rawTestDb }) });
  return { getDb: () => kyselyTestDb, runMigrations: jest.fn(), sql };
});

jest.mock('../seed', () => ({ seedIfEmpty: jest.fn() }));
// Don't actually send verification emails in tests
jest.mock('../lib/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(),
  sendJoinRequestEmail: jest.fn().mockResolvedValue(),
  sendJoinApprovedEmail: jest.fn().mockResolvedValue(),
  sendJoinDeniedEmail: jest.fn().mockResolvedValue(),
}));

const request = require('supertest');
const app = require('../index');

function setupUser(id, name, fields = {}) {
  const cols = ['id', 'display_name', 'is_admin', 'elo_rating', 'pin', 'email', 'password_hash'];
  const vals = [id, name, fields.is_admin ?? 0, 1000, fields.pin ?? '1234', fields.email ?? null, fields.password_hash ?? null];
  rawTestDb.prepare(
    `INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  ).run(...vals);
}
function addMember(userId, leagueId, role = 'player') {
  rawTestDb.prepare(`INSERT OR IGNORE INTO league_memberships (user_id, league_id, role) VALUES (?, ?, ?)`)
    .run(userId, leagueId, role);
}
async function loginAs(userId) {
  const agent = request.agent(app);
  await agent.post('/auth/login').send({ user_id: userId, pin: '1234' });
  return agent;
}

beforeEach(() => {
  rawTestDb.exec(`DELETE FROM league_memberships; DELETE FROM leagues; DELETE FROM users;`);
  rawTestDb.prepare(`INSERT INTO leagues (id, slug, name, is_public, plan) VALUES (1, 'cornhole249', 'Cornhole249', 1, 'pro')`).run();
  setupUser(1, 'Owner', { is_admin: 0 });
  setupUser(2, 'Player', { is_admin: 0 });
  addMember(1, 1, 'owner');
  addMember(2, 1, 'player');
});

describe('Stub player creation', () => {
  test('owner can create a stub player and gets a claim link', async () => {
    const agent = await loginAs(1);
    const res = await agent.post('/api/leagues/cornhole249/members/stub').send({ display_name: 'Party Guest' });

    expect(res.status).toBe(201);
    expect(res.body.member.display_name).toBe('Party Guest');
    expect(res.body.member.id).toEqual(expect.any(Number));
    expect(res.body.claim_link).toMatch(/\/claim\?token=/);

    // The new user is a member of the league
    const membership = rawTestDb.prepare(
      `SELECT role FROM league_memberships WHERE user_id = ? AND league_id = 1`
    ).get(res.body.member.id);
    expect(membership.role).toBe('player');

    // A claim token was stored
    const u = rawTestDb.prepare(`SELECT claim_token FROM users WHERE id = ?`).get(res.body.member.id);
    expect(u.claim_token).toBeTruthy();
  });

  test('non-admin player cannot create a stub player', async () => {
    const agent = await loginAs(2);
    const res = await agent.post('/api/leagues/cornhole249/members/stub').send({ display_name: 'Nope' });
    expect(res.status).toBe(403);
  });

  test('requires a display_name', async () => {
    const agent = await loginAs(1);
    const res = await agent.post('/api/leagues/cornhole249/members/stub').send({ display_name: '  ' });
    expect(res.status).toBe(400);
  });
});

describe('Claiming a stub player', () => {
  async function createStub() {
    const agent = await loginAs(1);
    const res = await agent.post('/api/leagues/cornhole249/members/stub').send({ display_name: 'Guest' });
    const token = res.body.claim_link.split('token=')[1];
    return { userId: res.body.member.id, token };
  }

  test('valid token signs the recipient in and is single-use', async () => {
    const { userId, token } = await createStub();

    const agent = request.agent(app);
    const res = await agent.post('/auth/claim').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.needs_migration).toBe(true);
    expect(res.body.league_slug).toBe('cornhole249');

    // Session is live
    const me = await agent.get('/auth/me');
    expect(me.body.id).toBe(userId);

    // Token is now consumed — a second claim fails
    const second = await request(app).post('/auth/claim').send({ token });
    expect(second.status).toBe(404);
  });

  test('expired token is rejected', async () => {
    const { userId, token } = await createStub();
    rawTestDb.prepare(`UPDATE users SET claim_token_expires_at = ? WHERE id = ?`)
      .run(new Date(Date.now() - 1000).toISOString(), userId);

    const res = await request(app).post('/auth/claim').send({ token });
    expect(res.status).toBe(410);
  });

  test('refuses to hijack an already-signed-in real account', async () => {
    const { token } = await createStub();
    // Give user 2 a real login and sign in as them
    rawTestDb.prepare(`UPDATE users SET email = 'real@example.com' WHERE id = 2`).run();
    const agent = await loginAs(2);

    const res = await agent.post('/auth/claim').send({ token });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_signed_in');
  });
});

describe('Setting up credentials after claiming', () => {
  async function claimedAgent() {
    const owner = await loginAs(1);
    const created = await owner.post('/api/leagues/cornhole249/members/stub').send({ display_name: 'Guest' });
    const token = created.body.claim_link.split('token=')[1];
    const agent = request.agent(app);
    await agent.post('/auth/claim').send({ token });
    return { agent, userId: created.body.member.id };
  }

  test('claimed user can set email + password', async () => {
    const { agent, userId } = await claimedAgent();
    const res = await agent.post('/auth/setup-credentials').send({ email: 'guest@example.com', password: 'Test1234!' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('guest@example.com');
    expect(res.body.needs_migration).toBe(false);

    const me = await agent.get('/auth/me');
    expect(me.body.email).toBe('guest@example.com');
    expect(me.body.needs_migration).toBe(false);
  });

  test('rejects weak password', async () => {
    const { agent } = await claimedAgent();
    const res = await agent.post('/auth/setup-credentials').send({ email: 'guest@example.com', password: 'weak' });
    expect(res.status).toBe(400);
  });

  test('rejects an email already in use', async () => {
    rawTestDb.prepare(`UPDATE users SET email = 'taken@example.com' WHERE id = 2`).run();
    const { agent } = await claimedAgent();
    const res = await agent.post('/auth/setup-credentials').send({ email: 'taken@example.com', password: 'Test1234!' });
    expect(res.status).toBe(409);
  });

  test('rejects setup when the account already has an email', async () => {
    const { agent } = await claimedAgent();
    await agent.post('/auth/setup-credentials').send({ email: 'first@example.com', password: 'Test1234!' });
    const res = await agent.post('/auth/setup-credentials').send({ email: 'second@example.com', password: 'Test1234!' });
    expect(res.status).toBe(409);
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/auth/setup-credentials').send({ email: 'x@example.com', password: 'Test1234!' });
    expect(res.status).toBe(401);
  });
});
