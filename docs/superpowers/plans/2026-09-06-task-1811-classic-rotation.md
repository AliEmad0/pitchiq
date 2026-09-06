# TASK-1811 — season injuries and squad rotation

Date: 2026-09-06. PR #214, following merged PR #213. Expanded at the owner's request
to include injury carryover and Legacy rotation in the same PR.

## Behavior

Classic uses the approved Season Orbit XI controls; Legacy uses its existing cockpit
squad panel. Both allow legal rotation between fixtures, automatically save the selection,
and apply it to sim and played fixtures. Club and formation stay fixed.

Classic rotates within its historical club-season pool. Legacy keeps its original drafted
XI and up to seven deterministic reserves from the same club's pool, saved as exact card
IDs. Reserve selection permits one goalkeeper and seeks outfield role cover before filling
remaining places by rating. It never signs players or redraws reserves after resume.
The original XI stays in `cardIds` for identity; `lineupIds` records the selected XI and
`rosterIds` records the fixed Legacy roster. Missing roster cards block resume.

## Injury contract

Carryover applies to the coach's squad in both modes. Rival squads do not yet carry injury
history. Only actual completed-match events produce new absences: knocks miss no future
fixture, moderate injuries miss one, severe injuries miss three. These are game rules,
not reconstructed real-world injury dates. Store compact `{cardId, remaining}` entries,
not event streams. Scope event matching by coach side as well as player ID.

The same commit of state holds score and availability. Recovery decrements once when
the coach completes a fixture, including a forfeit, never for rival-only calendar rows,
preview cancellation, loading or reloading. New injuries are added after the decrement.
Saved scores and seeds remain unchanged; finished games are never replayed to infer injuries.

Available legal cover is selected deterministically, preferring the chosen XI. Absent
players cannot enter the XI or bench. If no legal XI exists in the fixed formation,
play is disabled and the user can explicitly choose a 0–3 forfeit. Bulk simulation
stops before such a fixture; it never silently forfeits. This prevents sparse historical
squads from becoming stuck without inventing players or ignoring eligibility.

## Persistence and compatibility

Old saves start with no carried injuries; no past injury history is fabricated. Classic
keeps its version-1 schema with a validated optional availability field. Legacy saves
without roster/lineup fields receive deterministic reserves once; the original XI and
finished scores are preserved, and the resulting roster is immediately saved.

Legacy now waits for the slot read and validates its identity before saving even week zero.
Writes are serialized; a failed write blocks rotation, sim and play until retry saves the
same state. Read failures show recovery rather than being mistaken for an empty slot.
Classic retains its existing transaction lock and failed-save recovery. Other season,
match and daily storage keys are untouched.

## Validation

Local verification: 303 season/Classic tests across the regression and focused runs,
six browser scenarios across verification runs, type-check and lint passed. The broader
randomized Legacy smoke test also accounts for explicit injury pauses; full CI is pending.

Unit/component coverage includes injury duration and side identity, sim/live capture,
immutable results, Classic full-season progression, Legacy explicit-forfeit progression,
fixed-roster reload, legal rotation, missing saved reserves, duplicate live returns, failed
save retry and mobile browser checks. The season/Classic regression set and static-route
guards are exercised; type-check and lint run separately. Full CI/build run remotely.

Several old hub test fixtures used the first eleven pool cards, including two keepers in
outfield slots. They now construct legal XIs instead of relaxing the production eligibility
rule. Bulk-sim assertions account for the new intentional injury pause and explicitly
forfeit before continuing; table conservation and full-season completion remain asserted.

## Still pending in TASK-1811

Survival's mid-season start and points target. Historical named-bench sizes and concussion
protocols remain outside the ordinary-substitution model. No new route, dynamic rendering,
positive revalidation interval, or build-worker tuning is introduced by this PR.
