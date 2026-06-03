# PII Compliance Work — Handoff Document

**Session date:** June 3, 2026  
**Branch:** `claude/pii-storage-audit-aDosZ`  
**Status:** Minimum compliance work complete. Further hardening noted but not yet done.

---

## Context

A PII audit was conducted after a question about incorporating the business. The audit revealed that Cornhole249 stores and processes personal data subject to Canadian privacy law (PIPEDA) and US state laws (CCPA). The recommendation was to achieve minimum compliance immediately, then optionally pursue a near-zero PII architecture later.

---

## What We Store (audit findings)

| Data | Table / Column | Notes |
|------|---------------|-------|
| Email address | `users.email` | Login, verification, password reset |
| Google email | `users.google_email` | From OAuth profile |
| Google ID | `users.google_id` | OAuth identifier |
| Display name | `users.display_name` | Shown on leaderboards |
| Nickname | `users.nickname` | Optional |
| Avatar URL | `users.avatar_url` | Auto-generated or Google photo |
| Password hash | `users.password_hash` | bcrypt 12 rounds — handled correctly |
| Stripe customer ID | `users.stripe_customer_id` | Reference ID only, not payment data |
| Venue coordinates | `venues.lat` / `venues.lng` | Associated with places, not users |

**Not stored:** phone numbers, physical addresses, SSN, credit card numbers, IP addresses.

**External services receiving PII:**
- **Stripe** — email + display name when creating a billing customer
- **Google OAuth** — email + profile data during sign-in
- **Gmail SMTP** — sends to user email addresses (Nodemailer)
- **Sentry** — may capture request context if `SENTRY_DSN` is set

---

## Compliance Gaps Identified

| Gap | Severity | Status |
|-----|----------|--------|
| No privacy policy | Required | ✅ Done |
| No data deletion endpoint | Required (PIPEDA) | ✅ Done |
| No consent at sign-up | Required | ✅ Done |
| Backups unencrypted | Safeguards obligation | ✅ Done |
| Email address in dev console logs | Minor | ✅ Done |
| No rate limiting on `/auth/login`, `/auth/forgot-password` | Security hardening | ❌ Not done |
| Sentry may capture PII in error context | Low risk | ❌ Not done |
| No explicit GDPR-style data export endpoint | Nice-to-have | ❌ Not done |

---

## What Was Completed (this session)

All changes are committed to branch `claude/pii-storage-audit-aDosZ`.

### 1. Dev email logging fixed
**File:** `server/lib/email.js` line 40  
The `console.log` that fired when `GMAIL_USER` was unset previously logged the recipient's email address. It now only logs the subject line.

**Before:**
```
[Email] Would send to=${to} subject="${subject}" (GMAIL_USER not set)
```
**After:**
```
[Email] Would send subject="${subject}" (GMAIL_USER not configured — recipient suppressed)
```

---

### 2. Backup encryption
**File:** `server/lib/backup.js`

AES-256-GCM encryption added using Node's built-in `crypto` module. No new dependencies required.

- Encrypts when `BACKUP_ENCRYPTION_KEY` env var is set (must be 64 hex chars = 32 bytes)
- Encrypted files use extension `.json.gz.enc`; unencrypted remain `.json.gz`
- Both extensions are recognised during rotation so old unencrypted backups age out naturally (7-day window)
- Logs a `WARNING` on every backup run if the key is not set
- Key generation instructions added to `.env.example`

**Format:** `12-byte IV || 16-byte GCM auth tag || ciphertext`

**Production action required:** Set `BACKUP_ENCRYPTION_KEY` in Railway environment variables. Generate a key with:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
> ⚠️ Store the generated key in a password manager and set it only in Railway. Never commit it to the repo. If lost, existing encrypted backups are unreadable.

---

### 3. Delete account endpoint
**File:** `server/routes/auth.js`

New endpoint: `DELETE /auth/account`  
Requires an active session. No request body needed.

**What it does:**
1. Hard-deletes: `comments`, `trash_talk`, `achievements`, `league_memberships`
2. Nulls out FK references: `join_codes.created_by`, `join_codes.used_by`, `games.submitted_by_user_id`, `users.referred_by_user_id` (for users this person referred)
3. Anonymises the `users` row — nulls all PII fields, sets `display_name = 'Deleted User'` — preserving referential integrity for `game_participants` (which has a `NOT NULL` FK)
4. Destroys the session

**Why anonymise instead of hard-delete:** `game_participants.user_id` is `NOT NULL REFERENCES users(id)` with no cascade. Deleting the user row would break game history. Anonymising the row preserves scores/standings while removing all identifying information.

**Note on Stripe:** The endpoint clears `stripe_customer_id` from our database but does not call the Stripe API to cancel subscriptions or delete the Stripe customer. The Privacy Policy instructs users to cancel their subscription first and to email `hello@cornhole249.com` for Stripe data removal assistance.

---

### 4. Delete account UI
**File:** `client/src/pages/PlayerProfile.jsx`

A "Danger Zone" section appears inside the Edit panel when a user views their own profile. Two-step confirmation (click → confirm message → confirm button) before the irreversible action fires. On success, `window.location.href = '/'` redirects to home (session is destroyed server-side).

**New client API method:** `authApi.deleteAccount()` in `client/src/api.js` — `DELETE /auth/account`.

---

### 5. Privacy Policy page
**File:** `client/src/pages/Privacy.jsx`  
**Route:** `/privacy`

Covers:
- What is collected and why
- Retention period (until deletion; backups 7 days)
- Third parties: Stripe, Google, Open-Meteo (no data sold)
- User rights under PIPEDA and CCPA
- How to delete (link to own profile edit)
- Contact email: `hello@cornhole249.com`

**Contact email in Privacy Policy is a placeholder** — update `CONTACT_EMAIL` constant at the top of `Privacy.jsx` if the actual support address differs.

Route registered in `client/src/App.jsx`. Footer link added to all pages.

---

### 6. Consent checkbox at registration
**File:** `client/src/pages/Register.jsx`

A required checkbox added above the submit button:
> "I agree to the Privacy Policy. Your email is used for account management only — no marketing."

The "Privacy Policy" text is a `<Link>` to `/privacy` that opens in a new tab. The checkbox uses the browser's native `required` validation — form cannot be submitted without it. Applies to the email/password registration form only (Google OAuth users are covered by Google's own consent flow).

---

## What Was Suggested But Not Done

### Rate limiting on auth endpoints
`/auth/login` and `/auth/forgot-password` have no rate limiting. A brute-force or email enumeration attack is possible. Recommended fix: add `express-rate-limit` middleware.

```js
// Example
const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.post('/login', authLimiter, async (req, res) => { ... });
router.post('/forgot-password', authLimiter, async (req, res) => { ... });
```

### Sentry PII capture
If `SENTRY_DSN` is set, Sentry may capture request context including user data in error traces. This is currently set to 10% transaction sampling (`server/instrument.js`). Mitigation options:
- Add `beforeSend` hook to scrub known PII fields from event data
- Disable in development to avoid accidental leaks

### Data export endpoint
PIPEDA gives users the right to access their data. There is currently no endpoint to export a user's data as a download. Low urgency, but worth adding before marketing to enterprise/regulated users.

### Near-zero PII architecture (future consideration)
The codebase already supports PIN-only (no-email) accounts. If desired, email could be made fully optional:
- Most users play via PIN/display name only
- Email collected only if user opts in for account recovery
- Google OAuth would store `google_id` but `google_email` could be dropped
- Stripe checkout would pass email through at payment time rather than storing it in `users` table

This is an architectural decision, not a compliance requirement at current scale.

---

## Files Changed

```
.env.example                        — added BACKUP_ENCRYPTION_KEY documentation
client/src/App.jsx                  — Privacy route + footer link
client/src/api.js                   — authApi.deleteAccount()
client/src/pages/PlayerProfile.jsx  — delete account UI (danger zone in edit panel)
client/src/pages/Privacy.jsx        — new file: Privacy Policy page
client/src/pages/Register.jsx       — consent checkbox
server/lib/backup.js                — AES-256-GCM encryption
server/lib/email.js                 — suppress email from dev log
server/routes/auth.js               — DELETE /auth/account endpoint
```

---

## Outstanding Production Actions

- [ ] Set `BACKUP_ENCRYPTION_KEY` in Railway (key above — store in password manager)
- [ ] Update `CONTACT_EMAIL` in `client/src/pages/Privacy.jsx` if `hello@cornhole249.com` is not the correct support address
- [ ] Review and merge branch `claude/pii-storage-audit-aDosZ`
- [ ] (Optional) Add rate limiting to auth endpoints
- [ ] (Optional) Add Sentry `beforeSend` scrubbing hook
