/**
 * Migration 026: Comp every league owned by a site superadmin to Pro.
 *
 * Superadmin-owned leagues were stuck on the free plan (8-player cap, no
 * custom rules/theme) because nothing granted them Pro. Server enforcement now
 * treats a superadmin owner as Pro live (lib/plan.js leagueHasProAccess); this
 * backfills plan_override = 'pro' so the client UI and /admin agree.
 *
 * Only touches leagues with no existing override — a deliberate 'free' comp is
 * left alone. Each change is written to plan_override_audit. Idempotent.
 */

const { sql } = require('kysely');

const REASON = 'Superadmin-owned league (auto-comp)';

async function up(db) {
  const { rows } = await sql`
    SELECT DISTINCT l.id, l.plan
    FROM leagues l
    JOIN league_memberships lm ON lm.league_id = l.id AND lm.role = 'owner'
    JOIN users u ON u.id = lm.user_id
    WHERE u.is_admin = 1 AND l.plan_override IS NULL
  `.execute(db);

  for (const { id, plan } of rows) {
    await sql`
      UPDATE leagues SET plan_override = 'pro', plan_override_reason = ${REASON}
      WHERE id = ${id} AND plan_override IS NULL
    `.execute(db);
    await sql`
      INSERT INTO plan_override_audit (league_id, changed_by_user_id, from_plan, to_plan, reason)
      VALUES (${id}, NULL, ${plan}, 'pro', ${REASON})
    `.execute(db);
  }
}

module.exports = { up };
