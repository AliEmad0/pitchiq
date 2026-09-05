# TASK-1811 — Classic XI rotation

Date: 2026-09-06. Follows merged PR #213.

## Behavior

Use the approved Season Orbit's existing XI selects between fixtures. The club,
season and formation remain fixed; rotation chooses legal replacements from the
historical club-season pool. Every edit validates all eleven slots and unique player
identities, then saves the selection. The deterministic bench is rebuilt from the
remaining pool. Both simulated and played fixtures consume the restored selection.

The save remains version 1: cardIds already represents the current XI. Results and
seeds are retained verbatim, and neither rotation nor reload resimulates old matches.
A completed season is read-only. The coordinator's synchronous transaction lock blocks
concurrent actions; storage failure keeps the selected XI in memory, disables further
edits/play/sim, and retries the same save.

## Verification

- Classic save/run/lineup: 12 tests, including exact away-XI restoration after rotation,
  invalid/duplicate/foreign selections, completed-season rejection and immutable history.
- Component: save failure disables rotation/play/sim and retry persists the exact XI.
- Browser: simulate once, rotate, reload, cancel preview, retain selection and table;
  no horizontal overflow at 390px.
- Type-check and lint pass. Production build and full CI run remotely on the PR.

## Remaining injury work

This PR deliberately delivers rotation first. Cross-fixture injury availability is not
implemented, nor is Legacy rotation. The next injury slice must capture compact outcomes
once from actual sim/live events, persist them atomically with results, and never recreate
injuries by replaying finished matches. Existing saves need an explicit migration baseline.

Recovery and an insufficient-eligible-XI policy still need definition. Historical pools
can lack positional cover; blindly excluding injured players could leave a season unable
to advance. Do not silently heal players, invent replacements, or fill ineligible slots.
Define and test the fallback before introducing enforced absences. Survival remains a
separate TASK-1811 milestone.
