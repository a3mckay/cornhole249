/**
 * 012_digest_unsubscribed
 * Adds digest_unsubscribed_at to users so members can opt out of weekly emails.
 */

exports.up = async (db) => {
  await db.schema
    .alterTable('users')
    .addColumn('digest_unsubscribed_at', 'timestamptz')
    .execute();
};

exports.down = async (db) => {
  await db.schema
    .alterTable('users')
    .dropColumn('digest_unsubscribed_at')
    .execute();
};
