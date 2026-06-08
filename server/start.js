/**
 * Unified entry point — dispatches to the correct script based on DIGEST_MODE.
 *
 * Web service:  DIGEST_MODE is unset  → runs server/index.js (Express + healthcheck)
 * Cron service: DIGEST_MODE=true      → runs server/scripts/digest.js (one-shot, exits 0)
 *
 * Both services share the same railway.toml startCommand so we need a single
 * entrypoint that reads an environment variable to decide what to do.
 */

if (process.env.DIGEST_MODE === 'true') {
  require('./scripts/digest');
} else {
  require('./index');
}
