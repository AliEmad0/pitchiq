# TASK-1811 — Classic historical season foundation

Status: first implementation slice; Classic is not playable yet.

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
