# TASK-1810 PR 5 — Chemistry Draft: design

**The mode in one line:** draft an XI where _who stands next to whom_ matters — countrymen,
club legends and real teammates link across the pitch, and a well-linked side genuinely plays
better than the sum of its cards.

This closes the last of the five rule-pack modes and absorbs the engine half of
[TASK-1824](../../../TASKS.md). Every number below was measured against the committed
34-season data on 2026-08-28, before any code was written; §0 is the evidence and the rest of
the document is what follows from it.

---

## 0. What was measured before designing

Sampling 20,000 random XIs over 5,055 role-carrying distinct players, then simulating the real
draft mechanic (five candidates per slot, `onePerPlayer`).

### 0.1 How common each link actually is

Share of the 55 pairs in a random XI that link, and how many XIs contain none at all:

| Link                                      | Whole pool (5,055) | 600-card pool | XIs with ZERO (whole pool) |
| ----------------------------------------- | ------------------ | ------------- | -------------------------- |
| Same nationality                          | 13.1%              | 26.9%         | 1.7%                       |
| Same club, any season                     | 5.8%               | 22.4%         | 5.2%                       |
| **Same club AND season** (true teammates) | **1.1%**           | 7.4%          | **54.1%**                  |
| Era overlap (shared any season)           | 19.1%              | **63.9%**     | 0.0%                       |

⛔ **Era overlap is disqualified as a link.** At 64% of pairs in a dense pool it is nearly a
constant, so weighting it would flatten the score into noise — precisely the failure
TASK-1824's design constraint predicted ("a same-era link is common … or chemistry becomes a
flat constant"). It is not in the model. Era survives only implicitly, inside the teammate
tier, where it means something specific.

⭐ **True teammates are the prize, not the baseline.** 54% of random XIs contain none. That
rarity is what makes them worth the loudest visual treatment and the largest weight.

⭐ **Measured again after shipping, on what a coach actually experiences** (200 rooms, greedy
draft over the 23 ADJACENT pairs of 4-4-2 Flat — not the 55 pairs of a random XI above):

| In a steered draft              | Share of drafts                 |
| ------------------------------- | ------------------------------- |
| at least one **club** link      | 98.5%                           |
| at least one **teammates** link | **31.5%** (mean 0.38 per draft) |

So the top tier is rare but genuinely reachable — steering roughly triples the 1.1% pair rate
into a one-in-three chance of seeing green. ⚠️ Two consecutive drafts without a teammates link
is the ORDINARY case (≈47%), not evidence the tier is broken; verify the tier by attribute, not
by drafting until one appears.

### 0.2 Can a coach STEER it? (the depth measurement)

Given five candidates per slot, comparing a coach who picks at random with one who picks for
links, and with the best available from those same hands:

| Pool               | random | chem-greedy | best-of-hands | depth     |
| ------------------ | ------ | ----------- | ------------- | --------- |
| Whole pool (5,055) | 16.5   | 53.3        | 71.2          | **×4.33** |
| 600-card proxy     | 51.6   | 120.4       | 145.0         | ×2.81     |

Random sits at **23% of the achievable ceiling** — a wide, playable band. Contrast Budget Cap's
near-miss, where the cap bought 97% of the best possible XI and the mode had to be re-tuned.

⭐ **A wide pool gives MORE depth than a narrow elite one** (×4.33 vs ×2.81), which is
counterintuitive and load-bearing for §2: in a dense pool everything links anyway, so the
coach's choices stop mattering.

### 0.3 What chemistry COSTS (the tuning target)

Real ratings, real pools, 60 dealt rooms each:

| Pool             |           | random | chem-greedy | rating-greedy |
| ---------------- | --------- | ------ | ----------- | ------------- |
| pricedMarket 600 | rating    | 78.5   | 79.4        | **86.2**      |
|                  | chemistry | 13.4   | **44.2**    | 22.9          |
| topTeams (Chaos) | rating    | 80.1   | 80.3        | **88.8**      |
|                  | chemistry | 40.0   | **104.0**   | 41.9          |

⭐ **Chasing chemistry costs 6.8 rating points per player** on a cross-era pool (8.4 on Chaos)
— about a tenth of a card's quality. That is the trade-off that makes this a decision rather
than a solved puzzle: the linked countryman or the better stranger.

⛔ **THIS COST IS REAL, BUT THE "EXCHANGE RATE" INFERENCE DRAWN FROM IT WAS WRONG — see §5.**
The original reasoning was that the engine must repay ≈ 7 rating points per player at full
chemistry. Measuring the actual match outcomes disproved it: the engine's edge is a bounded
ratio and barely notices a 6-point rating gap, so the effect needed is far smaller. The
_direction_ stands (chemistry must repay its cost, or the mode is a trap); the magnitude was
invented rather than measured, and §5 carries the measurement that replaced it.

### 0.4 Adjacency density

Adjacency defined as §3, swept over all 20 shapes:

| Band     | adjacent pairs (of 55) | GK links |
| -------- | ---------------------- | -------- |
| 0.20     | 14–21, mean 18.3       | 1.9      |
| **0.26** | **14–25, mean 20.4**   | **2.4**  |
| 0.34     | 19–30, mean 25.1       | 3.8      |

**Band 0.26 is chosen.** It yields ~37% of all pairs, no shape is starved (min 14), and the
keeper links to his centre-backs and nobody else — which is the football-correct answer, not a
tuned one. The 4-4-2 Flat graph reads exactly like a team: `GK–CB`, `LB–CB`, `LB–LM`, `CB–CM`,
`CM–CM`, `CM–CF`, `CF–CF`.

⭐ **Adjacency costs no depth.** Under adjacent-only scoring the coach still moves
**5.8 → 18.9 (×3.23)**, against ×3.24 for all-pairs. So making placement matter is free — it
adds a spatial dimension without narrowing the game.

### 0.5 The data limits, stated plainly

- **Nationality is single-valued.** `enrichment.caps` is a bare count with no national team
  named, so dual eligibility cannot be recovered from our data. Coverage is 5,109/5,115. This
  _undercounts_ nation links; it does not bias them. Recorded as a known ceiling, not a bug.
- **A cross-era pool cards each player at ONE season**, which is why the club tiers must be
  split — see §1.

---

## 1. The link model — three exclusive tiers

A pair of players in adjacent slots has exactly one link strength, taking the **strongest tier
that applies**:

| Tier | Condition                     | Strength | Name             |
| ---- | ----------------------------- | -------- | ---------------- |
| —    | nothing shared                | 0        | no link          |
| 1    | same `nationalityCode`        | 1        | **countrymen**   |
| 2    | same club, any season         | 2        | **club legends** |
| 3    | same club **and** same season | 3        | **teammates**    |

⛔ **Exclusive, never additive.** Two reasons, and both are load-bearing. Conceptually a pair
_is_ one thing — you do not have "a bit of teammate plus some nation". Practically, the tiers
map 1:1 onto the three connector states the UI must draw (§4); an additive score would have
6 possible values and no honest colour for four of them.

⭐ **Tier 2 exists because of the pool's shape, and dropping it would break the mode.** A
cross-era pool cards each player at his single best season, so Giggs (carded 2008) and Scholes
(carded 2001) were teammates for a decade and would share _no_ link under a strict
same-club-and-season rule. Tier 2 catches the club legends; tier 3 rewards the pairs who
genuinely played the same season. This is also why **Budget Cap's priced pool cannot be
reused**: prices exist only from 2004, and excluding the 1990s throws away Manchester United
'99 and the Arsenal Invincibles — the most recognisable teammate links in the archive.

### 1.1 The score

```
chemistry = round( Σ strength(pair) / (adjacentPairs × 3) × 100 )     // 0..100
```

Normalised **per adjacent pair**, so a 14-pair shape and a 25-pair shape are directly
comparable and no formation is quietly easier. A slot that is still empty contributes a
strength of 0 and still counts in the denominator, so the number climbs as the XI fills
rather than jumping around — chemistry is a progress bar, not a verdict.

⚠️ **Pure, and a function of the placed XI alone** — `(cards, formation) → number`. No state,
no memo, no clock. It recomputes on every placement, which is what lets the draft surface it
live and what makes it trivially testable.

⚠️ **The display curve is calibrated, not assumed — and the calibration is now MEASURED.**
Over 200 dealt rooms across five shapes on the real pool:

| raw score      | mean | p50 | p75 | p90 | max |
| -------------- | ---- | --- | --- | --- | --- |
| random pick    | 9.3  | 9   | 12  | 16  | 25  |
| steering coach | 29.8 | 29  | 35  | 39  | 53  |
| best-of-hands  | 36.7 | 36  | 41  | 46  | 61  |

The all-teammates ideal is unreachable from five random candidates a slot, so scoring against
it would tell a coach who played well that he got 30 — which reads as failure and makes the
meter useless. **`CHEM_ANCHOR = 40`** puts a steering coach near 75, a random one near 23, and
leaves 100 reachable for an exceptional draft.

⭐ Confirmed independently: a human-style draft steering by the on-card deltas scored **72** in
a real browser, landing where the anchor — fitted against a greedy _algorithm_ — predicted.

⚠️ Two consequences the tests had to absorb. The tier grading is asserted as an **ordering**
(nation < club < teammates) rather than a fixed fraction, because a fraction re-breaks on every
refit. And "filling a slot raises the score" is asserted on countryman links: a full teammate
sheet clamps at 100 with or without an empty slot, so above the clamp the climb is invisible
and the assertion would prove nothing.

---

## 2. The pool — wide, cross-era, unpriced

New `PoolSpec` variant:

```ts
{ kind: "crossEra", cap: 600 }
```

One card per distinct player at his best-rated season, rating-ranked, tie-broken on `cardId`,
capped at 600. All 34 seasons.

- ⭐ **Wide by measurement, not by preference** (§0.2): breadth is what preserves the coach's
  agency. A dense elite pool links by itself.
- ⛔ **Not `topTeams`** (Chaos): it is built from each season's top three clubs, so it is full
  of real teammates by construction and the coach _starts_ at chemistry 40 instead of 13
  (§0.3). The draft has nowhere to climb, and the mode's whole arc disappears.
- ⛔ **Not `pricedMarket`** (Budget Cap): the 2004+ price window excludes the 1990s, and a
  price is meaningless here.
- ⚠️ **The tie-break on `cardId` is not cosmetic.** Two players level on rating at the 600
  boundary would otherwise be ordered by scan arrival, so the pool could shift between builds
  and silently evict a card someone has already drafted — killing his share link. Same rule
  `pricedMarket` learned.

---

## 3. Adjacency — `domain/pitch-adjacency.ts`

Formation slots carry `row` (1 = keeper line, increasing toward the opponent goal) and `col`
(1..n **within that line**). Lines have different widths, so `col` is not comparable across
rows and must be normalised — the same normalisation `PitchDraft` already uses to place spots:

```ts
x(slot) = slot.col / (slotsInSameRow + 1); // 0..1 across the pitch
```

Two slots are adjacent when:

- **same row** and `|col difference| === 1` — neighbours along a line (CB–CB, CM–CM); or
- **rows differ by exactly 1** and `|x(a) − x(b)| ≤ 0.26` — vertically near (CB–CM, LB–LM).

Rows two or more apart are never adjacent: a keeper does not link to a striker.

⚠️ **Pure geometry over `Formation`, in `domain/`, with no knowledge of cards.** Returns index
pairs. That keeps it exhaustively testable against all 20 shapes and lets the UI and the score
share one definition rather than drifting apart.

⚠️ **`ADJACENCY_BAND = 0.26` is a measured constant** (§0.4) and carries its sweep in a
comment. Changing it changes every chemistry score ever shared, so it is frozen the way
`market-index.ts`'s factors are.

---

## 4. What the coach sees

### 4.1 Connector lines on the pitch

Every adjacent pair draws a connector between its two spots, and the connector states are the
tiers:

| State       | Connector                     | Meaning                                |
| ----------- | ----------------------------- | -------------------------------------- |
| No link     | thin, muted grey, low opacity | nothing shared (or a slot still empty) |
| Soft link   | **amber**, solid              | countrymen or club legends (tiers 1–2) |
| Strong link | **green**, glowing            | teammates (tier 3)                     |

⭐ The rarity measured in §0.1 is the design justification: 54% of random XIs contain no
teammate pair at all, so a green line is genuinely an event and deserves the glow. Amber is the
common good outcome; grey is the resting state.

⛔ **Drawn as an SVG layer UNDER the spots, `pointer-events: none`.** The pitch's own
`::after` markings already swallowed clicks once (the centre circle made a CM unselectable);
decoration must never take a hit. Same rule, third time.

⚠️ **Reduced motion**: the glow is a `box-shadow`/`opacity` pulse and is gated, like every
other animation in the file. The colour distinction must survive the gate — it is the
information, and only the _pulse_ is decoration.

⛔ **MEASUREMENT TRAP, found here and worth carrying:** in an automated browser pane,
`getComputedStyle` reports a **transitioned** property at its start value forever — the page
composites no frames, so the transition sits at `currentTime: 0` in state "running". A club
link read as grey while its `stroke-width` (not transitioned) was already correct, which looks
exactly like a cascade bug and is not one. Verify a transitioned property with the transition
disabled, or read `element.getAnimations()`.

⚠️ **Re-measured 2026-09-01, and the first reading of this trap was too narrow — it is NOT
only a hidden pane.** With `document.visibilityState === "visible"` and the pane on screen,
**all four tiers still reported `stroke: rgb(159, 179, 200)`** (the `none` grey) minutes after
placement, while `stroke-width` and `filter` were per-tier correct and `getAnimations()` showed
two `CSSTransition`s still "running". Injecting `.chem-link { transition: none !important }`
immediately gave the true values (nation/club `#f6c000` at 0.55/0.9, teammates `#34d399` at 1.0
with the glow). **Never read a transitioned property in an automated pane without disabling the
transition first**, however visible the pane claims to be.

⚠️ **Colour is never the only channel.** Each connector carries a `<title>` naming the link
("Teammates — Manchester United, 1998-99"), and the chemistry meter states the counts in text,
so the three states are distinguishable without colour vision.

### 4.2 The meter

A chemistry meter above the pitch, in the idiom Budget Cap's "Countdown" meter established:
the 0-100 score as the hero number, a bar, and a line breaking down the links by tier
("3 teammates · 5 club legends · 4 countrymen"). It renders on the pitch **and** on the round
veil, because the veil covers the pitch (the lesson the budget meter taught).

### 4.3 In the round — what a card would DO

Each candidate in a hand shows the chemistry it would _add_ to the open slot: a small delta
badge ("+7") plus the tier icon of its best new link. This is the whole decision made legible
— the 91 stranger against the 84 countryman — and without it the trade-off measured in §0.3 is
invisible and the mode reduces to picking the highest number.

⚠️ Computed against the **current** placed XI and the open slot's adjacency only, so it is
honest about the slot being filled rather than a global estimate.

---

## 5. The engine — chemistry as a Modifier

`MatchSetup.modifiers` already exists and is layered after the baseline set, so this needs no
new engine seam:

```ts
chemistryModifier(chemistry: number): Modifier
```

A pure weight contributor, derived once from the final XI at setup.

⛔ **It rides on every path that rebuilds the match** — live start, resume, and share replay.
This is the exact shape of two shipped defects already (the `opponent` policy and Budget Cap's
`budget`): a replay built without it produces a _different match_, and because replay verifies
by fingerprint, the mismatch surfaces as "your saved match is corrupt" rather than as the
missing field it is. The chemistry score is derived from the XI, which the code already
carries — so nothing new goes in the share code, and no codec version bump is needed.

⛔ **THE ORIGINAL PREMISE HERE WAS WRONG, AND MEASURING IS WHAT CAUGHT IT.** This section used
to say the effect must be worth ≈ 7 rating points per player, reasoned from §0.3's cost. It
does not need to be, because `goalChance` derives its edge as `attack / (attack + oppDefense)`
— a **bounded ratio**, deliberately insensitive to power — so a 5.7-point average rating gap is
worth well under one win-rate point. Measured over **~3,000 seeded matches per constant**,
a chemistry XI (chemistry 73.4, rating 82.6) against a rating XI (chemistry 32.9, rating 88.3),
played both ways round so home advantage cannot flatter either:

| effect   | chem XI   | rating XI | draw  |                                   |
| -------- | --------- | --------- | ----- | --------------------------------- |
| 0        | 36.6%     | 37.4%     | 26.1% | chemistry buys nothing — the trap |
| **0.08** | **37.8%** | 36.8%     | 25.4% | **chosen**                        |
| 0.2      | 38.7%     | 35.6%     | 25.7% |                                   |
| 0.4      | 40.9%     | 34.3%     | 24.8% | chemistry starts to dominate      |

`CHEM_EFFECT = 0.08` turns chemistry's rating deficit into a ~1-point win-rate advantage:
rewarded for playing the mode as intended, never decisive.

⚠️ **A 240-match sweep looked "saturated" above 0.1.** It was not — 1–3 point differences are
inside the noise at that sample size. Any re-fit needs thousands of matches, not hundreds; the
obvious quick re-run gives a confidently wrong answer.

⚠️ **Only a FLAG travels.** The scores are derived inside `buildSession` from the two XIs it
already holds, so nothing new enters IndexedDB or the share code and the codec needs no version
bump. The flag rides in `RivalSetup` beside `budget` and `policy` — the seam whose own doc
already states that every field there must reach every rebuild path.

⚠️ **The engine never learns what chemistry IS.** It receives weights. No bespoke branch —
the modifier-stack rule locked in TASK-1803.

---

## 6. The pack

```ts
export const CHEMISTRY_PACK: RulePack = {
  id: "chemistry",
  pool: { kind: "crossEra", cap: 600 },
  chooser: undefined, // no choice to make — the pool is one cross-era set
  screens: "legacy",
  opponent: "best",
  draft: {
    handSize: 5,
    roam: "free",
    timer: null,
    lockPicks: false,
    confirm: true,
    onePerPlayer: true,
  },
  constraints: [{ kind: "chemistry" }],
  objective: "win",
};
```

- ⭐ **`lockPicks: false` + `confirm`**, following Budget Cap: the activity is trying
  combinations until the links work, so ending the draft on the last pick would stop the game
  at the moment it gets interesting. ⛔ And it therefore inherits Budget Cap's hard-won rule —
  **"reconsiderable" has two halves**: re-opening a filled slot must both refund what it can
  and offer a way out. That is already built (#201) and must be verified here, not assumed.
- ⚠️ **No chooser**, so the route is `/game/chemistry` — a bespoke page like `/game/budget`,
  not the parameterised `[mode]/[club]` pair. ⛔ `routedPacks()` filters on `chooser != null`
  and must therefore keep excluding it; registering a chooser-less pack into the
  chooser-aware route is what broke the Vercel build once.
- ⚠️ **No `standout`.** A guaranteed 80+ per hand fights link-hunting the same way it fights a
  budget: the strong card is rarely the linked one, and the guarantee would quietly pull every
  coach toward the rating-greedy XI.
- Registry: mode `chemistry` flips `single` to `live`. It already exists with an accent and a
  mark; this is a status change, which is the registry doing its job.

---

## 7. Testing

The load-bearing suites, beyond the obvious:

- **Adjacency over all 20 shapes**: symmetric, irreflexive, no pair repeated, no link across
  two rows, every shape within the measured 14–25 band, and the 4-4-2 graph asserted
  explicitly (a named-shape golden, so a geometry change is loud).
- **Tiers are exclusive**: a pair that is both countrymen and teammates scores 3, not 6.
- **The score is pure and order-independent**: the same XI in the same slots scores the same
  however it was assembled; an empty slot contributes 0 without changing the denominator.
- ⛔ **The discrimination control**: over the real pool, a chem-greedy XI must out-score a
  rating-greedy XI by a wide margin. This is the test that would fail if the model collapsed
  into a constant — the thing TASK-1824 warned about — and it is asserted as a _property_
  (greedy > random × 2), never a golden number, because the pool moves with the data.
- ⛔ **The engine round-trip**: a match played with chemistry replays byte-identically from
  its share code and its saved record. This is the defect class §5 names.
- ⛔ **The inertness control**: every other pack's matches and deals are byte-identical to
  before this shipped.
- **Fixtures read the pack**, never restate it (`CHEMISTRY_PACK.draft`) — the #201 lesson.

---

## 8. Out of scope

- Surfacing chemistry on the **other** modes' draft hubs — the remainder of TASK-1824, which
  stays open. This ships the score and the engine effect; spreading it across four shipped
  surfaces is a separate change with its own risk.
- Season format (TASK-1811).
- A bespoke 30-concept gallery for the chemistry surface. It ships on the Legacy pitch idiom
  with connectors and a meter added; if the owner wants a designed surface, that is a gallery
  pass on a working mode.
- Recovering dual nationality (§0.5). Not possible from our data; would need a new pipeline
  source.
