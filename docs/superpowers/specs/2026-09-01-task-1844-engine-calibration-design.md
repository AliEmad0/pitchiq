# TASK-1844 — Engine calibration: design

**The change in one line:** the match engine derives its edge from a bounded ratio that barely
responds to a rating gap. It becomes `A^p / (A^p + D^p)`, and `p` is fitted against 34 real
seasons.

**Why now:** designing [TASK-1811](../../../TASKS.md) (the season engine) measured the match
engine over a full league season for the first time. A single match hides this property; 38 weeks
cannot. §0 is the evidence, and everything after it follows from it.

---

## 0. What was measured before designing

### 0.1 The target — what a real Premier League table looks like

All 34 committed seasons (`standings-<year>.json`), 38-game era mixed with the early 42-game
years:

| Metric            | Mean      | Min  | Max  |
| ----------------- | --------- | ---- | ---- |
| Champion points   | **87.6**  | 75   | 100  |
| Bottom points     | 25.6      | 11   | 40   |
| Top-to-bottom gap | **62.0**  | 41   | 82   |
| Points SD         | **16.2**  | 10.1 | 20.5 |
| Champion win rate | **69.9%** | 55.3 | 84.2 |

### 0.2 What the engine produces instead

Six real seasons (1995, 2000, 2005, 2010, 2015, 2019) simulated with their **real squads**
(`assembleGameTeam`), full double round robin, season-authentic goal rates, scored against the
table that actually happened. 3 seeds each.

| Metric                   | Engine (p = 1) | Real     |
| ------------------------ | -------------- | -------- |
| Points SD                | **8.7**        | **16.2** |
| Top-to-bottom gap        | **32.7**       | **62.0** |
| Champion points          | 68.2           | 87.6     |
| Champion win rate        | 51.0%          | 69.9%    |
| ρ(sim table, real table) | 0.348          | —        |

⛔ **The engine is under-dispersed by about half.** Everyone finishes near the middle, so a
league table built on it is mostly noise.

### 0.3 The control — is it sensitive to squad quality at all?

600 matches per fixture over real all-time club XIs. The last row is the honest baseline: a side
playing **itself**, so any difference is pure home advantage.

| Fixture                                           | Home win  | Draw  | Away win | Goals     |
| ------------------------------------------------- | --------- | ----- | -------- | --------- |
| Strongest v weakest (92.7 v 69.8 — a 22.9-pt gap) | **40.8%** | 22.8% | 36.3%    | 1.49–1.37 |
| Mid v mid (83.0 v 82.4)                           | 38.5%     | 25.0% | 36.5%    | 1.50–1.44 |
| Strongest v **itself** (home advantage only)      | 38.2%     | 22.7% | 39.2%    | 1.49–1.47 |

⭐ **The widest squad gap in the entire archive is worth ~0.05–0.08 points per game.** Manchester
United's all-time XI against West Bromwich Albion's is very nearly a coin flip.

### 0.4 Root cause

`domain/minute-model.ts`:

```ts
const edge = attack / (attack + oppDefense || 1);
```

Both sides live in the same 0–100 rating space, so the ratio barely moves — 92 attack against 70
defence gives `0.568` against `0.500` for equals, a 13.6% edge in the most lopsided fixture
available. This is a **deliberate** property: the chemistry spec (TASK-1810 PR 5) recorded it as
"a bounded ratio, deliberately insensitive to power". Nobody had measured what it does across a
season.

### 0.5 ⚠️ A measurement error worth keeping

The first pass used **mean overall rating** as the squad-strength proxy and reported ρ ≈ 0.11 —
near zero, which read as "squad quality does not matter at all". That proxy was wrong: the engine
aggregates **role-weighted attack and defence** (`domain/team-power.ts`), not a flat mean. Against
real squads the true figure is ρ ≈ 0.35.

Both readings point the same way, but only one is defensible. **The honest, proxy-independent
finding is the dispersion shortfall in §0.2** — measure the thing the engine actually reads.

---

## 1. The model

```ts
edge = A ^ (p / (A ^ (p + D) ^ p));
```

Three properties make this safe to drop into a shipped engine:

1. ⭐ **Equal sides give exactly 0.5 at every `p`.** This is what keeps `calibrateK` — and the
   season-authentic goals-per-match calibration built on top of it — valid without a second fit.
2. **The value stays in (0, 1)** for any positive inputs and any `p`, so no clamping is needed and
   no probability can escape its range.
3. ⛔ **`p = 1` is exactly the shipped formula.** The change is a strict generalisation behind one
   constant, not a rewrite, so the refactor can be landed and proven inert before any value moves.

The exponent is a **global engine constant**, not a per-pack or per-mode field. A mode that wanted
its own physics would be a second engine, which the modifier-stack rule exists to prevent.

---

## 2. What must not move

A steeper edge buys table dispersion by making matches more decisive — and a match that is decided
before kick-off is a worse product than a flat league table. The existing harness already encodes
what a watchable match looks like, so it is the gate.

`tests/unit/game-match-harness.test.ts`, all measured through the **real** Chaos path:

| Gate              | Band    |
| ----------------- | ------- |
| Draw rate         | 15–35%  |
| First scorer wins | 55–78%  |
| Comebacks         | > 7%    |
| Goals per match   | 2.0–3.4 |
| Events per match  | > 15    |
| Latest goal       | > 90'   |

Plus `tests/unit/game-minute-model.test.ts` for the shape of the hazard curve.

⛔ **These bands must not be widened to accommodate an exponent.** They are the reason the harness
exists — TASK-1822 opened on a report that "the first team to score always wins", and these numbers
are the answer to it. If the fitted `p` breaks one, the fit is wrong and the next value down is
taken instead.

⚠️ **Expected, and not a regression:** a saved match and a share code carry a **seed**, and the
same seed produces a different match once the engine changes. Golden-value assertions across the
replay suites will need re-baselining. Structural assertions must not.

---

## 3. The fitted exponent

_Filled by Task 3 — the sweep over 10 real seasons × 4 seeds, with the §2 gates reported alongside
the table fit._

Provisional from the opening six-season sweep (3 seeds), for orientation only:

| p             | ρ(sim, real) | Champion | Gap      | Points SD |
| ------------- | ------------ | -------- | -------- | --------- |
| **1** (today) | 0.348        | 68.2     | 32.7     | 8.7       |
| 6             | 0.702        | 76.0     | 48.7     | 13.8      |
| 10            | 0.710        | 82.4     | 57.3     | 15.7      |
| **12**        | **0.753**    | 81.5     | 58.0     | **16.0**  |
| 16            | 0.742        | 84.9     | **62.9** | 16.6      |
| _real_        | —            | _87.6_   | _62.0_   | _16.2_    |

⚠️ Champion win rate was short at every `p` tested (62–65% against a real 69.9%). Task 3 must say
why before the value is settled.

---

## 4. Re-fitting `CHEM_EFFECT`

_Filled by Task 5._

⛔ **Not optional.** `CHEM_EFFECT = 0.08` was fitted by outcome against the **old** engine. Its own
measurement table shows why it cannot survive this change:

```
effect 0     chem 36.6%   rating 37.4%   <- with NO bonus, a side ~6.8 rating points per
effect 0.08  chem 37.8%   rating 36.8%      player WORSE still drew level
```

That near-tie at `effect 0` is this ticket's finding seen from the other side: rating points were
nearly free, so a small constant was enough to repay a cost that barely existed. Once a rating
point buys something, chemistry's measured ~6.8-point cost becomes a real price and `0.08` no
longer balances it.

⚠️ Any re-fit needs **thousands** of matches per constant. The original fit recorded that a
240-match sweep looked "saturated" purely because 1–3 point differences sit inside the noise at
that sample size.
