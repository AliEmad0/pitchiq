# Season hub — implementation plan (TASK-1811 PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or
> superpowers:subagent-driven-development) to implement this plan task-by-task.

**Goal:** Make the season **playable**: pick Full Season on the gate, draft your XI once, then
run a 38-week league from a hub — the design the owner chose across three gallery rounds.

**Architecture:** No new route. `/game/legacy/[club]?format=season` reuses the page that is
already prerendered; the client reads the param after hydration and hands the confirmed squad to
a `SeasonHub` instead of a single match. The league's 19 opponents come from the
already-prerendered `/api/game/rivals/[club]` routes, fetched once when the run is created.

**The settled design (three gallery rounds, do not re-open):**

- **Frame:** concept 29 "Cockpit" — `grid-template-areas:"hd ctl" "tbl side"`, columns
  `1.5fr 1fr`, radius 18px, `--accent:#25e0d0`.
- **Crests:** header carries **both** a watermark (absolute, `opacity:.13`, `z-index:0`) **and**
  an inline 44px crest; 21px crests in the table; opponent crest on the next fixture.
- **Animation on advancing a week:** 13 fixture slides + 5 your row glows + 9 FLIP + 18 header
  nudge + 26 sweep. ⛔ They compose only because each animates a **different property on a
  different element**; the sole element carrying two is `tr.me` (transform + box-shadow).

⛔ **IN SCOPE: auto-sim only.** "Auto-sim is the default; playing is the opt-in" — the default
path ships here. **Launching a real match from a fixture is PR 3**, because it means driving
`GamePlay`'s whole phase machine from inside a run and taking a result back, which is a separate
integration and would double this PR.

---

### Task 1: `?format=season` reaches the page

**Files:** modify `src/features/game/domain/modes.ts`,
`src/features/game/components/FormatChoice.tsx`; modify `tests/unit/game-modes.test.ts`

- [ ] **Step 1 — failing tests.**

```ts
it("⛔ Legacy's season format is LIVE and routes with ?format=season", () => {
  const legacy = GAME_MODES.find((m) => m.id === "legacy")!;
  expect(legacy.formats.season).toBe("live");
  expect(formatHref(legacy, "season")).toBe("/game/legacy?format=season");
  expect(formatHref(legacy, "single")).toBe("/game/legacy");
});

it("⚠️ a mode with no season is unchanged — no param is ever appended", () => {
  const chem = GAME_MODES.find((m) => m.id === "chemistry")!;
  expect(formatHref(chem, "single")).toBe("/game/chemistry");
});
```

- [ ] **Step 2 — run, watch it fail** (`formatHref` is not exported).
- [ ] **Step 3 — implement.** In `modes.ts`:

```ts
/**
 * Where a FORMAT lands.
 *
 * ⚠️ D11 deferred a `?format=` param "because nothing would read it". TASK-1811 is the thing
 * that reads it: the season and the single match now start from the same prerendered page and
 * branch on the client, which keeps the route `force-static` and adds no build cost.
 */
export function formatHref(mode: GameMode, format: GameFormat): string | null {
  if (mode.href == null) return null;
  return format === "season" ? `${mode.href}?format=season` : mode.href;
}
```

and flip Legacy to `formats: { single: "live", season: "live" }`.

- [ ] **Step 4 — use it** in `FormatChoice.tsx`: `href={formatHref(mode, format)!}`.
- [ ] **Step 5 — green, then re-run every mode-status suite AFTER the flip** (the Captain's
      Draft lesson):

```bash
./node_modules/.bin/vitest run tests/unit/game-modes.test.ts tests/unit/game-mode-tile.test.tsx tests/unit/game-rule-packs.test.ts
```

- [ ] **Step 6 — commit.**

---

### Task 2: the league — 20 clubs from the prerendered rival routes

**Files:** create `src/features/game/view/season-league.ts`,
`tests/unit/season-league-build.test.ts`

- [ ] **Step 1 — failing tests.**

```ts
import { describe, expect, it } from "vitest";
import { pickOpponents } from "@/features/game/view/season-league";

const CLUBS = Array.from({ length: 51 }, (_, i) => i + 1);

describe("pickOpponents", () => {
  it("returns exactly clubs-1 opponents and never the coach's own club", () => {
    const out = pickOpponents(CLUBS, 40, 20, 4242);
    expect(out).toHaveLength(19);
    expect(out).not.toContain(40);
    expect(new Set(out).size).toBe(19);
  });

  it("⛔ is DETERMINISTIC — the same seed gives the same league", () => {
    expect(pickOpponents(CLUBS, 40, 20, 4242)).toEqual(pickOpponents(CLUBS, 40, 20, 4242));
  });

  it("a different seed gives a different league", () => {
    expect(pickOpponents(CLUBS, 40, 20, 1)).not.toEqual(pickOpponents(CLUBS, 40, 20, 2));
  });

  it("⚠️ degrades rather than throwing when the pool is too small", () => {
    expect(pickOpponents([1, 2, 3], 1, 20, 7)).toEqual([2, 3]);
  });
});
```

- [ ] **Step 2 — fail. Step 3 — implement** with the shipped `mulberry32`, drawing without
      replacement from the clubs minus the coach's own.
- [ ] **Step 4 — green. Step 5 — commit.**

---

### Task 3: assembling the league's XIs

**Files:** modify `src/features/game/view/season-league.ts`; extend
`tests/unit/season-league-build.test.ts`

- [ ] **Step 1 — failing test** for a pure function that turns fetched rival pools into
      `GameTeam`s, so the fetch itself stays at the edge and this stays testable:

```ts
it("builds one XI per club, deterministically, from its rival pool", () => {
  const pools = { 40: liverpoolCards, 42: arsenalCards };
  const teams = buildLeagueTeams([40, 42], pools, 4242);
  expect(teams).toHaveLength(2);
  expect(teams[0]!.players).toHaveLength(11);
  expect(buildLeagueTeams([40, 42], pools, 4242)).toEqual(teams);
});
```

- [ ] **Step 2 — fail. Step 3 — implement** `buildLeagueTeams(ids, pools, seed)` over
      `chaosDraft(pool, seed + id, name, { policy: "best" })` — the same policy Legacy already
      declares for its opponent, so the league plays the side Legacy would have fielded.
- [ ] **Step 4 — green. Step 5 — commit.**

---

### Task 4: `SeasonHub` — the chosen surface

**Files:** create `src/features/game/components/SeasonHub.tsx`; modify `src/app/globals.css`;
create `tests/unit/season-hub.test.tsx`

- [ ] **Step 1 — failing tests.**

```tsx
it("renders the table, the next fixture, form and the squad", () => {
  render(<SeasonHub {...props} />);
  expect(screen.getAllByTestId("season-row")).toHaveLength(20);
  expect(screen.getByTestId("season-next")).toBeInTheDocument();
  expect(screen.getByTestId("season-week")).toHaveTextContent(/12 of 38/);
});

it("⛔ the header carries BOTH crests — the owner's hybrid", () => {
  render(<SeasonHub {...props} />);
  expect(screen.getByTestId("season-watermark")).toBeInTheDocument();
  expect(screen.getByTestId("season-crest")).toBeInTheDocument();
});

it("⭐ simming a week advances it and re-orders the table", async () => {
  render(<SeasonHub {...props} />);
  const before = screen.getAllByTestId("season-row").map((r) => r.dataset.club);
  await userEvent.click(screen.getByRole("button", { name: /sim week/i }));
  expect(screen.getByTestId("season-week")).toHaveTextContent(/13 of 38/);
  expect(screen.getAllByTestId("season-row").map((r) => r.dataset.club)).not.toEqual(before);
});

it("⚠️ every row carries data-was, which is what makes the FLIP travel the real distance", async () => {
  render(<SeasonHub {...props} />);
  await userEvent.click(screen.getByRole("button", { name: /sim week/i }));
  for (const row of screen.getAllByTestId("season-row")) {
    expect(row.dataset.was).toMatch(/^\d+$/);
  }
});
```

- [ ] **Step 2 — fail. Step 3 — implement.** CSS goes in the `sh-` block in `globals.css`:
      the Cockpit grid, both header crests (⛔ `z-index:1` on the row and the text, or the
      inline crest renders UNDER the watermark), 21px table crests, and the five composed
      animations. ⛔ `transform` / `opacity` / `box-shadow` only, and the progress bar uses
      `scaleX`, never `width`.
- [ ] **Step 4 — green, and run `motion-audit`** — the global guard a targeted battery misses:

```bash
./node_modules/.bin/vitest run tests/unit/season-hub.test.tsx tests/unit/motion-audit.test.ts
```

- [ ] **Step 5 — commit.**

---

### Task 5: wire it into the page

**Files:** modify `src/features/game/components/GamePlay.tsx`; modify
`src/app/[locale]/game/[mode]/[club]/page.tsx`; create `tests/unit/season-entry.test.tsx`

- [ ] **Step 1 — failing tests.**

```tsx
it("⛔ THE INERTNESS CONTROL — without ?format=season nothing changes", () => {
  render(<GamePlay {...props} />); // no season prop
  expect(screen.queryByTestId("season-hub")).toBeNull();
});

it("hands the confirmed squad to the hub when the season format is asked for", async () => {
  render(<GamePlay {...props} season={{ clubs: 20, league: "clubs" }} seasonRequested />);
  // ...draft, confirm...
  expect(await screen.findByTestId("season-hub")).toBeInTheDocument();
});
```

- [ ] **Step 2 — fail. Step 3 — implement.** `GamePlay` takes `season?: SeasonSpec` and
      `seasonRequested?: boolean`; when both are set, confirming the squad creates the run and
      renders `SeasonHub` instead of entering the match phases. The page passes
      `season={pack.season}` and reads the param in a client boundary.
      ⚠️ **`useSearchParams` must sit inside a `<Suspense>`** or it opts the whole prerendered
      page out of static generation — which is the one thing `force-static` exists to prevent.
- [ ] **Step 4 — green.** **Step 5 — commit.**

---

### Task 6: persistence — a run survives a reload

**Files:** modify `src/features/game/components/SeasonHub.tsx`; create
`tests/unit/season-resume.test.tsx`

- [ ] **Step 1 — failing tests**: after simming, `saveRun` holds the run; mounting with a saved
      run resumes at the right week; "Abandon season" clears it.
      ⚠️ Storage is touched **only after mount** — the page is `force-static` and the prerender
      has no IndexedDB.
- [ ] **Step 2–5** as usual.

---

### Task 7: verify, document, ship

- [ ] **Step 1 — the battery, plus the global guards**:

```bash
./node_modules/.bin/vitest run tests/unit/season-hub.test.tsx tests/unit/season-entry.test.tsx tests/unit/season-resume.test.tsx tests/unit/season-league-build.test.ts tests/unit/season-fixtures.test.ts tests/unit/season-table.test.ts tests/unit/season-run.test.ts tests/unit/season-slot.test.ts tests/unit/season-league.test.ts tests/unit/game-modes.test.ts tests/unit/game-mode-tile.test.tsx tests/unit/game-rule-packs.test.ts tests/unit/motion-audit.test.ts tests/unit/route-revalidate.test.ts tests/unit/game-routes-static.test.ts
./node_modules/.bin/tsc --noEmit
CI=true ./node_modules/.bin/next lint --max-warnings=0
```

- [ ] **Step 2 — e2e** `tests/e2e/game-season.spec.ts`: gate → Full Season → club → draft →
      hub renders → sim a week → the week advances. Helper `test` import, never
      `@playwright/test`. Add the route to `scripts/warm-e2e-routes.sh`.
- [ ] **Step 3 — REAL BROWSER**: start a season, sim to the end, confirm the table is sane at
      week 38 and the animations play. ⚠️ A hidden pane freezes animation timelines at
      `currentTime: 0` — resize the pane before judging motion.
- [ ] **Step 4 — docs**: TASKS.md (TASK-1811 → the mode is playable; flip to ✅ Done only if
      nothing in the ticket's scope is outstanding — the ghost, Survival and era rules are
      separate, so record them as follow-ups), CLAUDE.md rule for the `?format=` seam.
- [ ] **Step 5 — branch → PR → CI green by job name → squash-merge.**
