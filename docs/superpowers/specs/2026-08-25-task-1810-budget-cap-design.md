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

⭐ **Freezing the FACTOR TABLE is enough to freeze the window, so only it is committed.** The
pool is built from the seasons that have a factor, so when the pipeline adds 2026 that season
simply has none and is not drafted — membership does not move, and no 600-entry id list has to
be committed and reviewed. `top50Mean(2025)` is likewise unaffected, because 2025's own rows
are already present. **BASE stays 2025** so existing prices never move.

Membership can still shift from a _correction_ to an existing season, or from a change to
`rate()`. That is what the **golden membership test** is for: it pins the pool's card-id list,
so any such shift fails loudly at exactly the moment it happens rather than quietly killing
share links. The factor table gets the same treatment — regenerate from `data/`, assert the
committed copy matches.

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

✅ **CHECKED, and it is a non-issue — but only because of `altRoles`.** `canPlay` is strict
(`role === slot || altRoles.includes(slot)`) with no adjacent-role leniency, so this had to be
measured rather than assumed. Counting **eligible** cards rather than primary roles, every one
of the 13 distinct slots across all 20 formations is well supplied, and each has a cheap option:

```
CAM 129 (2.9M)  CB 136 (2.3M)  CDM 96 (3.0M)  CF 183 (2.9M)  CM 125 (4.3M)
GK   50 (1.5M)  LB   64 (2.3M)  LM  51 (4.3M)  LW 153 (8.9M)  RB  61 (3.0M)
RM   50 (4.5M)  RW 148 (2.9M)  SS  75 (4.6M)
```

**No formation has a slot with fewer than 11 eligible cards**, so no eligibility or formation
work is needed. ⚠️ The primary-role counts above are kept because they are the trap: read
alone they say the mode cannot field a 4-4-2, and they are wrong by 6–8×. Any future audit of
pool coverage must count `canPlay`, not `role`.

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

**`DraftSpec` is UNCHANGED, and this pack sets no `standout`.** A guaranteed 80+ in every hand
fights a budget rather than complementing it — it would either be unaffordable (a dead card) or
eat the cap. What a budget hand needs is a card the coach can still buy, and §5.1 shows that
falls out of the reserve rule without any new deal option, so `roomDeals` is not touched at all.

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
reserve = Σ, over every OTHER unfilled slot, of the CHEAPEST CARD IN THAT SLOT'S HAND
ceiling = budget − spent − reserve
```

⭐ **The reserve is computed over the DEALT HANDS, not over the pool** — and that one choice
makes the whole rule fall out for free. `roomDeals` deals all eleven hands up front, in slot
order, against one shared used-set (`onePerPlayer` already guarantees the hands are disjoint),
so "the cheapest card in each unfilled hand" is a fixed, distinct, role-correct set the moment
the room is created. Two properties follow, neither of which needs enforcing:

1. **Completion is structural.** Picking a card at cost `c ≤ ceiling` leaves
   `remaining ≥ Σ(cheapest of the other unfilled hands)`, so the invariant is preserved
   inductively and the last slot is always affordable.
2. **No hand is ever dead.** The cheapest card in the open hand is, by the same invariant,
   always at or below the ceiling — so there is always something to click.

⛔ **This is why the spec no longer has an `affordable` deal option.** The first draft added
`affordable: true` to `DraftSpec` to make the room deal one buyable card per hand. That cannot
work: `roomDeals` deals every hand from one seed **before the draft starts**, and affordability
depends on what has already been spent, which does not exist yet. Deriving the reserve from the
hands gets the same guarantee with no change to the shipped deal at all. ⚠️ Do not re-add it.

⚠️ **A pool-wide reserve would be both wrong and role-blind.** `slotsLeft × cheapestCard` is the
obvious form and it under-reserves: the cheapest card overall is no use when the unfilled slot
is a goalkeeper and that card is a winger. Reading the hands sidesteps this entirely, since a
hand only ever holds cards `canPlay` accepted for its own slot.

Both functions are pure over `(hands, picks, budget)` and belong in `domain/`, testable with no
room and no React. ⚠️ Budget state is **derived, never stored** — `RoomState` keeps only
`picks`, and spend is recomputed from picks + hands on every read, the same way daily streaks
are derived rather than persisted.

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

⛔ The route must declare **`export const dynamic = "force-static"` and `export const revalidate = false`**. Both are
CI-guarded — `tests/unit/game-routes-static.test.ts` asserts the first, `tests/unit/route-revalidate.test.ts`
rejects any positive `revalidate` — and a page that quietly goes dynamic is what caused the
2026-07 Vercel Active-CPU pause. This page is an especially bad candidate to get wrong: it
bakes a 600-card pool, so a request-time render would rebuild that pool per view.

---

## 8. Testing

- **The index is flat.** Assert per-band, per-era drift stays inside a stated bound. This is a
  real property of the design, and it is the test that would have caught the median basis.
- **The freeze holds.** Regenerate factors and pool membership from `data/` and assert the
  committed copies match (§2.1).
- **No draft can dead-end.** Property test over many seeds: drive a full XI under several
  spending strategies — greedy-expensive first, greedy-cheap first, random — and assert eleven
  slots always fill inside the cap.
- **The reserve reads the HANDS, not the pool.** Construct a room whose GK hand is expensive
  while a cheap outfielder sits in another hand; assert the reserve counts the keeper's hand.
  ⚠️ A pool-wide implementation passes a naive test and under-reserves here, so this fixture
  must make the two answers differ — otherwise it is vacuous.
- **The open hand always has something clickable.** For every seed and every spending strategy,
  assert at least one card in the open hand is at or below the ceiling (§5.1 property 2).
- **Every formation is fillable** from the cap-600 pool given `canPlay` — already measured
  green (§3.1), so this is a regression pin rather than a discovery.
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
