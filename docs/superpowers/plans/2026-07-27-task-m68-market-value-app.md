# TASK-M68 Market value — app half, part 1: schema + loaders + the profile block

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the two committed market-value side-maps through validated, memoized loaders and render the career market-value block on `/players/[id]` exactly as specified in `docs/superpowers/specs/2026-07-27-market-value-design.md`.

**Architecture:** Two Zod file schemas + two loaders on the existing memoized `readJsonOrNull` path. All strip maths lives in one pure module (`src/features/players/market-value.ts`) so it is unit-testable without React or the filesystem. The UI is an async Server Component (`PlayerMarketValue`) that loads + computes and renders the section chrome, plus one client island (`MarketValueStrip`) that owns hover state and the count-up. The block is **career-scoped and season-invariant**, so it is rendered _outside_ `<PlayerSeasonView>`'s swappable subtree via a new `careerBlock` prop — which is also what keeps the 5 MB history file off every request-time path.

**Tech Stack:** Next.js 15 App Router (RSC + ISR), Zod, next-intl (en/ar, RTL), Tailwind v4 + CSS Modules, Vitest + Testing Library.

---

## Conventions for every task in this plan

**Every `pnpm`/`node` command must go through WSL** (a Windows shell with a UNC cwd cannot spawn the node toolchain). Throughout this plan, `RUN <cmd>` means:

```bash
wsl -d Ubuntu -- bash -c 'source $HOME/.nvm/nvm.sh && nvm use 22 > /dev/null && cd /home/aliemad/projects/pitchiq && <cmd>'
```

**Branch first.** The repo is on `main` and clean. Before Task 1:

```bash
wsl -d Ubuntu -- bash -c 'cd /home/aliemad/projects/pitchiq && git checkout -b feat/m68-market-value-block'
```

Never push to `main` — this ships as a PR (see the Finishing section).

**Commit messages** go through a file (`git commit -F`), because apostrophes and parens break inline `-m` across the Windows→WSL boundary. End every message with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## File structure

| File                                                                   | Responsibility                                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/data/schemas.ts` (modify)                                         | `MarketValueFileSchema`, `MarketValueHistoryFileSchema` + inferred types                       |
| `src/data/loaders.ts` (modify)                                         | `loadMarketValues()`, `loadMarketValueHistory()` — memoized, server-only                       |
| `src/features/players/market-value.ts` (create)                        | **Pure logic**: bands, formatting, career-strip derivation. No React, no fs, no `server-only`. |
| `src/features/players/components/PlayerMarketValue.tsx` (create)       | Async Server Component: loads history, builds the strip, renders the card + legend, or `null`  |
| `src/features/players/components/MarketValueStrip.tsx` (create)        | `"use client"` island: readout + change chip + meta line + the cells; hover trail + count-up   |
| `src/features/players/components/MarketValueStrip.module.css` (create) | Cell/ramp/hover styles + the three animation beats                                             |
| `src/app/globals.css` (modify)                                         | `--mv-1 … --mv-7` ramp tokens in `:root` and `.dark`                                           |
| `src/features/players/components/PlayerSeasonView.tsx` (modify)        | New optional `careerBlock` prop rendered outside the season-swapped subtree                    |
| `src/app/[locale]/players/[id]/page.tsx` (modify)                      | Pass `<PlayerMarketValue …/>` as `careerBlock`                                                 |
| `src/i18n/messages/{en,ar}.json` (modify)                              | The block's message keys                                                                       |
| `tests/unit/market-value.test.ts` (create)                             | Pure-logic tests                                                                               |
| `tests/unit/market-value-loaders.test.ts` (create)                     | Schema + loader tests                                                                          |
| `tests/unit/player-market-value.test.tsx` (create)                     | Component tests (omission, values in static HTML, PL underline)                                |

---

## Task 1: Schemas for the two data files

**Files:**

- Modify: `src/data/schemas.ts` (append near `PlayerHistoryStatsFileSchema`, ~line 458)
- Test: `tests/unit/market-value-loaders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/market-value-loaders.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MarketValueFileSchema, MarketValueHistoryFileSchema } from "@/data/schemas";

describe("MarketValueFileSchema", () => {
  it("accepts the committed season → id → point shape", () => {
    const parsed = MarketValueFileSchema.parse({
      "2003": { "1004102": { determined: "2004-10-04", valueEur: 2000000 } },
    });
    expect(parsed["2003"]["1004102"].valueEur).toBe(2000000);
  });

  it("rejects a non-numeric value", () => {
    expect(() =>
      MarketValueFileSchema.parse({
        "2003": { "1": { determined: "2004-10-04", valueEur: "2m" } },
      }),
    ).toThrow();
  });
});

describe("MarketValueHistoryFileSchema", () => {
  it("accepts the committed id → points[] shape", () => {
    const parsed = MarketValueHistoryFileSchema.parse({
      "1000000": [{ determined: "2019-09-25", season: 2019, valueEur: 2500000 }],
    });
    expect(parsed["1000000"]).toHaveLength(1);
    expect(parsed["1000000"][0].season).toBe(2019);
  });

  it("rejects a point missing `season`", () => {
    expect(() =>
      MarketValueHistoryFileSchema.parse({
        "1": [{ determined: "2019-09-25", valueEur: 1 }],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

RUN `pnpm test tests/unit/market-value-loaders.test.ts`

Expected: FAIL — `MarketValueFileSchema` is not exported from `@/data/schemas`.

- [ ] **Step 3: Add the schemas**

Append to `src/data/schemas.ts`, immediately after the `PlayerHistoryStatsFileSchema` block (before `PlayerBioFileSchema`):

```ts
// TASK-M68: market-value side-maps, built from Transfermarkt by the external
// pipeline (`sync:data:market-values` + `apply-market-values.ts`). Two files,
// split by access pattern — see docs/superpowers/specs/2026-07-27-market-value-design.md §3.

/**
 * `data/market-values.json` — season → our player id → the LAST valuation of
 * that season. Clipped at apply time to seasons the app actually holds a row
 * for, which keeps it ~624 KB: it is read from request-time paths.
 */
export const MarketValueFileSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({
      valueEur: z.number().int(),
      determined: z.string(),
    }),
  ),
);
export type MarketValueFile = z.infer<typeof MarketValueFileSchema>;

/**
 * `data/market-value-history.json` — our player id → every valuation of their
 * WHOLE career (including non-PL clubs and seasons), oldest first. ~5 MB, so
 * it must only ever be read from the ISR'd `/players/[id]` render.
 */
export const MarketValueHistoryFileSchema = z.record(
  z.string(),
  z.array(
    z.object({
      season: z.number().int(),
      valueEur: z.number().int(),
      determined: z.string(),
    }),
  ),
);
export type MarketValueHistoryFile = z.infer<typeof MarketValueHistoryFileSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

RUN `pnpm test tests/unit/market-value-loaders.test.ts`

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/schemas.ts tests/unit/market-value-loaders.test.ts
git commit -F <msgfile>   # "feat(m68): add market-value file schemas"
```

---

## Task 2: The two loaders

**Files:**

- Modify: `src/data/loaders.ts` (imports at the top; the loader after `loadTeamColors`, ~line 183)
- Test: `tests/unit/market-value-loaders.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/market-value-loaders.test.ts`:

```ts
import { loadMarketValueHistory, loadMarketValues } from "@/data/loaders";

describe("market-value loaders (against the committed data)", () => {
  it("loads and validates data/market-values.json", async () => {
    const file = await loadMarketValues();
    expect(file).not.toBeNull();
    // The clip (spec §3.1) keeps this well under the unclipped 39,699 entries.
    const entries = Object.values(file!).reduce(
      (n, bySeason) => n + Object.keys(bySeason).length,
      0,
    );
    expect(entries).toBeGreaterThan(10_000);
    expect(entries).toBeLessThan(15_000);
  });

  it("loads and validates data/market-value-history.json", async () => {
    const file = await loadMarketValueHistory();
    expect(file).not.toBeNull();
    expect(Object.keys(file!).length).toBeGreaterThan(4_000);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

RUN `pnpm test tests/unit/market-value-loaders.test.ts`

Expected: FAIL — `loadMarketValues` is not exported from `@/data/loaders`.

- [ ] **Step 3: Add the loaders**

In `src/data/loaders.ts`, add to the schema import block:

```ts
  MarketValueFileSchema,
  MarketValueHistoryFileSchema,
  type MarketValueFile,
  type MarketValueHistoryFile,
```

Then insert after `loadTeamColors`:

```ts
/**
 * TASK-M68: last-of-season market values, `season → ourId → { valueEur, determined }`.
 * Clipped to seasons we hold player rows for (~624 KB), so it is safe on the
 * request-time surfaces (`/players`, `/compare`, the season-swap route).
 */
export async function loadMarketValues(): Promise<MarketValueFile | null> {
  return readJsonOrNull("market-values.json", MarketValueFileSchema);
}

/**
 * TASK-M68: the full per-player valuation history (whole career, ~5 MB).
 *
 * ⚠️ ISR-ONLY. Call this from the statically-rendered `/players/[id]` page and
 * nowhere else — parsing 84k objects on a request-time path is exactly the
 * Fluid Active-CPU shape that PR #35 and PR #40 had to fix. Request-time
 * surfaces read `loadMarketValues()` instead.
 */
export async function loadMarketValueHistory(): Promise<MarketValueHistoryFile | null> {
  return readJsonOrNull("market-value-history.json", MarketValueHistoryFileSchema);
}
```

- [ ] **Step 4: Run the test to verify it passes**

RUN `pnpm test tests/unit/market-value-loaders.test.ts`

Expected: PASS — 6 tests. (If the entry-count bounds fail, print the real count and adjust the bounds to bracket it; the point of the assertion is that the file is _clipped_, not the exact figure.)

- [ ] **Step 5: Commit**

```bash
git add src/data/loaders.ts tests/unit/market-value-loaders.test.ts
git commit -F <msgfile>   # "feat(m68): add memoized market-value loaders"
```

---

## Task 3: Pure logic — bands, formatting, strip derivation

**Files:**

- Create: `src/features/players/market-value.ts`
- Test: `tests/unit/market-value.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/market-value.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  bandForValue,
  buildMarketValueStrip,
  formatMarketValue,
} from "@/features/players/market-value";

const UNITS = { k: "k", m: "m" };

describe("bandForValue", () => {
  it("maps the seven fixed absolute bands", () => {
    expect(bandForValue(500_000)).toBe(1); // < €1m
    expect(bandForValue(1_000_000)).toBe(2); // €1–5m
    expect(bandForValue(4_999_999)).toBe(2);
    expect(bandForValue(5_000_000)).toBe(3); // €5–15m
    expect(bandForValue(15_000_000)).toBe(4); // €15–30m
    expect(bandForValue(30_000_000)).toBe(5); // €30–60m
    expect(bandForValue(60_000_000)).toBe(6); // €60–100m
    expect(bandForValue(150_000_000)).toBe(7); // €100m+
  });

  it("does NOT normalise per player — the same value is always the same band", () => {
    expect(bandForValue(500_000)).toBe(bandForValue(500_000));
  });
});

describe("formatMarketValue", () => {
  it("prints a currency symbol on every number", () => {
    expect(formatMarketValue(25_000, UNITS)).toBe("€25k");
    expect(formatMarketValue(1_500_000, UNITS)).toBe("€1.5m");
    expect(formatMarketValue(150_000_000, UNITS)).toBe("€150m");
  });

  it("drops a trailing .0 and switches to whole millions at 10m", () => {
    expect(formatMarketValue(2_000_000, UNITS)).toBe("€2m");
    expect(formatMarketValue(12_400_000, UNITS)).toBe("€12m");
  });

  it("uses the supplied unit labels (i18n)", () => {
    expect(formatMarketValue(1_500_000, { k: "ألف", m: "م" })).toBe("€1.5م");
  });

  it("prints sub-thousand values bare", () => {
    expect(formatMarketValue(750, UNITS)).toBe("€750");
  });
});

describe("buildMarketValueStrip", () => {
  const points = [
    { season: 2016, valueEur: 25_000_000, determined: "2016-10-01" },
    { season: 2017, valueEur: 40_000_000, determined: "2017-10-01" },
    { season: 2017, valueEur: 80_000_000, determined: "2018-01-10" },
    { season: 2017, valueEur: 150_000_000, determined: "2018-05-28" },
  ];

  it("collapses each season to its LAST valuation, with the season's spread", () => {
    const strip = buildMarketValueStrip(points, [2017]);
    expect(strip).toHaveLength(2);
    expect(strip[1]).toMatchObject({
      season: 2017,
      valueEur: 150_000_000,
      determined: "2018-05-28",
      points: 3,
      minEur: 40_000_000,
      maxEur: 150_000_000,
      band: 7,
    });
  });

  it("orders seasons oldest-first regardless of input order", () => {
    const strip = buildMarketValueStrip([...points].reverse(), []);
    expect(strip.map((s) => s.season)).toEqual([2016, 2017]);
  });

  it("flags only the seasons the app holds a player row for", () => {
    const strip = buildMarketValueStrip(points, [2017]);
    expect(strip.map((s) => s.isPl)).toEqual([false, true]);
  });

  it("computes the change against the previous season, null for the first", () => {
    const strip = buildMarketValueStrip(points, []);
    expect(strip[0].changePct).toBeNull();
    expect(strip[1].changePct).toBe(500); // 25m → 150m
  });

  it("drops retirement markers and pre-1990 noise", () => {
    const strip = buildMarketValueStrip(
      [
        { season: 2019, valueEur: 1_000_000, determined: "2019-08-01" },
        { season: 0, valueEur: 0, determined: "2020-10-15" },
        { season: 1980, valueEur: 5_000, determined: "1981-01-01" },
      ],
      [],
    );
    expect(strip.map((s) => s.season)).toEqual([2019]);
  });

  it("returns an empty strip for a player with no points", () => {
    expect(buildMarketValueStrip([], [2020])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

RUN `pnpm test tests/unit/market-value.test.ts`

Expected: FAIL — cannot resolve `@/features/players/market-value`.

- [ ] **Step 3: Write the module**

Create `src/features/players/market-value.ts`:

```ts
/**
 * TASK-M68 — pure market-value maths for the profile block, `/players` and
 * `/compare`. No React, no filesystem, no `server-only`: everything here is
 * unit-testable in isolation and safe to import from a client island.
 *
 * Spec: docs/superpowers/specs/2026-07-27-market-value-design.md §6.
 */

/** One committed valuation from `market-value-history.json`. */
export type MarketValuePoint = {
  season: number;
  valueEur: number;
  determined: string;
};

/** One cell of the career strip — a season collapsed to its last valuation. */
export type MarketValueSeason = {
  season: number;
  /** The season's LAST valuation — what the cell and the readout show. */
  valueEur: number;
  /** ISO date of that last valuation. */
  determined: string;
  /** How many times the player was revalued in the season (≥ 1). */
  points: number;
  minEur: number;
  maxEur: number;
  /** True when the app holds a player-season row — these get the PL underline. */
  isPl: boolean;
  /** 1–7, the fixed absolute colour band. */
  band: number;
  /** Percentage change vs the previous season in the strip; null for the first. */
  changePct: number | null;
};

/**
 * The upper bound (exclusive) of bands 1–6, in euro. Band 7 is everything above.
 * FIXED and ABSOLUTE, deliberately not normalised per player: a per-player ramp
 * made a €500k journeyman's best season render as dark as Salah's €150m peak,
 * so the colour meant something different on every page (spec §6.1).
 */
export const MV_BAND_BOUNDS = [1e6, 5e6, 15e6, 30e6, 60e6, 100e6] as const;

/** The fixed absolute band (1–7) a value falls in. */
export function bandForValue(valueEur: number): number {
  let band = 1;
  for (const bound of MV_BAND_BOUNDS) {
    if (valueEur < bound) return band;
    band++;
  }
  return band;
}

/** Locale-supplied unit suffixes, so the formatter itself stays pure. */
export type MarketValueUnits = { k: string; m: string };

/**
 * `€25k` · `€1.5m` · `€150m`. The currency symbol is printed on every number
 * (owner decision, spec §6). Digits are localised by the caller via
 * `localizeDigits` — this returns Latin digits.
 */
export function formatMarketValue(valueEur: number, units: MarketValueUnits): string {
  if (valueEur >= 1e6) {
    const m = valueEur / 1e6;
    const text = m >= 10 ? String(Math.round(m)) : trimZero(m.toFixed(1));
    return `€${text}${units.m}`;
  }
  if (valueEur >= 1e3) return `€${Math.round(valueEur / 1e3)}${units.k}`;
  return `€${Math.round(valueEur)}`;
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/**
 * Collapse a player's whole-career points into one cell per season.
 *
 * `plSeasons` is the player's own season list from `findPlayerSeasons` — the
 * seasons the app holds a row for. Everything else (Salah at Basel, Henry at
 * Monaco) still renders; it just doesn't get the Premier League underline.
 */
export function buildMarketValueStrip(
  points: readonly MarketValuePoint[],
  plSeasons: readonly number[],
): MarketValueSeason[] {
  const pl = new Set(plSeasons);
  const bySeason = new Map<number, MarketValuePoint[]>();

  for (const point of points) {
    // `seasonId: 0` + `value: 0` is Transfermarkt's RETIREMENT marker, not a
    // valuation — it would draw a bogus €0 cell at the end of a retired
    // player's career (spec §2). The builder already filters these, so this is
    // belt-and-braces against a future re-crawl.
    if (point.season < 1990 || point.valueEur <= 0) continue;
    const list = bySeason.get(point.season);
    if (list) list.push(point);
    else bySeason.set(point.season, [point]);
  }

  const seasons = [...bySeason.keys()].sort((a, b) => a - b);
  const strip: MarketValueSeason[] = [];

  for (const season of seasons) {
    const list = bySeason
      .get(season)!
      .slice()
      .sort((a, b) => a.determined.localeCompare(b.determined));
    const last = list[list.length - 1];
    const values = list.map((p) => p.valueEur);
    const previous = strip[strip.length - 1];
    strip.push({
      season,
      valueEur: last.valueEur,
      determined: last.determined,
      points: list.length,
      minEur: Math.min(...values),
      maxEur: Math.max(...values),
      isPl: pl.has(season),
      band: bandForValue(last.valueEur),
      changePct:
        previous && previous.valueEur > 0
          ? Math.round(((last.valueEur - previous.valueEur) / previous.valueEur) * 100)
          : null,
    });
  }

  return strip;
}
```

- [ ] **Step 4: Run the test to verify it passes**

RUN `pnpm test tests/unit/market-value.test.ts`

Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/players/market-value.ts tests/unit/market-value.test.ts
git commit -F <msgfile>   # "feat(m68): pure market-value bands, formatting and strip derivation"
```

---

## Task 4: The ramp tokens

**Files:**

- Modify: `src/app/globals.css` (`:root` block ~line 42, `.dark` block ~line 73)
- Test: `tests/unit/market-value-css.test.ts` (create)

The seven ramp steps are validated hexes from the spec (§6.2) — do **not** recompute them, and do **not** derive them from `--accent` (that token is a near-neutral surface tint and is reassigned by the M25 era themes; the strip must not repaint per era).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/market-value-css.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// TASK-M68 — the strip's colour encoding is CSS-driven; guard the ramp the way
// ix-css.test.ts guards the interaction utilities. The hexes are the validated
// ones from the design spec (single hue, monotone lightness, every adjacent gap
// ≥ 0.06, the step nearest the surface clears 2:1).
const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8");

const LIGHT = ["#dc9ed2", "#ce82c2", "#be65b3", "#af47a3", "#9e2193", "#86017c", "#690161"];
const DARK = ["#713b6a", "#8e4785", "#ab53a0", "#ca60bd", "#e96dda", "#ff87f0", "#ffb4f3"];

describe("market-value ramp tokens (globals.css)", () => {
  it("declares all seven light-mode steps", () => {
    LIGHT.forEach((hex, i) => expect(css).toContain(`--mv-${i + 1}: ${hex};`));
  });

  it("declares all seven dark-mode steps", () => {
    DARK.forEach((hex, i) => expect(css).toContain(`--mv-${i + 1}: ${hex};`));
  });

  it("is theme-invariant — no era block reassigns the ramp", () => {
    const eraBlocks = css.match(/\[data-era[^\]]*\][^{]*\{[^}]*\}/g) ?? [];
    for (const block of eraBlocks) expect(block).not.toMatch(/--mv-\d/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

RUN `pnpm test tests/unit/market-value-css.test.ts`

Expected: FAIL — `--mv-1: #dc9ed2;` not found.

- [ ] **Step 3: Add the tokens**

In `src/app/globals.css`, inside the `:root` block, immediately after the `--chart-*` declarations (the light values):

```css
/* TASK-M68 market-value ramp — seven FIXED absolute bands (<€1m … €100m+),
     stepped from --chart-1 (#c91dbb) against the light card surface (#ffffff).
     Deliberately theme-invariant, like --chart-*: the M25 era themes must not
     repaint the strip, and the ramp must never be derived from --accent (a
     near-neutral surface tint that eras reassign). */
--mv-1: #dc9ed2;
--mv-2: #ce82c2;
--mv-3: #be65b3;
--mv-4: #af47a3;
--mv-5: #9e2193;
--mv-6: #86017c;
--mv-7: #690161;
```

And inside the `.dark` block, after its `--chart-*` declarations:

```css
/* Stepped against the dark card surface (#1a1726) — selected, not flipped. */
--mv-1: #713b6a;
--mv-2: #8e4785;
--mv-3: #ab53a0;
--mv-4: #ca60bd;
--mv-5: #e96dda;
--mv-6: #ff87f0;
--mv-7: #ffb4f3;
```

- [ ] **Step 4: Run the test to verify it passes**

RUN `pnpm test tests/unit/market-value-css.test.ts`

Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css tests/unit/market-value-css.test.ts
git commit -F <msgfile>   # "feat(m68): add the validated market-value ramp tokens"
```

---

## Task 5: i18n keys

**Files:**

- Modify: `src/i18n/messages/en.json` (the `"players"` namespace, ~line 307)
- Modify: `src/i18n/messages/ar.json` (same namespace, same position)

`tests/unit/i18n-catalog-parity.test.ts` fails if the two catalogues drift, so both files change in the same commit.

- [ ] **Step 1: Add the English keys**

Insert into the `"players"` object of `src/i18n/messages/en.json`, keeping the surrounding key order tidy (place them after `"heightLabel"`):

```json
    "marketValue": "Market value",
    "mvUnitK": "k",
    "mvUnitM": "m",
    "mvAsOf": "as of {date}",
    "mvRevaluations": "{count, plural, one {# revaluation} other {# revaluations}}",
    "mvSpread": "{min}–{max}",
    "mvPlLegend": "underline = Premier League season",
    "mvSeasonValue": "{season}: {value}",
    "mvChangeUp": "up {pct}% on {season}",
    "mvChangeDown": "down {pct}% on {season}",
    "mvChangeFlat": "unchanged on {season}",
```

- [ ] **Step 2: Add the Arabic keys**

Insert the matching keys at the same position in `src/i18n/messages/ar.json`:

```json
    "marketValue": "القيمة السوقية",
    "mvUnitK": "ألف",
    "mvUnitM": "م",
    "mvAsOf": "حتى {date}",
    "mvRevaluations": "{count, plural, zero {# تقييم} one {تقييم واحد} two {تقييمان} few {# تقييمات} many {# تقييمًا} other {# تقييم}}",
    "mvSpread": "{min}–{max}",
    "mvPlLegend": "الخط السفلي = موسم في الدوري الإنجليزي",
    "mvSeasonValue": "{season}: {value}",
    "mvChangeUp": "ارتفاع {pct}٪ عن {season}",
    "mvChangeDown": "انخفاض {pct}٪ عن {season}",
    "mvChangeFlat": "دون تغيير عن {season}",
```

- [ ] **Step 3: Run the parity + i18n tests**

RUN `pnpm test tests/unit/i18n-catalog-parity.test.ts`

Expected: PASS — the catalogues agree on every key path.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -F <msgfile>   # "feat(m68): add market-value message keys (en/ar)"
```

---

## Task 6: The strip styles

**Files:**

- Create: `src/features/players/components/MarketValueStrip.module.css`

No test for this task on its own — Task 7's component tests assert the class hooks, and Task 4's test guards the tokens. Commit it together with Task 7 if you prefer; the split here is just for readability.

- [ ] **Step 1: Write the stylesheet**

Create `src/features/players/components/MarketValueStrip.module.css`:

```css
/* TASK-M68 market-value strip. Every keyframe animates transform / opacity /
   clip-path only, and every animation sits behind
   `prefers-reduced-motion: no-preference` — reduced-motion visitors get the
   finished state immediately (spec §7).

   ⚠️ VALUE RIDES THE FILL COLOUR, NEVER `opacity`. The first prototype encoded
   both the value and the hover trail in opacity; the trail won and every cell
   behind the cursor flattened to one shade, destroying the encoding. Dimming
   and hover ride separate channels (spec §6.2). */

.block {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ---- readout ---- */
.readout {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.value {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  font-size: 0.75rem;
  font-weight: 600;
  border: 1px solid currentColor;
}
.up {
  color: #15803d;
}
.down {
  color: #b91c1c;
}
.flat {
  color: var(--muted-foreground);
}
:global(.dark) .up {
  color: #4ade80;
}
:global(.dark) .down {
  color: #f87171;
}
.meta {
  color: var(--muted-foreground);
  font-size: 0.8125rem;
}

/* ---- strip ----
   Pinned dir="ltr" in the markup: a career runs oldest → newest left → right
   regardless of reading direction, the same call the M70 mini-pitch makes. */
.cells {
  display: flex;
  gap: 2px;
  align-items: stretch;
}
.col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: none;
  border: 0;
  padding: 0;
  cursor: default;
}
.cell {
  height: 2.75rem;
  border-radius: 3px;
  position: relative;
  transition:
    filter 140ms var(--ease-out-soft, ease-out),
    opacity 140ms var(--ease-out-soft, ease-out),
    transform 140ms var(--ease-out-soft, ease-out);
}
.cell[data-band="1"] {
  background: var(--mv-1);
}
.cell[data-band="2"] {
  background: var(--mv-2);
}
.cell[data-band="3"] {
  background: var(--mv-3);
}
.cell[data-band="4"] {
  background: var(--mv-4);
}
.cell[data-band="5"] {
  background: var(--mv-5);
}
.cell[data-band="6"] {
  background: var(--mv-6);
}
.cell[data-band="7"] {
  background: var(--mv-7);
}

/* Hover trail (L): everything AHEAD of the cursor dims; the trail behind stays
   fully lit. Dimming is the only thing opacity is allowed to express here. */
.col[data-ahead="true"] .cell {
  opacity: 0.3;
}
.col[data-focus="true"] .cell {
  filter: brightness(1.22) saturate(1.1);
  transform: translateY(-4px);
  box-shadow: 0 0 0 2px var(--ring, currentColor);
}

/* Per-cell value (K) — every season is legible without a pointer, which is what
   covers mobile, print and crawlers. */
.cellValue {
  font-size: 0.625rem;
  line-height: 1;
  text-align: center;
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The resting dot marks the season the headline refers to. */
.dot {
  position: absolute;
  top: -0.4rem;
  left: 50%;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 999px;
  background: var(--foreground);
}

/* PL underline (#27) — 2px, drawn as the closing beat. */
.pl {
  height: 2px;
  border-radius: 999px;
  background: var(--foreground);
  transform-origin: left center;
}
.spacer {
  height: 2px;
}

/* ---- axis + legend ---- */
.axis {
  display: flex;
  justify-content: space-between;
  color: var(--muted-foreground);
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
}
.legend {
  color: var(--muted-foreground);
  font-size: 0.6875rem;
}
.legendMark {
  display: inline-block;
  width: 0.9rem;
  height: 2px;
  vertical-align: middle;
  background: var(--foreground);
  margin-inline-end: 0.3rem;
}

/* ---- animation (spec §7) ---- */
@media (prefers-reduced-motion: no-preference) {
  /* #1 cascade left→right, 26ms stagger, each cell 420ms. */
  .col {
    animation: m68-rise 420ms cubic-bezier(0.2, 0.7, 0.3, 1) both;
    animation-delay: calc(var(--i) * 26ms);
  }
  .cellValue {
    animation: m68-fade 300ms ease-out both;
    animation-delay: calc(var(--i) * 26ms + 90ms);
  }
  /* #27 the PL underline draws last — 300ms each, 30ms stagger, from 880ms. */
  .pl {
    animation: m68-draw 300ms ease-out both;
    animation-delay: calc(880ms + var(--i) * 30ms);
  }
}

@keyframes m68-rise {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes m68-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes m68-draw {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/players/components/MarketValueStrip.module.css
git commit -F <msgfile>   # "feat(m68): market-value strip styles"
```

---

## Task 7: The client island — readout, strip, hover, count-up

**Files:**

- Create: `src/features/players/components/MarketValueStrip.tsx`
- Test: covered by Task 8's component test (the island only renders inside the Server Component)

- [ ] **Step 1: Write the component**

Create `src/features/players/components/MarketValueStrip.tsx`:

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { MarketValueSeason } from "@/features/players/market-value";
import { formatMarketValue } from "@/features/players/market-value";
import { formatBirthDate } from "@/utils/age";
import { localizeDigits } from "@/utils/format";
import { formatSeasonLabel } from "@/utils/season";

import styles from "./MarketValueStrip.module.css";

/**
 * TASK-M68 — the interactive half of the market-value block: the readout with
 * its ▲▼ change chip, the meta line, and the career heat strip.
 *
 * A client island, but it is server-rendered into the ISR'd HTML with the REAL
 * value: the count-up (#11) animates *from* zero after hydration by mutating
 * the already-correct node. Rendering €0 server-side would have crawlers index
 * every player as worthless (spec §7).
 */
export function MarketValueStrip({ seasons }: { seasons: MarketValueSeason[] }) {
  const t = useTranslations("players");
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);

  const units = { k: t("mvUnitK"), m: t("mvUnitM") };
  const fmt = (value: number) => localizeDigits(formatMarketValue(value, units), locale);

  const latest = seasons.length - 1;
  const active = hover ?? latest;
  const current = seasons[active];

  const valueRef = useRef<HTMLSpanElement>(null);
  const countedRef = useRef(false);

  // #11 count-up: 0 → the latest value over 900ms on a cubic ease-out, landing
  // just after the last cell of the cascade. Runs once, on mount, and writes
  // through the DOM — React re-renders (hover) restore the true text for free.
  useEffect(() => {
    if (countedRef.current) return;
    countedRef.current = true;
    const node = valueRef.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = seasons[seasons.length - 1].valueEur;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Mount-only by design — `fmt`/`seasons` are stable for the life of the block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeKey =
    current.changePct === null
      ? null
      : current.changePct > 0
        ? "mvChangeUp"
        : current.changePct < 0
          ? "mvChangeDown"
          : "mvChangeFlat";
  const changeClass =
    current.changePct === null || current.changePct === 0
      ? styles.flat
      : current.changePct > 0
        ? styles.up
        : styles.down;

  const seasonLabel = formatSeasonLabel(current.season, locale);
  const previousLabel = active > 0 ? formatSeasonLabel(seasons[active - 1].season, locale) : "";
  const asOf = formatBirthDate(current.determined, locale);

  return (
    <div className={styles.block}>
      <div className={styles.readout}>
        <span className={styles.value} ref={valueRef}>
          {fmt(current.valueEur)}
        </span>
        {changeKey && (
          <span className={`${styles.chip} ${changeClass}`}>
            <span aria-hidden>
              {current.changePct! > 0 ? "▲" : current.changePct! < 0 ? "▼" : "="}
            </span>
            {t(changeKey, {
              pct: localizeDigits(Math.abs(current.changePct!), locale),
              season: previousLabel,
            })}
          </span>
        )}
      </div>

      <p className={styles.meta}>
        {[
          localizeDigits(seasonLabel, locale),
          asOf ? t("mvAsOf", { date: asOf }) : null,
          t("mvRevaluations", { count: current.points }),
          current.minEur === current.maxEur
            ? null
            : t("mvSpread", { min: fmt(current.minEur), max: fmt(current.maxEur) }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/* A career runs oldest → newest left → right in both locales, so the
          strip is pinned LTR (the M70 mini-pitch makes the same call). */}
      <div className={styles.cells} dir="ltr" onPointerLeave={() => setHover(null)}>
        {seasons.map((season, i) => (
          <div
            key={season.season}
            className={styles.col}
            style={{ "--i": i } as CSSProperties}
            data-ahead={i > active}
            data-focus={i === active}
            onPointerEnter={() => setHover(i)}
          >
            <div className={styles.cell} data-band={season.band}>
              {i === latest && <span className={styles.dot} aria-hidden />}
            </div>
            <span className={styles.cellValue}>{fmt(season.valueEur)}</span>
            <span className="sr-only">
              {t("mvSeasonValue", {
                season: localizeDigits(formatSeasonLabel(season.season, locale), locale),
                value: fmt(season.valueEur),
              })}
            </span>
            {season.isPl ? (
              <span className={styles.pl} aria-hidden />
            ) : (
              <span className={styles.spacer} aria-hidden />
            )}
          </div>
        ))}
      </div>

      <div className={styles.axis} dir="ltr">
        <span>{localizeDigits(formatSeasonLabel(seasons[0].season, locale), locale)}</span>
        <span>{localizeDigits(formatSeasonLabel(seasons[latest].season, locale), locale)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

RUN `pnpm type-check`

Expected: no errors. (The `as CSSProperties` cast on the inline `--i` custom property is what keeps TS happy — keep it.)

- [ ] **Step 3: Commit**

```bash
git add src/features/players/components/MarketValueStrip.tsx
git commit -F <msgfile>   # "feat(m68): market-value strip island (hover trail + count-up)"
```

---

## Task 8: The Server Component

**Files:**

- Create: `src/features/players/components/PlayerMarketValue.tsx`
- Test: `tests/unit/player-market-value.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/player-market-value.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/messages/en.json";

// `PlayerMarketValue` is an async Server Component calling `getTranslations`,
// which has no request context under vitest — the TASK-1603 helper stands in
// and returns the real English catalog strings.
vi.mock("next-intl/server", () => import("./_helpers/intl-server"));

vi.mock("@/data/loaders", () => ({
  loadMarketValueHistory: vi.fn(),
}));

import { loadMarketValueHistory } from "@/data/loaders";
import { PlayerMarketValue } from "@/features/players/components/PlayerMarketValue";

const mocked = vi.mocked(loadMarketValueHistory);

async function renderBlock(props: { playerId: number; plSeasons: number[] }) {
  const ui = await PlayerMarketValue(props);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PlayerMarketValue", () => {
  beforeEach(() => vi.resetAllMocks());

  it("renders the REAL current value in the server markup, never €0", async () => {
    mocked.mockResolvedValue({
      "7": [
        { season: 2016, valueEur: 25_000_000, determined: "2016-10-01" },
        { season: 2017, valueEur: 150_000_000, determined: "2018-05-28" },
      ],
    });
    await renderBlock({ playerId: 7, plSeasons: [2017] });
    expect(screen.getByText("€150m")).toBeInTheDocument();
    expect(screen.queryByText("€0")).not.toBeInTheDocument();
  });

  it("omits itself entirely when the player has no market value", async () => {
    mocked.mockResolvedValue({ "7": [] });
    const { container } = await renderBlock({ playerId: 999, plSeasons: [2017] });
    expect(container).toBeEmptyDOMElement();
  });

  it("omits itself when the history file is absent", async () => {
    mocked.mockResolvedValue(null);
    const { container } = await renderBlock({ playerId: 7, plSeasons: [2017] });
    expect(container).toBeEmptyDOMElement();
  });

  it("prints a value under EVERY season, so no pointer is required", async () => {
    mocked.mockResolvedValue({
      "7": [
        { season: 2016, valueEur: 25_000_000, determined: "2016-10-01" },
        { season: 2017, valueEur: 150_000_000, determined: "2018-05-28" },
      ],
    });
    await renderBlock({ playerId: 7, plSeasons: [2017] });
    expect(screen.getByText("€25m")).toBeInTheDocument();
    expect(screen.getByText("€150m")).toBeInTheDocument();
  });

  it("labels the block and shows the Premier League legend", async () => {
    mocked.mockResolvedValue({
      "7": [{ season: 2017, valueEur: 150_000_000, determined: "2018-05-28" }],
    });
    await renderBlock({ playerId: 7, plSeasons: [2017] });
    expect(screen.getByText(messages.players.marketValue)).toBeInTheDocument();
    expect(screen.getByText(messages.players.mvPlLegend)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

RUN `pnpm test tests/unit/player-market-value.test.tsx`

Expected: FAIL — cannot resolve `@/features/players/components/PlayerMarketValue`.

- [ ] **Step 3: Write the component**

Create `src/features/players/components/PlayerMarketValue.tsx`:

```tsx
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { loadMarketValueHistory } from "@/data/loaders";
import { buildMarketValueStrip } from "@/features/players/market-value";

import { MarketValueStrip } from "./MarketValueStrip";
import styles from "./MarketValueStrip.module.css";

/**
 * TASK-M68 — the career market-value block on `/players/[id]`.
 *
 * Career-scoped and season-invariant, so the page renders it OUTSIDE
 * `<PlayerSeasonView>`'s swappable subtree: it survives a season swap, and —
 * critically — the 5 MB history file is only ever parsed during the ISR'd
 * render, never on the dynamic season-swap route (spec §3, §8).
 *
 * Null-graceful: a player with no valuations gets no block at all — no empty
 * strip, no "—" — matching how the M70 role block behaves when `role` is null.
 */
export async function PlayerMarketValue({
  playerId,
  plSeasons,
}: {
  playerId: number;
  /** The seasons the app holds a row for — these get the PL underline. */
  plSeasons: number[];
}) {
  const history = await loadMarketValueHistory();
  const points = history?.[String(playerId)];
  if (!points || points.length === 0) return null;

  const seasons = buildMarketValueStrip(points, plSeasons);
  if (seasons.length === 0) return null;

  const t = await getTranslations("players");

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
        {t("marketValue")}
      </h2>
      <MarketValueStrip seasons={seasons} />
      <p className={`${styles.legend} mt-3`}>
        <span className={styles.legendMark} aria-hidden />
        {t("mvPlLegend")}
      </p>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

RUN `pnpm test tests/unit/player-market-value.test.tsx`

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/players/components/PlayerMarketValue.tsx tests/unit/player-market-value.test.tsx
git commit -F <msgfile>   # "feat(m68): the career market-value block (server component)"
```

---

## Task 9: Wire it into the page, outside the season-swapped subtree

**Files:**

- Modify: `src/features/players/components/PlayerSeasonView.tsx`
- Modify: `src/app/[locale]/players/[id]/page.tsx`
- Test: `tests/unit/player-season-view.test.tsx` (extend)

- [ ] **Step 1: Write the failing test**

`tests/unit/player-season-view.test.tsx` has a `renderView()` helper that takes no arguments. Give it an optional slot — change the helper to:

```tsx
function renderView(careerBlock?: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlayerSeasonView
        playerId={42}
        seasons={[2025, 2016]}
        initialSeason={2025}
        displayName="Test Player"
        clubLogos={null}
        careerBlock={careerBlock}
      >
        <div>Initial Content</div>
      </PlayerSeasonView>
    </NextIntlClientProvider>,
  );
}
```

and add `import type { ReactNode } from "react";` at the top. Then append this case inside the existing `describe("PlayerSeasonView", …)`:

```tsx
it("keeps the career block mounted across a season swap (TASK-M68)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("/profile")
        ? new Response(JSON.stringify({ profile: profile(42, "Historical Player") }))
        : new Response(JSON.stringify({ facts: [] })),
    ),
  );
  window.history.replaceState(null, "", "/players/42?season=2016");
  renderView(<div data-testid="career-block">career</div>);

  // Present before the swap resolves...
  expect(screen.getByTestId("career-block")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("Historical Player")).toBeInTheDocument());
  // ...and still present after. The block is season-invariant, and keeping it
  // out of the swapped subtree is what keeps the 5 MB history file off the
  // dynamic /api/players/[id]/profile path.
  expect(screen.getByTestId("career-block")).toBeInTheDocument();
  expect(screen.queryByText("Initial Content")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it and confirm it fails**

RUN `pnpm test tests/unit/player-season-view.test.tsx`

Expected: FAIL — `careerBlock` is not a prop of `PlayerSeasonView` (TS error, or the node never renders).

- [ ] **Step 3: Add the prop**

In `src/features/players/components/PlayerSeasonView.tsx`, add to the props destructuring and the type:

```tsx
  careerBlock,
```

```tsx
  /**
   * TASK-M68: season-INVARIANT content (the career market-value block) rendered
   * below the season subtree and never replaced by a season swap. It is a
   * separate slot precisely so the 5 MB market-value history is parsed only in
   * the ISR'd server render, never by the dynamic `/api/players/[id]/profile`
   * path that drives the swap.
   */
  careerBlock?: ReactNode;
```

Then render it after the season-subtree conditional, still inside `<main>`:

```tsx
      )}
      {careerBlock}
    </main>
```

(The closing `)}` shown is the end of the existing `season === initialSeason ? … : …` expression — insert `{careerBlock}` between it and `</main>`.)

- [ ] **Step 4: Run the test to verify it passes**

RUN `pnpm test tests/unit/player-season-view.test.tsx`

Expected: PASS — the whole file, including the new case.

- [ ] **Step 5: Pass the block from the page**

In `src/app/[locale]/players/[id]/page.tsx`, add the import:

```tsx
import { PlayerMarketValue } from "@/features/players/components/PlayerMarketValue";
```

and the prop on `<PlayerSeasonView>` (alongside `displayName`):

```tsx
      careerBlock={<PlayerMarketValue playerId={playerId} plSeasons={known.seasons} />}
```

`known.seasons` comes from the `findPlayerSeasons` call the page already makes — no second load.

- [ ] **Step 6: Verify the whole suite + types + lint**

RUN `pnpm test`

Expected: PASS — the full unit suite (1213 + the ~24 added here), no failures.

RUN `pnpm type-check`

Expected: no errors.

RUN `pnpm lint`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/players/components/PlayerSeasonView.tsx "src/app/[locale]/players/[id]/page.tsx" tests/unit/player-season-view.test.tsx
git commit -F <msgfile>   # "feat(m68): render the market-value block on /players/[id]"
```

---

## Task 10: Verify it in the real app

**Files:** none — this is a verification task. Do not skip it: every previous check was a unit test, and the three things most likely to be wrong (the ramp reading as a flat block, the hover trail flattening the encoding, the ISR'd HTML containing €0) are only visible in a browser.

- [ ] **Step 1: Build and start production**

The count-up and ISR behaviour need a production build, not `next dev`.

RUN `pnpm build`

Expected: build succeeds; `/players/[id]` still lists as SSG (`●`) with ~570 prerendered paths. If it flipped to dynamic (`ƒ`), something in the new code read `searchParams`/`useSearchParams` — that is a hard regression, fix before continuing.

RUN `pnpm start -p 3131` (run in background)

- [ ] **Step 2: Confirm the static HTML carries the real value**

```bash
wsl -d Ubuntu -- bash -c 'curl -s http://localhost:3131/players/1000000 | grep -o "€[0-9.]*[km]" | head -5'
```

Expected: real values (e.g. `€7m`), and **no `€0`**. A `€0` here means the counter is rendering its start state server-side — crawlers would index every player as worthless.

- [ ] **Step 3: Look at it**

Open `http://localhost:3131/players/<a player with a long career>` in the in-app browser (Salah is the canonical case — the €25k → €150m rise is the whole point of the block). Check, in both themes:

- the strip reads as a gradient, not one flat colour (fixed absolute bands, spec §6.1);
- hovering mid-strip dims the future and keeps the trail lit **without flattening the colours** — the cells behind the cursor must still differ from each other (spec §6.2, the opacity trap);
- the value under every cell is legible at mobile width;
- the PL underline sits under exactly the seasons the player played in the PL;
- `/ar/players/<id>` renders with Arabic digits and an RTL layout, with the strip itself still running oldest → newest left → right.

- [ ] **Step 4: Check a null case**

Open a pre-2004 player (any player whose seasons are all 1990s). Expected: **no block at all** — not an empty strip, not a "—".

- [ ] **Step 5: Stop the server**

```bash
wsl -d Ubuntu -- bash -c 'pkill -9 -f "next start"'
```

- [ ] **Step 6: Commit anything the review turned up**

If the visual pass needed fixes, commit them now with a message describing what the browser showed.

---

## Finishing

- [ ] Run the full gate one more time: RUN `pnpm test && pnpm type-check && pnpm lint`
- [ ] Push the branch and open a PR against `main` (`AliEmad0/pitchiq`). No `gh` in WSL — use the token in `~/.git-credentials` with `curl` against the REST API. Title: `feat(m68): market-value schemas, loaders and the profile block`.
- [ ] Watch the checks; merge on green (auto-merge is enabled on this repo).
- [ ] **Do not flip TASK-M68 to Done yet** — `/players` and `/compare` are still outstanding (part 2). Update the ticket only when part 2 ships.

---

## Out of scope for this plan

`/players` market-value column + sort · `/compare` market-value `<StatRow>` — those are part 2, and they read `loadMarketValues()` (the small clipped season map), never the history file. The "most valuable" leaderboard is out of scope for M68 entirely (spec §9).
