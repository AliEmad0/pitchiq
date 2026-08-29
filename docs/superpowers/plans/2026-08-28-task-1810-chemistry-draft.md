# Chemistry Draft — implementation plan

> **STATUS 2026-08-28 — Tasks 1–10 are DONE and committed** on
> `feat/task-1810-chemistry-draft` (7 commits, unpushed). 115 tests green across the
> chemistry battery and every suite sharing its paths; `tsc` and lint clean.
>
> **Remaining: Task 11 (e2e + warm routes) and Task 12 (docs + ship).**
>
> ⛔ Two things the build changed about this plan, both because measuring disproved a premise:
>
> - **Task 9's exchange rate was wrong** — the effect needed is SMALL, not ~7 rating points.
>   Spec §5 now carries the ~3,000-match sweep and `CHEM_EFFECT = 0.08`.
> - **`CHEM_ANCHOR = 40`** was measured (spec §1.1), and the tier-ratio test became an
>   ORDERING assertion because a fixed fraction re-breaks on every refit.
>
> ⚠️ Task 12 must still verify Budget Cap's swap rule holds here (`lockPicks: false`) and
> re-run the mode-status suites AFTER any registry change.

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Spec:
> [`2026-08-28-task-1810-chemistry-draft-design.md`](../specs/2026-08-28-task-1810-chemistry-draft-design.md)
> — read §0 first; every constant below traces to a measurement there.

**Goal:** `/game/chemistry` — draft an XI where who stands next to whom matters, see the links
on the pitch, and have a well-linked side genuinely play better.

**Architecture:** Three pure domain modules (`pitch-adjacency`, `chemistry`,
`chemistry-modifier`), a `crossEra` pool recipe, a connector layer + meter on the shipped
`PitchDraft`, and a bespoke `/game/chemistry` route. Nothing new in the engine — chemistry
enters through the existing `MatchSetup.modifiers` seam.

**Tech stack:** the existing one. No new dependencies.

**Order matters:** domain first (Tasks 1–3) because everything else consumes it, the pool
before the route, and calibration (Task 9) **after** the mode is playable, since it measures
the real thing.

---

### Task 1: `domain/pitch-adjacency.ts` — the graph

**Files:** create `src/features/game/domain/pitch-adjacency.ts`, `tests/unit/pitch-adjacency.test.ts`

- [ ] **Step 1 — the failing tests.** Cover, over `FORMATIONS` (all 20):
  - symmetry, irreflexivity, no duplicate pair;
  - no pair with `|row difference| >= 2` (a keeper never links a striker);
  - every shape lands in the measured **14–25** band (§0.4) — `expect(n).toBeGreaterThanOrEqual(14)`;
  - a **golden** for 4-4-2 Flat: the exact 23 role-pairs listed in §0.4, resolved by
    `formationByName`, never by index;
  - the GK links to centre-backs only — for 4-4-2 Flat, both GK pairs have role `CB`.
- [ ] **Step 2 — run, watch it fail** (`vitest run tests/unit/pitch-adjacency.test.ts`) with
      "Failed to resolve import".
- [ ] **Step 3 — implement.** `ADJACENCY_BAND = 0.26` as an exported const carrying the §0.4
      sweep in its doc comment; `xOf(formation, index)`; `adjacentPairs(formation): Array<[number, number]>`
      memoised per formation object (it is called on every render).
- [ ] **Step 4 — green.**
- [ ] **Step 5 — commit** `feat(game): pitch adjacency graph for chemistry links`.

### Task 2: `domain/chemistry.ts` — tiers and score

**Files:** create `src/features/game/domain/chemistry.ts`, `tests/unit/chemistry.test.ts`

- [ ] **Step 1 — failing tests.**
  - `linkTier(a, b)` returns `"none" | "nation" | "club" | "teammates"`, **exclusive**: a pair
    who are both countrymen and teammates returns `"teammates"` (strength 3, never 6);
  - a missing/null `nationalityCode` on either side is never a nation link (the
    absent-is-not-a-match rule `ringOf` already follows);
  - `chemistry(cards, formation)` is 0 for an empty XI and 100 for an all-teammates XI;
  - **an empty slot contributes 0 but still counts in the denominator** — filling one slot
    raises the score, and the score never jumps when a slot is emptied;
  - **order independence**: shuffling the assembly order of the same placement scores the same;
  - `breakdown()` returns per-tier counts summing to the adjacent-pair count.
- [ ] **Step 2 — run, watch it fail.**
- [ ] **Step 3 — implement**, pure, `(cards: (PoolCard|null)[], formation) => number` plus
      `chemistryBreakdown()`. Keep the normalisation formula from §1.1 (the display anchor
      arrives in Task 9 — leave a `TODO(Task 9)`-free named constant `CHEM_ANCHOR = 1` here so
      the curve has a single place to land).
- [ ] **Step 4 — green.** **Step 5 — commit.**

### Task 3: the discrimination control (the test that matters most)

**Files:** `tests/unit/chemistry-depth.test.ts`

- [ ] **Step 1 — failing test.** Over the **real** pool (`buildPool({kind:"crossEra",cap:600})`,
      available after Task 4 — so land this task's file but skip it until then, or reorder
      locally): deal 40 rooms; a chem-greedy XI must score **more than twice** a random one.
      A property, never a golden — the pool moves with the data (§7).
- [ ] **Step 2–4** as usual. This is the test that fails if the model ever collapses into the
      flat constant TASK-1824 warned about.
- [ ] **Step 5 — commit.**

### Task 4: the `crossEra` pool

**Files:** modify `src/features/game/domain/rule-packs.ts` (PoolSpec union),
`src/features/game/adapter/pool.ts`; create `tests/unit/chemistry-pool.test.ts`

- [ ] **Step 1 — failing tests** against real data: exactly 600 cards, 600 **distinct**
      players, rating-descending, spans pre-2004 seasons (the 1990s must be present — §1's
      reason the priced pool is unusable), every card carries `club` and `season`.
- [ ] **Step 2 — run, fail.**
- [ ] **Step 3 — implement** the `crossEra` branch off the memoised `universe()` (the 18× rule),
      one card per player at best rating, sorted `rating desc, cardId asc` — the tie-break is
      load-bearing (§2).
- [ ] **Step 4 — green.** **Step 5 — commit.**

### Task 5: the pack + registry

**Files:** modify `rule-packs.ts` (`CHEMISTRY_PACK`, `Constraint` + `{kind:"chemistry"}`,
`RULE_PACKS`), `domain/modes.ts` (flip `chemistry.formats.single` to `"live"`, href
`/game/chemistry`)

- [ ] **Step 1 — failing test** in `tests/unit/game-rule-packs.test.ts`: the pack exists, is in
      `RULE_PACKS`, and — ⛔ **is NOT returned by `routedPacks()`** (it has no chooser; the
      Vercel-build lesson).
- [ ] **Steps 2–4.** Then **re-run every mode-status suite AFTER the flip**, not before — the
      Captain's Draft lesson: `game-modes`, `game-mode-tile`, `game-hub` e2e.
- [ ] **Step 5 — commit.**

### Task 6: the route + i18n

**Files:** create `src/app/[locale]/game/chemistry/page.tsx` (model it on
`game/budget/page.tsx`: `force-static`, `revalidate = false`); modify both message catalogs.

- [ ] Keys (en + ar, parity test enforces): `chemistryTitle`, `chemistrySubtitle`,
      `chemScore`, `chemBreakdown`, `chemTeammates`, `chemClubLegends`, `chemCountrymen`,
      `chemNoLink`, `chemDelta`, and the connector `<title>` strings.
- [ ] **Step: verify** `/game/chemistry` renders and the gate links to it. **Commit.**

### Task 7: the connectors + meter on `PitchDraft`

**Files:** modify `src/features/game/components/PitchDraft.tsx`,
`src/app/globals.css`; create `tests/unit/chemistry-draft.test.tsx`

- [ ] **Step 1 — failing tests.** Fixture reads `CHEMISTRY_PACK.draft` (never restated — #201).
  - a connector renders per adjacent pair, `data-testid="chem-link"`, carrying
    `data-tier="none|nation|club|teammates"`;
  - a teammate pair renders `data-tier="teammates"`; an unlinked pair `"none"`;
  - the SVG layer is `pointer-events: none` and every pitch spot is still clickable (the
    ::after-eats-clicks control, asserted by clicking a spot and getting a veil);
  - the meter shows the score and the per-tier breakdown;
  - ⛔ **the inertness control**: with no chemistry prop, `PitchDraft` renders **no**
    connectors and no meter — Legacy/Captain's/Budget/Nation are untouched.
- [ ] **Step 3 — implement.** SVG layer under the spots inside `.pd-pitch`; `.chem-link-*`
      classes in the `pd-` block; the glow pulse added to the existing reduced-motion gate
      (colour survives the gate — it is the information).
- [ ] **Step 4 — green.** **Step 5 — commit.**

### Task 8: the per-card delta in the round

**Files:** modify `PitchDraft.tsx`; extend `tests/unit/chemistry-draft.test.tsx`

- [ ] **Step 1 — failing tests**: each candidate shows `data-testid="chem-delta"` with the
      chemistry it would add for **this** slot; a card with a teammate link shows a strictly
      larger delta than an unlinked one; no delta renders for packs without chemistry.
- [ ] **Steps 2–5.** This is what makes §0.3's trade-off visible — without it the mode is
      "pick the highest number".

### Task 9: calibration — the display anchor AND the engine exchange rate

**Files:** create `src/features/game/domain/chemistry-modifier.ts`,
`tests/unit/chemistry-modifier.test.ts`; a throwaway measurement suite (deleted after, its
numbers recorded in the spec).

- [ ] **Step 1 — measure the display anchor.** Over 200 dealt rooms, record the raw score
      distribution for random / greedy / best-of-hands XIs. Set `CHEM_ANCHOR` so a
      _greedy_ coach lands around 75–85, not 27. Record the measured numbers in spec §1.1.
- [ ] **Step 2 — measure the engine exchange rate.** Simulate a chem-greedy XI against a
      rating-greedy XI over ≥ 300 seeded matches with the modifier scaled at several
      constants. ⛔ **Target: the two win roughly equally often** — that is §0.3's
      "≈ 7 rating points per player at chemistry 100" expressed as the outcome it must produce.
      Pick the constant that achieves it; record the win-rate table in the spec.
- [ ] **Step 3 — implement** `chemistryModifier(chemistry)` as a pure `Modifier`.
- [ ] **Step 4 — pin it**: a unit test that chemistry 0 returns a no-op and 100 returns the
      calibrated magnitude, plus the win-rate property at a tolerance the harness measured.
- [ ] **Step 5 — commit**, with the numbers in the message.

### Task 10: wire the modifier through EVERY rebuild path

**Files:** modify `GamePlay.tsx`, `view/match-session.ts`, and both replay paths.

- [ ] **Step 1 — failing test** (`tests/unit/chemistry-replay.test.ts`): a match played with
      chemistry replays **byte-identically** from its share code and from its saved record.
      ⛔ This is the defect class that shipped twice already (the `opponent` policy, Budget
      Cap's `budget`) — a replay missing it drafts a different match and reads as a corrupt
      save. Chemistry is derived from the XI, which every path already carries, so **no codec
      change and no version bump**; assert that too.
- [ ] **Steps 2–5.**

### Task 11: e2e + warm routes

**Files:** create `tests/e2e/game-chemistry.spec.ts`; modify `scripts/warm-e2e-routes.sh`

- [ ] Gate → tile → format → `/game/chemistry`; lock a shape; connectors render; picking a
      linked card raises the meter. Helper `test` import, never `@playwright/test`.
- [ ] Add `/game/chemistry` to the warm script (CI compiles on demand — the standing rule).
- [ ] **Commit.**

### Task 12: verify, document, ship

- [ ] Full targeted battery + `tsc` + `CI=true pnpm lint`. (Full local vitest is unreliable on
      this box — CI is the authority.)
- [ ] **Real browser**: draft an XI, watch a green connector appear on a teammate pick, confirm
      the meter and deltas move, play the match through to full time; `/ar` for the meter and
      connector titles (count Arabic codepoints — grep proves nothing, the catalog is
      serialised into every page).
- [ ] ⛔ **Verify Budget Cap's swap rule holds here** (`lockPicks: false`): re-open a filled
      slot, confirm there is a way out and the pick can be dropped. Inherited, not assumed.
- [ ] Docs **with** the ship: TASKS.md (TASK-1810 → Done, both board tables; TASK-1824 noted as
      partially absorbed), CLAUDE.md game-section rule for the exclusive-tier + adjacency
      design, spec + this plan.
- [ ] Branch → PR → CI green **by job name** → squash-merge → production-verify via
      `/api/health` commit and a real draft.
