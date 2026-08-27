# TASK-1842 — Nationality Draft: design

**Owner's brief (2026-08-25, verbatim intent):** _"select the nationality and build team from
this nationality — for example select Egypt, show me the available players for every position.
If they are more than 5 just give me 5, and if less than 5 just show the available cards. If no
players for this position give me African players in this position, and the same if I choose
France — if no players in any position give me from Europe."_

The scarcity is the mode. A hand is drawn from a **widening ring** — the nation, then its
continent, then the world — and watching the ring widen at a thin position is the drama.

## 0. What was measured before designing (2026-08-27)

Across all 34 seasons: **5,115 distinct players, 128 nations**, nationality coverage
5,109/5,115 (6 rows carry no code and are simply never in a nation pool; 60 rows carry no
role and are already ineligible everywhere).

- **Egypt (14 players)** — the owner's own example — is empty at GK, LB and LM (→ Africa),
  and thin (< 5) at seven more roles. **France (257)** and **Brazil (136)** fill every role
  five-deep. The premise validates exactly.
- **Ring 2 can be thin too**: Asia holds **2 GKs total** across the whole archive, Oceania
  3 RWs. So the world ring is not decoration — it is one data refresh away from being needed,
  even though **no (nation, role) reaches it today**.
- **Nations with ≥ 11 players: 57.** With ≥ 5: 78; with ≥ 1: 128. Egypt's 14 sits above the
  11 threshold.
- **Max same-role slots in any of the 20 shapes: CB 3, CM 3**, CDM/CF/CAM/SS 2, the rest 1.
  Worst-case same-role consumption is therefore 3 hands × 5 cards = 15, before altRoles theft.
- **England is the payload bound**: 1,767 players, 471 of them CM-eligible. Uncapped, its pool
  would be ~900 KB baked into a `force-static` page. Nine nations exceed a 30-per-role cap;
  the other 48 don't engage it at all.
- `nationalityCode` is a **flag-icons key** (ISO-2 lowercased plus `gb-eng`-style home
  nations), rides on every enriched card already (`CardBio`), and `<Flag>` consumes it as-is.

## 1. The shape: a rule pack, exactly like Captain's Draft

`NATION_PACK` in `domain/rule-packs.ts`:

```ts
{
  id: "nation",
  pool: { kind: "nationRings", perRoleCap: 30, roleFloor: 20, minPlayers: 11 },
  chooser: { kind: "nation" },
  screens: "legacy",
  opponent: "best",
  draft: { handSize: 5, roam: "free", timer: null, lockPicks: true, onePerPlayer: true },
  constraints: [],
  objective: "win",
}
```

- ⚠️ **No `standout`.** The ticket's own warning: a thin nation at a thin position may have no
  80+ card, and the pack must degrade honestly rather than widen just to keep a promise. The
  per-pack round copy (#202) already keys the "rated 80 or better" sentence on `standout`, so
  the veil makes no claim this pack cannot keep — that work pays off here immediately.
- `lockPicks: true` — picks are final, the Legacy mechanic. Short hands are honest ("if less
  than 5 just show the available cards"), and a hand of one is a forced pick, which is the
  scarcity being felt.
- No bench, no budget. The mode's whole novelty is the pool recipe and the deal.
- The registry (`domain/modes.ts`) gains a **twelfth mode**: id `nation`, group `draftPacks`,
  formats `{ single: "live", season: "planned" }`, its own accent and 8×8 pixel mark, ticket
  TASK-1842. The gate renders it with zero component changes — that is the registry doing its
  job.

## 2. The continent map — committed, in `domain/`

`domain/continents.ts`: a `Record<string, Continent>` over flag-icons codes, six values —
`eu | af | as | na | sa | oc` — plus `continentOf(code)` handling the `gb-*` home nations
(all `eu`). Geographic continents, not FIFA confederations, because the owner's words are
"African players" and "from Europe" (so `au` is Oceania and `tr`/`ru`/`il` are Europe, where
UEFA membership and geography agree closely enough for a game).

⚠️ **The rot guard the ticket demanded**: a data-driven test walks every `nationalityCode` in
every `players-*.json` and asserts it resolves to a continent — a new nation arriving in a
data refresh fails the suite instead of silently drafting as "world".

Localization: continent names are six catalog keys in both locales. Nation display names come
from `countryNameFromCode`, **extended with a locale parameter** (Intl.DisplayNames already
speaks Arabic; the four home nations and `xk` Kosovo get hardcoded pairs beside the existing
English ones — the M89 lesson: `<html lang="ar">` is not localization, the strings are).

## 3. The pool recipe — `nationRings`, bounded before it is built

For the chosen nation, in `adapter/pool.ts` (reusing the memoised `universe()` — the 18× rule):

1. **Nation ring**: for each of the 13 roles, the nation's eligible players (by `canPlay`)
   ranked by rating, capped at **`perRoleCap` = 30** per role; union, one card per distinct
   player at his best-rated season. Only 9 of 57 nations ever hit the cap (England, France,
   Scotland, Ireland, Netherlands, Spain, Brazil, Wales, Italy) — for the other 48 the pool
   is literally "the available players", the owner's words.
2. **Continent fill**: for each role where the union holds fewer than **`roleFloor` = 20**
   eligible cards, add the continent's best (excluding the nation) until the role reaches the
   floor or the continent runs out.
3. **World fill**: for each role still under the floor, the world's best. Unreachable today
   (§0) and kept anyway — it is the guarantee that a hand can never be empty.

Why 20: the worst shape consumes 15 same-role cards (3 slots × handSize 5), and altRoles let
other hands steal from the same set, so the floor carries a margin above 15. The margin is
**verified, not trusted**: a control test deals every routed nation across the worst shapes
and asserts no hand ever comes up empty (§6).

Payload: England ≈ 300–390 cards ≈ ~200 KB; a thin nation ≈ ~230 (its fills are its bulk);
both well under the ~720 KB a Legacy club page already ships. 57 nations × 2 locales = 114
new prerendered pages, built off the one memoised universe.

## 4. The deal — ring resolution happens AT DEAL TIME, per slot

`DealOptions` gains `rings?: { nation: string }`. When present, a slot's candidate bag
(unused ∧ `canPlay`) is partitioned by `ringOf(card, nation)` — nation / same continent /
other — and the hand is a seeded draw from **the lowest non-empty ring only**, up to
`handSize`, short when the ring is short. No mixing inside a hand.

⛔ **Per slot, not per role, and this is the subtle half of the ticket's "per POSITION"
requirement.** Egypt has one CB; a 4-4-2 has two CB slots. The first CB hand takes him
(a hand of one), and the second — the nation now exhausted for that role under
`onePerPlayer` — widens to Africa. A ring precomputed per role would deal the second hand
from an "available" nation that has nobody left. Same for altRoles theft: the lone CB may
already be gone into an RB hand.

`domain/PoolCard` gains optional `nationalityCode?: string | null` — acknowledging a field
every real card already carries via `CardBio`, exactly as `price` was added for Budget Cap.
The rings option is inert for every other pack (absent = the shipped behaviour, byte for
byte), so no existing replay or share code can drift.

## 5. What the coach SEES — the ring must be visible

The ticket: _"If a card silently arrives from 'Africa' while the coach thinks he is drafting
Egyptians, the mode's premise is broken without him knowing."_ Two surfaces, both in
`PitchDraft`, both gated on the new `nation` prop being present:

1. **A line on the hand.** The round veil's hint states the ring whenever it is not the
   nation: "No Egyptian is left for this position — these are Africa's best." (Catalog keys
   with nation/continent names interpolated; the hand is single-ring by construction, so the
   line is computed from any card in it.)
2. **A chip on the card.** Non-nation cards in a round carry a small badge naming their ring
   ("Africa" / "World"), in the `pd-current-mark` idiom — pointer-events none, above the
   pick control. Nation cards carry nothing: the badge marks the surprising case only. The
   card face's own flag (already rendered from `CardBio`) corroborates.

The chooser: `ModeChooser` gains `kind: "nation"` — a grid of the 57 nations grouped by
continent, each tile a `<Flag>`, the localized name, and the player count. Backed by a new
menu-only `nationChoices()` adapter read (names + codes + counts, never the card universe —
the `clubChoices` rule). The draft route's back link reads "Choose a different nation".

## 6. Routes and testing

**Routes** — the chooser-aware pair already shipped: `/game/nation` renders the chooser;
`/game/nation/<code>` (the `[club]` segment carries the flag-icons code — URL-safe as-is)
builds the pool and hands `GamePlay` the same props Legacy passes, plus `nation`.
`generateStaticParams` unions nation codes for nation packs; `dynamicParams = false` keeps
invented codes as build-free 404s. `buildPool(spec, only)` widens `only` to
`number | string`. Metadata goes three-way per chooser kind (the "titled them all Legacy
Club" lesson).

**Tests, the load-bearing ones:**

- **Continent-map rot guard** (§2) over the real data files.
- **The no-empty-hand control**: every routed nation × the worst shapes (both 3-CB and 3-CM
  families included) × several seeds — every hand non-empty. This is the floor's actual
  authority; the numbers in §3 are its starting point, not its proof.
- **Ring-purity property**: for any deal with rings on, each hand is single-ring, and a hand
  is non-nation **only if** the nation ring was exhausted for that slot at that point in the
  deal. The Egypt/4-4-2 second-CB case above is the named fixture.
- **⛔ The inertness control**: a deal WITHOUT the rings option over the same pool is
  byte-identical to today's — the option must not shift any other pack's PRNG stream.
- **Fixture honesty** (the #201 lesson, third occurrence): component tests read
  `NATION_PACK.draft` off the pack, never restate it.
- Registry guards extend themselves (unique ids, both locales resolve, mark exists) — plus
  the mode-status suites re-run AFTER the flip, not before (the Captain's Draft lesson).
- Playwright: gate → chooser → a thin nation's draft shows a widened hand with its ring line.

**Verification beyond tests**: a real browser on Egypt (empty roles → Africa hands with the
line and chips), France (all-nation), and `/ar` (Arabic nation names, Arabic ring line,
counted by codepoints).

## 7. Out of scope

- Season format (TASK-1811), chemistry links (that is the Chemistry pack), any rival drawn
  from its own nation (the shipped `opponent: "best"` + real-club rival picker is the
  precedent; a nation-vs-nation rivalry is a future refinement the owner has not asked for).
- Nations under 11 players: not routed. A one-player nation is a continent draft wearing a
  flag, and 57 tiles is already a full menu. The threshold is a pack literal, one number to
  change.
- Restyling the chooser beyond the shipped Legacy-menu idiom. If the owner wants a bespoke
  surface, that is a 30-concept gallery pass on top of a working mode.
