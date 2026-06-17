# Multi-Sport Merge Plan

**Status:** Plan only — nothing in here is built yet. Build one sport at a time, in phase order.
**Umbrella:** stays **cornhole249** (repo + product name). Other sports live inside it.
**Last updated:** 2026-06-17

---

## 0. Locked decisions (from Andrew)

| # | Decision | Choice |
|---|----------|--------|
| Sport model | How a sport attaches to data | **One sport per league.** A league is single-sport; `sport` column on `leagues`. |
| House model | Unit for cross-sport rankings | **By owner/venue.** Leagues owned by the same user form a "house," computed at query time. No grouping table. |
| Theming | Per-sport look, first cut | **Light.** Shared base theme + per-sport accent color + emoji/badges. No full runtime theme refactor (can layer later). |
| Branding | Umbrella identity | **Keep cornhole249.** No rename churn. |

### Feature directives (from the strategic brief)
- **Pool 1.1** — singles is the default/typical game; offer doubles as an option. ✅
- **Pool 1.2** — *[ASSUMED]* Race-to-N target score as a **per-league admin setting**; build it right away. ⚠️ *Confirm exact question — see Open Items.*
- **Pool 1.3** — "No." ⚠️ *Original question lost in context compaction — see Open Items.*
- **Pool 1.4** — add **straight pool** (Andrew wants to learn it).
- **Cross-sport stats** — house rankings, sport affinity, H2H across sports, best-at-everything, nemesis, jack-of-all-trades: **all YES.**
- **Digest** — **NO** global weekly digest. Instead a **consolidated digest covering only the sports a user has actually played** (played cornhole + pool → both; played only cornhole → only cornhole).
- **Other games** — add crokinole, cribbage, euchre, **and ping-pong** (new table). Add later, one at a time.
- **Planning** — plan for many sports now; build one sport at a time.

---

## 1. Safety rules (non-negotiable)

> "BE EXTREMELY CAREFUL — WE DO NOT WANT TO DELETE ANYTHING RELATED TO CORNHOLE249."

- **Additive only.** New migrations, new columns with safe defaults, new modules. Never drop/rename existing cornhole columns or routes during the merge.
- **pool249 is archived, never deleted.** Before any merge step touches pool logic: commit pool249's outstanding variant work and push pool249 to its own backup remote (mirrors what we did with `wip/league-model-local`). Keep the local clone on disk.
- **cornhole249 history preserved.** Latest origin/main + the 3 salvaged commits (017 FK indexes, 018 sequence fix, billing hardening) are live. The superseded WIP is safe on `origin/wip/league-model-local`.
- **Migrations are append-only.** Never edit an already-applied migration; new behavior = new numbered file, registered in `server/db/migrate.js`'s `MIGRATIONS` array (explicit manifest, not auto-discovery — easy to forget).

### "Merge" is a port, not a git merge
pool249 was forked from a **stale** cornhole working tree, and the two histories have diverged. So the merge is **re-implementing pool's net-new logic on top of current cornhole249 origin/main as a new sport** — not `git merge pool249`. The pool249 repo is the reference spec; current cornhole249 is the trunk.

Pool's net-new logic to port (already built & specced in pool249):
- `game_variant` (eight_ball / nine_ball / cutthroat / straight_pool), `eight_ball_end_condition` (sunk / scratch), `balls_remaining` (0–7, loser).
- `poolMarginMultiplier(ballsRemaining) = min(1.5, 1 + max(0, balls)/10)`; cutthroat = 1× (no margin); else point margin.
- Cutthroat modeling: winner = team1 (1 player), both losers = team2 (2 players) — avoids needing `team = 3`.
- Variant tabs + singles/doubles sub-toggle (Standings), 5-tile variant picker + "Racks won" labels + 8-ball extras (GameNew), variant badges (GameCard/GameDetail).

---

## 2. Technical foundation (Phase 1 — built once, benefits every sport)

### 2.1 Schema: `sport` on `leagues`
New migration `019_league_sport.js`:
```sql
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS sport TEXT NOT NULL DEFAULT 'cornhole';
-- CHECK constraint listing supported sports; widen it (new migration) as sports are added.
ALTER TABLE leagues ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('cornhole','pool','pingpong','crokinole','cribbage','euchre'));
CREATE INDEX IF NOT EXISTS idx_leagues_sport ON leagues(sport);
```
- Default `'cornhole'` backfills every existing league with zero risk.
- Per-sport game extensions (e.g. pool's `game_variant`, `balls_remaining`) land in their own migration when that sport is built — not now.

### 2.2 Sport-config registry (the keystone)
A single source of truth, mirrored server + client (`server/lib/sports.js` and `client/src/sports.js`, or one shared JSON consumed by both). Per sport:

| Field | Purpose |
|-------|---------|
| `key`, `displayName`, `emoji` | identity |
| `accent` (`{ primary, secondary }`) | **light theming** — overrides `--color-primary/secondary` CSS vars |
| `scoreModel` | `'points'` (cornhole 21), `'racks'` (pool), `'win_only'` (cutthroat), `'race_to_n'` (configurable) |
| `formats` | `['1v1','2v2', ...]` allowed team formats |
| `variants` | e.g. pool's 8-ball/9-ball/cutthroat/straight; `null` for single-variant sports |
| `marginFn(winnerRow, loserRow)` | per-sport ELO margin multiplier (cornhole = point margin via existing `marginMultiplier`; pool 8-ball = `poolMarginMultiplier(balls_remaining)`; win-only = 1×) |
| `rules`, `achievements`, `ogColors` | per-sport content |

This registry drives theming, score UX copy, variant pickers, ELO margin, OG image colors, and rules pages — so adding a sport is mostly a registry entry + a migration, not scattered edits.

### 2.3 ELO generalization (`server/lib/elo.js`)
Today `recalculateAllElos` hardcodes `marginMultiplier(winnerScore, loserScore)` (point margin, K=32, cap 1.5×). Generalize so the multiplier comes from the sport's `marginFn`:
- Look up the league's sport for each game, call `sports[sport].marginFn(winnerRow, loserRow)`.
- Cornhole keeps identical behavior (its `marginFn` = current `marginMultiplier`). **Regression-test cornhole ELO is byte-identical** before/after.

### 2.4 Theming (light)
Single `:root` block in `client/src/index.css` holds `--color-primary`, `--color-secondary`, etc. Per-sport theming = when viewing a league, set that sport's `accent` onto the primary/secondary vars (runtime style override on a wrapper, no rebuild). Everything else (surface, text, borders) stays shared. Emoji + accent give each sport identity cheaply — generalizes the pool variant-badge pattern already built.

---

## 3. Cross-sport stats (house = leagues sharing an owner)

A "house" = the set of leagues with the same owner. Combined rankings computed at query time over the shared `users` base. New endpoints under `server/routes/stats.js` (or a new `house.js`):
- **House rankings** — combined standing. Use **average percentile within each sport** (not raw ELO — ELO isn't comparable across sports), then average across the sports a player has played.
- **Sport affinity** — per player, which sport they over-perform in.
- **H2H across sports** — two players' record spanning every shared sport.
- **Best-at-everything** — highest min-percentile across all played sports.
- **Nemesis** — opponent with worst record against, across sports.
- **Jack-of-all-trades** — most sports played at ≥ some baseline percentile.
- Needs a **house view/landing** (owner-based) to surface these — since grouping is by owner, the combined page hangs off the owner's set of leagues.

---

## 4. Consolidated digest

Replace/augment the existing digest (`server/routes/digest.js`, `server/scripts/digest.js`) so a user gets **one email covering only the sports they actually played that period**:
- Detect played sports from the user's games in the window.
- Build a per-sport section (standings delta, notable games, achievements) for each played sport only.
- No global digest; no section for sports a user hasn't touched.

---

## 5. Roadmap — one sport at a time

- [x] **Phase 0 — Safety.** pool249 variant WIP committed; pushed to private `a3mckay/pool249` backup remote; cornhole backups intact.
- [x] **Phase 1 — Foundation.** `019_league_sport` migration; sport-config registry (`server/lib/sports.js` + `client/src/sports.js`); ELO generalized via per-sport `marginFn` (cornhole byte-identical, regression-tested); light-theming hook (sport accent under per-league `theme_json`). Cornhole behavior unchanged. *(commits ff61eff, 89db22f)*
- [~] **Phase 2 — Pool (sport #2).** **Shipped:** migration `020_pool_game_variants` (`game_variant` nullable/no-default, `eight_ball_end_condition`, `balls_remaining`, widened `game_type` CHECK for cutthroat); pool registry entry; sport-gated `/api/games` POST (cutthroat 1-winner/2-loser, variant fields, balls clamp); per-game sport resolution in `updateElosAfterGame`; variant marginFn (cutthroat 1×, 8-ball balls proxy, 9-ball/straight racks margin); variant UI (5-tile picker, Singles/Doubles, "Racks won", 8-ball extras, cutthroat layout); variant badges (GameCard/GameDetail); per-variant standings (`?variant=` filter + `/cutthroat` endpoint, variant tabs). Singles default + doubles (1.1) ✅; straight pool in picker (1.4) ✅. *(commits 4c662c0, e221902, 43f2a4b, 1c69752; 69/69 tests)*
  **Shipped (cont.):** Race-to-N per-league admin setting (1.2) — migration `021_league_race_to_target` (NULL = off), pool-gated admin toggle in League Settings (suggested default 7, editable), exposed via LeagueContext + race-to-N hint/quick-fill in GameNew. *(commit df86fad; 74/74 tests)* Full pool chrome theming — per-sport favicon (`favicon-pool.svg`), tab title (`🎱 <league>`), `theme-color` + `--color-navbar` (dark felt-green), sport emoji + league name in navbar, and a variant-aware Pool **rules page** (`PoolRules.jsx`: 8-ball / 9-ball / cutthroat / straight pool + race-to-N reflection). Theming driven from the client sport registry (`chrome` block).
  **Still open:** pool achievements; OG image colors (registry `accent` ready — needs plumbing into `server/og/templates`); variant-aware win% history chart (currently skipped on pool views).
- [ ] **Phase 3 — Ping-pong (sport #3).** Registry entry + score model (race-to-11, win-by-2 — confirm), minimal UI reuse.
- [ ] **Phase 4 — Cross-sport stats.** House rankings, sport affinity, H2H across sports, best-at-everything, nemesis, jack-of-all-trades + house landing view.
- [ ] **Phase 5 — Consolidated digest.** Per-sports-played email.
- [ ] **Phase 6 — Crokinole / cribbage / euchre.** One at a time; each = registry entry + score model + any game-extension migration.
- [ ] **Phase 7 — Feedback feature.** The "good feedback" item Andrew deferred ("come back to this").

Sequencing rule: a sport isn't "done" until its standings, ELO, OG images, rules page, and achievements all read from its registry entry.

---

## 6. Open items (need Andrew, not blocking the plan)

1. **Pool 1.2 / 1.3 wording.** 1.2 assumed = "Race-to-N target score as a per-league admin setting." 1.3 was a flat "No" to a question lost in compaction. Confirm both so Phase 2 scope is right.
2. **Per-sport score models to finalize at build time:** ping-pong (race-to-11 win-by-2?), cribbage (121 / skunk lines?), euchre (10 points, euchres/marches?), crokinole (20s + count), straight pool (race to a set total, e.g. 100). Decide each when its sport is built.
3. **House surfacing.** Owner-based grouping is set; still need to decide where the combined "house" page lives in nav and whether it gets a display name (even though branding stays cornhole249).
4. **Achievements cross-sport.** Whether jack-of-all-trades etc. become real `achievements` rows or a separate cross-sport board.
