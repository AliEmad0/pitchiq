# TASK-1842 — Nationality Draft: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Spec:
> [`2026-08-27-task-1842-nationality-draft-design.md`](../specs/2026-08-27-task-1842-nationality-draft-design.md)
> — read it first; every number below is measured there.

**Goal:** `/game/nation` — pick a country, draft its players position by position, with each
hand widening nation → continent → world only when the narrower ring is exhausted.

**Architecture:** A rule pack over the shipped chooser-aware routes (the TASK-1810 seam). New
domain: a continent map + `ringOf`; a `rings` option on `roomDeals` that partitions each
slot's candidates at deal time. New adapter: `nationChoices()` (menu-only) + a `nationRings`
branch in `buildPool` (per-role cap 30, floor 20, one card per player, off the memoised
universe). UI: `ModeChooser` kind `nation`, a ring line + ring chips on `PitchDraft`'s round.

**Tech stack:** the existing one — no new dependencies. Flags via `flag-icons` (`<Flag>`),
names via `Intl.DisplayNames`.

---

### Task 1: `domain/continents.ts` — the map, `continentOf`, `ringOf`

- Create `src/features/game/domain/continents.ts`: `type Continent = "eu"|"af"|"as"|"na"|"sa"|"oc"`;
  `CONTINENTS: Record<string, Continent>` over the 128 measured codes (`gb-*` → `eu`, `xk` → `eu`,
  `sr` → `sa`, `tr`/`ru`/`ge`/`am`/`il`/`cy` → `eu` geographic-UEFA, `au` → `oc`);
  `continentOf(code: string | null): Continent | null`;
  `ringOf(card: { nationalityCode?: string | null }, nation: string): "nation"|"continent"|"world"`
  (unknown/absent code ⇒ `world` — honest, not nation).
- Test `tests/unit/game-continents.test.ts`: home nations are `eu`; `eg` ≠ `sn` nation-wise but
  both `af`; unknown code ⇒ null/world; **rot guard** — walk every `players-*.json` (the
  data-driven test idiom, e.g. `game-captaincy-data.test.ts`) and assert every non-null
  `nationalityCode` resolves. TDD: tests first, watch them fail, implement, green, commit.

### Task 2: `PoolCard.nationalityCode` + the `rings` deal option

- Modify `domain/chaos-draft.ts` `PoolCard`: add optional `nationalityCode?: string | null`
  (the `price` precedent — a field every real card already carries via `CardBio`).
- Modify `domain/draft-room.ts` `DealOptions`: add `rings?: { nation: string }`. In the slot
  loop, after the eligibility filter: partition the bag by `ringOf`; replace the bag with the
  lowest non-empty ring **before** any draw, so the rng stream shape per hand is unchanged.
  Guard: option absent ⇒ code path identical to today.
- Test in `tests/unit/game-draft-room.test.ts` (same file as the other deal options):
  1. hand is single-ring;
  2. **the per-slot widening fixture**: a nation with ONE CB and a shape with two CB slots —
     first hand holds him alone, second hand is continent;
  3. altRoles theft: the lone CB is also the only RB and gets dealt to the RB slot first
     (slot order) — the CB hands both widen;
  4. **inertness control**: same pool, same seed, options without `rings` ⇒ deals byte-equal
     to a pre-change snapshot (assert against a deal computed with the option undefined).

### Task 3: the pack + the registry

- Modify `domain/rule-packs.ts`: `PoolSpec` union +
  `{ kind: "nationRings"; perRoleCap: number; roleFloor: number; minPlayers: number }`;
  `ChooserSpec.kind` + `"nation"`; `NATION_PACK` exactly as the spec §1; append to
  `RULE_PACKS`.
- Modify `domain/modes.ts`: `ModeId` + `"nation"`; registry entry (group `draftPacks`, emoji
  🌍, `modeNationName`/`modeNationDesc`, href `/game/nation`, formats
  `{ single: "live", season: "planned" }`, accent `#60a5fa` — check uniqueness against the
  other eleven first —, ticket TASK-1842). Modify `components/ModeMark.tsx`: a `nation` 8×8
  grid (a flag on a pole).
- Catalog keys (both locales, parity test enforces): mode pair, chooser title/hint, back
  link, ring line, ring chips, six continent names.
- Run `game-modes.test.ts`, `game-rule-packs.test.ts`, `game-mode-tile`, `game-hub` e2e — the
  suites that assert on mode status — AFTER the flip (the Captain's Draft lesson).

### Task 4: adapter — `nationChoices()` + `buildPool` `nationRings`

- Modify `adapter/pool.ts`:
  - `nationChoices(): Promise<{ code: string; name: string | null; players: number }[]>` —
    reads `players-*.json` metadata only (the `clubChoices` rule), counts distinct players
    per code, filters `>= minPlayers` (read the threshold off `NATION_PACK.pool`), sorts by
    count desc.
  - `buildPool` branch for `nationRings`, `only` widened to `number | string` (the nation
    code): spec §3's three steps off `universe()`; the card's `nationalityCode` must survive
    onto the pool card.
- Test `tests/unit/nation-pool.test.ts` (the `budget-pool.test.ts` idiom — real data):
  Egypt pool holds all 14 Egyptians + Africa fills to the floor at every thin role; England
  pool ≤ its cap union and every role ≥ floor; one card per distinct player;
  **the no-empty-hand control** — every routed nation × the 3-CB shape × the 3-CM shape ×
  3 seeds, `roomDeals` with rings on, assert every hand length ≥ 1.

### Task 5: routes + chooser

- Modify `[mode]/page.tsx` + `[mode]/[club]/page.tsx`: three-way on `chooser.kind`
  (`generateStaticParams` unions nation codes; metadata titles the nation's localized name;
  the draft page passes `nation={code}` and NO `clubId`/`captain`).
- Modify `components/ModeChooser.tsx`: `kind: "nation"` grid — grouped by continent,
  `<Flag>` + localized name + count.
- Modify `utils/country.ts`: `countryNameFromCode(code, locale = "en")` — per-locale
  `Intl.DisplayNames` cache; `xk` added beside the home nations with an Arabic pair each.
- Test: `tests/unit/country.test.ts` extension (Arabic name for `eg`, home nation in Arabic);
  chooser render test with a nation fixture.

### Task 6: `GamePlay` → `PitchDraft` — thread `nation`, show the ring

- Modify `GamePlay.tsx`: accept + forward `nation?: string` (the `budget` precedent).
- Modify `PitchDraft.tsx`: pass `rings: nation ? { nation } : undefined` into `roomDeals`;
  on a round veil whose hand's ring ≠ nation, swap the hint line for the ring line; render a
  ring chip (the `pd-current-mark` idiom, pointer-events none) on non-nation cards.
  CSS: `.pd-ring-chip` in `globals.css` under the pd- block.
- Test `tests/unit/nation-draft.test.tsx`: fixture draft read OFF `NATION_PACK.draft` (the
  #201 lesson, stated in a comment); a thin-nation pool ⇒ the widened slot's veil shows the
  ring line + chips and the nation slot's veil shows neither; no `budget` meter appears.

### Task 7: e2e + warm routes

- Modify `tests/e2e/game-hub.spec.ts` expectations if they count modes; add
  `tests/e2e/game-nation.spec.ts`: gate → nation tile → format → chooser → `/game/nation/eg`
  → lock a shape → open a position → a hand renders (helper `test` import, never
  `@playwright/test`).
- Add `/game/nation` + `/game/nation/eg` to `scripts/warm-e2e-routes.sh`.

### Task 8: verification + docs + ship

- Full unit suite; `tsc`; lint. Real browser: Egypt (empty roles → Africa line + chips),
  France (all-nation, no line), `/ar` (Arabic names + line, count codepoints), gate shows the
  twelfth tile lit.
- Docs WITH the ship (the standing rule): TASKS.md TASK-1842 flip with measurements; the two
  board tables; CLAUDE.md game-section bullet for the per-slot ring rule; spec + this plan
  committed.
- Branch `feat/task-1842-nationality-draft` → PR → CI green by job name → squash-merge →
  production verify via `/api/health` commit + a real-browser draft on production.
