# Multi-Sport Roadmap — Execution Tracker

**Purpose:** active, item-level tracker for the multi-sport work. The strategic
plan lives in `MULTISPORT_MERGE_PLAN.md`; this file is the running punch list
(what's broken, why, the fix, status). Phases 1–4 of the merge plan are done;
this roadmap covers **Phase 2.5 — Multi-sport UX hardening**, surfaced by
Andrew's real-device pool testing on 2026-06-18.

**Last updated:** 2026-06-18

---

## Decisions locked (2026-06-18)

| Topic | Decision |
|-------|----------|
| Umbrella brand | **"249" is the constant wordmark.** Active sport expresses itself beside it (`249 · 🎱 Pool`, `249 · 🌽 Cornhole`). "Cornhole249" / "Pool249" become per-sport faces of one brand. |
| Home / front door | **House hub as home (option B).** The home tap lands on the cross-sport House page (Phase-4 work) showing sport tiles → pick a sport → enter that league. |
| Switcher | **B + lightweight A.** Keep a quick sport-grouped dropdown in the navbar for same-sport hops; crossing a sport boundary is a deliberate "go home → pick sport" gesture. |
| ELO | **Per-sport ratings.** ELO is not comparable across sports (this is why House uses percentiles). A pool result must not move a cornhole rating. |

---

## Workstreams

Status key: `[ ]` not started · `[~]` in progress · `[x]` done

### WS-A — League-scoped navigation (the context cascade) — **highest priority**
**Covers feedback #2, #4, #7 (theme reverting).**
**Root cause (confirmed in code):** ~16 *bare* intra-app links/redirects
(`navigate('/games/:id')`, `to="/standings"`, `/players/:id`, etc.) across 9
files drop the `/l/:slug` prefix. Submitting a pool game in `/l/pool/games/new`
redirects to bare `/games/:id` → the **Cornhole249** route → navbar slug derives
`cornhole249` → theme, wordmark, and *every* nav link follow. One bare link
bounces you out of the league; everything after stays cornhole.
**Fix:** route every intra-app link/navigation through `leaguePath(slug, …)`
using `slug` from `useLeague()`. Both route trees wrap `LeagueProvider`
(`slug="cornhole249"` at top level, `:slug` under `/l/`), so `slug` is reliable
in both; `leaguePath('cornhole249', …)` returns the same bare paths today's
cornhole uses → **zero behavior change for cornhole**, context preserved for pool.
**Files:** GameNew, GameDetail, Games, Players/PlayerProfile, Teams/TeamProfile,
Stats, Home, Landing, TrashTalkBanner (audit `grep` list).
**Effort:** M (mechanical sweep + manual verify on a pool league).
**Status:** `[x]` — swept 14 files (GameNew, GameDetail, Games, PlayerProfile,
TeamProfile, Stats, Home, HallOfFame, TrashTalk + GameCard, StandingsTable,
PlayerCard, TrashTalkBanner). All bare intra-app links/redirects now route
through `useLeaguePath()`/`leaguePath(slug,…)`. Landing left bare (its links are
global routes: /leagues/new, /terms, /login). Build green, 97/97 server tests
pass. Remaining: manual verify on the live pool league.

### WS-B — Sport-appropriate content & chrome
**Covers feedback #6 (weather on indoor game), #3 (cornhole-board Games icon).**
**Fix:** add sport-config flags to the registry — `outdoor: true|false` and
per-sport nav/tab `icons`. Gate the Weather card on `outdoor` (pool = indoor →
hidden; keep Venue). Source BottomNav + Navbar "Games" icon (and siblings) from
the registry so they swap with the sport (🎱 for pool).
**Effort:** S–M. **Status:** `[x]` — registry gained `outdoor` (cornhole=true,
pool=false) + `icons` block (client & server). Weather now gated on `outdoor`:
hidden in GameCard badge & GameDetail card; GameNew drops the location-required
prompt + validation for indoor sports; **server skips the weather fetch** on
create + edit for indoor leagues (no wasted API calls / stored weather_json).
BottomNav Games tab swaps the cornhole-board SVG for 🎱 via `icons.games`
(desktop Navbar is text-only, no board icon to swap). Build green, 100/100.

### WS-C — Game-detail polish
**Covers feedback #7 (admin buttons overflow), #9 (winner vs racks + balls-left).**
**Fix:** (a) responsive admin action row — Share/Edit/Delete wrap or collapse to
an overflow menu on mobile. (b) When the variant/league isn't rack-scored (no
race target, e.g. 8-ball / cutthroat), render **"Winner"** instead of a numeric
score, and surface the loser's **balls-left-on-table** (`balls_remaining`, already
captured) in the matchup.
**Effort:** S. **Status:** `[x]` — (a) GameDetail header is now responsive
(`flex-col sm:flex-row` + `flex-wrap` action row) so Share/Edit/Delete wrap on
mobile instead of overflowing. (b) New `scoreModel` registry field
(cornhole=`points`, pool=`racks`) drives a `renderScore` helper: points sports
and race-to-N pool show the numeric score; pure win/loss games (single 8-ball,
cutthroat) show **"Winner"** for the winner and the loser's **balls-left** (or
`—` when not captured). Build green, 100/100. **Follow-up flagged:** server
only writes `balls_remaining` to team2 and only when team1 wins — loser balls
are dropped when team2 wins (display already degrades to `—`).

### WS-D — Branding & switcher (B + lightweight A)
**Covers feedback #1, #5.** Implements the locked branding/switcher decisions:
constant "249" wordmark + active-sport tag; House hub as home with sport tiles;
lightweight sport-grouped dropdown in the navbar for same-sport hops.
**Effort:** M. **Status:** `[x]` — three pieces:
1. **Wordmark** — Navbar now anchors a constant **"249"** + the active-sport
   face: `249 · 🌽 Cornhole`, `249 · 🎱 Pool`. Custom-logo leagues keep their
   logo + name as the face. Replaces the old "Cornhole249"/emoji-only headers.
2. **Switcher (B + lightweight A)** — new desktop sport-grouped dropdown
   (>1 league) for quick same-sport hops, with sport headers signalling a
   sport-boundary crossing; the mobile hamburger "My Leagues" list is now
   grouped by sport too. Both link to each league's home.
3. **House-as-home (conditional)** — `/` renders the cross-sport **House hub**
   for users with leagues in **2+ sports**; single-sport users keep their
   familiar league Home (no cornhole-only regression). House gained a
   **"Your Leagues" sport-tiles** front door (own house only) — pick a sport →
   enter that league (lands on Games to avoid the `/`→House loop).
Build green, 100/100 server tests pass. Remaining: manual eyeball on device.

### WS-E — Per-sport ELO (data-model change)
**Covers feedback #8.** Today `users.elo_rating` is a single global value and the
recalc blends every sport into it → pool wins move cornhole ELO. Move to
**per-sport ratings** (storage + recalc + display). Sequenced last because it's a
schema/data change; cornhole ratings must stay byte-identical after the split.
**Effort:** L. **Status:** `[x]` — per-sport ratings live in new
`user_sport_ratings(user_id, sport, rating)` (migration 022, idempotent). The
recalc is split: `recalculateAllElosBySport(games, participants, resolveSport)`
partitions games by each league's `sport` and replays every sport in isolation,
so a pool result only moves pool ratings. **Locked decision: `users.elo_rating`
stays the cornhole mirror** — `persistSportRatings` writes the cornhole bucket to
both the table and that column, so every existing cornhole read is byte-identical
(verified by a test asserting cornhole == cornhole-only replay). Non-cornhole
leagues read the table via `eloExpr/eloJoin/eloGroup` SQL helpers (emit the exact
original `u.elo_rating` snippets for cornhole → no join/COALESCE) and
`applySportElo`/`getSportRating` (no-ops for cornhole). Wired through games,
tournaments, startup recalc, standings, stats (elo-leaders + h2h), and odds. New
table mirrored into the test fixtures. 5 new tests (4 unit in elo.test.js: per-
sport partition, cornhole byte-identical, pool add/remove never moves cornhole,
default→cornhole; 1 integration in pool.test.js: pool game writes 2 pool rows +
0 cornhole rows + leaves both mirrors at 1000). 105/105 green; client build OK.

### WS-F — Proper sport picker (removes the manual DB step)
Carried over from 2026-06-17. Add a sport selector to league creation and accept
+ validate `sport` in `POST /api/leagues` (against the registry CHECK list), so
pool/ping-pong/etc. leagues are self-serve — no hand-edited `leagues.sport`.
**Effort:** S–M. **Status:** `[x]` — sport selector (emoji grid sourced from the
client `SPORTS` registry) added to CreateLeague; cornhole-only Scoring-Rules
picker now gated behind `sport === 'cornhole'`. `POST /api/leagues` accepts
`sport` (defaults cornhole) and validates with new `isLiveSport()` helper —
**validates against the LIVE registry, not the broader DB CHECK list**, so a
league can't be created for a planned-but-unbuilt sport (pingpong/crokinole/…).
3 new tests (default→cornhole, accept pool, reject unsupported). 100/100 green.

### WS-G — Matches / series (best-of-N between two fixed sides)
New feedback (2026-06-20). A *match* groups several individual games into a race
to N wins between two **fixed** sides (cornhole "best of 3", pool "race to 5").
**Sport-agnostic** (Andrew: cornhole plays best-of-3s too). Games in a match need
NOT be consecutive — another match can be logged in between (one table / one set
of boards), so progress is **derived by replaying the match's games**, never a
stored counter. **Effort:** L (own workstream). **Status:** Phase 1 (backend)
`[x]`; Phase 2 (client UI) `[ ]`.
- **Phase 1 (done):** migration 023 (`matches` table + nullable `games.match_id`,
  additive/idempotent — existing games untouched). Pure `lib/matches.js`
  (matchProgress replays games→running score + completion; gameFitsMatch validates
  a game's two teams are the match's two sides in either orientation).
  `lib/matchSync.js` (recomputeMatch persists status/winner_side/completed_at).
  `routes/matches.js` (POST create, GET list with running score, GET :id detail
  with rack-by-rack games + hydrated side players). `POST /api/games` accepts
  `match_id` (validates open + sides-fit, attaches, recomputes after each game).
  Mounted at `/api/matches` + `/api/l/:slug/matches`. Fixtures synced. 6 new
  tests; 117/117 green.
- **Phase 2 (todo):** client — start-a-match UI, log games into an open match
  (winner picker already exists), a match detail page with running score, and
  surfacing open matches + grouping in the games list.

---

## Execution order

1. **WS-A** — league-scoped navigation (unblocks basic pool usability)
2. **WS-F** — sport picker (kills the manual DB step)
3. **WS-B** — sport-gated weather + registry icons
4. **WS-C** — game-detail polish (winner/balls-left, button overflow)
5. **WS-D** — branding + switcher (B + lightweight A)
6. **WS-E** — per-sport ELO (own chunk; data-model)

---

## Context note

The `pool` league (id 3, slug `pool`, name "Pool") was hand-created in prod on
2026-06-17 as a stopgap (all 10 users added as members). **WS-F now makes this
self-serve** — new-sport leagues no longer need a manual `leagues.sport` set
(once the new front-end + server are deployed).
