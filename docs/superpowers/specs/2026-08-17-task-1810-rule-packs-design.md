# TASK-1810 — Modes as rule packs (PR 1: the seam + Legacy Club)

**Date:** 2026-08-17
**Ticket:** [TASK-1810](../../../TASKS.md) · `P3` · `XL` → sliced into 5 PRs
**Depends on:** TASK-1806 (done), TASK-1807 (done)

Introduces the rule-pack abstraction the ticket has always described but never had, and ships
**Legacy Club** through it end to end. The remaining four modes then become data-only PRs.

---

## 1. ⚠️ Two corrections to the ticket

**It says six modes; there are five.** The shipped registry (`domain/modes.ts`) has exactly
five tiles pointing at TASK-1810 — `captains`, `budget`, `chemistry`, `legacy`, `classic`.
**Survival is deliberately not a mode.** TASK-1832 decision D7 made it *an objective on the
Season format, owned by TASK-1811*, and `modes.ts` records that in a comment. The ticket text
predates the decision and is stale.

**Two of the five are described in season terms this ticket cannot deliver.** Legacy Club is
"season-by-season" and Classic is "a real season vs 19 real opponents", but multi-match
progression is TASK-1811 — which depends on 1810. The registry already resolves the ordering:
every mode declares status **per format** (`single` / `season`). So:

- **TASK-1810 makes `single: "live"`** for the five modes.
- **TASK-1811 later makes `season: "live"`** where it applies.

That reading is what turns an `XL` into five shippable slices.

---

## 2. Owner decisions

| # | Decision | Chosen |
| --- | --- | --- |
| D1 | Slicing | **Seam + one mode first**, then one PR per mode. Each PR leaves the game playable and flips one tile `planned → live` |
| D2 | First mode | **Legacy Club** — the only one of the five with no data gap (see §7) |
| D3 | The seam | **Declarative `PoolSpec` in `domain/`**; `adapter/` reads the recipe and does the JSON work |
| D4 | Routing | **One parameterised `/game/[mode]`** with `generateStaticParams`, so PRs 2–5 are data-only |
| D5 | Legacy clubs | **Ten** — the nine ever-presents **plus Manchester City** |

---

## 3. The seam

`domain/rule-packs.ts` — pure, no `adapter/` import, unit-testable with zero I/O:

```ts
interface RulePack {
  id: ModeId;                 // joins to the modes.ts registry
  pool: PoolSpec;             // a declarative RECIPE, never a builder function
  chooser?: ChooserSpec;      // a pre-draft choice the pack needs (Legacy: which club)
  constraints: Constraint[];  // see the honesty note below
  objective: Objective;
}

interface PoolSpec {
  /** Explicit team ids; `null` means "the top N of each season's table". */
  teams: number[] | null;
  /** Explicit seasons, or `null` for every committed season. */
  seasons: number[] | null;
  topTeamsPerSeason?: number; // only when `teams` is null
  cardsPerTeam: number;
}
```

`adapter/pool.ts` exposes exactly one entry point:

```ts
buildPool(spec: PoolSpec): Promise<EnrichedCard[]>
```

⚠️ **Why a recipe and not a function.** A `buildPool` slot in `domain/` would be a signature
only server code can satisfy, which makes it trivial to pull `adapter/*` into a client
component — the one boundary the game's layering forbids outright. A recipe keeps "modes are
rule packs (**data**), not code paths" literally true.

### ⚠️ What PR 1 actually proves, and what it does not

Legacy needs **no constraint** — its entire rule is a pool filter. Shipping a
`constraints` array that nothing exercises is how a seam gets designed for imagined needs.
So PR 1 does two things about that:

1. **Re-expresses the existing Chaos pool as a `PoolSpec`.** That gives the pool half **two**
   real callers, one of which already ships — and its output is diffable against today's
   252 cards, which is the control that proves the recipe changed no behaviour.
2. **Declares `Constraint` and `Objective` as types with Legacy's values empty/`"win"`, and
   builds no machinery for them.** Their first real exercise is Budget Cap (spend ≤ cap) and
   Captain's Draft (slot 1 must be a captain). The machinery arrives with the second caller
   that needs it, not now.

`objective` is near-trivial for every single-match mode ("win"); it earns its keep in
TASK-1811's season format. Named now so packs have a stable shape, not elaborated.

---

## 4. The route

`src/app/[locale]/game/[mode]/page.tsx` — `force-static`, `revalidate = 86400`,
`generateStaticParams` over packs whose `formats.single` is `"live"`.

`/game/draft`, `/game/chaos` and `/game/daily` keep their own files; Next resolves static
segments before dynamic ones, so they are unaffected.

**Three guards this trips, all handled here rather than discovered in CI:**

1. ⛔ **Unknown segments must 404.** `/game/nonsense` calls `notFound()`, and **no
   `loading.tsx` may sit above it** — TASK-M72 proved that any such file commits a 200 before
   the page runs, which is the exact soft-404 class that ticket existed to remove.
2. ⚠️ **`game-routes-static.test.ts` counts page FILES, not pages.** The floor moves 5 → 6,
   and its comment must say the sixth file stands for N modes so a future reader does not
   "fix" the count downward.
3. ⚠️ **`scripts/warm-e2e-routes.sh` needs one URL per mode.** The E2E job runs `pnpm dev` and
   compiles on demand; an uncompiled route blows the 12s `expect` timeout on its own.

---

## 5. Legacy Club

**Ten clubs, all with real depth in all three provenance eras** (measured, not assumed):

| Club | id | Seasons | retro90s / golden / modern |
| --- | --- | --- | --- |
| Manchester United | 33 | 34 | 8 / 10 / 16 |
| Liverpool | 40 | 34 | 8 / 10 / 16 |
| Tottenham Hotspur | 47 | 34 | 8 / 10 / 16 |
| Arsenal | 42 | 34 | 8 / 10 / 16 |
| Chelsea | 49 | 34 | 8 / 10 / 16 |
| Everton | 45 | 34 | 8 / 10 / 16 |
| Aston Villa | 66 | 31 | 8 / 10 / 13 |
| Newcastle United | 34 | 31 | 7 / 9 / 15 |
| West Ham United | 48 | 30 | 7 / 8 / 15 |
| Manchester City | 50 | 29 | 4 / 9 / 16 |

⚠️ **The club menu and the payload are the same decision.** One prerendered page holds every
selectable club's cards, so ~30 cards × 10 clubs ≈ **300 enriched cards** — the same order as
the Chaos pool's 252, which is the proven size. Adding all 51 clubs would be ~1,530 and is
why the menu is curated rather than complete.

**The picker is a client-side filter, not a route or a phase.** Every club's cards are already
in the payload, so choosing a club filters an array. No navigation, no second route, and
nothing added to the match machine — which matters because *pre-match is a phase, not a
route* and the live session lives in component memory.

Handoff is the existing `GamePlay({ pool, initialPhase })` with the filtered pool. Draft,
preview, live and summary are untouched.

Cards are drawn per club across its seasons so an XI spans decades — the mode's whole appeal
is a 1990s full-back beside a modern forward.

---

## 6. Testing

⛔ **Real data, real clubs, real pool output.** No synthetic pools: the recurring failure in
this codebase is a fixture that cannot occur.

- **The Chaos control.** The re-expressed Chaos `PoolSpec` must rebuild **the same card ids**
  as today. This is the assertion that proves the recipe is behaviour-preserving, and it is
  the reason Chaos is re-expressed at all.
- **Legacy pool, asserted by NAME.** Manchester United's pool contains a card from a 1990s
  season *and* one from a 2020s season, and contains **only** Man Utd cards. "Returns 30
  things" stays green through a total change in output.
- **Ten clubs, each non-empty**, and each spanning at least two eras — so a club whose data
  thins out (Man City's four retro seasons) fails loudly rather than silently shipping a
  one-era pool.
- **Route:** `generateStaticParams` returns exactly the live packs; an unknown mode 404s;
  both locales render.
- **Layering:** a test asserts `domain/rule-packs.ts` imports nothing from `adapter/`. The
  seam's whole value is that boundary, so it gets a guard rather than a convention.
- ⚠️ **Verify the 404 by making it fail** — remove the `notFound()` and exactly one test must
  go red. A guard nobody has seen fail is decorative.
- `pnpm type-check` and `CI=true pnpm lint` are separate required gates; vitest does not
  type-check.

---

## 7. The follow-on PRs, and the data gaps waiting in them

Recorded now because each one changes what its PR can promise:

| PR | Mode | Data reality |
| --- | --- | --- |
| 2 | Captain's Draft | ⚠️ `captains.json` covers **20 seasons**, teamId → playerId, and thinly — 1997 holds **two** entries. A curated captain list is likely needed |
| 3 | Budget Cap | ⚠️ `market-values.json` covers **2003–2025 only**; all eleven 1990s seasons are unpriced. Needs a rating-derived fallback or an era restriction, and a decision on which |
| 4 | Chemistry Draft | ⚠️ The ticket's own note: the single stored nationality undercounts links |
| 5 | Classic | Data complete, but its interesting form is the season one — it may be thin until TASK-1811 |

---

## 8. Out of scope

- **No season format.** Legacy's "season-by-season" and Classic's "vs 19 real opponents" are
  TASK-1811.
- **No Survival.** The registry assigns it to TASK-1811 as an objective; the stale ticket text
  gets fixed instead of built to.
- **No constraint machinery** beyond the type — see §3.
- **No new modes on the gate beyond `legacy`.** The other four tiles stay `planned` until
  their own PR.

---

## 9. Ticket status

TASK-1810 stays **📋 Backlog** until PR 5. Each PR appends a progress line naming the mode it
made live, in the style TASK-1807 used for its A/B1/B2/C sub-parts. ⛔ Do not mark the ticket
Done when only Legacy ships — the same discipline TASK-1812 used when two of its three thirds
landed.
