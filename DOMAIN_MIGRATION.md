# Domain Migration Runbook — cornhole249.com → games249.com

**Purpose:** a complete, do-it-when-ready checklist to move the app from
`cornhole249.com` to `games249.com` with **zero user-facing breakage** (no broken
links, no logged-out users, no spam'd emails, no dead OAuth/Stripe).

**Status:** NOT STARTED. This is a plan only — nothing here is built yet.

**Golden rule:** the architecture is **env-var driven**, so most of the work is
external config (DNS, email, OAuth, Stripe dashboards), not code. **Keep
`cornhole249.com` registered and pointed at the app** so old links/QRs/emails keep
working via redirect — do **not** let it lapse.

> **Critical distinction — domain ≠ league slug.** `cornhole249` is also the
> internal **slug** of the flagship league (the `/` and bare routes, special-cased
> throughout). This migration changes the **domain only**. Do **NOT** rename the
> league slug — it's high-risk DB + routing surgery with no user benefit. The site
> can live at games249.com while the flagship league's slug stays `cornhole249`.

---

## Phase 0 — Decisions to lock before starting

- [ ] **D1. Buy `games249.com`** (Andrew — Claude cannot purchase). Register for
      multiple years; enable auto-renew.
- [ ] **D2. Keep `cornhole249.com`** registered + auto-renew (for redirects).
- [ ] **D3. Brand rename?** Choose one:
      - **Domain-only** — site stays branded "Cornhole249", just lives at the new
        URL. (Minimal.)
      - **Full rebrand to "Games249"** — also rename the product name everywhere
        (see Phase 3). (Adds the "Branding" section below.)
- [ ] **D4. Subdomain strategy?** Choose one (see Appendix A):
      - **A. Path-based** (recommended) — `games249.com/l/<slug>`. No arch change.
      - **B. Vanity redirects** — `cornhole.games249.com` → `…/l/cornhole`.
      - **C. True per-sport subdomains** — large effort; deferred by default.
- [ ] **D5. Email approach?** Choose one (see Phase 1 §Email):
      - **Keep Gmail sender** but as a Google Workspace `@games249.com` mailbox, OR
      - **Transactional provider** (Resend/Postmark) on `@games249.com`.
- [ ] **D6. `www` or apex?** Decide canonical host (current prod is
      `www.cornhole249.com`). Recommend keeping `www.games249.com` canonical to
      match existing redirect pattern; apex → www.

---

## Phase 1 — External setup (do FIRST; nothing user-facing changes yet)

These can all be staged **before** cutover. The app keeps serving cornhole249.com
the whole time.

### DNS (games249.com)
- [ ] Point `www.games249.com` at Railway (CNAME to the Railway app domain).
- [ ] Point apex `games249.com` at Railway (A/ALIAS per Railway's instructions).
- [ ] Add the custom domain(s) in **Railway → Settings → Domains**; wait for
      Railway to issue TLS certs (both apex + www).
- [ ] (If subdomain option B/C) add wildcard `*.games249.com` + wildcard TLS.

### Email deliverability (the highest-risk item — start early, DNS propagation is slow)
- [ ] Stand up sending identity for `@games249.com` per **D5**.
- [ ] Add **SPF** TXT record for games249.com.
- [ ] Add **DKIM** record(s) from the provider.
- [ ] Add **DMARC** TXT record (`p=none` to start, tighten later).
- [ ] Send test emails (verify, reset, join-request, digest) and confirm they land
      in **inbox**, not spam, with correct From name/address.

### Google OAuth (Google Cloud Console → Credentials → OAuth client)
- [ ] Add **Authorized JavaScript origins**: `https://www.games249.com` (+ apex if used).
- [ ] Add **Authorized redirect URIs**: `https://www.games249.com/auth/google/callback`.
- [ ] Keep the cornhole249.com origins/URIs in place until cutover is verified.
- [ ] Note: `GOOGLE_CALLBACK_URL` defaults to the **relative** `/auth/google/callback`
      (`server/index.js:103`), so it auto-follows the host — but the **console must
      list the absolute games249.com URI** or sign-in 400s.

### Stripe (Dashboard)
- [ ] Add/Update **webhook endpoint** → `https://www.games249.com/api/billing/webhook`.
      Copy the new signing secret into env (`STRIPE_WEBHOOK_SECRET`) if it changes.
- [ ] Success/cancel/return URLs are built from `APP_URL` (`server/routes/billing.js:90,136,179`)
      — they auto-follow; no Stripe change needed beyond the webhook.
- [ ] Update any Stripe-hosted **branding / business URL** to games249.com.

### Railway environment variables (stage; flip at cutover)
- [ ] `APP_URL` = `https://www.games249.com`  *(drives email links, Stripe redirects, OG footer base)*
- [ ] `CLIENT_ORIGIN` = `https://www.games249.com`  *(CORS — `server/index.js:60`)*
- [ ] `GOOGLE_CALLBACK_URL` — leave relative, OR set `https://www.games249.com/auth/google/callback`.
- [ ] Email creds for the new sender (`GMAIL_USER` or new provider API key + `EMAIL_FROM`).
- [ ] Confirm `SESSION_SECRET` is set to a real secret in prod (currently defaults to
      `'cornhole249-dev-secret'` — `server/index.js:84`; unrelated to domain but verify).

---

## Phase 2 — Code changes (hardcoded references)

All small. Exact spots found in the audit:

- [ ] **`server/index.js:43-57`** — the prod redirect block. Replace the
      `host === 'cornhole249.com' → www.cornhole249.com` rule with:
      1. `cornhole249.com` **and** `www.cornhole249.com` → `https://www.games249.com$url` (301, preserves old links/QRs/emails)
      2. apex `games249.com` → `https://www.games249.com$url` (301)
      3. keep the HTTP→HTTPS rule.
- [ ] **`server/og/templates.js:125`** and **`:1324`** — change the `cornhole249.com`
      footer caption in share images to `games249.com` (or `Games249`).
- [ ] **`client/src/pages/Privacy.jsx:4`** — `CONTACT_EMAIL` `hello@cornhole249.com`
      → `hello@games249.com` (must match a real, monitored mailbox).
- [ ] **`client/src/pages/Terms.jsx:46`** — link text `cornhole249.com/refunds` → games249.com.
- [ ] **`client/src/pages/Admin.jsx:300`** — text `cornhole249.com/claim-account` → games249.com.
- [ ] **`server/lib/email.js:54`** — `from: "Cornhole249 <…>"` sender name (and the
      `GMAIL_USER` it wraps) → games249 sender. Update the header comment (`:7,:11`).
- [ ] **`client/src/components/InviteKit.jsx:47`** — comment example URL (cosmetic only).
- [ ] Anything `window.location.origin`-based (invite links, QR poster) needs **no
      change** — it auto-follows the domain. ✅

### Branding rename (ONLY if D3 = "Full rebrand to Games249")
- [ ] `client/index.html` — `<title>`, `apple-mobile-web-app-title` (`:15`), `#pre-load` (`:43`).
- [ ] `client/public/manifest.webmanifest` — `name`, `short_name`, `description`.
- [ ] Favicons / `icon-192.png` / `icon-512.png` / `founder.jpg` if they carry the wordmark.
- [ ] `server/lib/email.js` — subjects ("Verify your **Cornhole249** email", etc.) + body brand.
- [ ] ~63 `"Cornhole249"` string occurrences across `client/src` + `server` — sweep and replace
      where user-facing. (Navbar wordmark is already "Games249".)
- [ ] Leave the **`cornhole249` slug** and all `slug === 'cornhole249'` logic untouched.

---

## Phase 3 — Cutover sequence (the actual switch)

Order matters. Do during low traffic.

1. [ ] Confirm Phase 1 (DNS/TLS/email/OAuth/Stripe) all **green** on games249.com.
2. [ ] Merge + deploy the Phase 2 code changes.
3. [ ] Flip Railway env vars (`APP_URL`, `CLIENT_ORIGIN`, email) → games249.com; redeploy.
4. [ ] Verify games249.com serves the app over HTTPS (apex + www).
5. [ ] Verify `cornhole249.com/*` now 301-redirects to `www.games249.com/*` (path preserved).
6. [ ] Run the full **Phase 4 acceptance checklist**.
7. [ ] Announce the new URL; keep cornhole249.com redirecting indefinitely.

---

## Phase 4 — Acceptance criteria (must ALL pass for "seamless")

### Routing & TLS
- [ ] `https://www.games249.com` loads the app; valid TLS cert.
- [ ] `https://games249.com` → 301 → `https://www.games249.com` (same path).
- [ ] `http://…games249.com` → 301 → `https://…`.
- [ ] `https://cornhole249.com/l/pool/standings` → 301 → `https://www.games249.com/l/pool/standings` (**path + query preserved**).
- [ ] `https://www.cornhole249.com/<anything>` → 301 → games249.com equivalent.
- [ ] Deep links (a shared `/l/<slug>/games/<id>`, `/join`, `/verify-email/<t>`) all resolve post-redirect.

### Auth & sessions
- [ ] Existing logged-in users are **not** forced to re-auth unexpectedly after cutover
      (cookie host changes — confirm behavior; communicate if a re-login is required).
- [ ] Email/password login works on games249.com.
- [ ] **Google sign-in** completes end-to-end on games249.com (no redirect_uri_mismatch).
- [ ] Logout works; session cookie set on the games249.com host.

### Email (send a real one of each, confirm inbox + correct links/brand)
- [ ] Verify-email → link points to `www.games249.com/verify-email/…` and works.
- [ ] Password reset → `www.games249.com/reset-password?token=…` works.
- [ ] Join-request notification (to admin) lands in inbox.
- [ ] Join approved / declined emails correct.
- [ ] Weekly digest → links + unsubscribe (`/unsubscribe?uid=…`) point to games249.com.
- [ ] From name/address is the games249 identity; SPF/DKIM/DMARC pass (check headers).

### Billing (Stripe)
- [ ] Upgrade checkout → success returns to `www.games249.com/.../settings?billing=success`.
- [ ] Cancel returns correctly.
- [ ] Webhook fires to games249.com endpoint and updates plan (test with a real/ test-mode purchase).
- [ ] Billing portal `return_url` lands back on games249.com settings.

### Invites, QR, sharing, OG
- [ ] A freshly generated invite link uses `www.games249.com`.
- [ ] The **downloaded join QR poster** encodes a games249.com URL and scans to the join page.
- [ ] Existing/printed cornhole249.com QRs still work (via redirect).
- [ ] Share-image (OG) footer reads games249.com; social unfurls show the new domain.

### PWA / mobile
- [ ] Installed PWA still launches (manifest `start_url` is relative `/` — fine).
- [ ] If rebranded: home-screen name/icon updated on fresh install.

### App smoke test (on games249.com, mobile + desktop)
- [ ] House/league selector, league Home, Games, Standings, Stats, Trash all load.
- [ ] Log a game; log a best-of-N match rack; standings/Elo update.
- [ ] CSV export downloads (Pro league).
- [ ] No console errors; no CORS errors in network tab.

### SEO / housekeeping
- [ ] 301s (not 302) from cornhole249.com so link equity transfers.
- [ ] Update external references you control (social bios, app store listings, business cards, Google Business, etc.).

---

## Rollback plan
- [ ] Keep cornhole249.com fully functional (DNS + TLS) until games249.com is verified for several days.
- [ ] Rollback = revert the env vars (`APP_URL`/`CLIENT_ORIGIN`) and the Phase 2 redirect commit; cornhole249.com resumes as canonical.
- [ ] OAuth/Stripe: leave the old cornhole249.com origins/URIs/webhook in place during the bake period so rollback is instant.

---

## Appendix A — Subdomain strategies (decision D4)

- **A. Path-based (recommended):** `games249.com/l/<slug>`. The current model. No
  architecture change — the domain swap alone is enough. **Effort: included above.**
- **B. Vanity redirects:** `cornhole.games249.com` 301 → `games249.com/l/cornhole`.
  Needs wildcard DNS + a host-based redirect rule. Nice shareable links, no auth
  complexity. **Effort: Small–Medium.**
- **C. True per-sport subdomains:** the real app served at `cornhole.games249.com`.
  Requires: wildcard DNS + TLS; Host-header → sport/league routing; **session cookie
  `domain: '.games249.com'`** (currently unset — `server/index.js:87-92`) for shared
  login; and Google OAuth centralized on a single auth subdomain (Google won't
  wildcard JS origins). **Effort: Large (days); cross-subdomain auth is the hard
  part.** Defer unless there's a strong product reason.

## Appendix B — Why this is mostly low-risk
Env-driven base URL (`APP_URL`), CORS (`CLIENT_ORIGIN`), relative OAuth callback,
and `window.location.origin`-based invite/QR links mean the app **follows whatever
domain it's served on**. The only hard-coded domain strings are the redirect rule,
the OG footer, and a few contact/link texts (Phase 2). The genuine risk lives
**outside the code**: email deliverability (SPF/DKIM/DMARC) and the OAuth/Stripe
dashboards — budget time there, not in the codebase.
