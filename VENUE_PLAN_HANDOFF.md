# Venue Plan — Handoff Notes

## What was built

A **Venue plan** (CAD $199/yr) was added as a new pricing tier for bars, rec centres, and establishments that run multiple cornhole league nights. Unlike the existing per-league Pro plan ($80/yr per league), the Venue plan is an **account-level subscription** — one payment covers all leagues owned by that user.

The feature is merged to `main` and deployed to Railway. The backend is fully implemented. Two things remain before it's live to customers: a Stripe product, and a frontend checkout entry point.

---

## Current state of the codebase

### New / changed files

| File | What changed |
|------|-------------|
| `server/db/migrations/013_venue_plan.js` | New migration — adds `venue_plan`, `venue_stripe_subscription_id`, `venue_stripe_period_end` to `users` table |
| `server/db/migrate.js` | Registered migrations 012 (was missing) and 013 |
| `server/lib/stripe.js` | Added `venue_yearly` to `PRICES`, references `STRIPE_PRICE_VENUE_YEARLY` env var |
| `server/lib/plan.js` | Added `hasVenuePlan(user)` helper — exported alongside `effectivePlan` and `isPro` |
| `server/middleware/planAccess.js` | `requirePro` now runs a parallel query to check the league owner's venue plan; grants access if owner has active venue subscription |
| `server/routes/billing.js` | Checkout handles `venue_yearly` (no leagueId needed); webhooks handle venue activation, Pro→Venue upgrade cancellation with proration, venue cancellation grace periods, and skip grace periods on per-league subs when owner has venue |
| `client/src/pages/Landing.jsx` | Added "For establishments" Venue section below the pricing grid and a Venue FAQ entry |

### Plan logic summary
- Per-league plans (`pro`, `weekend_pass`, `free`) live on the `leagues` table — unchanged
- Venue plan lives on the `users` table (`venue_plan = 'venue'` when active)
- `planAccess.js` checks venue first (owner lookup), then falls back to per-league plan
- `hasVenuePlan(user)` requires `venue_plan === 'venue'`, a non-null `venue_stripe_subscription_id`, and `venue_stripe_period_end` in the future

### Webhook behaviour
- **Venue checkout completes**: sets venue plan on user, then cancels all active per-league Pro subs with `prorate: true` (credit applied to Stripe customer balance for next renewal)
- **Venue subscription renewed/updated**: updates `venue_stripe_period_end` on user
- **Venue subscription cancelled**: clears venue fields on user; scans all owned leagues and starts 7-day grace periods for any with >8 members that lack their own individual Pro subscription
- **Per-league subscription cancelled**: if owner has active venue plan, skips grace period (handles the upgrade cancellation webhook race)

---

## Remaining work

### 1. Create the Stripe product (manual, ~2 min)

Go to Stripe Dashboard → Products → Add Product:
- **Name**: Venue Plan
- **Price**: CAD $199.00, recurring, yearly
- Copy the generated **price ID** (looks like `price_1Ab...`)

Then in Railway → your service → Variables, add:
```
STRIPE_PRICE_VENUE_YEARLY=price_1Ab...
```
Railway will redeploy on save. The migration runs automatically on server startup.

---

### 2. Venue plan checkout entry point (frontend, ~1–2 hours)

**The problem**: the "Get Venue Plan →" button on the landing page (`client/src/pages/Landing.jsx`) currently links to `/leagues/new` as a placeholder. Users can't actually purchase the Venue plan yet.

**The API is ready**: `POST /api/billing/checkout` with body `{ plan: 'venue_yearly' }` (no `leagueId` needed). Returns `{ url }` — redirect to Stripe Checkout. Requires auth; returns 401 if not logged in.

**Suggested approach**: convert the landing page CTA into a button (not a `<Link>`) that:
1. If the user is logged in → POST to `/api/billing/checkout`, redirect to Stripe URL
2. If not logged in → redirect to `/login?next=venue` (or similar), then after login, trigger the checkout

You'll also want to handle the `?venue=success` query param that Stripe redirects back to (currently lands on `/` after venue checkout). Show a success toast or banner.

**Relevant files**:
- `client/src/pages/Landing.jsx` — the CTA button to wire up (search for "Get Venue Plan")
- `client/src/components/UpgradeModal.jsx` — optional: add a "Running multiple leagues? See Venue Plan →" link at the bottom for users who hit the modal from a per-league upgrade prompt
- `client/src/api.js` (or wherever `billingApi.checkout` is defined) — the checkout helper already works; just call it with `(null, 'venue_yearly')` or update the signature to make `leagueId` optional

---

### 3. Venue billing in LeagueSettings (polish, ~1 hour)

**The problem**: a Venue customer visiting any of their leagues' settings pages will see the standard "Upgrade to Pro" section, which is confusing — they're already covered.

**What to do**: in `client/src/pages/LeagueSettings.jsx`, fetch the current user's venue plan status (needs a new API endpoint or include it in the existing session/user response) and show "Covered by Venue Plan" instead of the upgrade prompt.

The server already knows about the venue plan via `planAccess.js`, but the frontend has no way to query it yet. You'll need a small endpoint — e.g. `GET /api/billing/status` — that returns the user's current plan info (venue plan active, per-league plan for the current league, etc.).

---

### 4. Venue welcome email (polish, ~30 min)

When a user completes a Venue checkout, there's no welcome email. The per-league Pro flow sends `sendProWelcomeEmail` — there should be an equivalent for venue.

**Where to add it**: `server/routes/billing.js`, inside the `checkout.session.completed` handler, in the `plan === 'venue_yearly'` branch (around line 236). Call a new `sendVenueWelcomeEmail` function from `server/lib/email.js`, similar to `sendProWelcomeEmail` but without a specific league name.

---

## Key env vars (for reference)

```
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_PRO_MONTHLY
STRIPE_PRICE_PRO_YEARLY
STRIPE_PRICE_WEEKEND_PASS
STRIPE_PRICE_VENUE_YEARLY   ← new, needs to be set
```
