/**
 * Unified entry point — dispatches to the correct script based on DIGEST_MODE.
 * Uses fork() so the target script runs as the main module (require.main === module).
 *
 * Web service:  DIGEST_MODE is unset  → runs server/index.js (Express + healthcheck)
 * Cron service: DIGEST_MODE=true      → runs server/scripts/digest.js (one-shot, exits 0)
 *
 * Both services share the same railway.toml startCommand so we need a single
 * entrypoint that reads an environment variable to decide what to do.
 */

const { fork } = require('child_process');
const path = require('path');

const script =
  process.env.DIGEST_MODE === 'true'
    ? path.join(__dirname, 'scripts', 'digest.js')
    : path.join(__dirname, 'index.js');

const child = fork(script, [], { stdio: 'inherit' });

// Forward termination signals so Railway can gracefully shut down the child
['SIGTERM', 'SIGINT'].forEach((sig) => {
  process.on(sig, () => child.kill(sig));
});

// Mirror the child's exit code so Railway sees success/failure correctly
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
