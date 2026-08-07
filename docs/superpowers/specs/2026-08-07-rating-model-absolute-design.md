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
5. **DEF values quality over volume** — success rates dominate, clearances and blocks are
   demoted, and structural impact enters via per-player on-pitch goals conceded plus a
   reduced team blend, both for defensive roles only.
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
`tacklesWon`/`tacklesLost`, `duels`/`duelsLost`/`groundDuels`/`groundDuelsWon`/`groundDuelsLost`,
`foulsWon`, `goalsConceded`, `goalsConcededOutsideBox`, `successfulLongPasses`. See the data
defects below before using any of the duel fields — several combinations that look derivable
are not.

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

| Dim | Inputs (weights)                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------- |
| ATT | goals/90 (2), xG/90 (1), shots-on-target/90 (1)                                                                                   |
| CRE | assists/90 (2), key passes/90 (1), pass accuracy (1)                                                                              |
| DEF | **duel-win % (3), ground-duel % (3), tackle % (2)** · interceptions/90 (1), tackles/90 (1) · clearances/90 (0.5), blocks/90 (0.5) |
| PHY | duels won/90 (2), fouls won/90 (1), fouls conceded/90 (1)                                                                         |

**DEF is 8/11 quality, 2/11 proactive volume, 1/11 reactive volume.** Clearances and blocks
are deliberately demoted to half weight: a high clearance count signals a team under siege,
not a good defender. Interceptions and tackle volume keep full weight because they are
_proactive_ — a defender chooses them; nobody chooses to be pinned in their own box.

`cleanSheets` is removed from outfield DEF. DEF now uses duel **rate** while PHY uses duel
**volume** — a deliberate split ("do you win them" vs "do you contest many"), not the
identical-stat double count that existed before.

### Data defects that constrain these inputs

Found while prototyping; encoded as rules, not comments:

1. **`duels` ≠ `duelsWon` + `duelsLost`.** Wan-Bissaka '18: `duels` 377, won+lost 171. The
   `duels` field counts total involvements; only won+lost is the resolved set. Duel rate
   **must** use `duelsWon / (duelsWon + duelsLost)`.
2. **`tackles` is already `tacklesWon` + `tacklesLost`** (Wan-Bissaka 129 = 129). Tackle
   success is `tacklesWon / tackles`; computing `tackles / (tackles + tacklesLost)`
   double-counts.
3. **Aerial duels cannot be derived, and dribbled-past does not exist.**
   `duelsWon − groundDuelsWon` goes **negative for 16 of 49 qualifying CBs in 2018/19**
   (Ben Davies −29, Holgate −35) — the fields use different definitions and are not subsets.
   The dataset also has no take-ons-faced field; `unsuccessfulDribbles` is the player's _own_
   failed dribbles. Neither input is available, however desirable.

Only three success rates survive validation: all-duel %, ground-duel %, tackle %.
`groundDuelsWon + groundDuelsLost = groundDuels` holds exactly, making ground-duel % the most
trustworthy of the three.

### Structural defensive impact (defensive roles only)

`extended.goalsConceded` is **per-player** — goals conceded while that player was on the
pitch, not a team total. That makes it a genuine individual measure of structural impact, and
it enters DEF at **weight 3** (inverted, per 90) for **GK, CB, RB, LB, CDM only**.

The role restriction is not optional. Applied league-wide it lifted **Salah '18/19 from DEF 6
to 26** and **Ronaldo '07/08 from 39 to 51** — forwards inheriting their back line's record,
which is precisely the pollution this ticket exists to remove.

A **team** goals-against blend from the standings row is retained on top, but reduced to
**15%** and scaled by `min(1, minutes / 2700)`, so only a defender who actually anchored the
season gets full structural credit. The per-player signal now does most of that work.

### GK dimensions

Ranked against the goalkeeper cohort, degrading by era. Labels follow the FIFA convention —
note **KIC**, not DIS, because the outfield card already uses DIS for discipline:

| Dim         | Label | Inputs (weights)                                                                       | Available                     |
| ----------- | ----- | -------------------------------------------------------------------------------------- | ----------------------------- |
| reflexes    | REF   | save % (2), saves/90 (1)                                                               | 2008+                         |
| handling    | HAN   | goals-conceded/90 inverted (2), clean-sheet rate (1)                                   | 2003+ (CS-rate only pre-2003) |
| kicking     | KIC   | pass accuracy (2), successful long passes/90 (1)                                       | 2003+                         |
| positioning | POS   | goals-conceded-**outside-box**/90 inverted (2), penalty goals conceded/90 inverted (1) | 2003+                         |
| command     | CMD   | duels won/90 (2), clearances/90 (1)                                                    | 2003+                         |

Each input is a real committed field, not a proxy invented for the table. POS reads
`goalsConcededOutsideBox` on the reasoning that a keeper beaten from distance was
mispositioned; CMD reads duels won and clearances, which is a keeper leaving their line for
crosses. CMD uses duel **counts**, never a derived aerial split — see the data defects above.

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
seasons for owner review. If Henry '03, Ronaldo '07, Shearer '95, Salah '19 or Van Dijk '18
are missing, that is a model bug to fix — not a knob to turn.

## Prototype evidence

A throwaway prototype over real committed data. **Note the season key: 2018/19 is `2018`** —
the first prototype pass measured `2019` (= 2019/20) and drew the wrong conclusion about Van
Dijk's peak season.

| Case                            | Original model | Revised model                                  |
| ------------------------------- | -------------- | ---------------------------------------------- |
| **Van Dijk '18/19 DEF**         | **68**         | **89** — 3rd in the league                     |
| Van Dijk '18/19 duel / ground % | —              | 70% / 81% — best in the league                 |
| Tarkowski '18/19 DEF            | 84             | 56 — high clearance volume correctly demoted   |
| Maguire '18/19 DEF              | 76             | 68                                             |
| Van der Sar '05 ATT             | **100**        | _n/a_ — GK pipeline, no ATT dimension          |
| Van Dijk '19 ATT                | **99**         | 61                                             |
| Ronaldo '07 DEF                 | **89**         | 39                                             |
| Salah '18 DEF                   | —              | 6                                              |
| Zero-goal players, median ATT   | —              | 17                                             |
| 2007/08 top-DEF                 | —              | Gabbidon, Ferdinand, Skrtel, Hargreaves, Vidic |

## Known limitation (accepted)

Van Dijk '18/19 lands at DEF 89, effectively tied with Matip's 90 despite leading him on
every validated quality rate (duel 70% vs 55%, ground 81% vs 70%, tackle 74% vs 67%, on-pitch
goals conceded 0.58 vs 0.70). The cause is **percentile saturation**: once two players are
both above the 95th percentile on the quality inputs, the ranking gap between them collapses,
and the remaining 3/14 volume weight decides the order.

Closing this would mean either non-linear stretching at the top of each pool or raising the
quality weights until one player ranks first — the latter is fitting the model to a single
name. Recorded rather than tuned. The headline defect is fixed: Van Dijk moved from 68
(mid-table) to 89 (elite tier, 3rd of ~350 outfielders).

## Testing

- **`stat-pool`** — per-90 conversion, the minutes floor, ties-averaged percentile against a
  hand-computed pool, and the pre-2004 `appearances × 90` fallback.
- **Structural invariants over real data** (the tests that would have caught the bug):
  no goalkeeper appears in an outfield pool; a season's top-8 DEF are defensive roles; the
  median ATT of zero-goal players sits below 25.
- **Regression cases as named assertions** — **Van Dijk '18 DEF > 85 and top-5 in the
  season**, Tarkowski '18 DEF < Van Dijk '18, Ronaldo '07 DEF < 50, Salah '18 DEF < 15
  (guards the structural-signal leak), Van Dijk '19 ATT < 70, and every rated goalkeeper's
  `attack` below 20 (the Van der Sar case).
- **Data-defect guards** — a duel rate never uses `duels` as its denominator; no aerial-duel
  input exists anywhere in the model. Both are the kind of thing a future edit would
  reintroduce innocently.
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
