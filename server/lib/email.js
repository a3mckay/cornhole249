/**
 * Email sending via Gmail HTTP API (googleapis).
 *
 * Uses OAuth2 — no SMTP, no port-blocking issues on Railway.
 *
 * Required env vars:
 *   GMAIL_USER            — the Gmail address to send from (e.g. noreply.cornhole249@gmail.com)
 *   GMAIL_REFRESH_TOKEN   — long-lived OAuth2 refresh token for that account
 *   GOOGLE_CLIENT_ID      — OAuth2 client ID (same one used for Google login)
 *   GOOGLE_CLIENT_SECRET  — OAuth2 client secret
 *   APP_URL               — public base URL for links (e.g. https://www.cornhole249.com)
 *
 * If GMAIL_USER or GMAIL_REFRESH_TOKEN is not set, emails are logged to the
 * console instead (safe for local dev without credentials).
 */

const { google } = require('googleapis');

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

/**
 * Encode a mail header value that may contain non-ASCII characters.
 * Plain ASCII passes through unchanged; anything else is wrapped in
 * RFC 2047 UTF-8/Base64 encoding so mail clients display it correctly.
 */
function encodeHeader(value) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function getGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
}

/**
 * Send an email via the Gmail REST API (HTTPS, port 443).
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.replyTo]
 */
async function sendEmail({ to, subject, html, replyTo }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_REFRESH_TOKEN) {
    console.log(`[Email] Would send subject="${subject}" (GMAIL_USER/GMAIL_REFRESH_TOKEN not set)`);
    return;
  }

  const from = `Cornhole249 <${process.env.GMAIL_USER}>`;
  const headerLines = [
    `From: ${encodeHeader(from)}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
  ];

  const raw = Buffer.from(
    headerLines.join('\r\n') + '\r\n\r\n' + html,
  ).toString('base64url');

  const gmail = getGmailClient();
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}

/**
 * Send account email-verification link.
 */
async function sendVerificationEmail(to, token) {
  const link = `${APP_URL}/verify-email/${token}`;
  await sendEmail({
    to,
    subject: 'Verify your Cornhole249 email',
    html: `
      <p style="font-family:sans-serif">
        Welcome to Cornhole249! Click the link below to verify your email address.
        This link expires in 24 hours.
      </p>
      <p style="font-family:sans-serif">
        <a href="${link}" style="color:#3A6B35;font-weight:bold">${link}</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">
        If you didn't create an account, you can safely ignore this email.
      </p>
    `,
  });
}

/**
 * Send password-reset link (expires in 1 hour).
 */
async function sendPasswordResetEmail(to, token) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  await sendEmail({
    to,
    subject: 'Reset your Cornhole249 password',
    html: `
      <p style="font-family:sans-serif">
        Someone requested a password reset for your Cornhole249 account.
        Click the link below to set a new password. This link expires in 1 hour.
      </p>
      <p style="font-family:sans-serif">
        <a href="${link}" style="color:#3A6B35;font-weight:bold">${link}</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">
        If you didn't request this, you can safely ignore this email.
      </p>
    `,
  });
}

/**
 * Notify league owners/admins that someone has requested to join.
 */
async function sendJoinRequestEmail({ to, adminName, leagueName, joinerName, reviewUrl }) {
  await sendEmail({
    to,
    subject: `${joinerName} wants to join ${leagueName}`,
    html: `
      <p style="font-family:sans-serif">Hey ${adminName},</p>
      <p style="font-family:sans-serif">
        <strong>${joinerName}</strong> has requested to join <strong>${leagueName}</strong> on Cornhole249.
      </p>
      <p style="font-family:sans-serif">
        <a href="${reviewUrl}" style="color:#3A6B35;font-weight:bold">Review the request →</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">
        You're receiving this because you're an owner or admin of ${leagueName}.
      </p>
    `,
  });
}

/**
 * Notify an applicant that their join request was approved.
 */
async function sendJoinApprovedEmail({ to, applicantName, leagueName, leagueUrl }) {
  await sendEmail({
    to,
    subject: `You're in! Welcome to ${leagueName}`,
    html: `
      <p style="font-family:sans-serif">Hey ${applicantName},</p>
      <p style="font-family:sans-serif">
        Great news — your request to join <strong>${leagueName}</strong> has been approved!
        You're officially on the board.
      </p>
      <p style="font-family:sans-serif">
        <a href="${leagueUrl}" style="color:#3A6B35;font-weight:bold">Go to ${leagueName} →</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">
        Log a game, check the standings, and start some trash talk.
      </p>
    `,
  });
}

/**
 * Notify an applicant that their join request was denied.
 */
async function sendJoinDeniedEmail({ to, applicantName, leagueName }) {
  await sendEmail({
    to,
    subject: `Update on your request to join ${leagueName}`,
    html: `
      <p style="font-family:sans-serif">Hey ${applicantName},</p>
      <p style="font-family:sans-serif">
        Thanks for your interest in <strong>${leagueName}</strong> on Cornhole249.
        Unfortunately your request to join wasn't approved this time.
      </p>
      <p style="font-family:sans-serif">
        If you think this was a mistake, reach out to the league owner directly.
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">
        You can still browse other public leagues at
        <a href="${APP_URL}" style="color:#3A6B35">${APP_URL}</a>.
      </p>
    `,
  });
}

/**
 * Welcome email for a new Pro subscription (monthly or yearly).
 */
async function sendProWelcomeEmail({ to, userName, leagueName, leagueUrl }) {
  await sendEmail({
    to,
    subject: `🎉 Welcome to Pro — ${leagueName} is fully unlocked`,
    html: `
      <p style="font-family:sans-serif">Hey ${userName},</p>
      <p style="font-family:sans-serif">
        <strong>${leagueName}</strong> is now on Cornhole249 Pro. Every feature is unlocked.
      </p>
      <ul style="font-family:sans-serif;padding-left:1.2em;line-height:1.8">
        <li>📊 Full stats &amp; analytics</li>
        <li>🏆 Tournament brackets</li>
        <li>♾️ Unlimited players — no 8-player cap</li>
        <li>📤 CSV export</li>
      </ul>
      <p style="font-family:sans-serif">
        <a href="${leagueUrl}/settings#invite-section" style="color:#3A6B35;font-weight:bold">Invite more players →</a>
        &nbsp;&nbsp;
        <a href="${leagueUrl}" style="color:#3A6B35">Go to ${leagueName} →</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">
        Manage or cancel your subscription any time from League Settings.
      </p>
    `,
  });
}

/**
 * Welcome email for a Weekend Pass purchase.
 */
async function sendWeekendPassWelcomeEmail({ to, userName, leagueName, leagueUrl, expiresAt }) {
  const expiryStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'in 7 days';
  await sendEmail({
    to,
    subject: `Your Weekend Pass for ${leagueName} is active`,
    html: `
      <p style="font-family:sans-serif">Hey ${userName},</p>
      <p style="font-family:sans-serif">
        Your Weekend Pass for <strong>${leagueName}</strong> is active —
        all Pro features are unlocked until <strong>${expiryStr}</strong>.
      </p>
      <ul style="font-family:sans-serif;padding-left:1.2em;line-height:1.8">
        <li>📊 Full stats &amp; analytics</li>
        <li>🏆 Tournament brackets</li>
        <li>♾️ Unlimited players — no 8-player cap</li>
        <li>📤 CSV export</li>
      </ul>
      <p style="font-family:sans-serif">
        <a href="${leagueUrl}/settings#invite-section" style="color:#3A6B35;font-weight:bold">Invite more players →</a>
        &nbsp;&nbsp;
        <a href="${leagueUrl}" style="color:#3A6B35">Go to ${leagueName} →</a>
      </p>
      <p style="font-family:sans-serif;color:#888;font-size:12px">
        Need more time after the weekend? Upgrade to Pro Monthly or Yearly from League Settings.
      </p>
    `,
  });
}

/**
 * Day-before warning email for expiring Weekend Pass.
 */
async function sendWeekendPassWarningEmail({ to, userName, leagueName, leagueUrl, expiresAt }) {
  const expiryStr = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'tomorrow';
  await sendEmail({
    to,
    subject: `Your Weekend Pass for ${leagueName} expires tomorrow`,
    html: `
      <p style="font-family:sans-serif">Hey ${userName},</p>
      <p style="font-family:sans-serif">
        Your Weekend Pass for <strong>${leagueName}</strong> expires on <strong>${expiryStr}</strong>.
        Grab another pass or upgrade to keep the Pro features going.
      </p>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:400px">
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings?plan=weekend_pass" style="display:inline-block;padding:10px 20px;background:#3A6B35;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Renew Weekend Pass — CAD $12
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings?plan=pro_monthly" style="display:inline-block;padding:10px 20px;background:#1a4a80;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Upgrade to Pro Monthly — CAD $9/mo
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings?plan=pro_yearly" style="display:inline-block;padding:10px 20px;background:#1a4a80;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Upgrade to Pro Yearly — CAD $80/yr
            </a>
          </td>
        </tr>
      </table>
      <p style="font-family:sans-serif;color:#888;font-size:12px;margin-top:16px">
        After expiry, ${leagueName} will revert to the free plan (up to 8 players).
      </p>
    `,
  });
}

/**
 * Expiry notification for a Weekend Pass that has lapsed.
 */
async function sendWeekendPassExpiredEmail({ to, userName, leagueName, leagueUrl }) {
  await sendEmail({
    to,
    subject: `Your Weekend Pass for ${leagueName} has expired`,
    html: `
      <p style="font-family:sans-serif">Hey ${userName},</p>
      <p style="font-family:sans-serif">
        Your Weekend Pass for <strong>${leagueName}</strong> has expired and the league has returned to the free plan.
        Grab another pass or upgrade to Pro to restore all features.
      </p>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:400px">
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings?plan=weekend_pass" style="display:inline-block;padding:10px 20px;background:#3A6B35;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Buy another Weekend Pass — CAD $12
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings?plan=pro_monthly" style="display:inline-block;padding:10px 20px;background:#1a4a80;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Upgrade to Pro Monthly — CAD $9/mo
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings?plan=pro_yearly" style="display:inline-block;padding:10px 20px;background:#1a4a80;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Upgrade to Pro Yearly — CAD $80/yr
            </a>
          </td>
        </tr>
      </table>
      <p style="font-family:sans-serif;color:#888;font-size:12px;margin-top:16px">
        All your game history and stats are safe — nothing was deleted.
      </p>
    `,
  });
}

/**
 * Sent immediately when a Pro subscription cancels and the league has >8 members.
 * Gives the owner 7 days to choose which players stay.
 */
async function sendGraceStartEmail({ to, userName, leagueName, leagueUrl, graceEndsAt, memberCount }) {
  const deadlineStr = new Date(graceEndsAt).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  await sendEmail({
    to,
    subject: `Action required: choose your 8 players for ${leagueName}`,
    html: `
      <p style="font-family:sans-serif">Hey ${userName},</p>
      <p style="font-family:sans-serif">
        Your Pro subscription for <strong>${leagueName}</strong> has ended.
        Your league currently has <strong>${memberCount} members</strong>, but the free plan supports up to 8.
      </p>
      <p style="font-family:sans-serif">
        You have until <strong>${deadlineStr}</strong> to choose which 8 players keep full access.
        If you don't choose, we'll automatically keep your first 8 members by join date — the rest will have read-only access.
      </p>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:400px">
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings" style="display:inline-block;padding:10px 20px;background:#3A6B35;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Manage Player Access →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0 6px">
            <a href="${leagueUrl}/settings?plan=pro_monthly" style="display:inline-block;padding:10px 20px;background:#1a4a80;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Re-upgrade to Pro — CAD $9/mo
            </a>
          </td>
        </tr>
      </table>
      <p style="font-family:sans-serif;color:#888;font-size:12px;margin-top:16px">
        All game history and stats are preserved. Upgrading back to Pro instantly restores full access for everyone.
      </p>
    `,
  });
}

/**
 * Sent the day before a grace period expires if the owner hasn't resolved it.
 */
async function sendGraceWarningEmail({ to, userName, leagueName, leagueUrl, graceEndsAt }) {
  const deadlineStr = new Date(graceEndsAt).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
  await sendEmail({
    to,
    subject: `Last chance: choose your 8 players for ${leagueName} by tomorrow`,
    html: `
      <p style="font-family:sans-serif">Hey ${userName},</p>
      <p style="font-family:sans-serif">
        Tomorrow (<strong>${deadlineStr}</strong>), the player cap for <strong>${leagueName}</strong> kicks in.
        If you haven't chosen your 8 players yet, we'll automatically keep your first 8 members by join date —
        everyone else will lose the ability to log games or comment.
      </p>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;max-width:400px">
        <tr>
          <td style="padding:6px 0">
            <a href="${leagueUrl}/settings" style="display:inline-block;padding:10px 20px;background:#3A6B35;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Choose My 8 Players →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0 6px">
            <a href="${leagueUrl}/settings?plan=pro_monthly" style="display:inline-block;padding:10px 20px;background:#1a4a80;color:#fff;font-weight:bold;text-decoration:none;border-radius:6px">
              Re-upgrade to Pro — CAD $9/mo
            </a>
          </td>
        </tr>
      </table>
      <p style="font-family:sans-serif;color:#888;font-size:12px;margin-top:16px">
        Upgrading back to Pro instantly restores full access for all members.
      </p>
    `,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendJoinRequestEmail,
  sendJoinApprovedEmail,
  sendJoinDeniedEmail,
  sendProWelcomeEmail,
  sendWeekendPassWelcomeEmail,
  sendWeekendPassWarningEmail,
  sendWeekendPassExpiredEmail,
  sendGraceStartEmail,
  sendGraceWarningEmail,
  sendContactEmail,
  sendDigestEmail,
};

/**
 * Weekly digest email.
 *
 * @param {object} opts
 * @param {string} opts.to             — recipient email
 * @param {string} opts.name           — recipient display name
 * @param {number} opts.userId         — recipient user ID (for unsubscribe token)
 * @param {object} opts.league         — { id, slug, name }
 * @param {object[]} opts.games        — assembled game objects (see digest.js)
 * @param {object} opts.highlights     — { streakLeader, biggestMargin, topPlayer, topWins }
 * @param {object[]} opts.standings1v1 — top-5 1v1 standings [ { rank, name, wins, losses, gp, win_pct } ]
 * @param {object[]} opts.standings2v2 — top-5 2v2 standings
 * @param {string|null} opts.preheader — LLM-generated inbox preview (~90 chars), or null
 * @param {string|null} opts.intro     — LLM-generated intro paragraph, or null
 * @param {string} opts.weekLabel      — "Jun 2 – Jun 8"
 */
async function sendDigestEmail({ to, name, userId, league, games, highlights, standings1v1, standings2v2, preheader, intro, weekLabel }) {
  const { makeUnsubscribeToken } = require('../routes/digest');
  const token     = makeUnsubscribeToken(userId);
  const unsubUrl  = `${APP_URL}/unsubscribe?uid=${userId}&token=${token}`;
  const leagueUrl = league.slug === 'cornhole249' ? APP_URL : `${APP_URL}/l/${league.slug}`;
  const address   = process.env.DIGEST_ADDRESS || '';

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtDate = (d) =>
    new Date(d).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });

  function playerLabel(team) {
    return team.map((p) => p.nickname || p.display_name).join(' & ');
  }

  function gameRow(game) {
    const t1 = game.teams[1] || [];
    const t2 = game.teams[2] || [];
    if (!t1.length || !t2.length) return '';
    const score1 = t1.reduce((s, p) => s + (p.score || 0), 0);
    const score2 = t2.reduce((s, p) => s + (p.score || 0), 0);
    const [winTeam, winScore, loseTeam, loseScore] =
      score1 >= score2
        ? [t1, score1, t2, score2]
        : [t2, score2, t1, score1];
    return `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8e0d0;font-family:sans-serif;font-size:14px;color:#3c2a1e">
          <strong>${playerLabel(winTeam)}</strong>
          <span style="color:#3a6b35;font-weight:700;margin:0 6px">${winScore}</span>
          <span style="color:#888">&#8211;</span>
          <span style="color:#a06040;font-weight:700;margin:0 6px">${loseScore}</span>
          ${playerLabel(loseTeam)}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #e8e0d0;font-family:sans-serif;font-size:12px;color:#888;white-space:nowrap;text-align:right">
          ${fmtDate(game.played_at)}
        </td>
      </tr>`;
  }

  function standingRow(s) {
    return `
      <tr>
        <td style="padding:6px 8px;font-family:sans-serif;font-size:13px;color:#888;text-align:center">${s.rank}</td>
        <td style="padding:6px 8px;font-family:sans-serif;font-size:14px;color:#3c2a1e;font-weight:${s.rank === 1 ? '700' : '400'}">${s.name}</td>
        <td style="padding:6px 8px;font-family:sans-serif;font-size:14px;color:#3a6b35;font-weight:600;text-align:center">${s.wins}</td>
        <td style="padding:6px 8px;font-family:sans-serif;font-size:14px;color:#a06040;text-align:center">${s.losses}</td>
        <td style="padding:6px 8px;font-family:sans-serif;font-size:13px;color:#888;text-align:center">${s.win_pct}%</td>
      </tr>`;
  }

  function standingsTable(rows) {
    if (!rows || !rows.length) return '<p style="font-family:sans-serif;font-size:13px;color:#888;margin:0">No games recorded yet.</p>';
    return `
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr style="background:#f5efe0">
          <th style="padding:6px 8px;font-family:sans-serif;font-size:11px;color:#888;font-weight:600;text-align:center">#</th>
          <th style="padding:6px 8px;font-family:sans-serif;font-size:11px;color:#888;font-weight:600;text-align:left">Player</th>
          <th style="padding:6px 8px;font-family:sans-serif;font-size:11px;color:#888;font-weight:600;text-align:center">W</th>
          <th style="padding:6px 8px;font-family:sans-serif;font-size:11px;color:#888;font-weight:600;text-align:center">L</th>
          <th style="padding:6px 8px;font-family:sans-serif;font-size:11px;color:#888;font-weight:600;text-align:center">Win%</th>
        </tr>
        ${rows.map(standingRow).join('')}
      </table>`;
  }

  // ── Highlights ─────────────────────────────────────────────────────────────
  const { streakLeader, biggestMargin, topPlayer, topWins } = highlights;
  let highlightRows = '';

  if (streakLeader && streakLeader.streak >= 3) {
    highlightRows += `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8e0d0;font-family:sans-serif;font-size:14px;color:#3c2a1e">
          🔥 <strong>${streakLeader.name}</strong> is on a ${streakLeader.streak}-game win streak
        </td>
      </tr>`;
  } else if (streakLeader && streakLeader.streak >= 2) {
    highlightRows += `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8e0d0;font-family:sans-serif;font-size:14px;color:#3c2a1e">
          🔥 <strong>${streakLeader.name}</strong> has won ${streakLeader.streak} in a row
        </td>
      </tr>`;
  }

  if (biggestMargin && biggestMargin.margin >= 5) {
    const winName = playerLabel(biggestMargin.winners);
    highlightRows += `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8e0d0;font-family:sans-serif;font-size:14px;color:#3c2a1e">
          💥 Biggest win: <strong>${winName}</strong> won ${biggestMargin.winScore}&#8211;${biggestMargin.loseScore} (${fmtDate(biggestMargin.played_at)})
        </td>
      </tr>`;
  }

  if (topPlayer && topWins >= 2) {
    highlightRows += `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #e8e0d0;font-family:sans-serif;font-size:14px;color:#3c2a1e">
          ⭐ Player of the week: <strong>${topPlayer.name}</strong> (${topWins} win${topWins !== 1 ? 's' : ''} this week)
        </td>
      </tr>`;
  }

  // ── Games list (cap at 7, show overflow count) ─────────────────────────────
  const shownGames = games.slice(0, 7);
  const overflowCount = games.length - shownGames.length;
  const gamesHtml = shownGames.map(gameRow).join('');
  const overflowRow = overflowCount > 0
    ? `<tr><td colspan="2" style="padding:8px 0;font-family:sans-serif;font-size:13px;color:#888">+ ${overflowCount} more game${overflowCount !== 1 ? 's' : ''} &#8212; <a href="${leagueUrl}/games" style="color:#3a6b35">view all</a></td></tr>`
    : '';

  // ── Preheader (hidden inbox preview text) ─────────────────────────────────
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#fff">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>`
    : '';

  // ── Intro paragraph ────────────────────────────────────────────────────────
  const introHtml = intro
    ? `<p style="margin:0 0 24px;font-family:sans-serif;font-size:15px;color:#3c2a1e;line-height:1.5">${intro}</p>`
    : '';

  // ── Email body ─────────────────────────────────────────────────────────────
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5efe0">
${preheaderHtml}
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5efe0">
<tr><td align="center" style="padding:24px 16px">

  <!-- Card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

    <!-- Header -->
    <tr>
      <td style="background:#3a6b35;padding:6px 28px;text-align:center">
        <p style="margin:0;font-family:sans-serif;font-size:11px;font-weight:700;color:rgba(255,255,255,0.75);letter-spacing:0.12em;text-transform:uppercase">Weekly Digest</p>
      </td>
    </tr>
    <tr>
      <td style="background:#4a3728;padding:20px 28px 22px;text-align:center">
        <h1 style="margin:0 0 4px;font-family:Georgia,serif;font-size:28px;color:#fff;font-weight:normal">${league.name}</h1>
        <p style="margin:0;font-family:sans-serif;font-size:13px;color:rgba(255,255,255,0.55)">${weekLabel}</p>
      </td>
    </tr>

    <!-- Body -->
    <tr><td style="padding:28px">

      ${introHtml}

      <!-- Games -->
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;font-size:18px;color:#3c2a1e;font-weight:normal">
        🎯 This Week&#8217;s Games <span style="font-family:sans-serif;font-size:13px;color:#888;font-weight:400">(${games.length})</span>
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${gamesHtml}
        ${overflowRow}
      </table>

      ${highlightRows ? `
      <!-- Highlights -->
      <h2 style="margin:28px 0 12px;font-family:Georgia,serif;font-size:18px;color:#3c2a1e;font-weight:normal">
        ✨ Highlights
      </h2>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${highlightRows}
      </table>
      ` : ''}

      <!-- Standings: 1v1 -->
      <h2 style="margin:28px 0 4px;font-family:Georgia,serif;font-size:18px;color:#3c2a1e;font-weight:normal">
        🏆 Standings
      </h2>
      <p style="margin:0 0 10px;font-family:sans-serif;font-size:12px;font-weight:700;color:#888;letter-spacing:0.08em;text-transform:uppercase">1v1</p>
      ${standingsTable(standings1v1)}
      <p style="margin:8px 0 0;font-family:sans-serif;font-size:13px">
        <a href="${leagueUrl}/standings" style="color:#3a6b35;text-decoration:none;font-weight:600">View full standings &#8594;</a>
      </p>

      ${(standings2v2 && standings2v2.length) ? `
      <!-- Standings: 2v2 -->
      <p style="margin:20px 0 10px;font-family:sans-serif;font-size:12px;font-weight:700;color:#888;letter-spacing:0.08em;text-transform:uppercase">2v2</p>
      ${standingsTable(standings2v2)}
      <p style="margin:8px 0 0;font-family:sans-serif;font-size:13px">
        <a href="${leagueUrl}/standings" style="color:#3a6b35;text-decoration:none;font-weight:600">View full standings &#8594;</a>
      </p>
      ` : ''}

      <!-- CTA -->
      <div style="margin-top:32px;text-align:center">
        <a href="${leagueUrl}"
           style="display:inline-block;padding:13px 28px;background:#3a6b35;color:#fff;font-family:sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;line-height:1">
          Jump into ${league.name} &#8594;
        </a>
      </div>

    </td></tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f5efe0;padding:20px 28px;border-top:1px solid #e8e0d0;text-align:center">
        <p style="margin:0 0 6px;font-family:sans-serif;font-size:12px;color:#888">
          You&#8217;re receiving this because you&#8217;re a member of <strong>${league.name}</strong> on Cornhole249.
        </p>
        <p style="margin:0;font-family:sans-serif;font-size:12px;color:#aaa">
          <a href="${unsubUrl}" style="color:#888;text-decoration:underline">Unsubscribe</a>
          ${address ? ` &nbsp;&middot;&nbsp; ${address}` : ''}
        </p>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

  await sendEmail({
    to,
    subject: `${league.name} · Weekly Digest · ${weekLabel}`,
    html,
  });
}

/**
 * Contact form submission — forwards to Andrew's inbox with Reply-To set to the user's email.
 */
async function sendContactEmail({ replyTo, subject, body, userId }) {
  const CONTACT_TO = process.env.CONTACT_EMAIL || process.env.GMAIL_USER;
  if (!CONTACT_TO || !process.env.GMAIL_USER) {
    console.log(`[Email] Contact form would send: subject="${subject}" reply_to="${replyTo}"`);
    return;
  }
  const userLine = userId ? `<p style="color:#666;font-size:12px;margin:0 0 16px">Submitted by user ID ${userId}</p>` : '';
  const safeBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  await sendEmail({
    to: CONTACT_TO,
    replyTo,
    subject: `[Cornhole249 Contact] ${subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="margin:0 0 4px;font-size:18px">New contact form submission</h2>
        ${userLine}
        <p style="margin:0 0 8px"><strong>Subject:</strong> ${subject}</p>
        <p style="margin:0 0 8px"><strong>Reply-to:</strong> <a href="mailto:${replyTo}">${replyTo}</a></p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb" />
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.6">${safeBody}</div>
      </div>
    `,
  });
}
