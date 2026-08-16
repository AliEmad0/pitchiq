# TASK-M83 — extended-stats leaderboards

**Date:** 2026-08-17
**Status:** design agreed, ready for planning
**Depends on:** nothing
**Supersedes:** the ticket's own framing — see [The premise changed](#the-premise-changed)

## Scope

Add eight leaderboards to `/leaderboards` from the extended per-season stats, and group the
page's boards into labelled sections now that there are 22 of them.

## The premise changed

The ticket says:

> `data/player-history-stats.json` is **15.6 MB** … **not read at runtime at all** — no
> loader exists. Only seven of the 54 were ever lifted onto player rows.
>
> ⚠️ Decide deliberately whether to lift fields onto player rows (bigger `players-*.json`,
> simple reads) or read the side-map at request time (no row churn).

**That decision is moot: all 54 fields are already on the player rows.**
`ComparisonMetricsSchema` has carried `extended: ExtendedMetricsSchema.optional()` since
TASK-M65, and `players-<season>.json` populates it.

Measured before designing:

| | |
| --- | --- |
| `players-*.json` rows carrying `metrics.extended` | ~95% per season, **2008–2025** |
| Field comparisons, row vs `player-history-stats.json` | **58,303** |
| Disagreements | **0** |
| Side-file rows with no row-side `extended` | **0** |

Three consequences:

1. **No loader is needed**, and no read of the 15.28 MB side file — so the
   prerender-vs-request-time hazard (TASK-M82/M92) never arises. `/leaderboards` is
   `force-static`, but it does not even need the big file.
2. **No row churn.** `players-*.json` (37.2 MB total) does not grow by a byte.
3. **Coverage is 2008+, not the ticket's 2010+** — the rows carry two seasons the side file
   does not.

This turns M83 from a data-plumbing ticket into a registry change. The remaining work is
the registry, the grouping, and the strings.

⚠️ **`player-history-stats.json` is now provably redundant for the app** — 100% duplicated
onto the rows. Deleting it would cut 15.28 MB of repo weight, but it may be the pipeline's
rebuild source. **Out of scope here**; it belongs to the pipeline repo as its own ticket.

## 1. Addressing an extended field

`LeaderboardCategory.key` is `keyof ComparisonMetrics` and `rankBy` reads `p.metrics[key]`.
It widens:

```ts
export type MetricKey =
  | Exclude<keyof ComparisonMetrics, "extended">
  | `extended.${Extract<keyof ExtendedMetrics, string>}`;
```

⛔ **The `Exclude` is load-bearing.** `"extended"` is itself a key of `ComparisonMetrics`,
so without it `key: "extended"` type-checks and `rankBy` sorts **objects** with `>` — which
does not throw, it just produces a meaningless order. The type is the only thing standing
between that and a shipped board.

`rankBy` gains one resolver:

```ts
const valueOf = (p: Player, key: MetricKey): unknown =>
  key.startsWith("extended.")
    ? p.metrics.extended?.[key.slice("extended.".length) as keyof ExtendedMetrics]
    : p.metrics[key as Exclude<keyof ComparisonMetrics, "extended">];
```

Everything downstream is unchanged — the existing filter already drops anything that is not
a positive number, so an absent `metrics.extended` yields no row rather than a crash or a
`NaN`.

**All 14 existing category entries stay exactly as written.** Widening the key rather than
restructuring the registry into a discriminated union is deliberate: the alternative edits
every line of a table that is otherwise correct, for no behavioural gain.

⚠️ `cat.key` is also the React key in `LeaderboardsIndex`. `"extended.touches"` keeps it
unique, and a test pins uniqueness across the registry.

## 2. Grouping

Each category gains a `group`:

```ts
type LeaderboardGroup = "overall" | "attacking" | "passing" | "defending" | "discipline";
```

⚠️ **Five groups, not four.** `appearances` belongs to none of the obvious four, and
forcing it into one would be a worse lie than giving it its own heading. All 22 boards are
assigned explicitly — a category without a group must not compile:

| Group | Boards |
| --- | --- |
| `overall` | appearances |
| `attacking` | goals · assists · shots on target · xG · xA · dribbles · **headed goals** · **left-footed goals** |
| `passing` | key passes · **touches** · **passes** |
| `defending` | clean sheets · saves · tackles · interceptions · **clearances** · **duels won** |
| `discipline` | yellow cards · red cards · **fouls won** · **offsides** |

(Bold = new in this ticket. 1 + 8 + 3 + 6 + 4 = 22.)

⚠️ `foulsWon` under `discipline` is the least obvious call: it is something a player
*earns* rather than commits. It sits there because the alternative is a sixth group for one
board, and it reads naturally beside offsides as the page's "everything else" tail.

`buildBoards` returns groups in display order instead of a flat list, and the page renders
an `<h2>` per group. The registry's existing comment already asserts this order
("attacking → keeping/defending → advanced → discipline"); this makes the structure visible
rather than implied.

⛔ **A group with no boards must not render its heading.** `buildBoards` already drops
boards with no rows; it must drop empty **groups** the same way, or every season from
1992–2007 gets four headings over nothing. This is the same class of bug as an
absent-vs-empty record: a heading asserts content exists.

## 3. The eight boards

Seven read from `extended`; one is already a base metric.

| Board | `key` | Non-null coverage |
| --- | --- | --- |
| Touches | `extended.touches` | 100% |
| Passes | `extended.totalPasses` | ~100% |
| **Duels won** | **`duelsWon`** (base metric) | existing |
| Clearances | `extended.clearances` | 91% |
| Fouls won | `extended.foulsWon` | 89% |
| Offsides | `extended.offsides` | 52% |
| Headed goals | `extended.headedGoals` | sparse by nature |
| Left-footed goals | `extended.leftFootGoals` | sparse by nature |

⚠️ **"Most duels won" needs no extended read at all.** `duelsWon` has been on
`ComparisonMetrics` all along and simply never had a board — worth stating because the
ticket lists it beside seven genuinely-extended stats.

⚠️ **The sparse coverage of headed and left-footed goals is not a data gap.** Most players
score none, so a zero is a real value; the percentages above count non-null, and a first
measurement that counted non-**zero** made those two look broken when they are not.

Their group assignment is in the table in §2, alongside the existing 14.

## 4. i18n and the OG card

42 new strings — 8 boards × (title + valueLabel) × 2 locales, plus **5** group headings × 2.
`i18n-catalog-parity.test.ts` already enforces en/ar parity, so a missing Arabic key fails
on its own without a new guard.

The registry's English `title` / `valueLabel` fields still feed
`/api/og/leaderboards`, which stays English by brand decision (TASK-1603). New categories
must set both the English literals and the message keys.

## 5. Testing

Extending `tests/unit/leaderboards-index.test.ts`:

- `rankBy` resolves an `extended.*` key against a row that has one
- `rankBy` returns **no row** — not `NaN`, not a throw — when `metrics.extended` is absent
- ⛔ a category keyed `"extended"` does not type-check (the §1 guard, asserted as a
  `@ts-expect-error`)
- every category `key` in the registry is unique
- **every category has a `group`, and every group in the union has ≥1 category** — the
  second half catches a heading that would render over nothing on every season
- **a 2005-shaped player set produces none of the eight boards AND no empty group heading**
- **a 2008-shaped player set does produce them** — the coverage bonus, asserted rather than
  assumed

⚠️ Per CLAUDE.md, a green suite is not evidence the code compiles and not evidence that
nothing changed. `pnpm type-check` is required, and the page should be looked at in both
locales before this is called done.

## Out of scope

- Deleting `player-history-stats.json` (pipeline's call — see above).
- Any change to `leaderboards-<season>.json` or `/api/leaderboards/[kind]`. That is a
  separate, older path serving four precomputed kinds; the `/leaderboards` page does not
  use it, and nothing here touches it.
- Adding extended stats to `/compare`. They are already reachable there via
  `metrics.extended`; whether to surface them is an editorial question, not this ticket.
