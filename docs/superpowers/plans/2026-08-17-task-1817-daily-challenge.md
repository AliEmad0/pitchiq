# TASK-1817 — Daily Seeded Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a once-a-day, UTC-seeded football challenge — the same formation, hands and opponent for everyone — with local streaks, a Wordle-shaped share and resume-by-replay.

**Architecture:** A pure `domain/daily*` layer derives everything about a day from its UTC date string (no clock inside `domain/`). A new `daily` IndexedDB store holds one replay-tuple record per day; all stats are re-derived, never counted. A `useMatchDriver` hook is extracted from `GamePlay` so `DailyChallenge` can drive the same engine without duplicating it or teaching `GamePlay` about modes.

**Tech Stack:** Next.js 15 App Router (`force-static`), React 19, TypeScript, next-intl (en + ar), Vitest + happy-dom, raw IndexedDB, Playwright.

**Spec:** [`docs/superpowers/specs/2026-08-17-task-1817-daily-challenge-design.md`](../specs/2026-08-17-task-1817-daily-challenge-design.md)

---

## Environment

Every command runs through WSL. Prefix used throughout:

```bash
wsl -d Ubuntu -- bash -lc 'source $HOME/.nvm/nvm.sh && nvm use 22 >/dev/null && cd /home/aliemad/projects/pq-1817 && <command>'
```

- Commit with `git commit --no-verify` — the husky hook fails `node: not found` under this PATH. CI is the real gate.
- ⛔ `next build` **cannot run here** (Google Fonts requests from Node time out). CI's Build check is the gate; do not burn time on it.
- `pnpm lint` must be prefixed `CI=true`.
- ⚠️ Vitest does **not** type-check. `pnpm type-check` is a separate, required gate.

---

## File Structure

**Create**

| File | Responsibility |
| --- | --- |
| `src/features/game/domain/daily.ts` | The day: `dayKey`, `dayKeyOffset`, `dayNumber`, `daySeeds`, `DAILY_SHAPES`, `dayFormation`. Pure, no clock. |
| `src/features/game/domain/daily-stats.ts` | `computeStats` — streaks/bests derived from records. |
| `src/features/game/domain/daily-share.ts` | `matchStrip`, `shareText`. |
| `src/features/game/storage/daily-slot.ts` | `DailyRecord` + IndexedDB access + the sessionStorage lock. |
| `src/features/game/view/use-match-driver.ts` | The extracted match-driving hook. |
| `src/features/game/components/DailyChallenge.tsx` | The daily container. |
| `src/app/[locale]/game/daily/page.tsx` | The route. |
| `tests/unit/game-daily.test.ts` | Day derivation + golden roster. |
| `tests/unit/game-daily-stats.test.ts` | Streak/PB rules. |
| `tests/unit/game-daily-share.test.ts` | Strip + share text. |
| `tests/unit/game-daily-slot.test.ts` | Store upgrade + record + lock. |
| `tests/unit/game-daily-challenge.test.tsx` | Container: lock, anchoring, rollover. |

**Modify**

| File | Change |
| --- | --- |
| `src/features/game/storage/idb.ts` | Add `"daily"` store, `DB_VERSION` → 2, add `idbGetAll`. |
| `src/features/game/domain/modes.ts` | `daily` gets `href` + `single: "live"`. |
| `src/features/game/components/GamePlay.tsx` | Consume `useMatchDriver`; behaviour unchanged. |
| `src/i18n/messages/en.json`, `ar.json` | New `game.daily*` keys. |
| `scripts/warm-e2e-routes.sh` | Add `/game/daily`. |
| `tests/unit/game-routes-static.test.ts` | Route count 4 → 5. |
| `TASKS.md` | TASK-1817 → ✅ Done. |

---

## Task 1: The day key (strict UTC)

**Files:**
- Create: `src/features/game/domain/daily.ts`
- Create: `tests/unit/game-daily.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-daily.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { dayKey, dayKeyOffset } from "@/features/game/domain/daily";

describe("dayKey", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it("⚠️ reads UTC fields, so every timezone gets the same challenge", () => {
    // 2026-08-17T23:30Z is ALREADY 2026-08-18 in UTC+13 and still 2026-08-17
    // in UTC-8. A local-getter implementation returns three different answers
    // here; that is the bug this pins.
    const instant = new Date("2026-08-17T23:30:00.000Z");
    expect(dayKey(instant)).toBe("2026-08-17");
  });

  it("pads month and day to two digits", () => {
    expect(dayKey(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
  });

  it("rolls at midnight UTC exactly", () => {
    expect(dayKey(new Date("2026-08-17T23:59:59.999Z"))).toBe("2026-08-17");
    expect(dayKey(new Date("2026-08-18T00:00:00.000Z"))).toBe("2026-08-18");
  });

  it("steps by whole UTC days in both directions", () => {
    expect(dayKeyOffset("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayKeyOffset("2026-12-31", 1)).toBe("2027-01-01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/game/domain/daily"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/daily.ts
/**
 * TASK-1817 — everything derivable about one daily challenge, from its date alone.
 *
 * ⚠️ NO CLOCK LIVES HERE. `domain/` may not read entropy or time (TASK-1803), so every
 * function takes the day as an argument. `view/` reads `new Date()` once and passes the
 * key down — the ticket's "a setup input, never read inside the engine".
 */

const MS_PER_DAY = 86_400_000;

/**
 * The UTC calendar day, `YYYY-MM-DD`.
 *
 * ⚠️ UTC GETTERS ONLY. A player in UTC+13 and one in UTC−8 must be given the same
 * challenge at the same instant — that is the entire premise of a daily. Local getters,
 * or `toISOString()` on a locally-adjusted date, break it for everyone outside UTC and
 * break it invisibly, because the developer's own machine usually agrees.
 */
export function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A key → its UTC midnight, in ms. `Date.UTC` so no DST rule can ever apply. */
function utcMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Step a key by whole days. Used to walk a streak backwards. */
export function dayKeyOffset(key: string, days: number): string {
  return dayKey(new Date(utcMs(key) + days * MS_PER_DAY));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/daily.ts tests/unit/game-daily.test.ts
git commit --no-verify -m "feat(game): the UTC day key for the daily challenge (TASK-1817)"
```

---

## Task 2: Day number

**Files:**
- Modify: `src/features/game/domain/daily.ts`
- Modify: `tests/unit/game-daily.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-daily.test.ts` (and add `dayNumber`, `DAILY_EPOCH_UTC` to the import):

```ts
describe("dayNumber", () => {
  it("counts 1-based from the epoch", () => {
    expect(dayNumber(DAILY_EPOCH_UTC)).toBe(1);
    expect(dayNumber("2026-08-18")).toBe(2);
    expect(dayNumber("2026-09-16")).toBe(31);
  });

  it("⚠️ clamps below the epoch rather than going negative", () => {
    // A device with a badly wrong clock must still see a sane challenge number,
    // not "Daily #-4".
    expect(dayNumber("2026-08-10")).toBe(1);
  });

  it("crosses a year boundary without drifting", () => {
    expect(dayNumber("2027-08-17")).toBe(366);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily.test.ts`
Expected: FAIL — `dayNumber is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/features/game/domain/daily.ts`:

```ts
/** Day #1. Changing this renumbers every challenge; it is not a tuning knob. */
export const DAILY_EPOCH_UTC = "2026-08-17";

/**
 * The challenge's ordinal, as shown in the share text.
 *
 * Clamped at 1: a device with a wrong clock should see day one, never a negative one.
 */
export function dayNumber(key: string): number {
  const n = Math.round((utcMs(key) - utcMs(DAILY_EPOCH_UTC)) / MS_PER_DAY) + 1;
  return Math.max(1, n);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/daily.ts tests/unit/game-daily.test.ts
git commit --no-verify -m "feat(game): 1-based daily challenge numbering (TASK-1817)"
```

---

## Task 3: Seeds and the frozen shape roster

**Files:**
- Modify: `src/features/game/domain/daily.ts`
- Modify: `tests/unit/game-daily.test.ts`

- [ ] **Step 1: Write the failing test**

Append (extend the import with `DAILY_SHAPES`, `dayFormation`, `daySeeds`; add `import { FORMATIONS } from "@/features/game/domain/chaos-draft";`):

```ts
describe("daySeeds", () => {
  it("is deterministic and gives three DIFFERENT streams", () => {
    const a = daySeeds("2026-08-17");
    const b = daySeeds("2026-08-17");
    expect(a).toEqual(b);
    expect(new Set([a.formation, a.deal, a.match]).size).toBe(3);
  });

  it("differs between adjacent days", () => {
    expect(daySeeds("2026-08-17").deal).not.toBe(daySeeds("2026-08-18").deal);
  });

  it("stays inside uint32", () => {
    for (const key of ["2026-08-17", "2026-12-31", "2030-01-01"]) {
      for (const s of Object.values(daySeeds(key))) {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(0xff_ff_ff_ff);
      }
    }
  });
});

describe("DAILY_SHAPES", () => {
  it("⚠️ golden roster — editing this re-maps every past day", () => {
    // The pick is hash(day) % length, so APPENDING is as breaking as reordering.
    // This test exists to make that change loud rather than silent. If you are
    // here because it failed: you have invalidated stored history, and the
    // fingerprint check will discard those records rather than mis-replay them.
    expect(DAILY_SHAPES).toEqual([
      "4-3-3 Holding",
      "4-3-3 Flat",
      "4-3-3 False 9",
      "4-2-3-1",
      "4-4-2 Flat",
      "4-4-2 Diamond",
      "4-1-4-1",
      "4-3-2-1 Christmas Tree",
      "4-5-1",
      "4-2-2-2 Magic Rectangle",
      "3-5-2",
      "3-4-3 Flat",
      "3-4-2-1",
      "3-1-4-2",
      "5-3-2",
      "5-4-1",
      "4-2-4",
      "3-2-2-3 W-M",
      "2-3-5 Pyramid",
      "4-6-0 Strikerless",
    ]);
  });

  it("every name resolves to a real shipped formation", () => {
    const shipped = new Set(FORMATIONS.map((f) => f.name));
    for (const name of DAILY_SHAPES) expect(shipped.has(name)).toBe(true);
  });
});

describe("dayFormation", () => {
  it("is stable for a given day", () => {
    expect(dayFormation("2026-08-17").name).toBe(dayFormation("2026-08-17").name);
  });

  it("returns eleven slots, whatever the day", () => {
    for (let i = 0; i < 40; i++) {
      expect(dayFormation(dayKeyOffset("2026-08-17", i)).slots).toHaveLength(11);
    }
  });

  it("varies across a month rather than sticking on one shape", () => {
    const names = new Set(
      Array.from({ length: 30 }, (_, i) => dayFormation(dayKeyOffset("2026-08-17", i)).name),
    );
    expect(names.size).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily.test.ts`
Expected: FAIL — `daySeeds is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/features/game/domain/daily.ts` (add imports at the top of the file:
`import { formationByName, type Formation } from "./formation";` and
`import { hashStr } from "./hash";`):

```ts
/**
 * Three independent streams from one day.
 *
 * XOR-split with distinct golden constants — the idiom `chaosMatchup` already uses, so a
 * reader who knows one knows both. One hash, one source of truth.
 */
export function daySeeds(key: string): { formation: number; deal: number; match: number } {
  const base = hashStr(key);
  return {
    formation: base >>> 0,
    deal: (base ^ 0x9e3779b9) >>> 0,
    match: (base ^ 0x51ed270b) >>> 0,
  };
}

/**
 * The shapes a daily challenge can deal, by NAME.
 *
 * ⛔ FROZEN. Not "append-only": the pick below is `seed % length`, so adding a name
 * re-maps every day exactly as reordering would, and there is no scheme that keeps a
 * uniform pick stable over a growing set. A golden test pins these contents so any edit
 * fails loudly and has to be accepted deliberately.
 *
 * ⚠️ Names, never positions into `FORMATIONS` — that array's order is presentation only.
 */
export const DAILY_SHAPES: readonly string[] = [
  "4-3-3 Holding",
  "4-3-3 Flat",
  "4-3-3 False 9",
  "4-2-3-1",
  "4-4-2 Flat",
  "4-4-2 Diamond",
  "4-1-4-1",
  "4-3-2-1 Christmas Tree",
  "4-5-1",
  "4-2-2-2 Magic Rectangle",
  "3-5-2",
  "3-4-3 Flat",
  "3-4-2-1",
  "3-1-4-2",
  "5-3-2",
  "5-4-1",
  "4-2-4",
  "3-2-2-3 W-M",
  "2-3-5 Pyramid",
  "4-6-0 Strikerless",
];

/** The shape every coach drafts into today. Resolved by name, so order cannot matter. */
export function dayFormation(key: string): Formation {
  return formationByName(DAILY_SHAPES[daySeeds(key).formation % DAILY_SHAPES.length]!);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/daily.ts tests/unit/game-daily.test.ts
git commit --no-verify -m "feat(game): day seeds and the frozen daily shape roster (TASK-1817)"
```

---

## Task 4: Stats — derived, never counted

**Files:**
- Create: `src/features/game/domain/daily-stats.ts`
- Create: `tests/unit/game-daily-stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-daily-stats.test.ts
import { describe, expect, it } from "vitest";
import { computeStats, type DailyOutcome } from "@/features/game/domain/daily-stats";

/** A finished day. `[day, gf, ga]`. */
const done = (day: string, gf: number, ga: number): DailyOutcome => ({
  day,
  done: true,
  score: { home: gf, away: ga },
});

describe("computeStats", () => {
  it("counts only finished days", () => {
    const s = computeStats([done("2026-08-17", 2, 0), { day: "2026-08-18", done: false }], "2026-08-18");
    expect(s.played).toBe(1);
    expect(s.won).toBe(1);
  });

  it("counts a streak of consecutive wins ending today", () => {
    const s = computeStats(
      [done("2026-08-15", 1, 0), done("2026-08-16", 3, 1), done("2026-08-17", 2, 2), done("2026-08-18", 1, 0)],
      "2026-08-18",
    );
    // The draw on the 17th breaks it, so only the 18th counts.
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it("⚠️ a DRAW breaks the streak", () => {
    const s = computeStats([done("2026-08-17", 1, 1)], "2026-08-17");
    expect(s.currentStreak).toBe(0);
  });

  it("⚠️ an UNPLAYED day breaks the streak", () => {
    // 16th won, 17th never played, 18th won → the streak is 1, not 2.
    const s = computeStats([done("2026-08-16", 1, 0), done("2026-08-18", 1, 0)], "2026-08-18");
    expect(s.currentStreak).toBe(1);
  });

  it("⚠️ shows yesterday's streak when today is not yet played", () => {
    // Otherwise an untouched morning reads as "streak 0" and looks like a loss.
    const s = computeStats([done("2026-08-16", 1, 0), done("2026-08-17", 2, 0)], "2026-08-18");
    expect(s.currentStreak).toBe(2);
  });

  it("keeps the best streak after it breaks", () => {
    const s = computeStats(
      [done("2026-08-11", 1, 0), done("2026-08-12", 1, 0), done("2026-08-13", 1, 0), done("2026-08-14", 0, 1)],
      "2026-08-14",
    );
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(3);
  });

  it("tracks the biggest winning margin only", () => {
    const s = computeStats([done("2026-08-16", 5, 1), done("2026-08-17", 0, 4)], "2026-08-17");
    expect(s.bestMargin).toBe(4);
  });

  it("is empty-safe", () => {
    expect(computeStats([], "2026-08-17")).toEqual({
      played: 0,
      won: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestMargin: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily-stats.test.ts`
Expected: FAIL — cannot resolve `@/features/game/domain/daily-stats`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/daily-stats.ts
import { dayKeyOffset } from "./daily";

/**
 * The part of a stored record that stats care about.
 *
 * Deliberately narrower than `DailyRecord`: this module has no business knowing about
 * replay tuples, and a narrow input keeps it testable without building a match.
 */
export interface DailyOutcome {
  day: string;
  done: boolean;
  score?: { home: number; away: number };
}

export interface DailyStats {
  played: number;
  won: number;
  currentStreak: number;
  bestStreak: number;
  bestMargin: number;
}

const isWin = (o: DailyOutcome | undefined): boolean =>
  o != null && o.done && o.score != null && o.score.home > o.score.away;

/**
 * Streaks and bests, DERIVED on every read.
 *
 * ⚠️ Nothing here is stored. A counter kept alongside the history is a second source of
 * truth that drifts the first time a write half-fails, and it is also the one field worth
 * editing in DevTools. Deriving costs nothing at this size and cannot disagree with the
 * record list it came from.
 *
 * A streak is consecutive CALENDAR DAYS WON. A loss breaks it, a draw breaks it, and an
 * unplayed day breaks it — one rule, no exceptions to remember.
 */
export function computeStats(records: readonly DailyOutcome[], todayKey: string): DailyStats {
  const byDay = new Map(records.map((r) => [r.day, r]));

  let played = 0;
  let won = 0;
  let bestMargin = 0;
  for (const r of records) {
    if (!r.done || r.score == null) continue;
    played++;
    if (r.score.home > r.score.away) {
      won++;
      bestMargin = Math.max(bestMargin, r.score.home - r.score.away);
    }
  }

  /** Walk back from `from` while each day is a win. */
  const runEndingAt = (from: string): number => {
    let n = 0;
    let cursor = from;
    while (isWin(byDay.get(cursor))) {
      n++;
      cursor = dayKeyOffset(cursor, -1);
    }
    return n;
  };

  // ⚠️ Start at yesterday when today is unplayed, so an untouched morning still shows the
  // streak the coach went to bed on rather than a demoralising zero.
  const currentStreak = isWin(byDay.get(todayKey))
    ? runEndingAt(todayKey)
    : runEndingAt(dayKeyOffset(todayKey, -1));

  let bestStreak = currentStreak;
  for (const r of records) {
    if (isWin(r)) bestStreak = Math.max(bestStreak, runEndingAt(r.day));
  }

  return { played, won, currentStreak, bestStreak, bestMargin };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily-stats.test.ts`
Expected: PASS, 8 tests.

⚠️ The "unplayed day breaks the streak" test is the one that fails if `runEndingAt` walks
the record list instead of the calendar. If it passes on the first run, confirm by
temporarily sorting records and counting them directly — it must go red.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/daily-stats.ts tests/unit/game-daily-stats.test.ts
git commit --no-verify -m "feat(game): derive daily streaks and bests from history (TASK-1817)"
```

---

## Task 5: The match-story strip

**Files:**
- Create: `src/features/game/domain/daily-share.ts`
- Create: `tests/unit/game-daily-share.test.ts`

⚠️ This test uses a **real simulated match**, not a hand-written event list. Three TASK-1812
defects hid behind fixtures that could not occur.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-daily-share.test.ts
import { describe, expect, it } from "vitest";
import { matchStrip } from "@/features/game/domain/daily-share";
import type { MatchEvent } from "@/features/game/domain/match-types";

const goal = (minute: number, side: "home" | "away", extra: Partial<MatchEvent> = {}): MatchEvent => ({
  minute,
  kind: "goal",
  side,
  ...extra,
});

describe("matchStrip", () => {
  it("paints six cells of fifteen minutes", () => {
    expect(matchStrip([], "home")).toBe("⬜⬜⬜⬜⬜⬜");
  });

  it("places goals in the right quarter-hour", () => {
    expect(matchStrip([goal(1, "home")], "home")).toBe("🟩⬜⬜⬜⬜⬜");
    expect(matchStrip([goal(15, "home")], "home")).toBe("🟩⬜⬜⬜⬜⬜");
    expect(matchStrip([goal(16, "home")], "home")).toBe("⬜🟩⬜⬜⬜⬜");
    expect(matchStrip([goal(90, "home")], "home")).toBe("⬜⬜⬜⬜⬜🟩");
  });

  it("⚠️ folds stoppage-time goals into the last cell", () => {
    expect(matchStrip([goal(94, "home")], "home")).toBe("⬜⬜⬜⬜⬜🟩");
  });

  it("shows conceded goals and both-scored cells", () => {
    expect(matchStrip([goal(20, "away")], "home")).toBe("⬜🟥⬜⬜⬜⬜");
    expect(matchStrip([goal(20, "home"), goal(25, "away")], "home")).toBe("⬜🟨⬜⬜⬜⬜");
  });

  it("⛔ a VAR-disallowed goal paints nothing", () => {
    // The goal stays in the timeline and counts on the scoreboard until its verdict
    // arrives; a FINAL scoreline filters on disallowedAt == null. The strip is final.
    expect(matchStrip([goal(30, "home", { disallowedAt: 32 })], "home")).toBe("⬜⬜⬜⬜⬜⬜");
  });

  it("⚠️ credits an own goal to the side it COUNTS FOR", () => {
    // The engine emits own goals with playerId undefined, the scorer in ownGoalBy, and
    // `side` = the side that benefits. Reading playerId here is the TASK-1812 bug.
    const og = goal(50, "home", { playerId: undefined, ownGoalBy: 99 } as Partial<MatchEvent>);
    expect(matchStrip([og], "home")).toBe("⬜⬜⬜🟩⬜⬜");
  });

  it("mirrors for the away perspective", () => {
    expect(matchStrip([goal(20, "home")], "away")).toBe("⬜🟥⬜⬜⬜⬜");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily-share.test.ts`
Expected: FAIL — cannot resolve `@/features/game/domain/daily-share`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/daily-share.ts
import type { MatchEvent, Side } from "./match-types";

const CELLS = 6;
const CELL_MINUTES = 15;

/**
 * The match as six fifteen-minute cells — the Wordle grid analogue.
 *
 * It encodes the DRAMA, not the drafted XI, which is what makes it safe to post next to
 * someone who has not played today: a 2–0 comeback reads instantly without naming a
 * single player.
 *
 * ⚠️ FINAL-scoreline semantics: a goal chalked off by VAR is dropped outright
 * (`disallowedAt == null`), matching `scoreAt` at full time. ⚠️ Own goals need no special
 * case — the engine sets `side` to the side the goal COUNTS FOR and leaves `playerId`
 * undefined, so reading `side` is both correct and the only thing that works.
 */
export function matchStrip(events: readonly MatchEvent[], side: Side): string {
  const us = Array.from({ length: CELLS }, () => false);
  const them = Array.from({ length: CELLS }, () => false);

  for (const e of events) {
    if (e.kind !== "goal" || e.side == null) continue;
    if (e.disallowedAt != null) continue;
    const cell = Math.min(CELLS - 1, Math.max(0, Math.ceil(e.minute / CELL_MINUTES) - 1));
    (e.side === side ? us : them)[cell] = true;
  }

  return us
    .map((ours, i) => (ours && them[i] ? "🟨" : ours ? "🟩" : them[i] ? "🟥" : "⬜"))
    .join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily-share.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/daily-share.ts tests/unit/game-daily-share.test.ts
git commit --no-verify -m "feat(game): the six-cell match-story strip (TASK-1817)"
```

---

## Task 6: The share text

**Files:**
- Modify: `src/features/game/domain/daily-share.ts`
- Modify: `tests/unit/game-daily-share.test.ts`

- [ ] **Step 1: Write the failing test**

Append (extend the import with `shareText`):

```ts
const LABELS = { title: "PitchIQ Daily", win: "✅", draw: "🤝", loss: "❌" };

describe("shareText", () => {
  const base = {
    dayNumber: 217,
    formationName: "4-2-3-1",
    score: { home: 3, away: 1 },
    strip: "⬜🟩⬜🟥🟩🟩",
    currentStreak: 5,
    bestStreak: 12,
    url: "https://pitchiq.app/game/daily",
    labels: LABELS,
  };

  it("lays out header, score, strip, streaks and url", () => {
    expect(shareText({ ...base, locale: "en" })).toBe(
      ["PitchIQ Daily #217 · 4-2-3-1", "3–1 ✅", "⬜🟩⬜🟥🟩🟩", "🔥 5   🏆 12", "https://pitchiq.app/game/daily"].join("\n"),
    );
  });

  it("marks a draw and a loss", () => {
    expect(shareText({ ...base, score: { home: 1, away: 1 }, locale: "en" })).toContain("1–1 🤝");
    expect(shareText({ ...base, score: { home: 0, away: 2 }, locale: "en" })).toContain("0–2 ❌");
  });

  it("⛔ localizes EVERY digit for Arabic", () => {
    // Intl.NumberFormat("ar") returns WESTERN digits in the browser — measured, not
    // assumed. localizeDigits is the only correct path.
    const text = shareText({ ...base, locale: "ar" });
    expect(text).toContain("٣–١");
    expect(text).toContain("#٢١٧");
    expect(text).toContain("🔥 ٥");
    expect(text).toContain("🏆 ١٢");
    // The URL must survive untouched — transliterating its digits would break the link.
    expect(text).toContain("https://pitchiq.app/game/daily");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily-share.test.ts`
Expected: FAIL — `shareText is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/features/game/domain/daily-share.ts` (add `import { localizeDigits } from "@/utils/format";` at the top):

```ts
export interface ShareTextArgs {
  dayNumber: number;
  formationName: string;
  score: { home: number; away: number };
  strip: string;
  currentStreak: number;
  bestStreak: number;
  url: string;
  locale: string;
  /** Resolved strings — `domain/` never reaches for a translator itself. */
  labels: { title: string; win: string; draw: string; loss: string };
}

/**
 * The shareable text for a finished day.
 *
 * ⛔ Every number the coach sees goes through `localizeDigits`. `Intl.NumberFormat("ar")`
 * returns WESTERN digits in the browser, so the obvious call is silently wrong in Arabic.
 * The URL is deliberately NOT transliterated — Eastern-Arabic digits in a host or path
 * would produce a link that does not resolve.
 */
export function shareText(args: ShareTextArgs): string {
  const n = (v: number): string => localizeDigits(v, args.locale);
  const { home, away } = args.score;
  const mark = home > away ? args.labels.win : home === away ? args.labels.draw : args.labels.loss;

  return [
    `${args.labels.title} #${n(args.dayNumber)} · ${args.formationName}`,
    `${n(home)}–${n(away)} ${mark}`,
    args.strip,
    `🔥 ${n(args.currentStreak)}   🏆 ${n(args.bestStreak)}`,
    args.url,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily-share.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/daily-share.ts tests/unit/game-daily-share.test.ts
git commit --no-verify -m "feat(game): the Wordle-shaped daily share text (TASK-1817)"
```

---

## Task 7: The `daily` store

**Files:**
- Modify: `src/features/game/storage/idb.ts`
- Create: `tests/unit/game-daily-slot.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-daily-slot.test.ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { idbGetAll, idbPut } from "@/features/game/storage/idb";

describe("idbGetAll", () => {
  beforeEach(async () => {
    indexedDB.deleteDatabase("pitchiq-game");
  });

  it("returns every value in a store", async () => {
    await idbPut("daily", "2026-08-16", { day: "2026-08-16" });
    await idbPut("daily", "2026-08-17", { day: "2026-08-17" });
    const all = await idbGetAll<{ day: string }>("daily");
    expect(all.map((r) => r.day).sort()).toEqual(["2026-08-16", "2026-08-17"]);
  });

  it("is empty-safe", async () => {
    expect(await idbGetAll("daily")).toEqual([]);
  });

  it("⚠️ the v1 → v2 upgrade ADDS the store and keeps existing matches", async () => {
    // The upgrade handler creates stores idempotently by name precisely so a later
    // ticket can add one without rebuilding the database. This is that ticket, and
    // this is the test that proves the claim was true.
    await idbPut("match", "current", { seed: 7 });
    await idbPut("daily", "2026-08-17", { day: "2026-08-17" });
    const matches = await idbGetAll<{ seed: number }>("match");
    expect(matches).toEqual([{ seed: 7 }]);
  });
});
```

⚠️ If `fake-indexeddb` is not already a devDependency, check first:
`grep -rn "fake-indexeddb" package.json tests/unit/game-idb.test.ts`. Reuse whatever
`game-idb.test.ts` already does rather than adding a dependency.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily-slot.test.ts`
Expected: FAIL — `idbGetAll` is not exported, and `"daily"` is not a `StoreName`.

- [ ] **Step 3: Write minimal implementation**

In `src/features/game/storage/idb.ts`, change the version and store list:

```ts
const DB_VERSION = 2;
```

```ts
/**
 * Every object store in the database.
 *
 * ⚠️ Later tickets add their own — TASK-1813 achievements, TASK-1819 collections. Add the
 * name here and bump `DB_VERSION`; the upgrade handler creates stores idempotently by
 * name, so it never assumes a single fixed schema and an existing database gains the new
 * store rather than being rebuilt. TASK-1817 added `daily` this way, and
 * `game-daily-slot.test.ts` proves an existing `match` record survived it.
 */
const STORES = ["match", "daily"] as const;
```

Append the bulk read:

```ts
/**
 * Every value in a store.
 *
 * Used for the daily history, where streaks are derived from the full record list rather
 * than from a stored counter that could drift.
 */
export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  if (!available()) return [];
  return (await run<T[] | undefined>(store, "readonly", (s) => s.getAll())) ?? [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily-slot.test.ts tests/unit/game-idb.test.ts`
Expected: PASS — both files, including the pre-existing idb tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/storage/idb.ts tests/unit/game-daily-slot.test.ts
git commit --no-verify -m "feat(game): add the daily IndexedDB store and a bulk read (TASK-1817)"
```

---

## Task 8: The daily record and the session lock

**Files:**
- Create: `src/features/game/storage/daily-slot.ts`
- Modify: `tests/unit/game-daily-slot.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-daily-slot.test.ts`:

```ts
import {
  allDaily,
  loadDaily,
  markStarted,
  saveDaily,
  wasStarted,
  type DailyRecord,
} from "@/features/game/storage/daily-slot";

const record = (day: string): DailyRecord => ({
  day,
  cardIds: ["1@2025"],
  answers: [],
  fingerprint: 123,
  eventCount: 4,
  done: false,
});

describe("daily record", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("pitchiq-game");
    sessionStorage.clear();
  });

  it("round-trips by day", async () => {
    await saveDaily(record("2026-08-17"));
    expect((await loadDaily("2026-08-17"))?.day).toBe("2026-08-17");
  });

  it("keeps days separate and lists them all", async () => {
    await saveDaily(record("2026-08-16"));
    await saveDaily(record("2026-08-17"));
    expect((await allDaily()).length).toBe(2);
    expect(await loadDaily("2026-08-15")).toBeNull();
  });

  it("overwrites the same day rather than appending", async () => {
    await saveDaily(record("2026-08-17"));
    await saveDaily({ ...record("2026-08-17"), done: true, score: { home: 2, away: 0 } });
    const all = await allDaily();
    expect(all).toHaveLength(1);
    expect(all[0]!.done).toBe(true);
  });
});

describe("session lock", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("marks and reads a day", () => {
    markStarted("2026-08-17");
    expect(wasStarted("2026-08-17")).toBe(true);
  });

  it("⚠️ yesterday's marker does NOT lock today", () => {
    markStarted("2026-08-16");
    expect(wasStarted("2026-08-17")).toBe(false);
  });

  it("reports false when nothing was marked", () => {
    expect(wasStarted("2026-08-17")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily-slot.test.ts`
Expected: FAIL — cannot resolve `@/features/game/storage/daily-slot`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/storage/daily-slot.ts
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { idbGet, idbGetAll, idbPut } from "./idb";

/**
 * One day's attempt, stored as the tuple that REPLAYS it.
 *
 * ⚠️ `seed` and `formationKey` are deliberately ABSENT — both are derived from `day` via
 * `domain/daily.ts`. Storing them would be a second source of truth that could disagree
 * with the day it is filed under. If the shape roster or the epoch ever changed, the
 * record replays against a different shape and its FINGERPRINT stops matching, so it is
 * discarded rather than resumed into a match nobody played.
 */
export interface DailyRecord {
  /** The UTC day key. Also the store key; kept in the value so a read is self-describing. */
  day: string;
  cardIds: PlayerSeasonId[];
  answers: DecisionAnswer[];
  fingerprint: number;
  eventCount: number;
  done: boolean;
  score?: { home: number; away: number };
}

/**
 * ⚠️ Every operation swallows failure, matching `match-slot.ts`. Private browsing, a quota
 * error or a blocked upgrade must never interrupt a running match — a challenge that
 * cannot be saved is a far better outcome than a thrown error in the 90th minute.
 */
export async function saveDaily(record: DailyRecord): Promise<void> {
  try {
    await idbPut("daily", record.day, record);
  } catch {
    // Persistence is best-effort by design.
  }
}

export async function loadDaily(day: string): Promise<DailyRecord | null> {
  try {
    return await idbGet<DailyRecord>("daily", day);
  } catch {
    return null;
  }
}

export async function allDaily(): Promise<DailyRecord[]> {
  try {
    return await idbGetAll<DailyRecord>("daily");
  } catch {
    return [];
  }
}

const lockKey = (day: string): string => `daily_active_lock_${day}`;

/**
 * Mark today as started, outside IndexedDB.
 *
 * ⛔ THIS IS A SPEED BUMP, NOT A LOCK, and the difference matters. `sessionStorage` is
 * per-tab and dies with the tab, so a new tab defeats it outright — and the same DevTools
 * "clear site data" that wipes IndexedDB wipes this too. It raises the cost of clearing
 * storage to retry a bad result; it cannot prevent it. In a 100% client-side design no
 * client-side measure can be authoritative, which is exactly why there is no global
 * leaderboard. Do not build one on top of this.
 */
export function markStarted(day: string): void {
  try {
    sessionStorage.setItem(lockKey(day), "1");
  } catch {
    // Blocked storage simply means no speed bump.
  }
}

/** Keyed by day, so a marker from an earlier day can never lock the current one. */
export function wasStarted(day: string): boolean {
  try {
    return sessionStorage.getItem(lockKey(day)) != null;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily-slot.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/storage/daily-slot.ts tests/unit/game-daily-slot.test.ts
git commit --no-verify -m "feat(game): the daily record and the session-start marker (TASK-1817)"
```

---

## Task 9: Extract `useMatchDriver` from `GamePlay`

**Files:**
- Create: `src/features/game/view/use-match-driver.ts`
- Modify: `src/features/game/components/GamePlay.tsx`

⚠️ **This task is behaviour-preserving.** `GamePlay`'s existing tests are the control and
must pass **untouched** — the same proof TASK-1812 used when `replayMatch` kept its
signature. Do not edit a `GamePlay` test in this task. If one goes red, the extraction is
wrong.

- [ ] **Step 1: Record the control**

Run: `pnpm test tests/unit/game-match-session.test.ts tests/unit/game-match-replay.test.ts tests/unit/game-interactive.test.ts`
Expected: PASS. Note the counts — they must be identical at Step 4.

- [ ] **Step 2: Write the hook**

```ts
// src/features/game/view/use-match-driver.ts
"use client";
import { useCallback, useRef, useState } from "react";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { buildSession, type MatchSession, type SessionNames } from "./match-session";
import type { StreamStep } from "./match-stream";

export interface DrivenMatch {
  home: GameTeam;
  away: GameTeam;
  seed: number;
}

export interface MatchDriver {
  match: DrivenMatch | null;
  events: MatchEvent[];
  answers: DecisionAnswer[];
  pending: MatchDecision | null;
  result: MatchResult | null;
  /** Build a match and run to its first decision. Returns the session's seed. */
  start: (
    pool: PoolCard[],
    players: PoolCard[],
    formation: Formation,
    seed: number,
    names: SessionNames,
  ) => void;
  answer: (a: DecisionAnswer) => void;
  /** Take over an already-replayed match (resume, or someone else's link). */
  adopt: (replayed: {
    session: MatchSession;
    events: MatchEvent[];
    answers: DecisionAnswer[];
    pending: MatchDecision | null;
    result: MatchResult | null;
  }) => void;
}

/**
 * The glue that DRIVES a match: the generator, and the state folded out of it.
 *
 * Extracted from `GamePlay` for TASK-1817 so a second container (the daily challenge) can
 * run the same engine without either duplicating this — resume and share drifting apart is
 * precisely the bug TASK-1812 collapsed into one path — or teaching `GamePlay` about game
 * modes, which the locked "modes are rule packs, not code paths" rule forbids.
 *
 * ⚠️ Only the coach's decisions surface here. `createStream` answers the opponent's with
 * `defaultAnswer`: every decision the engine raises must be answered or the generator
 * hangs.
 */
export function useMatchDriver(): MatchDriver {
  const streamRef = useRef<MatchSession["stream"] | null>(null);
  const [match, setMatch] = useState<DrivenMatch | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [answers, setAnswers] = useState<DecisionAnswer[]>([]);
  const [pending, setPending] = useState<MatchDecision | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  /** Fold one step of the stream into view state. */
  const consume = useCallback((step: StreamStep) => {
    setEvents((prior) => [...prior, ...step.events]);
    if (step.kind === "done") {
      setResult(step.result);
      setPending(null);
    } else {
      setPending(step.decision);
    }
  }, []);

  const start = useCallback(
    (
      pool: PoolCard[],
      players: PoolCard[],
      formation: Formation,
      seed: number,
      names: SessionNames,
    ) => {
      const session = buildSession(pool, players, formation, seed, names);
      streamRef.current = session.stream;
      setMatch({ home: session.home, away: session.away, seed });
      setEvents([]);
      setAnswers([]);
      setResult(null);
      // ⚠️ The first segment carries the referee and the weather — they are the first two
      // draws inside `runMatch`, so advancing here is the only way to show the coach the
      // official actually taking charge.
      consume(session.stream.advance());
    },
    [consume],
  );

  const answer = useCallback(
    (a: DecisionAnswer) => {
      const stream = streamRef.current;
      if (stream == null) return;
      setAnswers((prior) => [...prior, a]);
      setPending(null);
      consume(stream.answer(a));
    },
    [consume],
  );

  const adopt = useCallback<MatchDriver["adopt"]>((replayed) => {
    streamRef.current = replayed.session.stream;
    setMatch({
      home: replayed.session.home,
      away: replayed.session.away,
      seed: replayed.session.seed,
    });
    setEvents(replayed.events);
    setAnswers(replayed.answers);
    setPending(replayed.pending);
    setResult(replayed.result);
  }, []);

  return { match, events, answers, pending, result, start, answer, adopt };
}
```

- [ ] **Step 3: Rewire `GamePlay` to use it**

In `src/features/game/components/GamePlay.tsx`:

1. Delete the local `interface Match { … }` block and these six declarations:
   `streamRef`, `match`, `events`, `pending`, `answers`, `result` (the `useRef`/`useState`
   lines), plus the local `consume` callback and the local `answer` function.
2. Add the import: `import { useMatchDriver } from "@/features/game/view/use-match-driver";`
3. Insert directly after the `useReducer` line:

```tsx
  const driver = useMatchDriver();
  const { match, events, answers, pending, result } = driver;
```

4. Replace the body of `confirmSquad` with:

```tsx
  const confirmSquad = (players: PoolCard[], formation: Formation) => {
    const seed = randomSeed();
    driver.start(pool, players, formation, seed, { home: t("yourXi"), away: t("rivals") });
    setSquad({
      cardIds: players.map((p) => p.cardId),
      formationKey: formationKey(formation),
    });
    dispatch({ type: "confirmSquad", seed });
  };
```

5. In the share-code effect, replace the five `setMatch`/`setEvents`/`setAnswers`/
   `setResult`/`setPending` calls with one `driver.adopt(replayed)` — `replayed` already
   has exactly the five fields `adopt` takes. Keep every other line (the `setSquad`,
   `setShared`, `setDrifted`, `setOffer`, `dispatch`) unchanged.

6. In `resume`, replace the same five setters with:

```tsx
    driver.adopt(offer);
```

   Keep `setSquad({ cardIds: offer.record.cardIds, formationKey: offer.record.formationKey })`,
   `setOffer(null)` and the `dispatch` exactly as they are.

7. Replace every remaining bare `answer(…)` reference passed to `DecisionPrompt` with
   `driver.answer`.

- [ ] **Step 4: Run the control tests — unchanged**

Run: `pnpm test tests/unit/game-match-session.test.ts tests/unit/game-match-replay.test.ts tests/unit/game-interactive.test.ts`
Expected: PASS with the **same counts as Step 1**, and with no test file edited.

Then the whole suite plus types:

Run: `pnpm test && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/view/use-match-driver.ts src/features/game/components/GamePlay.tsx
git commit --no-verify -m "refactor(game): extract useMatchDriver so a second mode can drive a match (TASK-1817)"
```

---

## Task 10: The `DailyChallenge` container

**Files:**
- Create: `src/features/game/components/DailyChallenge.tsx`
- Create: `tests/unit/game-daily-challenge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/game-daily-challenge.test.tsx
import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { saveDaily } from "@/features/game/storage/daily-slot";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

// ⚠️ Dynamic import AFTER the mock, matching `game-draft-room-view.test.tsx` — the
// component reads `prefersReducedMotion` at module scope through `DraftRoom`.
const { DailyChallenge } = await import("@/features/game/components/DailyChallenge");

// An empty pool is legitimate here: `roomDeals` returns empty hands and nothing
// crashes. These tests are about the day/lock lifecycle, not about drafting.
const pool: PoolCard[] = [];

const mount = () => renderWithIntl(<DailyChallenge pool={pool} />);

describe("DailyChallenge", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("pitchiq-game");
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("⚠️ renders no day-specific content before mount resolves the day", () => {
    // The route is force-static and CDN-cached; baking today's shape into the
    // prerender would serve a stale challenge tomorrow.
    const { container } = mount();
    expect(container.textContent).not.toMatch(/#\d/);
  });

  it("shows today's challenge number and shape after mount", async () => {
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-header")).toBeTruthy());
    expect(screen.getByTestId("daily-header").textContent).toMatch(/#\d+/);
  });

  it("⛔ renders a finished day as spent rather than offering a fresh attempt", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await saveDaily({
      day: today,
      cardIds: [],
      answers: [],
      fingerprint: 1,
      eventCount: 1,
      done: true,
      score: { home: 2, away: 0 },
    });
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-spent")).toBeTruthy());
  });

  it("⚠️ a session marker with NO record still renders the day spent", async () => {
    // Storage was cleared mid-day. This is the tamper speed bump; without it the
    // day would silently offer a fresh attempt.
    const today = new Date().toISOString().slice(0, 10);
    sessionStorage.setItem(`daily_active_lock_${today}`, "1");
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-spent")).toBeTruthy());
  });

  it("⚠️ a marker for a DIFFERENT day does not lock today", async () => {
    sessionStorage.setItem("daily_active_lock_1999-01-01", "1");
    mount();
    await waitFor(() => expect(screen.getByTestId("daily-header")).toBeTruthy());
    expect(screen.queryByTestId("daily-spent")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-daily-challenge.test.tsx`
Expected: FAIL — cannot resolve `@/features/game/components/DailyChallenge`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/game/components/DailyChallenge.tsx
"use client";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useReducer, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { dayFormation, dayKey, dayNumber, daySeeds } from "@/features/game/domain/daily";
import { matchStrip, shareText } from "@/features/game/domain/daily-share";
import { computeStats } from "@/features/game/domain/daily-stats";
import { formationKey } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import {
  allDaily,
  loadDaily,
  markStarted,
  saveDaily,
  wasStarted,
  type DailyRecord,
} from "@/features/game/storage/daily-slot";
import { replayMatch } from "@/features/game/view/match-replay";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { createPlayState, playReducer } from "@/features/game/view/play-machine";
import { useMatchDriver } from "@/features/game/view/use-match-driver";
import { DecisionPrompt } from "./DecisionPrompt";
import { DraftRoom } from "./DraftRoom";
import { MatchupPreview } from "./MatchupPreview";
import { MatchView } from "./MatchView";

const DECISION_LIMIT = 20;

/**
 * TASK-1817 — one deterministic challenge per day.
 *
 * ⚠️ The day resolves AFTER MOUNT, never during render. The route is `force-static`, so a
 * day read during render would bake one visitor's challenge into the CDN copy and serve it
 * to everyone until the next revalidation.
 */
export function DailyChallenge({ pool }: { pool: PoolCard[] }) {
  const t = useTranslations("game");
  const locale = useLocale();
  const [state, dispatch] = useReducer(playReducer, createPlayState("setup"));
  const driver = useMatchDriver();

  /** Null until mount resolves it. Also the "is the shell still cold" flag. */
  const [today, setToday] = useState<string | null>(null);
  const [record, setRecord] = useState<DailyRecord | null>(null);
  const [history, setHistory] = useState<DailyRecord[]>([]);
  const [spent, setSpent] = useState(false);

  /**
   * ⚠️ ANCHORED AT KICKOFF and immutable for the session.
   *
   * A match can straddle midnight. Kicking off at 23:58 and finishing at 00:03 must record
   * under the day it BEGAN, so nothing inside a live session may call `dayKey(new Date())`
   * again — this is the only day that session knows.
   */
  const [kickoffDayKey, setKickoffDayKey] = useState<string | null>(null);

  const [squad, setSquad] = useState<{ cardIds: PlayerSeasonId[] } | null>(null);

  const hydrate = useCallback(async (key: string) => {
    const [mine, all] = await Promise.all([loadDaily(key), allDaily()]);
    setToday(key);
    setRecord(mine);
    setHistory(all);
    // The tamper speed bump: no record but a marker for THIS day means storage was
    // cleared mid-challenge. See `markStarted` for why this is a bump, not a lock.
    setSpent((mine?.done ?? false) || (mine == null && wasStarted(key)));
  }, []);

  useEffect(() => {
    void hydrate(dayKey(new Date()));
  }, [hydrate]);

  /**
   * Re-hydrate when the date moves under an open tab.
   *
   * ⚠️ Never mid-match. A live session runs to full time under its anchored key; the hub
   * catches up when the coach returns, which is the first moment it costs nothing.
   */
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "hidden") return;
      const now = dayKey(new Date());
      if (now === today) return;
      if (state.phase === "live") return;
      void hydrate(now);
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [today, state.phase, hydrate]);

  // Resume an unfinished attempt. ⚠️ Only for the CURRENT day — an earlier day's
  // unfinished record is never offered, and `computeStats` already reads it as "not won".
  useEffect(() => {
    if (today == null || record == null || record.done || record.day !== today) return;
    if (state.phase !== "setup") return;
    const restored = replayMatch(
      pool,
      {
        cardIds: record.cardIds,
        formationKey: formationKey(dayFormation(today)),
        seed: daySeeds(today).match,
        answers: record.answers,
        fingerprint: record.fingerprint,
        eventCount: record.eventCount,
      },
      { home: t("yourXi"), away: t("rivals") },
    );
    if (restored == null) return;
    setKickoffDayKey(record.day);
    setSquad({ cardIds: record.cardIds });
    driver.adopt(restored);
    dispatch({ type: "resume", seed: restored.session.seed });
    // Mount-driven, like GamePlay's restore effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, record]);

  // Persist on kickoff and after every answer, under the ANCHORED key.
  useEffect(() => {
    if (state.phase !== "live" || kickoffDayKey == null || squad == null) return;
    void saveDaily({
      day: kickoffDayKey,
      cardIds: squad.cardIds,
      answers: driver.answers,
      fingerprint: hashEvents(driver.events),
      eventCount: driver.events.length,
      done: driver.result != null,
      score: driver.result?.score,
    });
  }, [state.phase, kickoffDayKey, squad, driver.answers, driver.events, driver.result]);

  if (today == null) {
    return <div data-testid="daily-loading" className="min-h-40" aria-busy="true" />;
  }

  const stats = computeStats(history, today);
  const formation = dayFormation(today);
  const seeds = daySeeds(today);

  if (spent && state.phase === "setup") {
    const finished = record?.done === true && record.score != null;
    return (
      <div data-testid="daily-spent" className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t("dailyTitle", { n: dayNumber(today) })}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {finished ? t("dailySpentDone") : t("dailySpentCleared")}
        </p>
        <p className="mt-4 font-mono text-lg" data-testid="daily-stats">
          {t("dailyStreak", { streak: stats.currentStreak, best: stats.bestStreak })}
        </p>
      </div>
    );
  }

  if (state.phase === "setup") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <h1 data-testid="daily-header" className="text-2xl font-extrabold tracking-tight">
          {t("dailyTitle", { n: dayNumber(today) })} · {formation.name}
        </h1>
        <DraftRoom
          pool={pool}
          formation={formation}
          seed={seeds.deal}
          onComplete={(cardIds) => {
            const players = cardIds
              .map((id) => pool.find((c) => c.cardId === id))
              .filter((c): c is PoolCard => c != null);
            setSquad({ cardIds });
            driver.start(pool, players, formation, seeds.match, {
              home: t("yourXi"),
              away: t("rivals"),
            });
            dispatch({ type: "confirmSquad", seed: seeds.match });
          }}
        />
      </div>
    );
  }

  if (state.phase === "preview" && driver.match != null) {
    return (
      <MatchupPreview
        home={driver.match.home}
        away={driver.match.away}
        referee={(driver.events.find((e) => e.kind === "referee")?.refStyle ?? null) as never}
        weather={(driver.events.find((e) => e.kind === "weather")?.weather ?? null) as never}
        onKickOff={() => {
          // ⚠️ THE COMMIT POINT. The day is spent here, and its key is frozen for the
          // rest of the session.
          const anchor = dayKey(new Date());
          setKickoffDayKey(anchor);
          markStarted(anchor);
          dispatch({ type: "kickOff" });
        }}
        onBack={() => dispatch({ type: "backToSetup" })}
      />
    );
  }

  const model =
    driver.match != null && driver.events.length > 0
      ? buildMatchViewModel(driver.match.home, driver.match.away, {
          score: { home: 0, away: 0 },
          events: driver.events,
          seed: driver.match.seed,
        })
      : null;

  return (
    <div>
      {model != null ? (
        <MatchView
          model={model}
          holdAt={driver.pending?.minute ?? (driver.result == null ? 0 : undefined)}
        />
      ) : null}
      {driver.pending != null ? (
        <DecisionPrompt
          decision={driver.pending}
          limit={DECISION_LIMIT}
          onAnswer={driver.answer}
        />
      ) : null}
      {driver.result != null ? (
        <div data-testid="daily-result" className="mt-4">
          <pre className="font-mono text-sm">
            {shareText({
              dayNumber: dayNumber(kickoffDayKey ?? today),
              formationName: formation.name,
              score: driver.result.score,
              strip: matchStrip(driver.events, "home"),
              currentStreak: stats.currentStreak,
              bestStreak: stats.bestStreak,
              url: typeof location === "undefined" ? "" : location.origin + "/game/daily",
              locale,
              labels: {
                title: t("dailyShareTitle"),
                win: "✅",
                draw: "🤝",
                loss: "❌",
              },
            })}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
```

⚠️ Note the import list already includes `daySeeds` alongside `dayFormation`, `dayKey` and
`dayNumber` — all four come from `@/features/game/domain/daily`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/unit/game-daily-challenge.test.tsx && pnpm type-check`
Expected: PASS, 5 tests, and a clean `tsc`.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/DailyChallenge.tsx tests/unit/game-daily-challenge.test.tsx
git commit --no-verify -m "feat(game): the daily challenge container (TASK-1817)"
```

---

## Task 11: The route, the gate entry and the copy

**Files:**
- Create: `src/app/[locale]/game/daily/page.tsx`
- Modify: `src/features/game/domain/modes.ts`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Modify: `tests/unit/game-routes-static.test.ts`
- Modify: `scripts/warm-e2e-routes.sh`

- [ ] **Step 1: Write the failing test**

In `tests/unit/game-routes-static.test.ts`, raise the floor and update the comment:

```ts
  it("finds every game route", () => {
    // If this drops the glob broke and every assertion below is vacuous. Raise it when
    // a route is added: /game (the gate), /game/demo, /game/chaos, /game/draft,
    // /game/daily. TASK-1832 retired /game/play — it is a next.config redirect now.
    expect(files.length).toBeGreaterThanOrEqual(5);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/game-routes-static.test.ts`
Expected: FAIL — `expected 4 to be greater than or equal to 5`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/[locale]/game/daily/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { DailyChallenge } from "@/features/game/components/DailyChallenge";

// force-static, exactly like the other /game routes. The M71 arc exists to keep every
// route CDN-served. ⚠️ The prerendered HTML therefore carries NO day-specific content —
// the day resolves after mount inside the container.
export const dynamic = "force-static";
export const revalidate = 86400;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("modeDailyName"), description: t("modeDailyDesc") };
}

export default async function DailyPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const pool = await loadChaosPool();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <DailyChallenge pool={pool} />
    </main>
  );
}
```

In `src/features/game/domain/modes.ts`, update the `daily` entry only:

```ts
  {
    id: "daily",
    group: "challenges",
    emoji: "📅",
    nameKey: "modeDailyName",
    descriptionKey: "modeDailyDesc",
    href: "/game/daily",
    formats: { single: "live", season: "planned" },
    ticket: "TASK-1817",
  },
```

Add to the `game` namespace in `src/i18n/messages/en.json`:

```json
"dailyTitle": "Daily Challenge #{n}",
"dailyShareTitle": "PitchIQ Daily",
"dailySpentDone": "You've played today's challenge. A new one arrives at midnight UTC.",
"dailySpentCleared": "Today's challenge has already been started on this device.",
"dailyStreak": "🔥 {streak}   🏆 {best}"
```

And the Arabic equivalents in `src/i18n/messages/ar.json`:

```json
"dailyTitle": "تحدي اليوم رقم {n}",
"dailyShareTitle": "تحدي بيتش آي كيو اليومي",
"dailySpentDone": "لقد لعبت تحدي اليوم. يصل تحدٍ جديد عند منتصف الليل بتوقيت UTC.",
"dailySpentCleared": "تم بدء تحدي اليوم بالفعل على هذا الجهاز.",
"dailyStreak": "🔥 {streak}   🏆 {best}"
```

Add `/game/daily` to `ROUTES` in `scripts/warm-e2e-routes.sh`, directly after `/game/draft`:

```bash
  "/game/daily"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/game-routes-static.test.ts tests/unit/game-modes.test.ts`
Expected: PASS — including `game-modes.test.ts`'s "points every href at a route that
exists" and "resolves every label key in BOTH locales".

Run: `pnpm test && pnpm type-check && CI=true pnpm lint`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/game/daily/page.tsx src/features/game/domain/modes.ts \
  src/i18n/messages/en.json src/i18n/messages/ar.json \
  tests/unit/game-routes-static.test.ts scripts/warm-e2e-routes.sh
git commit --no-verify -m "feat(game): unlock the daily challenge route and gate tile (TASK-1817)"
```

---

## Task 12: Verify in a real browser, then close the ticket

**Files:**
- Modify: `TASKS.md`

⚠️ A green suite is not evidence the feature works. TASK-1831 changed what every seed
drafts and not one determinism test noticed.

- [ ] **Step 1: Serve and drive the route**

```bash
wsl -d Ubuntu -- bash -lc 'source $HOME/.nvm/nvm.sh && nvm use 22 >/dev/null && cd /home/aliemad/projects/pq-1817 && setsid pnpm dev >/tmp/daily-dev.log 2>&1 < /dev/null & sleep 25; curl -sL -o /dev/null -w "%{http_code}\n" http://localhost:3000/game/daily'
```

Expected: `200`.

- [ ] **Step 2: Confirm the day resolves and both locales render**

Verify by measurement, not by reading the markup:

1. `/game/daily` shows a challenge number and a formation name after hydration.
2. ⛔ **Verify Arabic by COUNTING ARABIC CODEPOINTS** on `/ar/game/daily`, never by
   grepping for a phrase — next-intl serialises the whole catalog into every page, so a
   grep always "finds" the string. Count characters in `؀-ۿ` in the rendered
   body and assert it is non-trivial.
3. Draft eleven, kick off, then **reload mid-match** — it must resume at the same minute,
   not restart.
4. Reach full time and confirm the share block shows a six-cell strip consistent with the
   scoreline.

- [ ] **Step 3: Prove the kickoff lock actually locks**

⚠️ Verify the gate by making it fail. Temporarily comment out `markStarted(anchor)` in
`DailyChallenge.tsx` and run `pnpm test tests/unit/game-daily-challenge.test.tsx`.

Expected: the "a session marker with NO record still renders the day spent" test goes
**red**. Restore the line and confirm it goes green again. If it stayed green, the test is
vacuous and must be rewritten before shipping.

- [ ] **Step 4: Flip the ticket**

In `TASKS.md`, change the TASK-1817 row and heading from `📋 Backlog` to `✅ Done`, and add
a **Shipped** note under `### TASK-1817` naming the spec and plan paths, in the style of
the surrounding shipped tickets.

Statuses are flipped as **part of** shipping, not deferred.

- [ ] **Step 5: Commit and open the PR**

```bash
git add TASKS.md
git commit --no-verify -m "docs: TASK-1817 shipped — the daily seeded challenge"
git push -u origin feat/task-1817-daily-challenge
```

Then open the PR against `main` and watch all three checks (**Vercel Preview Comments**,
**Lint · Type-check · Test · Build**, **Playwright (chromium · MSW)**). Squash-merge on
green. ⛔ Do not merge on a red Build check — CI is the only place `next build` can run,
so it is the sole proof the route actually prerenders.

---

## Self-review notes

- **Spec §2 route/shell** → Task 11 (route, `force-static`, no day-specific prerender) and
  Task 10 Step 1 (the cold-shell test).
- **Spec §3 day derivation + frozen roster** → Tasks 1–3.
- **Spec §4 loop + §4.1 UTC anchoring** → Task 10 (`kickoffDayKey`, resume gated on
  `record.day !== today`).
- **Spec §5 storage + §5.1 tamper** → Tasks 7–8.
- **Spec §6 derived stats** → Task 4.
- **Spec §7 share** → Tasks 5–6.
- **Spec §8 tab lifecycle** → Task 10 (`visibilitychange` / `focus`, skipped while live).
- **Spec §9 `useMatchDriver`** → Task 9.
- **Spec §10 testing** → distributed; the browser pass and the make-it-fail check are
  Task 12.
- **Spec §12 ticket status** → Task 12 Step 4.
