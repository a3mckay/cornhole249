/**
 * Email sending via Nodemailer (Gmail SMTP).
 *
 * Required env vars:
 *   GMAIL_USER      — the Gmail address to send from (e.g. noreply.cornhole249@gmail.com)
 *   GMAIL_APP_PASS  — a Gmail App Password (not your regular password)
 *                     Generate one at: myaccount.google.com/apppasswords
 *   APP_URL         — public base URL for links (e.g. https://www.cornhole249.com)
 *
 * If GMAIL_USER is not set, emails are logged to the console instead
 * (safe for local dev without credentials).
 *
 * To create a Gmail App Password:
 *   1. Go to myaccount.google.com → Security → 2-Step Verification (must be enabled)
 *   2. Search for "App passwords" → create one named "Cornhole249"
 *   3. Copy the 16-char password — that's GMAIL_APP_PASS
 */

const nodemailer = require('nodemailer');

const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS,
      },
    });
  }
  return _transporter;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.GMAIL_USER) {
    console.log(`[Email] Would send subject="${subject}" (GMAIL_USER not configured — recipient suppressed)`);
    return;
  }
  await getTransporter().sendMail({
    from: `Cornhole249 <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
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
};

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
  await getTransporter().sendMail({
    from: `Cornhole249 <${process.env.GMAIL_USER}>`,
    to: CONTACT_TO,
    replyTo: replyTo,
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
