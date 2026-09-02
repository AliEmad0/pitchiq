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

<!-- ⚠️ NOT a `ts` fence: prettier parses one and rewrites `A^p` as a bitwise XOR, which silently
     turns this formula into something mathematically different. Keep it as plain text. -->

```text
edge = A^p / (A^p + D^p)
```

⛔ **AND THE TWO SIDES ARE NORMALISED against each other**, which is not a detail — it is half the
design, and measurement forced it after the first sweep:

```text
share = myRawEdge / (myRawEdge + theirRawEdge)
```

### 1.1 Why normalisation is load-bearing

The first version of this section claimed "equal sides give exactly 0.5 at every `p`, which keeps
`calibrateK` valid". **That was false, and the sweep caught it.** A raw edge compares one side's
**attack** against the other's **defence**, and those are different numbers even for two identical
teams — so `A^p / (A^p + D^p)` is not 0.5 for a team playing itself unless its attack happens to
equal its defence.

Measured across real leagues, the offset is large and **flips sign by season**:

| Season | mean attack | mean defence | edge sum, p = 1 | edge sum, p = 8 | edge sum, p = 12 |
| ------ | ----------- | ------------ | --------------- | --------------- | ---------------- |
| 2000   | 57.8        | 49.2         | 1.08            | 1.57            | **1.75**         |
| 2012   | 53.8        | 57.1         | 0.97            | 0.77            | **0.65**         |
| 2021   | 54.0        | 56.5         | 0.98            | 0.82            | 0.73             |

Total goals scale directly with that sum, so an un-normalised exponent would have made 2000 score
~75% too many goals and 2012 ~35% too few. Measured end to end, goals per match fell from **2.64
at p = 1 to 2.05 at p = 16**, and the draw rate climbed through the harness ceiling (0.287 → 0.379
against a gate of < 0.35). Choosing a smaller `p` only shrinks that distortion; it does not remove
it.

⭐ **Normalising separates the two questions the engine must answer independently:** _how many_
chances a match produces (the season's goal rate, set by `k`) and _who gets them_ (the strength
split, set by `POWER_EXPONENT`). After it, goals per match are flat across the whole sweep —
2.76, 2.85, 2.84, 2.78, 2.83, 2.75, 2.86 — and the draw rate **falls** as `p` rises, which is what
a more decisive engine should do.

### 1.2 The properties that actually hold

1. ⭐ **The two sides' shares always sum to exactly 1**, at every `p`. This is what keeps
   `calibrateK` — and the season-authentic goals-per-match calibration on top of it — valid.
2. ⭐ **Two identical teams split exactly 0.5 / 0.5**, whatever their attack/defence offset.
3. **Every share stays in [0, 1]** — inclusive, deliberately: at absurd exponents the raw edge
   saturates to exactly 1 in floating point, which is harmless but makes a strict `< 1` assertion
   a falsehood.
4. ⛔ **`p = 1` reproduces the shipped raw-edge formula**, so the exponent seam could be landed and
   proven inert before any value moved.

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

## 3. The fitted exponent — `POWER_EXPONENT = 6`

Fitted over **9 real seasons × 4 seeds**, real squads, season-authentic goal rates, each simulated
league scored against the table that actually happened. All figures are with normalisation (§1.1)
in place.

| p              | ρ(sim, real) | Champion | Gap      | Points SD | Champ win rate | Draws | Goals |
| -------------- | ------------ | -------- | -------- | --------- | -------------- | ----- | ----- |
| **1** ⟵ was    | 0.386        | 68.5     | 31.9     | 8.4       | 52.5%          | 0.263 | 2.76  |
| 4              | 0.653        | 77.0     | 50.6     | 13.4      | 60.2%          | 0.240 | 2.89  |
| 5              | 0.650        | 78.4     | 52.7     | 14.0      | 62.0%          | 0.230 | 2.82  |
| **6** ⟵ chosen | 0.722        | 84.4     | **61.3** | **16.3**  | **68.6%**      | 0.223 | 2.87  |
| 7              | 0.698        | 85.1     | 64.2     | 16.9      | 68.2%          | 0.214 | 2.85  |
| 8              | 0.724        | 85.7     | 64.6     | 17.3      | 69.2%          | 0.217 | 2.85  |
| 9              | 0.739        | 87.9     | 67.4     | 18.3      | 70.8%          | 0.218 | 2.84  |
| _real_         | —            | _87.6_   | _62.0_   | _16.2_    | _69.9%_        | —     | —     |

⭐ **`p = 6` is chosen because it fits the SHAPE of the table, not one row of it.** It lands points
SD at 16.3 against a real 16.2 and the top-to-bottom gap at 61.3 against 62.0 — the two measures
that describe the whole distribution — and champion win rate at 68.6% against 69.9%. Its champion
total is 3.2 points light (84.4 v 87.6), which sits well inside the real spread's own variation
(champions have ranged 75–100).

⚠️ **`p = 9` fits champion points almost exactly (87.9) and is the wrong choice**: it overshoots
both dispersion measures (gap 67.4, SD 18.3). Fitting a single row at the cost of the distribution
is how a calibration ends up flattering one number and lying about the rest.

⚠️ **The optimum MOVED once normalisation landed** — the un-normalised sweep pointed at p ≈ 12,
because suppressed scoring was damping the dispersion that the exponent was adding. A fit is only
as good as the model underneath it; re-fit after any change to the model, not just after a data
refresh.

### 3.1 What it does to a match

Every gate in §2 passes, and the distribution moves **toward** real football rather than away:

| Harness metric    | p = 1 (was) | **p = 6** | Real football | Gate    |
| ----------------- | ----------- | --------- | ------------- | ------- |
| Draw rate         | 27.3%       | **24.7%** | ~22–25%       | 15–35%  |
| First scorer wins | 69.2%       | **65.7%** | ~68–70%       | 55–78%  |
| Comebacks         | —           | 13.8%     | —             | > 7%    |
| Goals per match   | —           | 2.79      | —             | 2.0–3.4 |
| Events per match  | —           | 42.8      | —             | > 15    |

⭐ **Blowouts stay rare**: 7.2% of matches finish with a margin of 4+, and the widest margin over
~13,000 simulated fixtures was 8. The failure this change risked — a strong side winning 6–0 every
week — did not materialise.

---

## 4. Re-fitting `CHEM_EFFECT` — 0.08 → **0.03**

Fitted over **12,000 seeded matches per constant**, each pairing played **both ways**:

| effect   | chem XI   | rating XI | edge     |                                  |
| -------- | --------- | --------- | -------- | -------------------------------- |
| 0        | 37.8%     | 37.5%     | +0.3     | chemistry buys nothing: the trap |
| 0.02     | 37.9%     | 37.2%     | +0.7     | inside the noise floor           |
| **0.03** | **38.6%** | **36.7%** | **+1.9** | **chosen**                       |
| 0.04     | 39.6%     | 36.2%     | +3.4     |                                  |
| 0.06     | 40.4%     | 34.2%     | +6.2     | chemistry starts to dominate     |

0.03 is the **smallest constant whose reward is clearly distinguishable from zero** — the standard
error on the difference is ~0.6 points at this sample size — which is what "rewarded for playing
the mode as intended, never decisive" means in numbers.

### 4.1 ⛔ Two measurement errors the re-fit caught

1. **The first harness played the chemistry XI at HOME in all 3,000 matches.** A one-sided fixture
   cannot separate the mode's effect from home advantage. Playing each pairing both ways moved the
   effect-0 result from **+4.9 to +0.3** — i.e. the entire apparent advantage was the fixture.
2. ⭐ **"Chemistry costs ~6.8 rating points per player" is measured in the WRONG UNITS**, and it is
   §0.5's error repeated inside chemistry's own harness. That is a mean-OVERALL figure; the engine
   reads role-weighted attack and defence:

   | XI        | mean overall | attack   | defence  |
   | --------- | ------------ | -------- | -------- |
   | chem XI   | 82.8         | 80.9     | **70.1** |
   | rating XI | **88.6**     | **82.8** | 68.6     |

   Steering for links is **very nearly free** in the terms that decide matches — 1.9 behind on
   attack, 1.5 **ahead** on defence. The old reasoning about "repaying a 6-point cost" was
   answering a question the engine never asked.

⚠️ **A knock-on in the replay suite, and it is a FALSE NEGATIVE not a defect.** Two tests asserted
that chemistry on/off produce different fingerprints **on one seed**. At a constant this small the
effect need not tip a dice roll in any single match, so they broke the moment the constant moved.
They now sweep 12 seeds and require at least 3 to differ (measured: 5). A fixture that cannot show
the effect proves nothing about it — the same trap this spec recorded once already.

### 4.2 The superseded fit, kept for the trail

`CHEM_EFFECT = 0.08` was fitted by outcome against the **old** engine. Its own measurement table
shows why it could not survive this change:

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
