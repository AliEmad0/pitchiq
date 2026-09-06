# TASK-1811 — Survival foundation and concept selection

Owner requested a new 30-concept gallery rather than extending Season Orbit (2026-09-06).
Survival remains an objective on the Season format, not a new draft-mode tile.

## Gallery contract

- Three complete real archives: 1992–93, 2003–04, 2015–16. Each has three relegation places.
- Takeover is 1 January; the chooser offers the five lowest clubs at that date.
- The baseline is the archive's exact chronological prefix, including unequal games played.
- Campaign results store only the suffix after takeover. The existing Classic driver
  simulates actual upcoming fixtures with historical substitution rules and injury carryover.
- The target is one point above the last historically safe club's final points. It is
  a benchmark, not guaranteed survival. The final simulated table decides the outcome.
- An exact points/GD/goals-for tie straddling safety is unresolved, never silently awarded
  on the table's club-index display tiebreak.
- No new production page, API, or deployment. Gallery storage is separate localStorage.
- Real squads and local crests are embedded; player portraits use initials. No external assets.
- Simulation, rotation, availability, explicit forfeits, restart, reload, and saved selection
  work in all concepts. Switching concepts preserves campaign state.
- This is layout round 1. Live fixture presentation, production persistence/migration,
  a broader season/data audit, and animation selection follow the owner's layout choice.
- Seasons with undated points adjustments are excluded from this prototype. Do not invent
  deduction timing or generalize the three-relegation assumption to 1994–95.

## Files and reproduction

Source: `design/survival-gallery`. Generated data and the standalone file are in
`artifacts/survival-gallery`, ignored by Git and excluded from production type-checking.
The prototype builds separately against the actual typed game engine.

From the repository with Node 22 and dependencies installed:

```sh
# Run against the app's local server, or set GALLERY_API_BASE to its preview URL.
node design/survival-gallery/export-data.mjs
node design/survival-gallery/build.mjs
node design/survival-gallery/verify.cjs
```

The initial export reused the existing Classic gallery's real three-season snapshots;
re-exporting uses the current Classic API and fingerprints the complete snapshot.

Deliverable: `artifacts/survival-gallery/survival-concepts.html`, a single offline file.
It is intentionally not placed in `public/`, so the deployment does not ship the gallery.

## Validation

Six Vitest tests cover takeover arithmetic, corrupt prefixes/date validation, milestones,
final ties, deterministic simulation, immutable history, JSON resume, and played away scores.
Chromium checks all thirty concepts simulate, have thirty distinct block-geometry signatures,
fit at 390px, finish a run-in, restore saved results, and persist a selection. Desktop/mobile
screenshots are inspected separately. Production integration remains unbuilt pending choice.
