# TASK-M68 Market value — app half, part 2: `/players` column + sort, `/compare` row

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface market value on the two table surfaces — a value column plus a "most valuable" sort on `/players`, and a market-value `<StatRow>` on `/compare`.

**Architecture:** Both surfaces are request-time, so both read **`loadMarketValues()`** — the clipped 624 KB season map — and never `loadMarketValueHistory()`. Two new pure lookups join the existing `src/features/players/market-value.ts`; the rest is wiring into `players-index.api.ts`, `PlayersTable`, and `compare/page.tsx`.

**Tech Stack:** Next.js 15 App Router, Zod, next-intl (en/ar), nuqs, Vitest + Testing Library.

**Prerequisite:** part 1 (#51), merged as `8999815`.

---

## Conventions

`RUN <cmd>` means, from a script file with a Linux-pinned PATH (see [[pitchiq-wsl-toolchain]]):

```bash
wsl -d Ubuntu -- bash /home/aliemad/_m68app_test.sh node_modules/.bin/<cmd>
```

Use the binaries directly (`node_modules/.bin/vitest run`, `.../tsc --noEmit`, `.../next lint --dir src --dir tests`) — **not** `pnpm <script>`. Branch: `feat/m68-market-value-tables`. Ships as a PR; never push to `main`.

---

## Decisions locked before writing code

1. **`contributions` stays the default sort on `/players`.** The spec calls the MV sort the true "most valuable", superseding the M50 goals+assists proxy — but it does not ask for a new default, and making MV the default would be actively wrong for the 12 seasons before ~2004, where _no_ player has a value and the page would fall back to an arbitrary order. MV is an additional sort button.
2. **Unvalued players always sink** in the MV sort, never sort as zero — a player with no Transfermarkt match is unknown, not worthless.
3. **A career (`?sa=all`) compare slot shows the player's PEAK value**, not a sum (meaningless) and not null (uninformative). This matches the page's existing career semantics, which already mix totals and averages.
4. **Table cells render `—` for a missing value**, per spec §5 — only the profile block omits itself entirely.

---

## File structure

| File                                               | Change                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `src/features/players/market-value.ts`             | + `marketValueForSeason()`, `peakMarketValue()`                       |
| `src/features/players/players-index.api.ts`        | `PlayerIndexRow.marketValueEur`, loaded from the season map           |
| `src/features/players/components/PlayersTable.tsx` | `marketValue` sort key + label, value column, null-sinking sort       |
| `src/app/[locale]/compare/page.tsx`                | `Resolved.marketValueEur`, resolved per slot, conditional `<StatRow>` |
| `src/i18n/messages/{en,ar}.json`                   | `sortMarketValue`, `colMarketValue`                                   |
| `tests/unit/market-value.test.ts`                  | lookup + peak tests                                                   |
| `tests/unit/players-table.test.tsx`                | column + sort tests                                                   |
| `tests/unit/compare-page.test.tsx`                 | the MV row                                                            |

---

## Task 1: Pure lookups

**Files:** Modify `src/features/players/market-value.ts` · Test `tests/unit/market-value.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `tests/unit/market-value.test.ts`:

```ts
import { marketValueForSeason, peakMarketValue } from "@/features/players/market-value";

const FILE = {
  "2016": { "7": { valueEur: 25_000_000, determined: "2016-10-01" } },
  "2017": { "7": { valueEur: 150_000_000, determined: "2018-05-28" } },
  "2018": { "9": { valueEur: 5_000_000, determined: "2019-01-01" } },
};

describe("marketValueForSeason", () => {
  it("reads one player's value for one season", () => {
    expect(marketValueForSeason(FILE, 2017, 7)).toBe(150_000_000);
  });

  it("returns null for a season the player has no value in", () => {
    expect(marketValueForSeason(FILE, 2018, 7)).toBeNull();
  });

  it("returns null for a missing season or a null file", () => {
    expect(marketValueForSeason(FILE, 1995, 7)).toBeNull();
    expect(marketValueForSeason(null, 2017, 7)).toBeNull();
  });
});

describe("peakMarketValue", () => {
  it("returns the highest value across every season", () => {
    expect(peakMarketValue(FILE, 7)).toBe(150_000_000);
  });

  it("returns null for a player with no values at all", () => {
    expect(peakMarketValue(FILE, 999)).toBeNull();
    expect(peakMarketValue(null, 7)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm failure** — RUN `vitest run tests/unit/market-value.test.ts`. Expected: FAIL, `marketValueForSeason` is not exported.

- [ ] **Step 3: Implement** — append to `src/features/players/market-value.ts`:

```ts
import type { MarketValueFile } from "@/data/schemas";

/**
 * One player's value for one season, from the clipped season map.
 *
 * This is the lookup the REQUEST-TIME surfaces use (`/players`, `/compare`).
 * They must never reach for `loadMarketValueHistory()` — see the loader's
 * ISR-only warning.
 */
export function marketValueForSeason(
  file: MarketValueFile | null,
  season: number,
  playerId: number,
): number | null {
  return file?.[String(season)]?.[String(playerId)]?.valueEur ?? null;
}

/**
 * The highest value a player ever reached across the seasons in the map — the
 * career analogue of a single season's figure, used by a `?sa=all` compare slot.
 * A sum would be meaningless for a valuation.
 */
export function peakMarketValue(file: MarketValueFile | null, playerId: number): number | null {
  if (!file) return null;
  const key = String(playerId);
  let peak: number | null = null;
  for (const bySeason of Object.values(file)) {
    const value = bySeason[key]?.valueEur;
    if (value != null && (peak === null || value > peak)) peak = value;
  }
  return peak;
}
```

- [ ] **Step 4: Run and confirm pass** — RUN `vitest run tests/unit/market-value.test.ts`. Expected: PASS (17 tests).

- [ ] **Step 5: Commit** — `feat(m68): season + peak market-value lookups`

---

## Task 2: `/players` — the column and the sort

**Files:** Modify `players-index.api.ts`, `PlayersTable.tsx`, both message catalogs · Test `tests/unit/players-table.test.tsx`

- [ ] **Step 1: Write the failing tests.** Read the existing `tests/unit/players-table.test.tsx` first and reuse its row factory and render helper. Add:

```tsx
it("renders a market-value column, with an em dash when unvalued (TASK-M68)", () => {
  renderTable([
    row({ id: 1, name: "Rich", marketValueEur: 150_000_000 }),
    row({ id: 2, name: "Unvalued", marketValueEur: null }),
  ]);
  expect(screen.getByText("€150m")).toBeInTheDocument();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});

it("sorts by market value and sinks unvalued players (TASK-M68)", () => {
  const rows = [
    row({ id: 1, name: "Unvalued", marketValueEur: null }),
    row({ id: 2, name: "Cheap", marketValueEur: 1_000_000 }),
    row({ id: 3, name: "Pricey", marketValueEur: 90_000_000 }),
  ];
  // An unvalued player is UNKNOWN, not worthless — they must never outrank a
  // player with a real value, in either direction.
  expect(sortPlayerRows(rows, "marketValue").map((r) => r.name)).toEqual([
    "Pricey",
    "Cheap",
    "Unvalued",
  ]);
});
```

- [ ] **Step 2: Run and confirm failure** — RUN `vitest run tests/unit/players-table.test.tsx`.

- [ ] **Step 3: Add the field to the row type.** In `src/features/players/players-index.api.ts`, add to `PlayerIndexRow`:

```ts
/** TASK-M68: last-of-season market value in EUR; null when unmatched or pre-2004. */
marketValueEur: number | null;
```

Import `loadMarketValues` alongside the other loaders, and `marketValueForSeason` from `@/features/players/market-value`. Add `loadMarketValues()` to the existing `Promise.all`:

```ts
const [clubLogos, teamColors, names, marketValues] = await Promise.all([
  loadClubLogos(),
  loadTeamColors(),
  getEntityNames(),
  loadMarketValues(),
]);
```

and inside the `players.map` row literal:

```ts
      marketValueEur: marketValueForSeason(marketValues, season, p.id),
```

- [ ] **Step 4: Wire the table.** In `src/features/players/components/PlayersTable.tsx`:

Add the sort key and label:

```ts
const SORT_KEYS = [
  "contributions",
  "marketValue",
  "goals",
  "assists",
  "appearances",
  "name",
] as const;
```

```ts
  marketValue: "sortMarketValue",
```

Teach `sortPlayerRows` about the nullable key — the existing `b[key] - a[key]` would produce `NaN` for nulls:

```ts
export function sortPlayerRows(rows: PlayerIndexRow[], key: SortKey): PlayerIndexRow[] {
  const out = [...rows];
  const byName = (a: PlayerIndexRow, b: PlayerIndexRow) => a.name.localeCompare(b.name);
  if (key === "name") out.sort(byName);
  else if (key === "marketValue")
    // Unvalued players sink in BOTH directions: no Transfermarkt match means
    // unknown, not worthless, so they must never outrank a real valuation.
    out.sort((a, b) => {
      const av = a.marketValueEur;
      const bv = b.marketValueEur;
      if (av === null || bv === null) {
        if (av === bv) return byName(a, b);
        return av === null ? 1 : -1;
      }
      return bv - av || byName(a, b);
    });
  else out.sort((a, b) => b[key] - a[key] || b.goals - a.goals || byName(a, b));
  return out;
}
```

Note `SortKey` now includes `"marketValue"`, which is not a numeric key of `PlayerIndexRow`; the `else` branch's `b[key]` must stay typed. Keep the numeric branch narrowed by giving the final `else` an explicit cast to the numeric keys:

```ts
  else {
    const numeric = key as "contributions" | "goals" | "assists" | "appearances";
    out.sort((a, b) => b[numeric] - a[numeric] || b.goals - a.goals || byName(a, b));
  }
```

Add the header cell after the `gaAbbr` column:

```tsx
<th className="px-2 py-2 text-end">{t("colMarketValue")}</th>
```

and the body cell after the contributions cell:

```tsx
<td className="text-muted-foreground px-2 py-2 text-end tabular-nums">
  {r.marketValueEur === null
    ? "—"
    : localizeDigits(
        formatMarketValue(r.marketValueEur, {
          k: t("mvUnitK"),
          m: t("mvUnitM"),
        }),
        locale,
      )}
</td>
```

with `import { formatMarketValue } from "@/features/players/market-value";` at the top.

- [ ] **Step 5: Messages.** Add to the `players` namespace of both catalogs, keeping them in sync (`i18n-catalog-parity.test.ts` enforces it):

`en.json`:

```json
    "sortMarketValue": "Market value",
    "colMarketValue": "Value",
```

`ar.json`:

```json
    "sortMarketValue": "القيمة السوقية",
    "colMarketValue": "القيمة",
```

- [ ] **Step 6: Run and confirm pass** — RUN `vitest run tests/unit/players-table.test.tsx tests/unit/players-index-api.test.ts tests/unit/i18n-catalog-parity.test.ts`.

- [ ] **Step 7: Commit** — `feat(m68): market-value column and sort on /players`

---

## Task 3: `/compare` — the market-value row

**Files:** Modify `src/app/[locale]/compare/page.tsx` · Test `tests/unit/compare-page.test.tsx`

- [ ] **Step 1: Write the failing test.** Read `tests/unit/compare-page.test.tsx` for its existing harness and mocks, then add a case asserting that when both slots resolve with a market value, the page renders a market-value row showing both formatted figures; and that the row is absent when neither slot has one. Mirror how the file already tests the conditional xG/xA rows — reuse its mock factories verbatim rather than writing a second harness.

- [ ] **Step 2: Run and confirm failure** — RUN `vitest run tests/unit/compare-page.test.tsx`.

- [ ] **Step 3: Implement.** In `src/app/[locale]/compare/page.tsx`:

Extend the resolved shape:

```ts
type Resolved = {
  player: Player;
  metrics: ComparisonMetrics;
  label: string;
  /** TASK-M68: the slot's market value — the season's figure, or the career peak. */
  marketValueEur: number | null;
};
```

Give `resolveSlot` the season map (loaded once by the page and passed in, so two slots share one read):

```ts
async function resolveSlot(
  id: number,
  slotSeason: SlotSeason,
  careerLabel: (from: number, to: number) => string,
  locale: string,
  marketValues: MarketValueFile | null,
): Promise<Resolved | null> {
  if (slotSeason === "all") {
    const career = await getPlayerCareer(id);
    if (!career) return null;
    return {
      player: career.player,
      metrics: career.metrics,
      label: careerLabel(career.span.from, career.span.to),
      // A career slot shows the PEAK — summing valuations would be meaningless.
      marketValueEur: peakMarketValue(marketValues, id),
    };
  }
  const stats = await getPlayerStats(id, slotSeason);
  if (!stats) return null;
  return {
    player: stats.player,
    metrics: stats.metrics,
    label: formatSeasonLabel(slotSeason, locale),
    marketValueEur: marketValueForSeason(marketValues, slotSeason, id),
  };
}
```

In the page body, load the map alongside the slots (it is the small clipped file, safe at request time):

```ts
if (aId !== null && bId !== null) {
  const marketValues = await loadMarketValues();
  [aData, bData] = await Promise.all([
    resolveSlot(aId, saSeason, careerLabel, locale, marketValues),
    resolveSlot(bId, sbSeason, careerLabel, locale, marketValues),
  ]);
}
```

In `ComparisonView`, after the xG/xA rows and before the clean-sheets rows, add the conditional row (matching the era-sparse pattern already there):

```tsx
{
  /* TASK-M68: market value — era-sparse (Transfermarkt starts ~2004) and
            absent for unmatched players, so it renders only when a slot has one. */
}
{
  (a.marketValueEur != null || b.marketValueEur != null) && (
    <StatRow
      label={tp("marketValue")}
      a={a.marketValueEur}
      b={b.marketValueEur}
      format={(n) => formatMarketValue(n, { k: tp("mvUnitK"), m: tp("mvUnitM") })}
    />
  );
}
```

`tp` is a `useTranslations("players")` handle — the market-value keys live in the `players` namespace, not `metrics`. Add it next to the existing `tm`/`t` handles in `ComparisonView`, and import `formatMarketValue`, `marketValueForSeason`, `peakMarketValue`, `loadMarketValues`, and the `MarketValueFile` type.

- [ ] **Step 4: Run and confirm pass** — RUN `vitest run tests/unit/compare-page.test.tsx`.

- [ ] **Step 5: Commit** — `feat(m68): market-value row on /compare`

---

## Task 4: Verify and ship

- [ ] **Step 1: Full gate** — RUN `vitest run`, then `tsc --noEmit`, then `next lint --dir src --dir tests`. All three must be clean.

- [ ] **Step 2: Production build** — RUN `next build`. Confirm it succeeds and that `/[locale]/players` and `/[locale]/compare` keep their existing render modes (`●` and `ƒ` respectively). Google-Fonts fetch failures here are transient — retry the build rather than chasing them.

- [ ] **Step 3: Look at it.** Start the server detached (`setsid nohup node_modules/.bin/next start -p 3131 …`) and check:
  - `/players` — the Value column populates for 2025-26 and the "Market value" sort button reorders with unvalued players last;
  - `/players?season=1995` — every value shows `—` and the page is not broken;
  - `/compare?a=<id>&b=<id>` — the market-value row renders with both figures;
  - `/compare?a=<id>&sa=all&b=<id>` — the career slot shows the peak;
  - `/ar/players` — the column header and values are Arabic.

  Read values with the browser's `javascript_tool` rather than screenshots; assert on markup structure, not message text (next-intl serialises the whole catalog into every page).

- [ ] **Step 4: Flip the board.** TASK-M68 is now complete end-to-end, so update **both** boards as part of shipping (owner expectation): public `pitchiq/TASKS.md` M68 → ✅ Done with a resolution block naming the two app PRs, and the pipeline board's M68 entry cross-referenced.

- [ ] **Step 5: PR** — push, open against `main` via the REST API (no `gh` in WSL), watch checks, merge on green.
