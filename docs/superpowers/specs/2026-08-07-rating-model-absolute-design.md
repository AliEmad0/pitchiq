# Rating model: absolute / cross-position stats + a goalkeeper pipeline

**Date:** 2026-08-07 · **Ticket:** TASK-1820 · **Status:** design approved, ready to plan

## Problem

TASK-1802 rates every dimension as a percentile **within the player's own role cohort**
(`poolOf(cohort, role, pick)` — role peers when there are ≥8, else the whole season). Two
things follow, and both are visible on the cards:

**Cross-position numbers don't compare.** A card's ATT 99 means "elite attack _for a
centre-back_", but nothing on the card says so. Van Dijk reads as a better attacker than
most forwards.

**Degenerate cohorts break outright.** Every goalkeeper has 0 goals, so
`percentileRank(0, [0,0,…]) = 1.0` and **Van der Sar rates ATT 100**.

Two smaller defects compound it:

- `cleanSheets` — a **team** outcome — feeds individual DEF for every player, so forwards
  collect defensive credit for their back line. This is a large part of why Ronaldo '07
  rated DEF 89, _above_ Van Dijk's 84.
- `duelsWon` is counted in **both** DEF and PHY, double-weighting one stat.

## Decisions (owner, 2026-08-07)

1. **Cross-position pools.** Rank each outfield dimension against every outfielder that
   season, not role peers.
2. **Goalkeepers get their own pipeline** and leave the outfield pools entirely.
3. **GK cards get GK-specific stat labels** (REF/HAN/KIC/POS/CMD), not ATT/CRE/DEF/PHY/DIS.
4. **Per-90 rates with a minutes floor**, not raw season totals.
5. **DEF carries ~25% team defensive context — for defensive roles only.**
6. **`overall` is calibrated with a single monotonic scale**, never a per-season quota.

## Data reality

Probed across the six chaos-pool seasons (1996 / 2004 / 2008 / 2012 / 2019 / 2023):

| Era   | GK `saves` | GK `cleanSheets` | `extended.goalsConceded` / `minutesPlayed` |
| ----- | ---------- | ---------------- | ------------------------------------------ |
| 1996  | ✗ 0%       | ✓ 100%           | ✗                                          |
| 2004  | ✗ 0%       | ✓ 100%           | ✓ 96% / 100%                               |
| 2008+ | ✓ 97–100%  | ✓ 79–85%         | ✓ 85–100%                                  |

So the GK pipeline degrades in three grades, and `extended.minutesPlayed` makes per-90
rates possible league-wide from 2004 (`appearances × 90` is the pre-2004 fallback).

`extended` also carries the fields the current model never reads: `clearances`, `blocks`,
`tacklesWon`/`tacklesLost`, `duels`/`groundDuels`/`groundDuelsWon` (aerial duels are
derivable as `duels − groundDuels`), `foulsWon`, `goalsConceded`, `successfulLongPasses`.

## Architecture

### `domain/stat-pool.ts` (new) — replaces `percentile.ts#poolOf`

One module owning the three things the current model conflates:

- **Rate conversion** — `per90(value, minutes)`; `minutesOf(player)` reads
  `extended.minutesPlayed`, falling back to `appearances × 90`.
- **Pool construction** — `buildPools(players, statFn, keys)`, including only players above
  `MIN_MINUTES = 600`. Low-minute players are still _rated_; they just don't distort the
  scale.
- **Ranking** — `pctile(value, pool)` uses a **ties-averaged (midpoint)** percentile, so a
  block of equal values lands in the middle of the block rather than the top of it. This is
  the specific change that stops a mass of zeros scoring high.

`percentileRank` stays exported (the sparse pipeline's standings context uses it).

### Two pipelines, split at the pool

`rate()` routes on `player.role === "GK"`. Goalkeepers are ranked only against goalkeepers;
outfielders only against outfielders. The split happens when the pools are built, so no
degenerate cohort can form.

### Outfield dimensions

| Dim | Inputs (weights)                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------ |
| ATT | goals/90 (2), xG/90 (1), shots-on-target/90 (1)                                                              |
| CRE | assists/90 (2), key passes/90 (1), pass accuracy (1)                                                         |
| DEF | tackles/90, interceptions/90, clearances/90, blocks/90 (1 each) **+ tackle-success % (2), aerial-win % (2)** |
| PHY | duel-win % (2), duels won/90 (1), fouls won/90 (1)                                                           |

DEF deliberately splits weight evenly between **volume** and **success rate**. Volume alone
is a role-and-team artifact: a dominant side's centre-back makes fewer defensive actions,
so a pure-volume DEF ranks journeymen at leaky clubs top.

`cleanSheets` is removed from outfield DEF. `duelsWon` now appears only in PHY.

### Team defensive context

For **GK, CB, RB, LB, CDM only**:

```
DEF = 0.75 × individual + 0.25 × teamGoalsAgainstPercentile
```

from the season's standings row. This is deliberately narrower than the bug it replaces:
the old `cleanSheets` term gave _every_ player DEF credit for their team, including
forwards.

### GK dimensions

Ranked against the goalkeeper cohort, degrading by era. Labels follow the FIFA convention —
note **KIC**, not DIS, because the outfield card already uses DIS for discipline:

| Dim         | Label | Inputs (weights)                                                                       | Available                     |
| ----------- | ----- | -------------------------------------------------------------------------------------- | ----------------------------- |
| reflexes    | REF   | save % (2), saves/90 (1)                                                               | 2008+                         |
| handling    | HAN   | goals-conceded/90 inverted (2), clean-sheet rate (1)                                   | 2003+ (CS-rate only pre-2003) |
| kicking     | KIC   | pass accuracy (2), successful long passes/90 (1)                                       | 2003+                         |
| positioning | POS   | goals-conceded-**outside-box**/90 inverted (2), penalty goals conceded/90 inverted (1) | 2003+                         |
| command     | CMD   | aerial duels won/90 (2), clearances/90 (1)                                             | 2003+                         |

Each input is a real committed field, not a proxy invented for the table. POS reads
`goalsConcededOutsideBox` on the reasoning that a keeper beaten from distance was
mispositioned; CMD reads aerial duels and clearances, which is a keeper leaving their line
for crosses.

Where an era lacks an input the dimension returns **null** and the card renders a dash —
never a fabricated number. `provenance.basis` gains `hasSaves` so a GK card can be honest
about which grade produced it.

### `PlayerRatings` stays the engine contract

The six numeric keys (`attack`, `creation`, `defense`, `physical`, `discipline`, `overall`)
**do not change shape.** `team-power.ts`, `minute-model.ts` and `card-design.ts` all read
them for every player including goalkeepers, so making them role-dependent would break the
TASK-1803 engine. Instead:

- A goalkeeper's six keys are still populated — but from the GK pipeline. `attack` becomes
  a genuine near-zero instead of 100, and `defense` is a blend of REF/HAN/POS so
  `powerOf()` finally gets a real goalkeeper-quality signal (`ROLE_WEIGHTS.GK` already
  weights defense at 0.75).
- The five GK-specific numbers ride along in a new optional `gk?: GkRatings` block, used by
  the card face only.

So the engine is untouched, and the card gets the honest goalkeeper view.

### Card labels

`CARD_DIMS` becomes `dimsFor(role)`, returning the GK set (reading `ratings.gk`) or the
outfield set. `PlayerCard` reads it per card. Five new i18n keys in **both** `en.json` and
`ar.json` (the parity test enforces this). Labels render from a const array as `{expr}`,
which is guard-safe — the no-hardcoded-strings AST guard flags string literals, never
expressions.

### `overall` calibration

`ROLE_WEIGHTS` still blends the four dims per role. The calibration is a **single monotonic
scale applied to every player in every season** — it cannot reorder anyone, it only sets
where the 90 line falls. Per-season counts float freely, so a stacked season yields more
premium cards.

Procedure: measure today's 90+ share of the ~250-card chaos pool, fit the scale so the new
share is comparable, then lock a **wide** regression band (premium share roughly 2–15%) so a
future change can't silently make everyone a 95. The band is a guard, not a quota.

**Acceptance is a name check, not a percentage.** Print every 90+ card across the six pool
seasons for owner review. If Henry '03, Ronaldo '07, Shearer '95, Salah '19 or Van Dijk '19
are missing, that is a model bug to fix — not a knob to turn.

## Known limitation (accepted)

Van Dijk 2019 lands at DEF 68 while Matip rates 87. Elite defenders on dominant teams
genuinely make fewer defensive actions, and **no stat in this dataset measures defensive
quality directly**. Team context narrows the gap (58 → 68) but does not close it. Recorded
deliberately rather than fitting the model to one player.

## Prototype evidence

A throwaway prototype of this model over real committed data:

| Case                          | Before  | After                                      |
| ----------------------------- | ------- | ------------------------------------------ |
| Van der Sar '05 ATT           | **100** | _n/a_ — GK pipeline, no ATT dimension      |
| Van Dijk '19 ATT              | **99**  | 61                                         |
| Ronaldo '07 DEF               | **89**  | 37                                         |
| Salah '19 DEF                 | —       | 12                                         |
| Zero-goal players, median ATT | —       | 17                                         |
| 2007 top-DEF                  | —       | Hargreaves, Silva, Ferdinand, Terry, Vidic |

## Testing

- **`stat-pool`** — per-90 conversion, the minutes floor, ties-averaged percentile against a
  hand-computed pool, and the pre-2004 `appearances × 90` fallback.
- **Structural invariants over real data** (the tests that would have caught the bug):
  no goalkeeper appears in an outfield pool; a season's top-8 DEF are defensive roles; the
  median ATT of zero-goal players sits below 25.
- **Regression cases as named assertions** — Van Dijk '19 ATT < 70, Ronaldo '07 DEF < 50,
  and every rated goalkeeper's `attack` below 20 (the Van der Sar case).
- **Era degradation** — a 1996 GK yields null REF rather than a number; a 2019 GK does not.
- **Calibration band** — premium share of the chaos pool within 2–15%.
- **i18n parity** — the five GK label keys exist in `en` and `ar`.

## Files

| File                         | Change                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `domain/stat-pool.ts`        | **new** — rates, pools, minutes floor, ties-averaged percentile               |
| `domain/percentile.ts`       | `poolOf` removed; `percentileRank` kept                                       |
| `domain/rating-rich.ts`      | rewritten onto `stat-pool`; outfield only                                     |
| `domain/rating-sparse.ts`    | same pool/rate treatment; outfield only                                       |
| `domain/rating-gk.ts`        | **new** — the goalkeeper pipeline                                             |
| `domain/rate.ts`             | routes GK vs outfield; `basis.hasSaves`                                       |
| `domain/ratings.ts`          | six keys unchanged; adds optional `gk?: GkRatings`                            |
| `domain/rating-weights.ts`   | `ROLE_WEIGHTS` unchanged; adds the named `OVERALL_SCALE` calibration constant |
| `domain/player-card.ts`      | `CARD_DIMS` → `dimsFor(role)`                                                 |
| `components/PlayerCard.tsx`  | reads `dimsFor(card.role)`                                                    |
| `i18n/messages/{en,ar}.json` | five GK label keys                                                            |
| `TASKS.md`                   | TASK-1820 added and flipped on ship                                           |

## Out of scope

The `traits?` seam (TASK-1814), engine constant re-tuning (TASK-1803 v1 constants stand),
and the `/draft` interactive hub (TASK-1807, next in the arc).
