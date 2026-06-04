# Cornhole249 — Commercial Release Spec

> The canonical plan for taking Cornhole249 from a single-league hobby app into a publicly available, for-sale SaaS product. Re-upload this file to any Claude session to resume work.

---

## How to use this doc

This file is both the spec **and** Claude's operating manual for building from it. Read this section first.

### Operating rules for Claude

1. **Before starting any feature in the Feature Catalog:** read the relevant section in full, then ask 2–5 refining questions about ambiguities or edge cases. Wait for answers before writing code.
2. **Sequence is fixed:** build phases in the order listed (Phase 1 → Phase 2 → …). Don't jump ahead unless explicitly told to.
3. **After each phase ships:** summarise what was built, what was tested, what was deferred, and any spec amendments needed.
4. **Voice:** follow the Voice & Copy Guide below. Loud surfaces lean in; error/payment screens stay clean. No swears, no innuendo (kids may play).
5. **Engineering rigor:** follow the Quality Standards section. CI passes, regression test for every bug fix, no console errors, build verified before declaring done.
6. **Don't over-engineer.** If a feature can ship in a day at v1 quality, don't propose three days of polish.
7. **When uncertain, ask.** Cheaper than rewriting.

### Operating rules for the human (Andrew)

1. If you don't reply to Claude's refining questions, Claude proceeds with the documented defaults and notes it in the summary.
2. To change a locked decision, update this spec first, then ask Claude to build.
3. You can reorder Phase 5+ if priorities shift. Phases 1–4 are foundational and ordered for dependency reasons.

---

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Platform name | Stay with **Cornhole249** | Specific brands sell better in early markets; revisit only when adding non-cornhole games |
| URL structure | Path-based: `cornhole249.com/l/<slug>` | Lower ops cost than subdomains; upgrade later if needed |
| Default league | Cornhole249 (Hamilton) lives at `cornhole249.com` root | Doubles as marketing demo + Andrew's own league |
| Database | **Postgres** (managed on Railway) | Commercial product needs proper concurrency, JSON columns, ops tooling |
| Auth | Email + password + Google SSO | PIN-only is too weak for paying customers; keep PIN as optional fast-login for shared devices |
| Pricing currency | CAD initially | Aligns with initial Canadian audience; revisit when going international |
| OG image rendering | `satori` + `@resvg/resvg-js` | No headless browser, ~50ms renders, works on Railway |
| Email provider | Gmail SMTP via Nodemailer | Switched from Resend pre-launch; credentials in Railway (`GMAIL_USER`, `GMAIL_APP_PASS`) |
| Hosting | Railway | Existing setup; supports Postgres, branch deploys, wildcard SSL |
| Analytics | PostHog (free tier) | Funnel + retention + product analytics in one |
| Error monitoring | Sentry (free tier) | Catches what tests miss |
| Payments | Stripe | No real alternative; supports CAD + global cards + subscription billing |
| Public leagues | Anyone on internet can browse; only members can comment/log | Maximises viral surface; protects league integrity |
| Free league cap | 2 leagues per admin (hard cap) | Allows evangelism; forces upgrade for power users |
| Player cap on free | 8 players per league (hard cap) | Real friction when a free league grows; natural upsell moment |
| Hard locks on free | No tournaments, no Stats page, no custom rules, no theme/branding, no CSV export | Premium features that don't break habit formation |
| Soft features that stay free | Standings, game logging, comments/trash talk, basic profiles, last-5/streak indicators | Core habit-forming surfaces; never gate these |
| Watermark on shared images | Always present on free **and** Pro | Brand visibility for the platform; one less Pro differentiator but a permanent organic-growth surface |
| Superadmin Pro grants | Site-wide admins (e.g. Andrew) can flip any league to Pro without payment | Comp influencers/evangelists/partners without billing friction |

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + Tailwind (existing) |
| Backend | Express + Node 20 (existing) |
| Database | Postgres (managed on Railway, migration from SQLite during Phase 2) |
| ORM | Plain SQL via `pg` (or `drizzle` if migration tooling becomes painful — Claude to recommend during Phase 2) |
| Session | `express-session` + `connect-pg-simple` (replaces existing SQLite store) |
| Auth | bcrypt-hashed passwords + Google OAuth via `passport-google-oauth20` |
| Payments | Stripe + Stripe Billing (subscriptions) + Stripe Checkout |
| Image rendering | `satori` + `@resvg/resvg-js` |
| Email | Resend |
| Analytics | PostHog (browser + server) |
| Error monitoring | Sentry (browser + server) |
| CI | GitHub Actions |
| Hosting | Railway (web + Postgres + volume for static assets) |
| Cache for OG images | On-disk hash-keyed cache in Railway volume |

---

## Pricing

| Tier | Price | Includes |
|---|---|---|
| **Free** | $0 | 1 league (admin can run up to 2 total), 8 players/league, standings, game logging, comments, basic profiles, watermarked share images |
| **Pro Monthly** | **CAD $9/mo** | Unlimited leagues, unlimited players, tournaments, Stats page, custom rules, custom theme/branding, CSV export |
| **Pro Yearly** | **CAD $80/yr** (saves ~26%) | Same as Pro Monthly |
| **Weekend Pass** | **CAD $12 one-time** | 7 days of full Pro access. Designed for bachelor parties, beer festivals, one-off events. Auto-converts to free after 7 days (no surprise rebill). |

**Note:** The "Cornhole249" watermark appears on all shared OG images regardless of plan — it's a permanent organic-growth surface, not a paid removal.

**Pricing principles:**
- Yearly is the anchor; surface it prominently with "2 months free" framing
- Weekend Pass is the impulse-buy SKU for event-driven use cases
- Adjust prices ONLY in response to data (signup conversion, churn). Don't pre-optimise.
- Stripe processing fees: ~2.9% + $0.30 — eaten by us, prices above are the user-facing number

---

## Voice & copy guide

### Principle

**Tongue-in-cheek, sharp, observational. Confident, never cruel.** No swearing, no innuendo (kids may play), no mean-spirited individual targeting. Like a witty friend roasting you over beers, not a bully.

### Dial guide

| Volume | Surfaces |
|---|---|
| **Loud** | Weekly digest content + subject lines, empty states, achievement unlocks, trash talk UI, upsell copy, anniversary triggers, share card footers |
| **Medium** | Onboarding copy, game logging confirmations, tournament setup flow |
| **Quiet (functional)** | Error states, payment/billing screens, account/security copy, all legal/ToS |

### Examples (canonical reference)

| Polite | Right voice |
|---|---|
| "No games logged yet" | "No games yet. The board is judging." |
| "Win streak 5 unlocked" | "Five wins in a row. The neighbours are talking." |
| "Wiggz passed Andrew" | "Wiggz dethroned Andrew. Andrew has not commented." |
| "Closest game: 10-9" | "Andrew won by one bag. One. Single. Bag." |
| "Dave is on a 3-loss streak" | "Dave is 0-4. The board has questions." |
| "Free plan: 2 leagues" | "Free plan: 2 leagues. Want more? Cough up $9 and run brackets like someone with ambitions." |

### Hard rules

- **Errors are voice-quiet, always.** Frustrated users + jokes = salt in the wound. Functional, clear, brief.
- **Money screens are voice-quiet, always.** People want clarity when paying. Save the personality for the success screen after.
- **Never use individual players as the butt of a joke without context** — "Dave has a 3-loss streak" is fine; "Dave sucks" is not.
- **Subject lines must be truthful.** No clickbait. The job of the subject is to advertise the most interesting *real* fact in the email.

### Voice doc location

Mirror this section into `CLAUDE.md` at the repo root during Phase 1. Update both places when the guide evolves.

---

## Quality standards

### Engineering rigor

These are non-negotiable for v1.

1. **CI on every push.** GitHub Actions runs server tests + client build. Failed = no merge. Failed = no deploy.
2. **Regression test for every fix.** If you fix a bug, write a test that fails before the fix and passes after. The test outlives Claude's memory.
3. **Test new logic.** Any non-trivial new server route or library function gets a test before declaring done.
4. **Branch deploys.** Every PR gets a Railway preview URL. QA happens against the preview, not main.
5. **Build verified.** Run `npm run build` after any JSX/CSS change. JSX errors hide until build.
6. **Sentry wired up.** Browser + server. Real errors must surface within 30 seconds of happening.
7. **No console errors in dev tools.** A single warning in the console is a bug to triage.
8. **Edge cases enumerated.** Before implementing any non-trivial change, list 3+ edge cases and how each is handled. This goes in the PR description.
9. **Plan before code on multi-file changes.** Use ExitPlanMode on any change spanning 3+ files. Human sees the plan first.

### Definition of done (per feature)

- [ ] Acceptance criteria from spec met
- [ ] Server tests passing locally + CI green
- [ ] Client builds with no warnings
- [ ] Manual smoke test on at least 1 mobile breakpoint + 1 desktop breakpoint
- [ ] No new console errors
- [ ] Sentry confirms no production errors in the 24h after merge
- [ ] Spec updated if anything changed

---

## Feature catalog

Phases are ordered. Within a phase, features can be built in any order unless noted. Each feature includes a Why, In Scope, Out of Scope, Tech Notes, and Open Questions list. Claude must ask the Open Questions before building.

---

### Phase 1 — Share & referral infrastructure

**Goal**: Every interesting moment in the app becomes a shareable, referral-tagged URL with a rich link preview. Foundation for organic growth before paid features exist.

#### 1.1 OG image rendering pipeline

**Why:** Rich link previews in iMessage / Discord / Twitter / WhatsApp are the single highest-leverage virality lever. Foundation for everything else in this phase.

**In scope:**
- Add `satori` + `@resvg/resvg-js` to server dependencies
- New route family: `GET /og/:type/:id.png` (e.g. `/og/game/14.png`, `/og/player/3.png`)
- Disk cache in Railway volume, keyed by `{type}:{id}:{content_hash}.png` — invalidates when underlying data changes
- Base layout component (header with "Cornhole249" wordmark, footer with subtle CTA)
- Default fallback card for unknown/missing entities

**Out of scope (v1):**
- Animated cards
- Per-user custom card backgrounds (Pro feature, defer to Phase 5)
- Multiple aspect ratios (just 1200×630, fits OG + iMessage + Discord)

**Tech notes:**
- Satori needs fonts loaded as ArrayBuffers — bundle Abril Fatface (display), Nunito (UI), and a fallback emoji font (Twemoji or Noto Color Emoji) in `server/og/fonts/`
- Cache invalidation: hash includes the relevant DB fields (e.g. for a game card: score + participants + venue + weather). When the hash changes, generate fresh PNG.
- Render time target: <100ms p95 on Railway. Cache hit target: <20ms.

**Locked decisions:**
- Fonts: stay with Abril Fatface (display) + Nunito (UI) — match the in-app visual identity as closely as possible.
- Fallback card: generic "Couldn't find that — explore Cornhole249" card, linking to the root cornhole249.com landing.
- Watermark: always rendered, on every card, free or Pro. Footer reads "Cornhole249" with a subtle CTA. Removing it is **not** a Pro perk.

#### 1.2 Card types

**Why:** Each card type is a distinct virality surface tuned to its content. Built on top of 1.1.

**Cards to build:**

| Type | URL | Content |
|---|---|---|
| Game | `/og/game/:id.png` | Avatars, score (winner highlighted with trophy), venue, date, weather emoji. Neutral framing — no winner POV variant. |
| Tournament (overview) | `/og/tournament/:id.png` | Full bracket visualisation + tournament name + status (in progress / complete / scheduled). For sharing the tournament at a high level. |
| Tournament match | `/og/tournament/:id/match/:matchId.png` | Single match result with players, score, round label (e.g. "Semifinal"). For sharing a specific match win/loss. |
| Player | `/og/player/:id.png` | Avatar, name + nickname, W-L, +/-, current streak (flame/ice emoji) |
| Standings | `/og/standings.png` (Phase 2: `/og/standings/:leagueId.png`) | Top 3 with avatars + points, "Week of [date]" |
| Trash talk quote | `/og/comment/:id.png` | The quote, author avatar, game context underneath |
| Achievement | `/og/achievement/:userId/:key.png` | Achievement icon, name, flavour text, player name |
| League landing | `/og/league/:id.png` (Phase 2) | Name, top 6 member avatars, game/player counts |

**Out of scope (v1):**
- Detailed per-player heat maps, advanced stats visualizations
- "Story" formats (vertical 9:16) — defer until we know users want it

**Locked decisions:**
- Game cards: keep neutral, single variant. No "winner POV" version with gold trim. The score speaks for itself.
- Tournament cards: split into two endpoints — the overview card (full bracket) for high-level shares, and the per-match card (with round label) for individual win/loss shares. The share UI picks the right endpoint based on what the user is sharing from.

#### 1.3 Server-side OG meta injection

**Why:** SPAs serve the same `index.html` for every route, so link previews show the same generic card everywhere. Without this, the card pipeline is wasted.

**In scope:**
- Express middleware that intercepts `GET /games/:id`, `/players/:id`, `/tournaments/:id`, `/standings`, etc.
- Parses the route, looks up the entity, injects route-specific `<meta property="og:image">`, `<meta og:title>`, `<meta og:description>`, plus Twitter card equivalents
- Returns the modified `index.html`
- Bots only: detect crawler user agents (`facebookexternalhit`, `Twitterbot`, etc.) and serve the bot a minimal HTML with just the meta tags — saves rendering the full React app for crawlers

**Out of scope:**
- Full SSR — overkill for v1
- Pre-rendering at build time — dynamic content makes this impractical

**Open questions:**
- For private leagues (Phase 2): should OG cards still render for crawlers, or 404? (Privacy vs link unfurling tradeoff.)

#### 1.4 Share affordance UI

**Why:** OG cards work passively (someone shares a URL). The share modal lets users actively export images, copy links, send via SMS/email/WhatsApp.

**In scope:**
- `<ShareButton entityType entityId />` component used across the app
- Click opens a sheet/modal showing:
  - Live preview of the rendered card
  - **Copy link** button (includes referral param — see 1.6)
  - **Copy image** button (writes PNG to clipboard via `navigator.clipboard.write`)
  - **Download PNG** button
  - **Web Share API** button on mobile (iOS/Android native share sheet)
- Share affordances appear on:
  - Game logged confirmation screen (largest dopamine moment)
  - Game detail page (header action)
  - Tournament detail page
  - Player profile page
  - Standings page (overall standings)
  - Tournament completion modal (champion's victory variant) ✅ shipped

**Out of scope:**
- Twitter/Facebook auto-post integrations (link sharing is enough)
- Direct DM-to-platform integrations
- Per-row "share my rank" on standings (removed — low leverage)
- Share button on individual trash talk comments (removed — low leverage)
- QR code inside ShareButton modal (removed — QRShare component handles QR separately)

**Locked decisions:**
- UX pattern: **always show the custom modal** with the card preview, copy link, copy image, download PNG. On mobile (and any browser supporting Web Share API), include a **"Native share…"** button inside the modal that triggers the OS share sheet. Users who want the preview see it; users who just want to share get one extra tap to the native sheet. Best of both.
- All options visible by default — no "More options" hiding. The modal is the moment of intent; surfacing all paths reduces friction.

#### 1.5 Invite landing pages

**Why:** Today, joining a league is "go to cornhole249.com and type in a join code." That's friction at the most important conversion moment. Invite landing converts the click into a signup with social context fresh in their mind.

**In scope:**
- New public route: `/join/:code` (no auth required)
- Renders:
  - "**[Inviter name] invited you to [League name]**" headline
  - Current member avatars (social proof — up to ~12)
  - Recent activity preview (last 3 games, current top 3 in standings)
  - One big primary CTA: **"Join this league"** → registration with code pre-filled
  - Smaller secondary: "Already have an account? Sign in" → after auth, league is joined
- OG meta tags on this page (uses 1.3): preview shows league name + member avatars when shared
- Phase 2 update: respects league privacy — public league always works; private league requires the code

**Out of scope:**
- Inviter-to-invitee messaging
- Multi-league bulk invites

**Open questions:**
- For the "recent activity preview": is showing real game results pre-signup OK for private leagues? (Trades preview value for some privacy concession.)
- Should the invite landing show *who* the inviter is by avatar, or just by name?

#### 1.6 Referral tracking plumbing

**Why:** Every share URL is a potential referral. Capturing who-referred-whom from day one costs nothing and tells us exactly when (and whether) to invest in a reward system later.

**In scope:**
- Database: add `referred_by_user_id` (nullable FK to `users.id`) on `users` table
- All URLs generated *by the app* for sharing append `?ref=<current_user_id>` automatically (via a `buildShareUrl()` helper)
- On any first-visit-from-referral: set a `ref` cookie (30-day expiry) with the referrer's user_id
- On signup: read the cookie (and `?ref=` if present in the signup URL), record on `users.referred_by_user_id`
- Admin dashboard surface: a simple `/admin/referrals` page listing referrer → referees + signup dates (for human visibility, no automated rewards yet)

**Out of scope (deferred to v2 — see "V2 Backlog"):**
- Rewards (free month for both when referee upgrades)
- Referrer leaderboards
- Anti-fraud rate limiting

**Open questions:**
- Should the `?ref=` parameter use the user_id directly, or a separate `ref_code` field (privacy: ref_code doesn't expose user IDs)?
- 30-day cookie: long enough? Industry standard is 30–90 days.

---

### Phase 2 — Multi-tenancy

**Goal**: Cornhole249 becomes a platform that hosts many leagues. Andrew's league stays at the root URL as the demo. Anyone can create their own.

#### 2.1 Postgres migration

**Why:** Foundational. Multi-tenancy on SQLite would work but Postgres is the right base for a commercial product.

**In scope:**
- Provision Postgres on Railway
- Move session store from SQLite to `connect-pg-simple`
- Migrate schema: convert all existing tables to Postgres types (TEXT, INTEGER, TIMESTAMPTZ, JSONB where useful)
- One-time data dump from current SQLite → load into Postgres
- Update all `getDb()` calls to use `pg` client + parameterised queries
- Backup script (daily Postgres dump to Railway volume)

**Out of scope:**
- ORM (still plain SQL — pick this fight only if migrations become painful)
- Read replicas (premature)

**Open questions:**
- Plain `pg` client or `node-postgres` + a query builder like `kysely`? Claude to recommend during build.
- Should we keep the SQLite file as a frozen archive after migration? (Yes — disaster recovery insurance.)

#### 2.2 League data model

**Why:** Add the tenancy layer to the existing schema.

**In scope:**
- New table: `leagues` (id, slug, name, owner_user_id, plan ['free'|'pro'|'weekend_pass'], is_public BOOL, rules ['hamilton'|'aca'|'custom'], custom_rules_json JSONB nullable, theme_json JSONB nullable, created_at, expires_at TIMESTAMPTZ nullable for weekend passes)
- New table: `league_memberships` (id, league_id, user_id, role ['owner'|'admin'|'player'], joined_at)
- Add `league_id` (nullable in migration step, NOT NULL after backfill) to: `games`, `venues`, `tournaments`, `comments`, `trash_talk`, `achievements`, `join_codes`
- Backfill: every existing row gets `league_id = 1` (Cornhole249); seed the `leagues` row with slug=`cornhole249`, owner=Andrew, is_public=true, plan='pro'
- Backfill `league_memberships` from existing `users` (everyone is a player of Cornhole249)

**Out of scope:**
- Per-league custom domains (defer; subdomain support is in v2 backlog)
- Cross-league transfers of games (no real use case)

**Open questions:**
- For weekend passes: when `expires_at` passes, should the league become read-only, locked entirely, or auto-downgrade to free tier? (Recommendation: read-only + a "Renew Pro" banner.)
- Should `slug` be user-chosen at creation, or auto-generated? (Recommendation: auto-generated from name, with override option for Pro.)

#### 2.3 Routing & URL structure

**Why:** Every league gets its own URL space. Cornhole249 stays at root for demo + Andrew's nostalgia.

**In scope:**
- Cornhole249 at `/` (no path prefix — special-case in the router)
- All other leagues at `/l/<slug>/...` (e.g. `/l/bachparty/standings`, `/l/bachparty/games`)
- Currently logged-in user has a "current league" in their session
- League switcher in navbar (dropdown showing all leagues the user is a member of, plus "Create a new league")
- Public league pages accessible without auth (read-only); private league pages 404 for non-members

**Out of scope:**
- Vanity URLs / custom domains (v2)
- Deep links into a league bypassing the switcher (the switcher always reflects current league)

**Open questions:**
- When a user visits `/l/<slug>/...` while signed into a different league: switch their session, or open in a "read-only viewer" mode for the visited league? (Recommendation: switch session if they're a member; viewer mode if they're not.)
- What's the URL for *creating* a league? `/leagues/new` outside any league context.

#### 2.4 Authorization model

**Why:** Multi-tenant means strict isolation. Every server route must check the user has access to the league they're operating on.

**In scope:**
- Middleware: `requireLeagueAccess(req, res, next)` — reads league from URL slug, verifies user is a member (for write actions) or league is public (for read actions)
- Role checks: `requireLeagueRole('admin' | 'owner')` for league settings, tournament creation, member management
- Existing `requireAdmin` (site-wide admin) preserved separately — that's Andrew's god mode
- All existing queries filtered by `league_id` (no cross-tenant data leak even with a bug)

**Out of scope:**
- Granular per-feature permissions (e.g. "comment-only player") — single membership tier per user-league is enough for v1

**Open questions:**
- Site admins (Andrew): full read access across all leagues, or only the ones they're members of?
- Owner transfer (one owner sells/gives league to another user): in scope for v1 or v2?

#### 2.5 League creation flow

**Why:** Critical conversion moment for new sign-ups.

**In scope:**
- `/leagues/new` page (signed-in users only)
- Form: name (required), public/private toggle, rules dropdown (default ACA), optional first invite emails
- On submit: creates league, makes creator owner, generates first join code, redirects to a freshly-minted league at `/l/<slug>/welcome`
- Welcome page: invite kit (copy link, QR, share buttons) + "What now?" choice cards

**Out of scope:**
- Templates for specific use cases (the onboarding wizard handles this — Phase 3)

**Open questions:**
- Should free users hit the 2-league cap *before* the form opens, or after they submit? (Recommendation: before, with a clear upgrade prompt.)

---

### Phase 3 — Onboarding & use case wizard

**Goal:** First-time users get a tailored experience based on why they're here, dropping them into the right next-step.

#### 3.1 Use case wizard

**In scope:**
- Triggered on first league creation (after Phase 2.5's `/leagues/new` form, before welcome screen)
- 4 paths:
  - **Recurring backyard league** → land on Standings (empty state)
  - **Tournament (bachelor party, one-day event)** → land on Create Tournament form, seeding pre-filled
  - **Open play (festival, weekend get-together)** → land on Log a Game with no preamble
  - **Just exploring** → tour the Cornhole249 demo league
- Selected path is stored on `leagues.use_case` for analytics + future tailoring
- Use case affects which nav items are emphasised (e.g. Tournament path = Tournaments badge highlighted in nav)

**Out of scope:**
- Multi-step wizards within each path (defer — see what users need first)

**Open questions:**
- Should the wizard appear on every new league created by a user, or only the first? (Recommendation: every league — they may have different use cases.)

#### 3.2 Invite kit

**In scope:**
- Shown on league creation completion, also accessible from league settings
- Single modal with:
  - Big "Share invite link" with copy-to-clipboard
  - SMS button (`sms:` deep link with prefilled body)
  - Email button (`mailto:` with prefilled subject + body)
  - QR code with download
  - Native share via Web Share API on mobile
- The invite URL is the Phase 1.5 invite landing page

**Open questions:**
- For SMS prefill: include the inviter's name in the message body, or anonymise? (Recommendation: include — social context drives conversion.)

---

### Phase 4 — Auth upgrade

**Goal:** Move off PIN-only auth to a real commercial-grade login.

#### 4.1 Email + password

**In scope:**
- New columns on `users`: `email` (unique, lowercase), `password_hash`, `email_verified_at`, `password_reset_token`, `password_reset_expires_at`
- Registration: email + password + display name (PIN no longer required)
- Login: email + password
- Forgot password: email a reset link, expires in 1 hour
- Email verification: send verification link on signup, account works while unverified but shows a banner
- bcrypt for hashing (12 rounds)

**Migration of existing users:**
- Existing Cornhole249 users keep their PIN as a fallback
- On next login, prompt them to add an email + password (skippable for 30 days, then required)

**Out of scope:**
- 2FA (defer; not needed for a sports app)
- Password strength meters beyond a basic length+character check

**Open questions:**
- Minimum password length? Recommendation: 10 characters, no other rules (length > complexity is the modern consensus).
- Email verification: block login until verified, or allow with a banner? (Recommendation: allow with banner — verification is rate-limited friction otherwise.)

#### 4.2 Google SSO

**In scope:**
- `passport-google-oauth20` integration
- Single button on login + register: "Continue with Google"
- On first Google login: create user with `email` set, `password_hash` null
- If a user already exists with that email: link the Google account (don't duplicate)

**Out of scope:**
- Apple SSO (defer; add only if iOS demand is real)
- Facebook/Twitter login (no value for this audience)

---

### Phase 5 — Payments

**Goal:** Pro tier + Weekend Pass live, paying customers possible.

#### 5.1 Stripe integration

**In scope:**
- Stripe products + prices configured: Pro Monthly (CAD $9/mo), Pro Yearly (CAD $80/yr), Weekend Pass (CAD $12 one-time)
- Stripe Checkout for new subscriptions / one-time purchases
- Stripe Customer Portal for billing management (existing subscribers manage their own card / cancel)
- Webhooks for: subscription created, subscription updated, subscription cancelled, invoice paid, invoice failed, charge succeeded (Weekend Pass)
- Webhook signature verification (mandatory)
- All Stripe IDs stored: `stripe_customer_id` on users, `stripe_subscription_id` on leagues

**Out of scope (v1):**
- Annual plan upgrades from monthly (handled by Stripe Portal — no custom UI needed)
- Pause subscriptions (rarely used in this space)

**Open questions:**
- Are subscriptions tied to *user* or *league*? (Recommendation: per-league — a user could pay Pro for one league and run another on free.)
- For Weekend Pass: should the league downgrade to free or become read-only on expiry? (Locked decision: read-only with "Renew" banner.)

#### 5.2 Paywall enforcement

**In scope:**
- Server-side check on every Pro-gated action: tournaments create, Stats page API, custom rules, theme update, CSV export
- Client-side: Pro-gated features show in nav with a small lock icon; clicking opens upgrade modal
- Upgrade modal: shows what's locked, lists Pro perks, two buttons (Monthly / Yearly)
- Hard caps enforced server-side: 2-league-per-free-admin, 8-player-per-free-league

**Out of scope:**
- Granular per-feature pricing (one Pro tier covers everything)
- A/B testing prices (premature)

**Open questions:**
- When a league downgrades from Pro to free (subscription cancelled): what happens to tournaments, custom rules, etc.? (Recommendation: features hidden, data preserved — upgrading later restores access.)

#### 5.3 Pro perks

Each one is a small feature to build. List here so they're not forgotten:
- **Unlimited leagues, players, tournaments** (enforcement only — the features exist)
- **Stats page** (currently shipping for free — gate it server-side)
- **Custom rules**: form to define point values, win condition, positioning rules — stored on `leagues.custom_rules_json`
- **Theme customisation**: header colour, accent colour, league logo upload — stored on `leagues.theme_json`
- **CSV export**: button on Standings, Games, Stats pages; server route generates CSV

The "Cornhole249" watermark on shared images is intentionally **not** a Pro perk — it remains on all cards regardless of plan, as a permanent brand-visibility surface.

**Open questions:**
- League logo upload: bytes stored where? Railway volume + URL, or S3-compatible? (Recommendation: Railway volume initially; migrate to object storage if it gets large.)
- Custom rules complexity: how flexible? Just scores + win condition, or full rule book editor? (Recommendation: form-based with named fields, not free text — keeps it sanitised and structured.)

#### 5.4 Superadmin Pro grants

**Why:** Comp influencers, beta partners, friends-and-family, and special-case leagues without forcing them through Stripe. Important for relationship management and for handling support cases ("my payment failed but I need access for tonight's tournament").

**In scope:**
- New field on `leagues`: `plan_override` (nullable, one of `'pro'|'free'|null`) and `plan_override_reason` (TEXT, audit trail)
- When `plan_override` is set, it takes precedence over Stripe-derived plan status
- New admin route: `PATCH /api/admin/leagues/:id/plan` (requires site-wide superadmin) accepting `{ plan_override, reason }`
- New admin UI at `/admin/leagues`: searchable list of all leagues with plan badge, current Stripe status, and a "Grant Pro / Revoke override" action with a reason field
- All grants logged to a `plan_override_audit` table (who, when, league, from, to, reason) so we have a paper trail
- Grants don't expire automatically — must be revoked manually. (No "grant Pro for 30 days" expiry option in v1; can be added later if needed.)
- Granted Pro leagues function identically to paid Pro leagues — same features, same OG cards, same everything. The user receives no different treatment.

**Out of scope (v1):**
- Self-service "request a comp" form for users (would invite spam)
- Per-feature grants (e.g. "give them Stats page but not tournaments") — single all-or-nothing flag

**Open questions:**
- Should comped Pro leagues see any indicator inside their own UI that they're on a granted plan? (Recommendation: no — they should feel like normal Pro customers. Internal audit log is sufficient.)
- If a granted-Pro league later signs up for paid Pro themselves, does the override get cleared? (Recommendation: yes — paid plan supersedes; clear override automatically on subscription creation.)

#### 5.5 Downgrade: grace period & player cap enforcement

**Why:** When a Pro league cancels its subscription and has more than 8 members, we can't silently strip access — that destroys trust. A grace period gives the admin a window to resolve it gracefully. If they don't act, we fall back to a deterministic default (oldest 8 members) rather than leaving the league in an undefined state.

**The full design (locked decisions):**

| Decision | Choice |
|---|---|
| Grace period length | 7 days from subscription cancellation |
| Behaviour during grace period | League operates normally — all players can log games and comment. Pro features (Stats, Tournaments, etc.) are locked immediately. |
| Admin selection window | Admin can choose which 8 players stay active **only during the grace period**. Once the grace period lapses, the choice is frozen and cannot be changed by the admin. |
| Default if admin doesn't act | First 8 members by chronological join date (`league_memberships.joined_at ASC`) are kept active. The rest are frozen automatically when `grace_period_ends_at` passes. |
| Frozen player access | Can browse the league (view standings, history, profiles). **Cannot** log games, comment, or be selected as a participant in new games. |
| Frozen player in game creation UI | Appears greyed out and unselectable in the player picker. |
| Frozen player in-app message | Persistent banner when browsing the league: "Your access to [League] has been limited. Ask the league owner to re-upgrade to Pro to restore your access." |
| Data preservation | All historical games, comments, and stats for frozen players are preserved and visible. Nothing is deleted. |
| Permanence | Once a player is frozen, they stay frozen until Pro is restored. Admins cannot unfreeze individual players on the free plan. No toggling allowed. |
| Restoration | Upgrading back to Pro (any plan) instantly unfreezes all members. |
| Frozen players buying Pro | Deferred. For now, the frozen player message should direct them to ask the league owner to re-upgrade. |

**Email notifications:**

| Trigger | Recipient | Content |
|---|---|---|
| Subscription cancelled (grace starts) | League owner | "Your Pro subscription has ended. You have 7 days — until [date] — to choose which 8 players keep full access to [League]. If you don't choose, we'll automatically keep your first 8 members. [Choose now →]" |
| 1 day before grace period ends (only if admin hasn't resolved) | League owner | "Tomorrow, [League]'s player cap kicks in. Choose your 8 now to decide who stays — or we'll automatically keep your first 8 by join date. [Choose now →]" |

**In scope:**
- New column: `leagues.grace_period_ends_at` (TIMESTAMPTZ, nullable) — set when subscription cancels if `member_count > 8`
- New column: `league_memberships.frozen_at` (TIMESTAMPTZ, nullable) — set when a member is frozen; null = active
- Webhook `customer.subscription.deleted`: if member count > 8, set `grace_period_ends_at = NOW() + 7 days` and send grace-start email. If ≤ 8 members, no action needed.
- Cron job (daily): find leagues where `grace_period_ends_at < NOW()` and `plan = 'free'` and still have >8 active members → freeze all members beyond the oldest 8 by `joined_at`
- Cron job (daily): find leagues where `grace_period_ends_at` is tomorrow and admin hasn't resolved → send warning email
- League Settings admin UI: during the grace period only, show a "Manage player access" panel listing all members with checkboxes (max 8 selectable). Submitting this choice immediately freezes the unchecked players and clears `grace_period_ends_at`. Once submitted (or after expiry), panel is hidden — no further changes allowed.
- All game-logging routes: check `league_memberships.frozen_at IS NULL` for each participant; reject frozen members with 403
- Comments / trash-talk routes: same frozen check
- Game creation client: query membership list; render frozen players greyed out with `disabled` and a tooltip "Access limited"
- Frozen member sees persistent banner when visiting any page under `/l/:slug/`

**Out of scope (v1):**
- Frozen players purchasing Pro on behalf of the league
- Admin choosing to freeze fewer than the full excess (e.g. keeping 6 instead of 8) — always fills to 8
- Per-player override (unfreeze one person without full Pro upgrade)

**Open questions (to resolve before building):**
- Should the League Settings "manage player access" panel show during the grace period even if the league has exactly 8 members (i.e. no action needed)? Recommendation: hide it — only show when member count > 8.
- If a frozen player is later approved in a different league, does their frozen status in this league affect anything? No — `frozen_at` is per `league_membership` row, fully scoped to one league.
- Day-before warning email: if the admin resolves it at 11pm the night before, does the email still send? Recommendation: run the cron check before midnight and skip if already resolved.

---

### Phase 6 — Marketing landing & legal

**Goal:** cornhole249.com still hosts Andrew's league, but also explains the product to first-time visitors.

#### 6.1 Public homepage

**In scope:**
- New homepage at `/` for logged-out visitors (signed-in users go to their default league)
- Content:
  - Hero with one-line pitch + "Create your league" CTA + "See it live" link to Cornhole249 league
  - Three use-case showcases (recurring league, tournament, weekend event) with screenshots/cards
  - Pricing table (Free / Pro / Weekend Pass)
  - FAQ section (5–8 critical questions)
  - Footer with legal links, contact, social

**Out of scope:**
- Blog / content marketing surface (defer)
- Customer testimonials (need customers first)

**Open questions:**
- Tagline? (Recommendation: "Cornhole249 — your league, your crew, your rules.")
- Hero visuals: animated screenshot? Static? Video? (Recommendation: static rendered card collage — fast, won't break.)

#### 6.2 Legal pages

**In scope:**
- Terms of Service
- Privacy Policy
- Refund Policy (recommend: 7-day full refund on Pro purchases, no refunds on Weekend Pass since it's by definition time-limited)
- Cookie notice (lightweight — we use minimal cookies)

**Tech notes:**
- Use Termly or similar template generator (~$10/mo or free tier) — don't hand-write these
- Footer links from every page

**Open questions:**
- Operating entity / business address on legal pages? (Andrew to provide.)

---

### Phase 6.5 — PII Compliance & Data Safety ✅ Complete

**Goal:** Achieve minimum legal compliance under PIPEDA (Canada) and CCPA (US) before public launch. Completed in a separate cloud session on June 3, 2026. All changes shipped to `main`.

#### What we store (audit findings)

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

#### Completed ✅

| Item | File(s) | Notes |
|------|---------|-------|
| Privacy Policy page | `client/src/pages/Privacy.jsx` | PIPEDA + CCPA language; contact `hello@cornhole249.com` |
| Delete account endpoint | `server/routes/auth.js` `DELETE /auth/account` | Hard-deletes PII; anonymises `users` row to preserve game history; destroys session |
| Delete account UI | `client/src/pages/PlayerProfile.jsx` | Two-step confirmation in own profile edit panel |
| Backup encryption | `server/lib/backup.js` | AES-256-GCM via Node `crypto`; key set via `BACKUP_ENCRYPTION_KEY` env var |
| Consent checkbox at registration | `client/src/pages/Register.jsx` | Required checkbox linking to Privacy Policy before account creation |
| Dev email logging fix | `server/lib/email.js` | No longer logs recipient address when `GMAIL_USER` is unset |

#### Production action

- ✅ `BACKUP_ENCRYPTION_KEY` set in Railway (June 3, 2026)

#### Still outstanding (not yet done)

| Item | Severity | Notes |
|------|----------|-------|
| Rate limiting on `/auth/login` + `/auth/forgot-password` | Security hardening | Add `express-rate-limit`; 20 req / 15 min window |
| Sentry PII scrubbing | Low risk | Add `beforeSend` hook to strip PII fields from error events |
| Data export endpoint | Nice-to-have | PIPEDA right of access; low urgency pre-launch |

---

### Phase 7 — Analytics

**Goal:** Know what users actually do. Inform pricing, copy, and roadmap decisions with data.

#### 7.1 PostHog integration

**In scope:**
- Browser SDK + server SDK
- Identify users on login (PostHog distinct_id = our user_id)
- Auto-capture pageviews
- Custom events for the funnel:
  - `landing_page_viewed`
  - `signup_started`
  - `signup_completed` (with `referred_by_user_id` set if applicable)
  - `league_created` (with use_case property)
  - `invite_sent` (channel: link/sms/email/qr)
  - `invite_accepted`
  - `game_logged` (with game_type)
  - `share_button_clicked` (entity_type, channel)
  - `upgrade_modal_viewed` (trigger: tournament/stats/players_cap/leagues_cap)
  - `subscription_created` (plan)
  - `weekend_pass_purchased`
- Funnel dashboards: signup → league created → invite sent → game logged → upgrade
- Cohort analysis: users by signup week, retention by week 1/2/4/8

**Out of scope:**
- Session replay (privacy + cost)
- Feature flags for A/B testing (defer — premature for our scale)

**Open questions:**
- Any events I'm missing that would matter for product decisions?

---

### Phase 8 — Help / Knowledge Base

**Goal:** Self-service support for common questions. Reduces inbox load. Drives user confidence in the product.

#### 8.1 Help section + search

**In scope:**
- New section at `/help`
- Article model: slug, title, body (Markdown), category, tags, updated_at
- Articles seeded as MDX files in `client/src/help/articles/` (build-time loaded, not DB)
- Search box: keyword match across title + body
- Article listing by category
- Article view with related-article links + "Was this helpful? [Y/N]" feedback

**Out of scope:**
- Article authoring UI (Andrew edits MDX files in the repo)
- Article versioning

#### 8.2 Initial article set (seeded by Claude)

Claude writes these as part of Phase 8:

1. **How do I invite players to my league?**
2. **How do I create a tournament?**
3. **What's the difference between Hamilton Rules and ACA?**
4. **How do I upgrade to Pro?**
5. **What's the difference between public and private leagues?**
6. **Why does my +/- look different than I expect?**
7. **How do I recover my PIN?** (legacy users)
8. **How do I reset my password?**
9. **How do refunds work?**
10. **How do I add a venue?**
11. **What happens when my Weekend Pass expires?**
12. **How do I cancel my subscription?**

**Open questions:**
- Tone for help articles: clear+functional (no jokes), or sprinkle voice? (Recommendation: clear+functional with a tiny touch of personality in intros only. Help articles are voice-quiet by default.)

#### 8.3 Contact form

**In scope:**
- `/help/contact` page
- Form with subject + body
- Before submit: keyword match against KB → "These articles might help:" with 3 suggestions
- Below suggestions: "Still need help? Send us a message" button
- On submit: sends to Andrew's email via Resend

**Out of scope:**
- LLM-powered ticket triage (defer until inbox volume justifies it)
- Live chat / ticketing system

---

### Phase 9 — PWA install

**Goal:** Mobile users can install the app to their home screen. Increases retention dramatically with near-zero effort.

#### 9.1 PWA manifest + service worker

**In scope:**
- `manifest.webmanifest` with icons (192x192, 512x512), theme color, display: standalone
- Minimal service worker for offline shell (cache static assets, fall through to network for API)
- Install prompt: appears on mobile browsers after 2nd session, dismissible
- iOS-specific: meta tags for status bar style + apple-touch-icon

**Out of scope:**
- Full offline mode (no game logging while offline — defer; needs conflict resolution)
- Push notifications (Phase 10 covers email; push is more invasive)

**Open questions:**
- Should the install prompt also appear on desktop? (Recommendation: yes — desktop PWA is a quiet win.)

---

### Phase 10 — Retention (weekly digest)

**Goal:** Bring users back with genuine value, not bait. One weekly email per active league.

#### 10.1 Weekly digest email

**In scope:**
- Cron job (Railway scheduled job): every Sunday at 7pm league-local-time, generate + send a digest for every league with ≥1 game in the past week
- Recipients: all members of that league who haven't opted out
- Content (voice-loud per the guide):
  - Subject line: one specific headline ("There's been a coup at #1" / "Five games, one photo finish")
  - Leaderboard changes (who moved up/down)
  - Biggest win (largest margin)
  - Closest game
  - Game of the week (highest combined score)
  - MVP (best W% over the week, min 2 games)
  - Heater (3+ win streak)
  - Cold streak (3+ loss streak)
  - Top trash talk quote
  - Notable milestones (player hit a round number of games, first H2H win, etc.)
  - Weather curiosity (if data is rich enough)
  - Footer: small "View full standings" link, opt-out link
- One coherent email per week, NOT separate notifications for each event
- Voice: tongue-in-cheek per guide, never bait

**Out of scope:**
- Push notifications (defer — see 9.1)
- Per-user customised digests beyond opt-out (defer)

**Open questions:**
- Should free leagues get the digest, or Pro-only? (Recommendation: free leagues get a basic version with one or two highlights; Pro gets the full digest with all sections — quality differentiation, not a hard lock.)
- Send time: 7pm league-local is a guess. Optimise after launch with data from PostHog open rates.

#### 10.2 Anniversary triggers

**In scope:**
- For Weekend Pass purchasers: cron job sends an email at 11 months after purchase ("Last year you ran [Tournament Name]. Run it again?") with a one-click "Revive my league" CTA
- For Pro subscribers: cron job sends a yearly recap email on subscription anniversary

**Out of scope:**
- Birthday emails / individual user anniversaries (too low-leverage)

---

## V2 backlog

These are committed but not v1. Build after launch, in roughly this order.

| Feature | Why deferred |
|---|---|
| **Referral rewards** (free month for both on Pro upgrade) | Plumbing tracked in v1; ship the reward only after data shows referrals drive real signups |
| **Subdomain URLs** (`myleague.cornhole249.com`) | Wildcard SSL setup is fine, but the upgrade isn't needed until we have customers asking for it |
| **Custom domains** (`mybachelorparty.com` → user's league) | Premium feature; very few customers will care |
| **Per-league push notifications** | Email digest is enough for v1 retention |
| **Native mobile apps** | PWA covers 95% of the value |
| **Other games** (pool, cribbage, crokinole, euchre, Carcassonne, Klask, Catan) | Rules are pluggable but each game needs its own scoring/UI work. Cross this bridge when a paying customer asks. |
| **End-user-added games** | Free-form rule editor is a UX rabbit hole; defer until we have multiple first-party game types built |
| **League owner transfer** | Rarely needed; manual admin action for now |
| **Bulk invite via CSV** | Single-link sharing covers 95% of cases |
| **API for integrations** | Premature without demand |

---

## Open strategic decisions (deferred, but tracked)

| Decision | When to revisit |
|---|---|
| Rebrand from Cornhole249 to a multi-game platform name | When ≥3 paying customers ask for non-cornhole games |
| Subdomain URLs | When ≥5 customers request "their own URL" |
| Apple SSO | When ≥10% of signups come from iOS Safari |
| Native mobile apps | When PWA install rate plateaus AND there's a missing-feature pain point |
| Pricing changes | After 50 paying customers, with PostHog conversion data |

---

## Build process

### Per-feature workflow

For each feature in the catalog, Claude follows this process:

1. **Read** the feature section in this spec end-to-end.
2. **Re-read** any other section the feature touches (Voice Guide, Quality Standards, Tech Stack).
3. **Ask** 2–5 refining questions for any open questions in the feature section, plus anything the spec is ambiguous on. Wait for human reply.
4. **Plan** (use ExitPlanMode if change spans 3+ files).
5. **Build** following the engineering rigor standards (tests, build verification, no console errors).
6. **QA** manually on at least one mobile breakpoint and one desktop breakpoint.
7. **Commit + push** with a body explaining what changed and why.
8. **Summarise** for the human: what shipped, what was deferred, what was tested, any spec amendments needed.
9. **Wait** for the human to confirm before moving to the next feature.

### Sequencing override

The human can reorder or skip features. If they say "skip Phase 9 for now," Claude marks Phase 9 as deferred in the spec and proceeds to the next.

### Spec amendments

Anything Claude learns during a build that contradicts or extends this spec should be raised as a proposed amendment **before** changing it. The human approves spec changes explicitly.

---

## Definition of "v1 ship-ready"

The product is launchable when:

- [ ] Phases 1–7 complete (share/referral, multi-tenancy, onboarding, auth, payments, marketing, analytics)
- [ ] Phase 8 (help/KB) seeded with the 12 initial articles
- [ ] Phase 9 (PWA) install prompt working on iOS Safari + Chrome Android
- [ ] Phase 10 (digest) live and sending weekly
- [ ] Cornhole249 league migrated and serving from the new multi-tenant platform with no data loss
- [ ] CI green for 7 consecutive days
- [ ] Zero Sentry errors for 24 consecutive hours under production traffic
- [ ] Legal pages live and linked
- [ ] First non-Andrew paying customer onboarded successfully

After this, the product can be marketed publicly. Until then, treat it as private beta.

---

*End of spec. Re-upload to a Claude session to resume work.*
