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

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendJoinRequestEmail,
  sendJoinApprovedEmail,
  sendJoinDeniedEmail,
};
