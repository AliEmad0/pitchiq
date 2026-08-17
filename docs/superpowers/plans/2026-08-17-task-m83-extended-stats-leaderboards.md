# TASK-M83 Extended-Stats Leaderboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add eight leaderboards drawn from the extended per-season stats, and group the 22 boards on `/leaderboards` into labelled sections.

**Architecture:** No new data read. Every value already lives on the player rows as `metrics.extended` (TASK-M65), so the work is: widen the category key so it can address a nested field, give each category a group, and render sections. `buildBoards` keeps its exact signature because the OG route also calls it; grouping is a new function layered on top.

**Tech Stack:** TypeScript, Next.js App Router (`force-static` page), next-intl (en + ar), Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-17-task-m83-extended-stats-leaderboards-design.md`](../specs/2026-08-17-task-m83-extended-stats-leaderboards-design.md)

---

## Before you start

**Every node command must run through WSL.** Wrap each command shown below:

```bash
wsl -d Ubuntu -- bash -c 'source $HOME/.nvm/nvm.sh && nvm use 22 > /dev/null && cd /home/aliemad/projects/pitchiq-m83 && <command>'
```

⚠️ `pnpm lint` must be prefixed `CI=true`.
⚠️ **Vitest does not type-check.** Task 1's guard is a compile-time assertion — it is enforced by `pnpm type-check`, NOT by a green suite. Run both.

**Working branch:** `feat/m83-extended-leaderboards` in `/home/aliemad/projects/pitchiq-m83`, already branched off `main`. Never push to `main`.

**Never `git add -A`.** Add the exact files each commit step names.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/players/leaderboards-index.ts` | **Modify.** The category registry, `rankBy`, and board assembly. Gains a nested-capable metric key, a `group` per category, and `buildGroupedBoards`. |
| `src/features/players/components/LeaderboardsIndex.tsx` | **Modify.** Renders a heading per group instead of one flat grid. |
| `src/i18n/messages/{en,ar}.json` | **Modify.** 21 new keys per locale (8 boards × 2, plus 5 group headings). |
| `tests/unit/leaderboards-index.test.ts` | **Modify.** Extends the existing suite. |

⚠️ **`buildBoards` keeps its exact signature and behaviour.** `src/app/api/og/leaderboards/route.tsx` calls it too and must be untouched by this ticket.

---

## Task 1: Let a category address a nested extended field

**Files:**
- Modify: `src/features/players/leaderboards-index.ts`
- Test: `tests/unit/leaderboards-index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/leaderboards-index.test.ts`:

```ts
import type { ExtendedMetrics } from "../../src/data/schemas";

/** A player whose row carries `metrics.extended`, as every 2008+ row does. */
const mkExt = (id: number, ext: Partial<ExtendedMetrics>, name = `E${id}`): Player => {
  const base = mk(id, {}, name);
  return { ...base, metrics: { ...base.metrics, extended: ext as ExtendedMetrics } };
};

describe("rankBy over extended metrics", () => {
  it("resolves an extended.* key from metrics.extended", () => {
    const players = [
      mkExt(1, { touches: 900 }),
      mkExt(2, { touches: 2500 }),
      mkExt(3, { touches: 1700 }),
    ];
    const rows = rankBy(players, "extended.touches");
    expect(rows.map((r) => r.playerId)).toEqual([2, 3, 1]);
    expect(rows[0].value).toBe(2500);
  });

  // ⚠️ Not NaN, not a throw — a pre-2008 row simply has no `extended` object, and the
  // board must omit the player rather than rank them at the bottom.
  it("produces NO row for a player with no metrics.extended at all", () => {
    const rows = rankBy([mk(1, {}), mkExt(2, { touches: 10 })], "extended.touches");
    expect(rows.map((r) => r.playerId)).toEqual([2]);
  });

  it("produces no row when the specific extended field is null or zero", () => {
    const rows = rankBy(
      [mkExt(1, { touches: null }), mkExt(2, { touches: 0 }), mkExt(3, { touches: 5 })],
      "extended.touches",
    );
    expect(rows.map((r) => r.playerId)).toEqual([3]);
  });

  it("still resolves a base metric key exactly as before", () => {
    expect(rankBy([mk(1, { goals: 3 }), mk(2, { goals: 9 })], "goals").map((r) => r.playerId)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/unit/leaderboards-index.test.ts`
Expected: FAIL — `"extended.touches"` is not assignable to `keyof ComparisonMetrics`, and the rows come back empty.

- [ ] **Step 3: Implement the key type and the resolver**

In `src/features/players/leaderboards-index.ts`, replace the import and add the types above `LeaderboardCategory`:

```ts
import type { ComparisonMetrics, ExtendedMetrics, Player } from "@/data/schemas";

/**
 * What a board can rank by: a top-level metric, or one of the 54 extended fields
 * addressed as `extended.<field>`.
 *
 * ⛔ The `Exclude` is load-bearing. `"extended"` is itself a key of `ComparisonMetrics`,
 * so without it `key: "extended"` type-checks and `rankBy` sorts OBJECTS with `>` — which
 * does not throw, it just produces a meaningless order. The type is the only thing between
 * that and a shipped board.
 */
export type BaseMetricKey = Exclude<keyof ComparisonMetrics, "extended">;
export type MetricKey = BaseMetricKey | `extended.${Extract<keyof ExtendedMetrics, string>}`;

const EXTENDED_PREFIX = "extended.";

/**
 * The number a board ranks on, or null when this player has none.
 *
 * ⚠️ Rows before 2008 carry no `metrics.extended` at all, so the optional chain is the
 * normal path rather than defensive padding.
 */
function metricValue(p: Player, key: MetricKey): number | null {
  if (key.startsWith(EXTENDED_PREFIX)) {
    const field = key.slice(EXTENDED_PREFIX.length) as keyof ExtendedMetrics;
    const v = p.metrics.extended?.[field];
    return typeof v === "number" ? v : null;
  }
  const v = p.metrics[key as BaseMetricKey];
  return typeof v === "number" ? v : null;
}
```

Change `LeaderboardCategory.key` from `keyof ComparisonMetrics` to `MetricKey`, and change `rankBy`'s signature and its first `map`:

```ts
export function rankBy(
  players: Player[],
  key: MetricKey,
  opts: { n?: number; decimals?: number } = {},
): StatLeaderboardEntry[] {
  const { n = 10, decimals } = opts;
  const scored = players
    .map((p) => ({ p, v: metricValue(p, key) }))
    .filter((x): x is { p: Player; v: number } => typeof x.v === "number" && x.v > 0)
    .sort((a, b) => b.v - a.v || a.p.id - b.p.id)
    .slice(0, n);
```

Leave the rest of `rankBy` and all 14 existing category entries untouched.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/unit/leaderboards-index.test.ts`
Expected: PASS, including the four pre-existing `rankBy` tests.

- [ ] **Step 5: Add the compile-time guard**

Append to `tests/unit/leaderboards-index.test.ts`:

```ts
describe("the metric key cannot address the extended OBJECT", () => {
  it("⛔ rejects key: \"extended\" at compile time", () => {
    // ⚠️ Enforced by `pnpm type-check`, NOT by this suite — vitest does not type-check, so
    // a green run here proves nothing on its own. Ranking by the object would compare
    // objects with `>`, which silently yields a meaningless order instead of throwing.
    // @ts-expect-error "extended" is deliberately excluded from MetricKey
    const bad: MetricKey = "extended";
    expect(bad).toBe("extended");
  });
});
```

Add `MetricKey` to the existing import from `leaderboards-index`.

- [ ] **Step 6: Prove the guard by breaking it**

Run: `pnpm type-check`
Expected: clean.

Now temporarily change `BaseMetricKey` to `keyof ComparisonMetrics` (drop the `Exclude`) and re-run `pnpm type-check`.
Expected: FAIL — `Unused '@ts-expect-error' directive`. **Restore the `Exclude` and confirm `pnpm type-check` is clean again.** A guard nobody has seen fail is decorative.

- [ ] **Step 7: Commit**

```bash
git add src/features/players/leaderboards-index.ts tests/unit/leaderboards-index.test.ts
git commit -m "feat(m83): leaderboard categories can rank by an extended metric"
```

---

## Task 2: Give every category a group

**Files:**
- Modify: `src/features/players/leaderboards-index.ts`
- Test: `tests/unit/leaderboards-index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/leaderboards-index.test.ts`:

```ts
import {
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_GROUPS,
} from "../../src/features/players/leaderboards-index";

describe("the category registry", () => {
  it("gives every category a group in the union", () => {
    for (const cat of LEADERBOARD_CATEGORIES) {
      expect(LEADERBOARD_GROUPS, cat.key).toContain(cat.group);
    }
  });

  // ⛔ A group defined but never assigned renders a heading over nothing on EVERY season.
  it("leaves no group without at least one category", () => {
    for (const group of LEADERBOARD_GROUPS) {
      expect(
        LEADERBOARD_CATEGORIES.some((c) => c.group === group),
        `group "${group}" has no categories`,
      ).toBe(true);
    }
  });

  it("keys are unique — they are also the React keys", () => {
    const keys = LEADERBOARD_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/unit/leaderboards-index.test.ts`
Expected: FAIL — `LEADERBOARD_GROUPS` is not exported.

- [ ] **Step 3: Add the group union and assign all 14 existing categories**

In `src/features/players/leaderboards-index.ts`, above `LeaderboardCategory`:

```ts
/**
 * Section headings on `/leaderboards`, in display order.
 *
 * ⚠️ FIVE groups, not four. `appearances` belongs to none of attacking/passing/defending/
 * discipline, and forcing it into one would be a worse lie than giving it its own heading.
 */
export const LEADERBOARD_GROUPS = [
  "overall",
  "attacking",
  "passing",
  "defending",
  "discipline",
] as const;

export type LeaderboardGroup = (typeof LEADERBOARD_GROUPS)[number];
```

Add `group: LeaderboardGroup;` to `LeaderboardCategory` (required, not optional — a category with no group must not compile).

Add `group` to each of the 14 existing entries:

| Category `key` | `group` |
| --- | --- |
| `goals` | `"attacking"` |
| `assists` | `"attacking"` |
| `appearances` | `"overall"` |
| `cleanSheets` | `"defending"` |
| `saves` | `"defending"` |
| `keyPasses` | `"passing"` |
| `tackles` | `"defending"` |
| `interceptions` | `"defending"` |
| `dribblesCompleted` | `"attacking"` |
| `shotsOnTarget` | `"attacking"` |
| `xg` | `"attacking"` |
| `xa` | `"attacking"` |
| `yellowCards` | `"discipline"` |
| `redCards` | `"discipline"` |

Example of the edit for a one-line entry:

```ts
  { key: "goals", group: "attacking", title: "Goals", valueLabel: "Goals", titleKey: "catGoalsTitle", valueLabelKey: "catGoalsValue", accent: "amber" }, // prettier-ignore
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/unit/leaderboards-index.test.ts`
Expected: PASS. `passing` currently holds only `keyPasses` — that is fine; Task 3 adds two more.

- [ ] **Step 5: Commit**

```bash
git add src/features/players/leaderboards-index.ts tests/unit/leaderboards-index.test.ts
git commit -m "feat(m83): group every leaderboard category"
```

---

## Task 3: Assemble grouped boards

**Files:**
- Modify: `src/features/players/leaderboards-index.ts`
- Test: `tests/unit/leaderboards-index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/leaderboards-index.test.ts`:

```ts
import { buildGroupedBoards } from "../../src/features/players/leaderboards-index";

describe("buildGroupedBoards", () => {
  // ⚠️ `mk` sets `appearances: 38`, so EVERY fixture player ranks on the Appearances
  // board and the `overall` group is always present. Pass `appearances: 0` to opt out.
  it("returns groups in registry order, each holding its own boards", () => {
    const groups = buildGroupedBoards([mk(1, { goals: 5 }), mk(2, { yellowCards: 4 })]);
    expect(groups.map((g) => g.group)).toEqual(["overall", "attacking", "discipline"]);
    for (const g of groups) {
      expect(g.boards.every((b) => b.cat.group === g.group), g.group).toBe(true);
    }
  });

  // ⛔ A heading asserts that content exists. Same class as an absent-vs-empty record.
  it("omits a group entirely when it has no boards", () => {
    const groups = buildGroupedBoards([mk(1, { goals: 5 })]);
    expect(groups.map((g) => g.group)).toEqual(["overall", "attacking"]);
    expect(groups.some((g) => g.boards.length === 0)).toBe(false);
  });

  it("carries a heading message key per group", () => {
    const groups = buildGroupedBoards([mk(1, { goals: 5 })]);
    expect(groups.map((g) => g.titleKey)).toEqual(["groupOverall", "groupAttacking"]);
  });

  it("returns nothing at all for a player set that ranks nowhere", () => {
    expect(buildGroupedBoards([mk(1, { appearances: 0 })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/unit/leaderboards-index.test.ts`
Expected: FAIL — `buildGroupedBoards` is not exported.

- [ ] **Step 3: Implement**

Append to `src/features/players/leaderboards-index.ts`, below `buildBoards`:

```ts
export interface LeaderboardGroupBoards {
  group: LeaderboardGroup;
  /** Message key in the `leaderboard` namespace, e.g. "groupAttacking". */
  titleKey: string;
  boards: Array<{ cat: LeaderboardCategory; rows: StatLeaderboardEntry[] }>;
}

/**
 * `buildBoards`, split into display sections.
 *
 * ⚠️ Layered ON TOP of `buildBoards` rather than replacing it — `/api/og/leaderboards`
 * calls that function too and must keep its flat list.
 *
 * ⛔ Empty groups are dropped, not rendered empty. A heading asserts that content exists,
 * and every season before 2008 would otherwise show five headings over nothing.
 */
export function buildGroupedBoards(players: Player[]): LeaderboardGroupBoards[] {
  const boards = buildBoards(players);
  return LEADERBOARD_GROUPS.map((group) => ({
    group,
    titleKey: `group${group[0]!.toUpperCase()}${group.slice(1)}`,
    boards: boards.filter((b) => b.cat.group === group),
  })).filter((g) => g.boards.length > 0);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/unit/leaderboards-index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/players/leaderboards-index.ts tests/unit/leaderboards-index.test.ts
git commit -m "feat(m83): assemble leaderboards into display groups"
```

---

## Task 4: Add the eight boards and their strings

**Files:**
- Modify: `src/features/players/leaderboards-index.ts`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Test: `tests/unit/leaderboards-index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/leaderboards-index.test.ts`:

```ts
import en from "../../src/i18n/messages/en.json";
import ar from "../../src/i18n/messages/ar.json";

const NEW_KEYS = [
  "extended.touches",
  "extended.totalPasses",
  "duelsWon",
  "extended.clearances",
  "extended.foulsWon",
  "extended.offsides",
  "extended.headedGoals",
  "extended.leftFootGoals",
] as const;

describe("the eight extended-stat boards", () => {
  it("are all registered", () => {
    const keys = LEADERBOARD_CATEGORIES.map((c) => c.key);
    for (const k of NEW_KEYS) expect(keys, k).toContain(k);
    expect(LEADERBOARD_CATEGORIES).toHaveLength(22);
  });

  it("every category's message keys resolve in BOTH locales", () => {
    for (const cat of LEADERBOARD_CATEGORIES) {
      expect(en.leaderboard, `en ${cat.titleKey}`).toHaveProperty(cat.titleKey);
      expect(en.leaderboard, `en ${cat.valueLabelKey}`).toHaveProperty(cat.valueLabelKey);
      expect(ar.leaderboard, `ar ${cat.titleKey}`).toHaveProperty(cat.titleKey);
      expect(ar.leaderboard, `ar ${cat.valueLabelKey}`).toHaveProperty(cat.valueLabelKey);
    }
  });

  it("every group heading key resolves in BOTH locales", () => {
    for (const group of LEADERBOARD_GROUPS) {
      const key = `group${group[0]!.toUpperCase()}${group.slice(1)}`;
      expect(en.leaderboard, `en ${key}`).toHaveProperty(key);
      expect(ar.leaderboard, `ar ${key}`).toHaveProperty(key);
    }
  });

  // ⚠️ The coverage bonus the ticket did not know about: rows carry `extended` from 2008,
  // two seasons earlier than the side file the ticket describes.
  it("a 2008-shaped player set DOES produce the new boards", () => {
    const groups = buildGroupedBoards([
      // ⚠️ `mkExt` is built on `mk`, so this player also ranks on Appearances — that is
      // realistic (a real row has both) and irrelevant to what is asserted below.
      mkExt(1, { touches: 2200, totalPasses: 1400, clearances: 90, foulsWon: 30 }),
    ]);
    const keys = groups.flatMap((g) => g.boards.map((b) => b.cat.key));
    expect(keys).toContain("extended.touches");
    expect(keys).toContain("extended.clearances");
  });

  // ⛔ 1992–2007 must be untouched: no extended boards, and no empty headings.
  it("a pre-2008 player set produces NONE of them and no empty group", () => {
    const groups = buildGroupedBoards([mk(1, { goals: 12 }), mk(2, { assists: 7 })]);
    const keys = groups.flatMap((g) => g.boards.map((b) => b.cat.key));
    for (const k of NEW_KEYS) {
      if (k === "duelsWon") continue; // a base metric — available in every era
      expect(keys, k).not.toContain(k);
    }
    expect(groups.every((g) => g.boards.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/unit/leaderboards-index.test.ts`
Expected: FAIL — the registry has 14 entries, not 22.

- [ ] **Step 3: Add the eight categories**

Append inside `LEADERBOARD_CATEGORIES`, keeping the array's display order (they will be re-sorted into groups by `buildGroupedBoards`, so append at the end):

```ts
  { key: "extended.touches", group: "passing", title: "Touches", valueLabel: "Touches", titleKey: "catTouchesTitle", valueLabelKey: "catTouchesValue" }, // prettier-ignore
  { key: "extended.totalPasses", group: "passing", title: "Passes", valueLabel: "Passes", titleKey: "catPassesTitle", valueLabelKey: "catPassesValue" }, // prettier-ignore
  { key: "duelsWon", group: "defending", title: "Duels Won", valueLabel: "Duels", titleKey: "catDuelsWonTitle", valueLabelKey: "catDuelsWonValue" }, // prettier-ignore
  { key: "extended.clearances", group: "defending", title: "Clearances", valueLabel: "Clearances", titleKey: "catClearancesTitle", valueLabelKey: "catClearancesValue" }, // prettier-ignore
  { key: "extended.foulsWon", group: "discipline", title: "Fouls Won", valueLabel: "Fouls won", titleKey: "catFoulsWonTitle", valueLabelKey: "catFoulsWonValue" }, // prettier-ignore
  { key: "extended.offsides", group: "discipline", title: "Offsides", valueLabel: "Offsides", titleKey: "catOffsidesTitle", valueLabelKey: "catOffsidesValue" }, // prettier-ignore
  { key: "extended.headedGoals", group: "attacking", title: "Headed Goals", valueLabel: "Headers", titleKey: "catHeadedGoalsTitle", valueLabelKey: "catHeadedGoalsValue", accent: "amber" }, // prettier-ignore
  { key: "extended.leftFootGoals", group: "attacking", title: "Left-Footed Goals", valueLabel: "Left foot", titleKey: "catLeftFootGoalsTitle", valueLabelKey: "catLeftFootGoalsValue", accent: "amber" }, // prettier-ignore
```

⚠️ **`duelsWon` has no `extended.` prefix.** It has been a top-level `ComparisonMetrics` field all along and simply never had a board — it needs no extended read.

- [ ] **Step 4: Add the English strings**

In `src/i18n/messages/en.json`, inside the `leaderboard` object:

```json
"groupOverall": "Overall",
"groupAttacking": "Attacking",
"groupPassing": "Passing & possession",
"groupDefending": "Defending",
"groupDiscipline": "Discipline",
"catTouchesTitle": "Touches",
"catTouchesValue": "Touches",
"catPassesTitle": "Passes",
"catPassesValue": "Passes",
"catDuelsWonTitle": "Duels Won",
"catDuelsWonValue": "Duels",
"catClearancesTitle": "Clearances",
"catClearancesValue": "Clearances",
"catFoulsWonTitle": "Fouls Won",
"catFoulsWonValue": "Fouls won",
"catOffsidesTitle": "Offsides",
"catOffsidesValue": "Offsides",
"catHeadedGoalsTitle": "Headed Goals",
"catHeadedGoalsValue": "Headers",
"catLeftFootGoalsTitle": "Left-Footed Goals",
"catLeftFootGoalsValue": "Left foot"
```

- [ ] **Step 5: Add the Arabic strings**

In `src/i18n/messages/ar.json`, inside the `leaderboard` object:

```json
"groupOverall": "عام",
"groupAttacking": "الهجوم",
"groupPassing": "التمرير والاستحواذ",
"groupDefending": "الدفاع",
"groupDiscipline": "الانضباط",
"catTouchesTitle": "اللمسات",
"catTouchesValue": "اللمسات",
"catPassesTitle": "التمريرات",
"catPassesValue": "التمريرات",
"catDuelsWonTitle": "الالتحامات المكسوبة",
"catDuelsWonValue": "الالتحامات",
"catClearancesTitle": "التشتيتات",
"catClearancesValue": "التشتيتات",
"catFoulsWonTitle": "الأخطاء المكتسبة",
"catFoulsWonValue": "الأخطاء",
"catOffsidesTitle": "التسللات",
"catOffsidesValue": "التسللات",
"catHeadedGoalsTitle": "أهداف الرأس",
"catHeadedGoalsValue": "رأسيات",
"catLeftFootGoalsTitle": "أهداف القدم اليسرى",
"catLeftFootGoalsValue": "القدم اليسرى"
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test tests/unit/leaderboards-index.test.ts tests/unit/i18n-catalog-parity.test.ts`
Expected: PASS. The parity test independently confirms en/ar key sets match.

- [ ] **Step 7: Commit**

```bash
git add src/features/players/leaderboards-index.ts src/i18n/messages/en.json src/i18n/messages/ar.json tests/unit/leaderboards-index.test.ts
git commit -m "feat(m83): eight extended-stat leaderboards, en + ar"
```

---

## Task 5: Render the sections

**Files:**
- Modify: `src/features/players/components/LeaderboardsIndex.tsx`

- [ ] **Step 1: Swap the flat grid for grouped sections**

Replace the `buildBoards` import and call:

```tsx
import { buildGroupedBoards } from "@/features/players/leaderboards-index";
```

```tsx
  const groups = players ? buildGroupedBoards(players) : [];
```

Replace the `boards.length > 0 ? (...)` block's contents:

```tsx
      {groups.length > 0 ? (
        <div className="space-y-10">
          {groups.map(({ group, titleKey, boards }) => (
            <section key={group} className="space-y-4">
              <h2 className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
                {t(titleKey)}
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map(({ cat, rows }) => (
                  <StatLeaderboard
                    key={cat.key}
                    title={t(cat.titleKey)}
                    valueLabel={t(cat.valueLabelKey)}
                    entries={rows}
                    accent={cat.accent}
                    season={season}
                    limit={10}
                    variant="badge"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
```

The `DataUnavailable` branch is unchanged — `groups.length === 0` means the same thing `boards.length === 0` did.

- [ ] **Step 2: Run the whole suite**

Run: `pnpm test`
Expected: green. ⚠️ If a `/leaderboards` component or E2E test asserts the old flat structure, fix the TEST to expect sections — do not revert the component.

- [ ] **Step 3: Type-check and lint**

Run: `pnpm type-check`
Expected: clean.

Run: `CI=true pnpm lint`
Expected: clean.

- [ ] **Step 4: Look at it, in both locales**

Run `pnpm dev`, then open `/leaderboards` and `/ar/leaderboards`.

Confirm:
- five headings on a modern season, in order Overall → Attacking → Passing & possession → Defending → Discipline
- 22 boards total; touches, passes, clearances and fouls won all populated
- `/leaderboards?season=2000` (or the season switcher on an early season) shows **no** extended boards and **no** empty headings
- the Arabic headings render in Arabic, RTL

⚠️ Per CLAUDE.md, do not verify Arabic by grepping the page — next-intl serialises the whole catalog into every page, so any string is always "found". Read the rendered headings.

- [ ] **Step 5: Commit**

```bash
git add src/features/players/components/LeaderboardsIndex.tsx
git commit -m "feat(m83): render leaderboards in labelled sections"
```

---

## Task 6: Docs and the PR

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Flip the ticket and record what was found**

In `TASKS.md`, change TASK-M83's status from `⬜ Todo` to `✅ Done` and add shipped notes covering:

- the ticket's premise was wrong — all 54 fields were already on the rows via `metrics.extended` (TASK-M65), verified by **58,303 field comparisons with 0 disagreements**, so the lift-vs-read decision it asks for is moot
- no loader, no row churn, no read of the 15.28 MB side file
- coverage is **2008+**, two seasons better than the ticket's "2010+"
- `duelsWon` needed no extended read — it was a base metric with no board
- five groups, because `appearances` fits none of the other four
- ⚠️ **`player-history-stats.json` (15.28 MB) is now provably redundant for the app.** Flag it for the pipeline repo; do not delete it here.

- [ ] **Step 2: Full verification**

Run: `pnpm test` — expected green.
Run: `pnpm type-check` — expected clean.
Run: `CI=true pnpm lint` — expected clean.

⚠️ **`pnpm build` may fail locally** with `next/font` ETIMEDOUT on Google Fonts — a known limitation of this environment, not a code problem (`curl` reaches the same URLs). CI's Build check is the gate.

- [ ] **Step 3: Commit and open the PR**

```bash
git add TASKS.md
git commit -m "docs(m83): record the extended-stats leaderboards work"
git push -u origin feat/m83-extended-leaderboards
```

Open the PR against `main`, watch the three CI checks, squash-merge on green. Never push to `main`.

---

## Notes for the implementer

- **`buildBoards` must keep its exact signature.** `/api/og/leaderboards` calls it; if that route changes behaviour, the grouping was built in the wrong place.
- **A green suite is not evidence the code compiles.** Task 1's `@ts-expect-error` guard only fires under `pnpm type-check` — and Task 1 Step 6 tells you to watch it fail on purpose.
- **A green suite is not evidence anything changed, either.** The new boards appearing is a user-visible claim; Task 5 Step 4 verifies it by looking, not by the suite staying green.
