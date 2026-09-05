# TASK-1811 — Classic historical season foundation

Status: Season Orbit selected by the owner; production Classic Season integrated in PR #212.

## Scope

Build the historical schedule and ghost comparison before wiring a new game surface.
Legacy's random all-era league and circle-method matchweeks cannot stand in for a real
historical season. This slice adds a server-only archive adapter and pure comparison
functions, with no route, storage migration, pack activation, or engine change.

## Archive audit (2026-09-05)

Read every fixtures and standings snapshot, 1992 through 2025 inclusive:

- All 34 have every directed home-away pair exactly once, with completed scores.
- 1992–1994: 22 clubs, 462 fixtures, 42 games per club.
- 1995–2025: 20 clubs, 380 fixtures, 38 games per club.
- Every club's played/W/D/L/GF/GA record agrees with the committed standings.
- Every committed points total equals 3W+D. This is internal snapshot consistency,
  not independent verification of historical sanctions or the upstream data source.
- Fixture rows contain actual dates, but no matchweek number. Postponements make
  equal-sized chronological batches an invented schedule.

The permanent `classic-season-archive.test.ts` repeats the audit through the real loaders.
It also pins Arsenal's 2003 opener against Everton (2–1) and final 90 points, 26 wins,
12 draws, no losses. All archives must be non-null: empty loops cannot pass this test.

## Implemented contracts

- `adapter/classic-season.ts`: load validated snapshots via existing loaders; keep numeric
  club IDs in ascending order and map fixtures to league indices. Source row order and
  final rank never define club identity. Missing, incomplete, unplayed, contradictory or
  duplicate data returns null; never reduce the historical league to available clubs.
- `domain/classic-season.ts`: validate a complete double round robin; sort by actual UTC
  date with fixture ID as deterministic tie-break. No fabricated matchweeks or entropy.
  Fixtures are copied rather than sorting/mutating the caller's archive.
- Ghost comparison consumes a completed prefix of the coach's historical fixtures,
  joined by fixture ID. Results may arrive in any storage order; duplicates, gaps,
  foreign fixture IDs and invalid scores are rejected. Home and away scores are oriented
  to the coach before awarding points.
- Cumulative ghost points compare exactly the fixtures already played. Final published
  points/rank remain a separate target. The adapter retains any difference between
  earned and published points as `pointsAdjustment`, tested with a synthetic deduction;
  it does not invent the timing of sanctions for intermediate tables.
- Existing `SeasonRun` and IndexedDB slots are unchanged. Historical results are not
  simulated events or replay tuples. The adapter uses shared table arithmetic only.

## Next implementation slices

1. Measure usable rated squads for each club-season and define the Classic pack's
   season-scoped pool; never reuse Legacy's all-era rival endpoint. Design the season/club
   chooser and ghost presentation through the owner’s playable concept workflow
   (`CLAUDE.md`, game-surface rule), reusing approved match screens where possible.
2. Add a static, bounded data delivery path and chronological season progression.
   Proposed progression: advance through the league calendar to each coach fixture,
   simulate rivals honestly with stable fixture-identity seeds, and allow unequal games
   played after postponements. Define the final rival-only tail and same-date ordering
   explicitly; do not pass calendar batches through Legacy's complete-week assumptions.
3. Add isolated Classic save identity (season, club IDs, fixture schedule identity, squad,
   seed, append-only results). Specify archive-drift recovery before sharing a slot with
   Legacy. Played scores stay immutable across engine changes.
4. Integrate auto-sim and opt-in play, historical comparison, final target and resume.
   Verify home/away, 22-club seasons, failed loads, duplicate returns, refresh and both
   locales; unlock only the implemented format in the mode registry.

Era substitution rules, rotation/injuries and Survival remain separate follow-ups.

## Local validation

- Type-check and lint passed.
- 64 new tests passed; 87 tests passed including the existing season domain suites.
- Mutation proof: forcing the coach to be home made the away comparison tests fail;
  restoring the implementation made them pass.
- Full unit suite attempted twice (default and two workers). Both stopped in a native
  Node/libuv worker crash during happy-dom image-fetch teardown, reporting
  `ERR_IPC_CHANNEL_CLOSED`; this is not a green full-suite result. CI must verify the
  complete suite before merge. No routes or rendered surfaces changed in this slice.

## Squad and progression continuation (2026-09-05)

- All **686 club-seasons** field at least one legal XI using only that season's players.
  Formation coverage is 3–20 supported shapes per club; the chooser must offer only
  supported shapes. Season squad payloads measure **198,923–225,918 bytes** before
  compression. Serve one selected season, not all 34 as a page prop.
- `loadClassicSquads` builds one shared rating context per season and respects the
  existing `playerInSquad` membership helper, including players who represented multiple
  clubs. It does not infer precise transfer-date availability from season totals.
- `classicLineup` uses deterministic bipartite assignment with reassignment, not an
  ineligible fallback. Player identity is unique within each XI. This proves legal
  feasibility; it does not claim a globally optimal rating assignment.
- `advanceClassic` appends a calendar prefix through the next coach fixture; on the last
  coach fixture it completes the rival-only tail. Unequal games played are allowed.
  A supplied played score must match that exact next fixture. Existing results remain
  unchanged; seeds derive from fixture identity and the season seed.
- Classic's final app route and saved-run recovery are still pending the surface choice.
  The prototype does not persist simulation progress and does not claim to implement
  interactive minute-by-minute match coaching.

### Playable concept review

A local gallery is available at `http://localhost:8903/`, with its sources in the shared
workspace's sibling `classic-gallery/` directory. It imports the real progression and
simulation code, using adapter exports for 1992, 2003 and 2015. Thirty layout/treatment
combinations share a single run. Choose a season, club and supported formation; simulate
fixtures or five at a time; compare against the same historical fixtures; save a concept.
This is round 1 of the owner's concept workflow, not a production route or final design.
The formation/club/season controls explicitly restart the prototype run.

Chromium verification passed all 30 desktop interaction loops and all 30 mobile horizontal
bounds checks. A full 1992 run finishes 42 coach fixtures and all 462 league games. The
concept choice persists across reloads. No page errors were reported. Desktop and mobile
screenshots live beside the gallery, and the desktop screenshot was visually inspected.

Next dependent step: owner chooses a frame, then refinements/animation choices as needed;
implement the selected screen, static data route and isolated save identity with the
already-tested squad and calendar primitives.

Continuation validation: 127 tests passed across ten Classic/season suites; type-check
and lint passed. CI must run again on the continuation commit before merge.

## Season Orbit integration (2026-09-06)

The owner rejected the first gallery because theme variants reused layouts. The revised
30 structurally distinct concepts replaced it; the owner selected **02 / Season orbit**.
The production `/game/classic` screen now uses that ring, next-fixture console, historical
chase, final target and league table, with season/club/formation and legal XI selection.

- Classic Season is live in the registry; its single-match format remains planned.
- Static `/api/game/classic/[season]` serves one archive and enriched season squads.
  Enrichment roughly doubles the earlier bare-card measurement (about 384–438 KB for
  squads before compression); no all-season payload is sent to the client.
- Simulate or play the next historical fixture through the shared match screens. Away
  orientation and selected XI/bench survive the round trip. Completed scores are stored
  without rerunning them after reload. Final progression completes the rival-only tail.
- `season/classic-current` is isolated from Legacy and single-match slots. Version,
  archive fingerprint, seed, exact XI and calendar prefix define recovery. Corrupt data
  surfaces a retry/explicit abandonment choice; failed saves block further progression.
- English is the only active routing locale (TASK-1843). Arabic catalog entries remain
  synchronized, but `/ar/*` redirects intentionally; this feature does not re-enable it.
- Type-check, lint and 139 focused tests passed. Browser play/return/table/reload and
  mobile width checks passed; the early 42-fixture season has its own browser check.
- Era-specific substitutions, rotation/injuries and Survival remain follow-up work.

Earlier sections record the foundation and gallery history, not remaining integration work.
