# TASK-1810 — Budget Cap Draft: design

**Status:** design AGREED with the owner, 2026-08-25. **Not yet built** — this is PR 4 of 5.

Build an XI from a fixed transfer budget, shopping across the whole priced archive at once.
Every card carries a real Premier League market value, adjusted so that money from 2004 and
money from 2025 mean the same thing. The mode is about finding players who are worth more
than they cost.

⛔ **Read §0 before changing any number in here.** Almost every constant below is a
measurement, not a preference, and four of the obvious choices were measured and rejected.

---

## 0. What was measured before designing

Ratings come from `domain/rate.ts` over a per-season `makeRatingContext` — the game's own
ratings, not a proxy.

| Question                      | Answer                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| Priced seasons                | **2004–2025 only** — 22 of the archive's 34                  |
| Coverage inside that window   | 11,122 of 11,766 player-seasons = **94.5%**, 644 holes       |
| Raw inflation, median card    | €2.8M (2004) → €18.0M (2025) = **6.4×**                      |
| Raw inflation, top card       | €45M → €200M = **4.4×**                                      |
| Does price predict rating?    | Pearson r(ovr, log₁₀ value) = **0.37–0.63**, mean ≈ **0.52** |
| Distinct players after dedupe | 11,122 player-seasons → **3,373 players**                    |
| Cheapest legal XI (cap 600)   | **€37M**                                                     |
| Best XI, money no object      | mean rating **94.0**, costing **€1,474M**                    |

**The budget curve** — best achievable XI (1 GK + 10 outfield) from the capped pool, solved
exactly by DP over €1M buckets:

| budget   | €60M | €80M | **€100M** | €150M | €200M | €300M |
| -------- | ---- | ---- | --------- | ----- | ----- | ----- |
| mean ovr | 76.8 | 78.9 | **80.8**  | 83.7  | 85.5  | 87.8  |

€100M yields a mean-80.8 XI — **86% of the 94.0 ceiling** — on the steep part of the curve,
where another €50M still buys about three rating points. Against a €37M floor it is neither
trivial nor punishing, so the ticket's round number survives contact with the data.

### 0.1 Four things that were measured and rejected

⛔ **Rating-derived pricing.** "Dynamically-priced" could have meant a price computed from the
card's rating. It must not. Price would then be a monotonic function of quality, no player
would ever be better than his cost, and the optimal XI would be arithmetic rather than a
decision. The mode exists **because** r ≈ 0.52 leaves roughly three-quarters of price variance
unexplained by rating — that residue is where bargains live. Named examples the measurement
surfaced: **John Terry 2014, rated 95, €5M** and **Van Dijk 2024, rated 94, €23M**, against
**Rodri 2023, rated 91, €120M**.

⛔ **Unindexed cross-era prices.** At face value €100M buys a near-best 2004 XI (that season's
p90 is €9.5M) or five average 2025 players. The optimal strategy collapses to "only buy the
2000s" and the modern half of the archive becomes dead weight — the same shape of failure as
an unbounded Captain's Draft pool, where the mechanic evaporates exactly where it should mean
most.

⛔ **Median-basis indexing.** The obvious index — scale each season by its median card — is
wrong, because the middle of the market inflated faster (≈6.5×) than the top did (≈4.3×).
Under it an 88+ player from 2004 costs **€179M** in 2025 money against **€101M** for one from
2024: a 1.8× penalty for being old, which is the unindexed bug with its sign flipped.

⛔ **A cap of 900.** Drafted into this spec and then measured out of it. Raising the pool cap
from 600 to 900 leaves the achievable XI **identical at every budget from €60M up** — the
extra 300 cards are all rated 64–70 and never enter an optimal XI at €100M. They would be
dealt, never wanted, and cost ~150 KB. Cap 900's only real gain is feasibility below €60M,
which this mode does not need.

---

## 1. The data window

`data/market-values.json` is `{ season: { playerId: { determined, valueEur } } }`, with 23
season keys spanning 2003–2025.

⚠️ **2003 is a key, not a season.** It holds **6 priced players out of 517 (1%)**, so the real
window is **2004–2025**. The ticket's own note ("2003–2025, so all eleven 1990s seasons are
unpriced") understates the gap by a season and mislabels it: it is **twelve** seasons,
1992–2003, and they include the whole 1990s plus the first three years of the 2000s.

`data/market-value-history.json` does not rescue them — 4,354 players, season range 2003–2026,
and only **69 rows** dated before 2004.

⛔ **So 1992–2003 is out of this mode entirely**, and that is a data fact, not a scoping choice.
The gate copy and the mode description must not imply the full archive is available. The 644
unpriced cards inside 2004–2025 are excluded for the same reason: a card with no price cannot
be bought, and inventing one would reintroduce rejected option §0.1.

---

## 2. The price model

New pure module `domain/market-index.ts`. No I/O, no adapter imports — same discipline as
`domain/rule-packs.ts`.

```
top50Mean(season) = mean of that season's 50 highest market values
indexFactor(season) = top50Mean(BASE) / top50Mean(season)      // BASE = 2025
cost(card) = round(valueEur × indexFactor(card.season))
```

**Why the top 50 and not the median or the mean:** it is the only basis measured to be flat
across the whole rating range. Mean indexed price by rating band and era:

| band  | 2004–09 | 2010–15 | 2016–20 | 2021–25 | drift |
| ----- | ------- | ------- | ------- | ------- | ----- |
| 60–69 | 21.8M   | 22.6M   | 22.6M   | 29.9M   | 1.37× |
| 70–79 | 31.6M   | 34.9M   | 34.9M   | 39.3M   | 1.24× |
| 80–87 | 55.0M   | 55.5M   | 57.1M   | 62.3M   | 1.13× |
| 88+   | 109.0M  | 89.1M   | 94.8M   | 90.4M   | 0.83× |

Residual drift is 1.13–1.37× against a raw 6.4×, and — the part that matters — **the cheap
band drifts up while the elite band drifts down**, so there is no single era to farm. Compare
the median basis, where every band is penalised in the same direction.

### 2.1 The index and the pool are FROZEN data

⛔ **The factors and the pool membership are generated once and committed**, not recomputed
from whatever `data/` currently holds. This is the `DAILY_SHAPES` pattern and it exists for a
specific failure: when a new season lands, `top50Mean(BASE)` moves, every historical price
moves with it, and the rating-ranked cap admits and evicts different players. A card someone
drafted last week could fall out of the pool, and `replayWith` returns null on the first card
it cannot find — so **a share link would die silently and present as "the link is broken"**,
which is exactly the defect Captain's Draft hit from the other direction.

Extending the window when 2026 data arrives is therefore a deliberate, reviewed change, and
**BASE stays 2025** so existing prices never move. A test regenerates both artefacts from
`data/` and asserts the committed copies still match, so the freeze is verified rather than
trusted.

⚠️ **The budget is a DRAFT-time rule, never a replay-time one.** `replayWith` must not
re-validate the cap. It resolves a saved XI, and re-checking a constraint on resolution is how
a legal match becomes unresumable after a data change. This matches `onePerPlayer`, which is
likewise enforced while drafting and never on replay.

### 2.2 What the card shows

**The indexed cost only** (owner, 2026-08-25) — one number, so the budget arithmetic on screen
is never ambiguous.

⚠️ Recorded trade-off: the real historical figure is then not visible anywhere, and it is real
archive data. The owner accepted this for card clarity. It is softened by the card already
carrying its **season**, so a 2014 card still reads as a 2014 card — what is hidden is the euro
figure, not the provenance.

---

## 3. The pool

New `PoolSpec` member:

```ts
{
  kind: "pricedMarket";
  /** Cards on the page after ranking. ~0.5 KB each, so this is a payload decision. */
  cap: number;
  /** The money year every price is expressed in. Frozen — see §2.1. */
  baseSeason: number;
}
```

Built in three steps:

1. **Gather** every priced player-season in 2004–2025 → 11,122 cards.
2. **Dedupe** to one card per distinct player, at his **best-rated** season → 3,373.
3. **Rank** by rating and **cap at 600**.

The resulting pool measures: rating range **70–95**, median price **€39M**, **50 goalkeepers**,
cheapest legal XI **€37M**, payload **~300 KB**. Cap 600 matches Captain's Draft, and §0.1
records why 900 was measured and dropped. A useful side effect of stopping at 600: the minimum
rating is 70, so every card in the mode is a genuine Premier League contributor rather than
filler the coach will never want.

⚠️ **A rating-ranked cap was expected to destroy the price spread and does not.** The concern
was the `nationalityReserve` failure — rank by one axis and the other axis vanishes. Measured:
the pool's median price is €39M yet its cheapest legal XI is €37M, because weak rating↔price
correlation keeps cheap players inside a rating-ranked cap. So **no stratified price reserve is
needed** and none should be added on suspicion. If the correlation ever tightens, this is the
number that would move.

⚠️ **Dedupe keeps the best-rated season, which costs one kind of bargain.** The pre-breakout
card — Vardy 2014 at 86 for €5M — loses to his own better season. Accepted, for the Captain's
Draft reason: without dedupe the cheapest 85+ XI is literally _Vardy 2014, Vardy 2021, Vardy
2020…_, and a pool where one underpriced man occupies eleven slots is not a market.

### 3.1 Two structural gaps in the pool, both measured

⚠️ **No goalkeeper anywhere costs more than €100M**, and only five sit in €60–100M. The GK slot
is inherently cheap. This is realistic and needs no correction, but any test asserting "an
expensive card exists for every role" would be false, and the reserve rule in §5.1 must not
assume otherwise.

⛔ **Role coverage is thin at the edges.** Cap-600 role counts:

```
CF 150   CB 110   CM 60   GK 50   RW 48   CAM 46   LW 36   CDM 33
RB 29    LB 20    LM 8    RM 6    SS 4
```

A 4-4-2 wants two full-backs and two wide midfielders, and the pool holds **6 RMs and 8 LMs**.
Before building, verify that `domain/eligibility.ts#canPlay` already lets a winger or a
full-back cover those slots — the shipped draft has `altRoles` and adjacent-role eligibility,
so this is very likely already handled. If it is not, the fix is eligibility or the formation
set, **never** a special case in the pool builder. This must be checked rather than assumed:
a formation that cannot be filled would surface as an unfillable slot late in a draft, which is
the worst possible moment to discover it.

---

## 4. The pack

```ts
export const BUDGET_PACK: RulePack = {
  id: "budget",
  pool: { kind: "pricedMarket", cap: 600, baseSeason: 2025 },
  // no chooser — one cross-era pool, so there is nothing to choose
  screens: "legacy",
  opponent: "budget",
  draft: {
    handSize: 5,
    roam: "free",
    timer: null,
    lockPicks: true,
    affordable: true,
    onePerPlayer: true,
  },
  constraints: [{ kind: "budgetCap", amountEur: 100_000_000 }],
  objective: "win",
};
```

**`Constraint` gains its second member**, after `captainFirst`:

```ts
| { kind: "budgetCap"; amountEur: number }
```

⚠️ Unlike `captainFirst`, this one **does** carry its value. The captain is a route param, so
the pack could only declare the rule; the budget is the same for every player of this mode, so
it belongs in the pack.

**`DraftSpec` gains `affordable`, and this pack sets no `standout`.** A guaranteed 80+ in every
hand fights a budget rather than complementing it — it would either be unaffordable (a dead
card) or eat the cap. What a budget hand needs guaranteed is a card the coach **can still
buy**; see §5.1.

⛔ **Register in `RULE_PACKS` only once `/game/budget` exists.** `routedPacks()` filters on
`chooser != null` and reads `RULE_PACKS`, never `domain/modes.ts`. This pack has no chooser, so
it is excluded from the parameterised route automatically and **needs a bespoke route file**,
exactly as Chaos does. Registering it early cannot fan out `[mode]/[club]` the way Captain's
Draft did, but it can still resolve `packFor("budget")` for a URL that renders nothing.

---

## 5. The draft

`screens: "legacy"` — the matchday programme at `?phase=preview` and the split feed at
`?phase=live`, unchanged.

**The budget meter** sits in the Draft Room: spent, remaining, and slots left.

**Dealt but disabled** (owner, 2026-08-25). Every hand is drawn from the pool as normal;
cards the coach cannot afford are rendered greyed with the shortfall shown, and are not
selectable. Seeing Haaland at €200M and being priced out of him is the mode working, not a
frustration to design away.

### 5.1 The reserve rule — why a draft cannot dead-end

The hazard is spending €95M on two stars and being unable to fill nine slots. The ceiling on
the current pick is therefore not the remaining budget but:

```
reserve = Σ, over every OTHER unfilled slot s, of cheapestEligible(s)
ceiling = remaining − reserve
```

`cheapestEligible(s)` is the cheapest pool card that `canPlay` accepts for slot `s`, and the
cards chosen across slots must be **distinct**, since `onePerPlayer` means one man cannot fill
two. A greedy distinct assignment is correct enough here: over-reserving only makes the ceiling
slightly conservative, whereas under-reserving dead-ends the draft. Completion is then
**structurally guaranteed** rather than checked after the fact.

`affordable: true` makes the room deal at least one card at or below the ceiling in every hand,
so no hand is ever entirely dead. Both rules are pure functions over (pool, spent, slots) and
belong in `domain/`, testable with no room and no React.

⚠️ **The reserve must be per-slot and role-aware, not `slotsLeft × cheapestCard`.** The cheapest
card overall is no use if the unfilled slot is a goalkeeper and that card is a winger. With no
GK above €100M and only 6 RMs in the pool (§3.1), a role-blind reserve would be wrong in both
directions and would hide behind plausible-looking numbers rather than failing loudly.

---

## 6. The opponent

New `DraftPolicy` member: `"budget"` — the rival is drafted from the same pool under the same
cap, seeded.

⛔ This is measured, not stylistic. Legacy and Captain's Draft declare `"best"`, which here
would field the **94.0** ceiling XI against the coach's **80.8** — a 13-point gap decided by
the draft rules before a ball is kicked. That is precisely the balance defect the owner
reported on 2026-08-19, when guaranteed-standout hands met a uniformly drawn opponent.

⚠️ Declaring an `opponent` policy also withholds the coach's own XI from the auto-draft, since
both sides draw from one pool. That behaviour already exists in `view/match-session.ts` and
needs no change.

---

## 7. Routing and payload

| Route          | Shape                                                             |
| -------------- | ----------------------------------------------------------------- |
| `/game/budget` | Bespoke `force-static` page, like `/game/chaos`. ~300 KB of pool. |

The setup screen carries formation and rival difficulty. There is no chooser segment and no
`?format=` param — `formats.single` is the only live format, so the tile is direct-entry via
the `isDirectEntry` rule shipped in #192.

---

## 8. Testing

- **The index is flat.** Assert per-band, per-era drift stays inside a stated bound. This is a
  real property of the design, and it is the test that would have caught the median basis.
- **The freeze holds.** Regenerate factors and pool membership from `data/` and assert the
  committed copies match (§2.1).
- **No draft can dead-end.** Property test over many seeds: drive a full XI under several
  spending strategies — greedy-expensive first, greedy-cheap first, random — and assert eleven
  slots always fill inside the cap.
- **`cheapestEligible` is role-aware.** Construct a state where the only unfilled slot is GK and
  the cheapest card overall is an outfielder; assert the ceiling uses the keeper.
- **Every formation is fillable** from the cap-600 pool given `canPlay` (§3.1).
- **The opponent is budget-matched**, not best-available: assert its XI cost is within the cap.
- **Every pool card has a price.** The 644 holes must be filtered, not defaulted to zero — a
  free card would break the whole mode and a zero is easy to introduce silently.

⚠️ **Derive the "locked mode" example** in any test that needs one —
`GAME_MODES.find(m => !isPlayable(m))`. Two tests hardcoded Captain's Draft and both failed the
day it shipped, for reasons unrelated to the rule they guarded.

⚠️ **Re-run everything that asserts on mode status AFTER flipping `budget` live**, not before.

⚠️ **Probe any test that could skip itself.** Two tests in this ticket's history were vacuous —
one asserted a property the bug also satisfied, the other guarded on a button that never
appeared. Prove each new test fails when the behaviour is removed.

---

## 9. Out of scope

- **1992–2003.** No price data exists; see §1.
- **The season format.** `formats.season` stays `planned` — TASK-1811 owns it.
- **Chemistry and Classic.** PR 5.
- **Re-pricing on data growth.** Frozen by §2.1; extending the window is its own change.
