# TASK-1815 Post-match Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every full-time screen shows a retro newspaper headline for the match's arc and an estimated-xG timeline, derived purely from the match's events.

**Architecture:** Two pure `domain/` modules — `match-xg.ts` (frozen per-event xG estimate → shots, totals, cumulative series) and `match-headline.ts` (arc detection → a `{ key, values }` message reference, TASK-1804 convention). One client component `PostMatchReport.tsx` renders both, mounted by `MatchSummary` (drafted modes + season fixtures) and `DailyChallenge`. Nothing is stored; the engine is untouched.

**Tech Stack:** Next.js 15, React 19, TypeScript, next-intl (ICU), Vitest + Testing Library (happy-dom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-13-task-1815-post-match-report-design.md`

## Global Constraints

- Every command runs through WSL: `wsl -d Ubuntu -- bash -c 'source $HOME/.nvm/nvm.sh && nvm use 22 > /dev/null && cd /home/aliemad/projects/pitchiq && <cmd>'`. Commit from WSL too (the husky hook needs nvm's node).
- `domain/` is pure: no I/O, no `Math.random()`, no `Date.now()`. Variants come from `hashStr`.
- The engine (`domain/simulate.ts`) is NOT modified. No new field enters saves, share codes or daily records.
- No new route, fetch or server read; every `/game/*` route stays `force-static`.
- xG values are integer **hundredths** internally; displayed to one decimal.
- The xG table is FROZEN and pinned by a golden test.
- Scores/goals use given goals only: `kind === "goal" && disallowedAt == null`.
- New strings live under `game.report.*` in BOTH `src/i18n/messages/en.json` and `ar.json`; every number shown goes through `localizeDigits` (`@/utils/format`).
- The chart carries `dir="ltr"`; the newspaper text follows the locale.
- Motion: `transform` / `opacity` only, `prefers-reduced-motion`-gated (motion audit).
- Headline copy is retro-tabloid about football only — never mocking nationality or a real person.
- `pnpm type-check` before claiming done (Vitest does not type-check). Lint with `CI=true pnpm lint`.
- Owner rituals: the LAYOUT is chosen from a 30-concept HTML gallery (Task 1) and the MOTION from a 20-design animation gallery (Task 6) before those parts are built.

## Review Focus

1. **A penalty that scores is counted twice** (penalty event + its `goal` with `source: "penalty"`) — expect 0.76 once. Pinned in Task 2.
2. **Season fixture where the coach is AWAY** — expect the headline written from the coach's side (a 0–3 away win is a win, not a loss). Pinned in Task 3 and Task 5.
3. **A goal scored by a substitute** — expect his name, never a bare id/placeholder (bench must be in the name lookup). Pinned in Task 3.
4. **Arabic locale** — expect Eastern-Arabic digits in headline, standfirst and xG figures, and an LTR chart. Pinned in Task 4.
5. **A match with zero shots for one or both sides** (possible in a 0–0) — expect a flat line at 0 and no divide-by-zero / NaN in SVG coordinates. Pinned in Task 4.

---

### Task 1: The 30-concept layout gallery (design gate)

**Files:**

- Create: `design/post-match-gallery/index.html` (one standalone file: inline CSS + JS, no build step, no external scripts)

**Interfaces:**

- Consumes: nothing.
- Produces: the owner's pick (a concept number), recorded in this plan under Task 4 before Task 4 starts.

- [ ] **Step 1: Build the gallery.** 30 numbered concepts of the post-match report (headline block + xG timeline), each rendered from the SAME three sample matches (a comeback 3–2, a robbed 0–1 with 2.4–0.6 xG, a 0–0), switchable per page. Every concept shows a **desktop frame (~720px) and a mobile frame (375px) side by side**. Page-level toggles: **era** (the app's three eras: modern / golden / retro accents) and **light/dark**. The chart in every concept is real SVG computed in-page from the sample events using the Task 2 table, so the pick is judged on real shapes.
- [ ] **Step 2: Verify it opens offline** — open `file:///` in the browser pane, check no console errors, toggles work, mobile frames have no horizontal scroll.
- [ ] **Step 3: Commit** `design(1815): 30-concept post-match report gallery`.
- [ ] **Step 4: STOP — owner picks a concept.** Record the pick in Task 4 ("Chosen concept: #N — <name>").

---

### Task 2: `domain/match-xg.ts` — frozen xG estimate

**Files:**

- Create: `src/features/game/domain/match-xg.ts`
- Test: `tests/unit/game-match-xg.test.ts`

**Interfaces:**

- Consumes: `MatchEvent`, `GoalStyle`, `ChanceOutcome`, `Side` from `./match-types`.
- Produces:
  - `type DangerBand = "low" | "medium" | "high"`
  - `interface ShotXg { minute: number; side: Side; xg: number /* hundredths */; band: DangerBand; goal: boolean; disallowed: boolean }`
  - `shotXgOf(e: MatchEvent): number | null`
  - `bandOf(hundredths: number): DangerBand`
  - `shotsOf(events: readonly MatchEvent[]): ShotXg[]`
  - `xgTotals(shots: readonly ShotXg[]): { home: number; away: number }`
  - `xgSeries(shots: readonly ShotXg[], endMinute: number): { minute: number; home: number; away: number }[]`
  - `formatXg(hundredths: number): string` → `"2.4"`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@/features/game/domain/match-types";
import {
  bandOf,
  formatXg,
  shotXgOf,
  shotsOf,
  xgSeries,
  xgTotals,
  XG_CHANCE,
  XG_FREEKICK,
  XG_GOAL_STYLE,
  XG_OPEN_DEFAULT,
  XG_PENALTY,
} from "@/features/game/domain/match-xg";

const ev = (e: Partial<MatchEvent>): MatchEvent =>
  ({ minute: 10, kind: "chance", side: "home", ...e }) as MatchEvent;

describe("match xG — the frozen table", () => {
  it("⛔ GOLDEN: the table never changes (it would rewrite every report ever shared)", () => {
    expect(XG_PENALTY).toBe(76);
    expect(XG_FREEKICK).toBe(6);
    expect(XG_OPEN_DEFAULT).toBe(30);
    expect(XG_GOAL_STYLE).toEqual({
      "tap-in": 55,
      counter: 30,
      header: 18,
      chip: 15,
      volley: 12,
      trivela: 5,
      "long-range": 4,
    });
    expect(XG_CHANCE).toEqual({ post: 20, crossbar: 20, saved: 12, wide: 6, blocked: 5 });
  });

  it("bands: low < 10 ≤ medium < 30 ≤ high", () => {
    expect([bandOf(9), bandOf(10), bandOf(29), bandOf(30)]).toEqual([
      "low",
      "medium",
      "medium",
      "high",
    ]);
  });
});

describe("match xG — counting", () => {
  it("⛔ a scored penalty counts 0.76 ONCE, not again on its goal", () => {
    const shots = shotsOf([
      ev({ kind: "penalty", penaltyOutcome: "scored-placed", minute: 30 }),
      ev({ kind: "goal", source: "penalty", minute: 30, playerId: 9 }),
    ]);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ xg: 76, goal: true, band: "high" });
  });

  it("a parried penalty followed in is a goal; a saved one is not", () => {
    expect(shotsOf([ev({ kind: "penalty", penaltyOutcome: "saved-rebound-goal" })])[0]!.goal).toBe(
      true,
    );
    expect(shotsOf([ev({ kind: "penalty", penaltyOutcome: "saved-held" })])[0]!.goal).toBe(false);
  });

  it("a free kick counts on its own event; its goal adds nothing", () => {
    const shots = shotsOf([
      ev({ kind: "freekick", freeKickOutcome: "scored" }),
      ev({ kind: "goal", source: "freekick" }),
    ]);
    expect(shots.map((s) => [s.xg, s.goal])).toEqual([[6, true]]);
  });

  it("an own goal is not a shot", () => {
    expect(shotXgOf(ev({ kind: "goal", source: "own-goal" }))).toBeNull();
  });

  it("an open goal reads its style, defaulting to 0.30", () => {
    expect(shotXgOf(ev({ kind: "goal", source: "open", goalStyle: "header" }))).toBe(18);
    expect(shotXgOf(ev({ kind: "goal", source: "open" }))).toBe(30);
  });

  it("a VAR-disallowed goal KEEPS its xG and is flagged", () => {
    const [s] = shotsOf([
      ev({ kind: "goal", source: "open", goalStyle: "tap-in", disallowedAt: 33 }),
    ]);
    expect(s).toMatchObject({ xg: 55, goal: true, disallowed: true });
  });

  it("a disallowed PENALTY goal flags its penalty shot", () => {
    const [s] = shotsOf([
      ev({ kind: "penalty", penaltyOutcome: "scored-placed", minute: 40 }),
      ev({ kind: "goal", source: "penalty", minute: 40, disallowedAt: 42 }),
    ]);
    expect(s!.disallowed).toBe(true);
  });

  it("non-shot events are ignored", () => {
    expect(shotsOf([ev({ kind: "card" }), ev({ kind: "kickoff", side: undefined })])).toEqual([]);
  });

  it("totals equal the sum of shots, per side, in integer hundredths", () => {
    const shots = shotsOf([
      ev({ outcome: "saved" }),
      ev({ outcome: "post" }),
      ev({ side: "away", outcome: "wide" }),
    ]);
    expect(xgTotals(shots)).toEqual({ home: 32, away: 6 });
    expect(formatXg(32)).toBe("0.3");
    expect(formatXg(245)).toBe("2.5");
  });

  it("the series is cumulative, starts at 0, and ends at the final minute", () => {
    const shots = shotsOf([
      ev({ minute: 20, outcome: "saved" }),
      ev({ minute: 70, side: "away", outcome: "post" }),
    ]);
    expect(xgSeries(shots, 94)).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 20, home: 12, away: 0 },
      { minute: 70, home: 12, away: 20 },
      { minute: 94, home: 12, away: 20 },
    ]);
  });

  it("a match with no shots is a flat series", () => {
    expect(xgSeries([], 90)).toEqual([
      { minute: 0, home: 0, away: 0 },
      { minute: 90, home: 0, away: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test tests/unit/game-match-xg.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { ChanceOutcome, GoalStyle, MatchEvent, PenaltyOutcome, Side } from "./match-types";

/**
 * TASK-1815 — an ESTIMATED xG per shot, read off what each event already records.
 *
 * The engine does not compute shot quality, and teaching it to would change its output
 * and drift every save and share code. This table maps the recorded shape of a shot
 * onto a plausible probability instead. Values are integer HUNDREDTHS so totals never
 * drift through float addition.
 *
 * ⛔ FROZEN — pinned by a golden test. Every report is derived on the fly, so editing a
 * value silently rewrites the report of every match ever played or shared (the
 * DAILY_SHAPES rule).
 *
 * ⚠️ The engine emits a set piece as its OWN event (`penalty` / `freekick`) AND a
 * separate `goal` carrying `source`. The shot is counted on the set-piece event; its
 * goal adds nothing. An own goal is not a shot at all.
 */
export const XG_PENALTY = 76;
export const XG_FREEKICK = 6;
export const XG_OPEN_DEFAULT = 30;
export const XG_GOAL_STYLE: Readonly<Record<GoalStyle, number>> = {
  "tap-in": 55,
  counter: 30,
  header: 18,
  chip: 15,
  volley: 12,
  trivela: 5,
  "long-range": 4,
};
export const XG_CHANCE: Readonly<Record<ChanceOutcome, number>> = {
  post: 20,
  crossbar: 20,
  saved: 12,
  wide: 6,
  blocked: 5,
};

export type DangerBand = "low" | "medium" | "high";

export interface ShotXg {
  minute: number;
  side: Side;
  /** Integer hundredths. */
  xg: number;
  band: DangerBand;
  goal: boolean;
  /** A given goal later chalked off — it keeps its xG; the chance was real. */
  disallowed: boolean;
}

const penaltyScores = (o: PenaltyOutcome | undefined): boolean =>
  o != null && (o.startsWith("scored") || o === "saved-rebound-goal");

export function shotXgOf(e: MatchEvent): number | null {
  if (e.kind === "penalty") return XG_PENALTY;
  if (e.kind === "freekick") return XG_FREEKICK;
  if (e.kind === "chance") return e.outcome != null ? XG_CHANCE[e.outcome] : null;
  if (e.kind === "goal" && e.source === "open")
    return e.goalStyle != null ? XG_GOAL_STYLE[e.goalStyle] : XG_OPEN_DEFAULT;
  return null;
}

export function bandOf(h: number): DangerBand {
  return h < 10 ? "low" : h < 30 ? "medium" : "high";
}

/** The set-piece goal a penalty/free kick produced, to read its VAR verdict. */
function setPieceGoal(events: readonly MatchEvent[], e: MatchEvent): MatchEvent | undefined {
  return events.find(
    (g) => g.kind === "goal" && g.source === e.kind && g.minute === e.minute && g.side === e.side,
  );
}

export function shotsOf(events: readonly MatchEvent[]): ShotXg[] {
  const out: ShotXg[] = [];
  for (const e of events) {
    const xg = shotXgOf(e);
    if (xg == null || e.side == null) continue;
    let goal = false;
    let disallowed = false;
    if (e.kind === "goal") {
      goal = true;
      disallowed = e.disallowedAt != null;
    } else if (e.kind === "penalty" || e.kind === "freekick") {
      goal =
        e.kind === "penalty" ? penaltyScores(e.penaltyOutcome) : e.freeKickOutcome === "scored";
      disallowed = goal && setPieceGoal(events, e)?.disallowedAt != null;
    }
    out.push({ minute: e.minute, side: e.side, xg, band: bandOf(xg), goal, disallowed });
  }
  return out;
}

export function xgTotals(shots: readonly ShotXg[]): { home: number; away: number } {
  const t = { home: 0, away: 0 };
  for (const s of shots) t[s.side] += s.xg;
  return t;
}

export function xgSeries(
  shots: readonly ShotXg[],
  endMinute: number,
): { minute: number; home: number; away: number }[] {
  const pts = [{ minute: 0, home: 0, away: 0 }];
  const run = { home: 0, away: 0 };
  for (const s of shots) {
    run[s.side] += s.xg;
    pts.push({ minute: s.minute, home: run.home, away: run.away });
  }
  pts.push({
    minute: Math.max(endMinute, pts[pts.length - 1]!.minute),
    home: run.home,
    away: run.away,
  });
  return pts;
}

export const formatXg = (h: number): string => (h / 100).toFixed(1);
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS. Then **sabotage check**: change `XG_PENALTY` to 75, confirm the golden test fails, revert.
- [ ] **Step 5: Commit** `feat(1815): frozen per-event xG estimate`.

---

### Task 3: `domain/match-headline.ts` — the arc

**Files:**

- Create: `src/features/game/domain/match-headline.ts`
- Test: `tests/unit/game-match-headline.test.ts`

**Interfaces:**

- Consumes: Task 2 `shotsOf`, `xgTotals`; `hashStr` from `./hash`; `MatchResult`, `MatchEvent`, `Side` from `./match-types`; `GameTeam` from `./team`.
- Produces:
  - `type HeadlineArc = "comeback" | "lateWinner" | "lateLoser" | "robbed" | "smashAndGrab" | "routWin" | "routLoss" | "hatTrick" | "tenMen" | "varDrama" | "boreDraw" | "thriller" | "win" | "draw" | "loss"`
  - `const HEADLINE_POOL = 3` (every arc has 3 wordings: `game.report.headline.<arc>.0..2`)
  - `interface HeadlineValues { coach: string; opponent: string; coachGoals: number; oppGoals: number; player: string; minute: number }`
  - `interface HeadlineRef { arc: HeadlineArc; key: string; values: HeadlineValues }`
  - `interface ScorerLine { side: Side; name: string; goals: number; ownGoal: boolean }`
  - `headlineFor(result: MatchResult, home: GameTeam, away: GameTeam, coachSide: Side): HeadlineRef`
  - `scorersOf(result: MatchResult, home: GameTeam, away: GameTeam): ScorerLine[]`

Arc rules (first match wins), all from the coach's side, given goals only:

1. `comeback` — coach trailed by ≥ 2 at some point and finished level or ahead.
2. `lateWinner` / `lateLoser` — not a draw, and the decisive goal (the winner's goal number `loserGoals + 1`) came at minute ≥ 85; `lateWinner` if the coach won.
3. `robbed` — coach lost and coach xG − opp xG ≥ 100.
4. `smashAndGrab` — coach won and opp xG − coach xG ≥ 100.
5. `routWin` / `routLoss` — margin ≥ 4.
6. `hatTrick` — any player with ≥ 3 given goals (`player` = him, first such in event order).
7. `tenMen` — the coach's side had a red card and drew or won.
8. `varDrama` — any goal disallowed and |margin| ≤ 1.
9. `boreDraw` — 0–0.
10. `thriller` — ≥ 5 given goals.
11. `win` / `draw` / `loss`.

Variant: `hashStr(\`${result.seed}:${arc}\`) % HEADLINE_POOL`. `player`defaults to`""`, `minute`to`0`when the arc names none (lateWinner/lateLoser set`minute`and`player` to the decisive goal).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import { headlineFor, HEADLINE_POOL, scorersOf } from "@/features/game/domain/match-headline";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";

const p = (id: number, name: string): GamePlayer =>
  ({
    cardId: `${id}@2020`,
    playerId: id,
    season: 2020,
    name,
    role: "CF",
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  }) as GamePlayer;
const shape = { name: "", season: 2020, slots: [] };
const HOME = makeGameTeam(1, "Rovers", 2020, shape, [p(1, "Smith"), p(2, "Jones")], [p(3, "Sub")]);
const AWAY = makeGameTeam(2, "United", 2020, shape, [p(11, "Brown"), p(12, "Green")]);

const g = (
  minute: number,
  side: "home" | "away",
  playerId: number,
  extra: Partial<MatchEvent> = {},
): MatchEvent =>
  ({
    minute,
    kind: "goal",
    side,
    playerId,
    source: "open",
    goalStyle: "tap-in",
    ...extra,
  }) as MatchEvent;
const res = (events: MatchEvent[], seed = 1): MatchResult => {
  const given = events.filter((e) => e.kind === "goal" && e.disallowedAt == null);
  return {
    seed,
    events: [
      { minute: 0, kind: "kickoff" },
      ...events,
      { minute: 93, kind: "fulltime" },
    ] as MatchEvent[],
    score: {
      home: given.filter((e) => e.side === "home").length,
      away: given.filter((e) => e.side === "away").length,
    },
  };
};
const arc = (r: MatchResult, side: "home" | "away" = "home") =>
  headlineFor(r, HOME, AWAY, side).arc;

describe("headlineFor — arcs", () => {
  it("comeback beats late winner (priority)", () => {
    expect(
      arc(
        res([
          g(10, "away", 11),
          g(20, "away", 12),
          g(60, "home", 1),
          g(70, "home", 2),
          g(88, "home", 1),
        ]),
      ),
    ).toBe("comeback");
  });
  it("late winner / late loser", () => {
    expect(arc(res([g(10, "home", 1), g(30, "away", 11), g(89, "home", 2)]))).toBe("lateWinner");
    expect(arc(res([g(10, "home", 1), g(30, "away", 11), g(89, "away", 12)]))).toBe("lateLoser");
  });
  it("robbed / smash-and-grab read the xG gap", () => {
    const misses = (side: "home" | "away") =>
      Array.from(
        { length: 10 },
        (_, i) => ({ minute: 20 + i, kind: "chance", side, outcome: "post" }) as MatchEvent,
      );
    expect(arc(res([...misses("home"), g(50, "away", 11, { goalStyle: "long-range" })]))).toBe(
      "robbed",
    );
    expect(arc(res([...misses("away"), g(50, "home", 1, { goalStyle: "long-range" })]))).toBe(
      "smashAndGrab",
    );
  });
  it("rout, either way", () => {
    const four = (side: "home" | "away", id: number) =>
      [10, 20, 30, 40].map((m) => g(m, side, id + (m % 20 ? 0 : 1)));
    expect(arc(res(four("home", 1)))).toBe("routWin");
    expect(arc(res(four("away", 11)))).toBe("routLoss");
  });
  it("hat-trick names the hero — even a SUBSTITUTE", () => {
    const h = headlineFor(
      res([g(10, "home", 3), g(40, "home", 3), g(80, "home", 3), g(50, "away", 11)]),
      HOME,
      AWAY,
      "home",
    );
    expect(h.arc).toBe("hatTrick");
    expect(h.values.player).toBe("Sub");
  });
  it("ten men", () => {
    expect(
      arc(
        res([
          { minute: 20, kind: "card", side: "home", card: "red", playerId: 2 } as MatchEvent,
          g(60, "home", 1),
        ]),
      ),
    ).toBe("tenMen");
  });
  it("VAR drama", () => {
    expect(arc(res([g(30, "home", 1, { disallowedAt: 32 }), g(60, "away", 11)]))).toBe("varDrama");
  });
  it("bore draw, thriller, fallbacks", () => {
    expect(arc(res([]))).toBe("boreDraw");
    expect(
      arc(
        res([
          g(5, "home", 1),
          g(15, "away", 11),
          g(25, "home", 2),
          g(35, "away", 12),
          g(45, "home", 1),
        ]),
      ),
    ).toBe("thriller");
    expect(arc(res([g(30, "home", 1)]))).toBe("win");
    expect(arc(res([g(30, "home", 1), g(50, "away", 11)]))).toBe("draw");
    expect(arc(res([g(30, "away", 11)]))).toBe("loss");
  });
});

describe("headlineFor — side, determinism, values", () => {
  it("⛔ written from the COACH's side: an away win is a win", () => {
    expect(arc(res([g(30, "away", 11)]), "away")).toBe("win");
    const h = headlineFor(res([g(30, "away", 11)]), HOME, AWAY, "away");
    expect(h.values).toMatchObject({
      coach: "United",
      opponent: "Rovers",
      coachGoals: 1,
      oppGoals: 0,
    });
  });
  it("the same match prints the same headline; the key is in the pool", () => {
    const r = res([g(30, "home", 1)], 4242);
    expect(headlineFor(r, HOME, AWAY, "home")).toEqual(headlineFor(r, HOME, AWAY, "home"));
    expect(headlineFor(r, HOME, AWAY, "home").key).toMatch(
      new RegExp(`^game\\.report\\.headline\\.win\\.[0-${HEADLINE_POOL - 1}]$`),
    );
  });
});

describe("scorersOf", () => {
  it("groups given goals per player, includes the bench, marks own goals, skips disallowed", () => {
    const r = res([
      g(10, "home", 1),
      g(20, "home", 1),
      g(30, "home", 3),
      g(40, "home", 2, { disallowedAt: 41 }),
      { minute: 50, kind: "goal", side: "away", source: "own-goal", ownGoalBy: 2 } as MatchEvent,
    ]);
    expect(scorersOf(r, HOME, AWAY)).toEqual([
      { side: "home", name: "Smith", goals: 2, ownGoal: false },
      { side: "home", name: "Sub", goals: 1, ownGoal: false },
      { side: "away", name: "Jones", goals: 1, ownGoal: true },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm test tests/unit/game-match-headline.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { hashStr } from "./hash";
import type { MatchEvent, MatchResult, Side } from "./match-types";
import { shotsOf, xgTotals } from "./match-xg";
import type { GameTeam } from "./team";

/**
 * TASK-1815 — the match's dramatic arc, as a message REFERENCE (the TASK-1804
 * commentary convention): domain picks the key, the view translates it.
 *
 * Written from the COACH's side — a season fixture can put him away, and "0–3" there
 * is a win. Given goals only (`disallowedAt == null`), the `view/score.ts` rule.
 */
export type HeadlineArc =
  | "comeback"
  | "lateWinner"
  | "lateLoser"
  | "robbed"
  | "smashAndGrab"
  | "routWin"
  | "routLoss"
  | "hatTrick"
  | "tenMen"
  | "varDrama"
  | "boreDraw"
  | "thriller"
  | "win"
  | "draw"
  | "loss";

export const HEADLINE_POOL = 3;
const LATE_MINUTE = 85;
const XG_GAP = 100; // hundredths
const ROUT_MARGIN = 4;
const THRILLER_GOALS = 5;

export interface HeadlineValues {
  coach: string;
  opponent: string;
  coachGoals: number;
  oppGoals: number;
  player: string;
  minute: number;
}
export interface HeadlineRef {
  arc: HeadlineArc;
  key: string;
  values: HeadlineValues;
}
export interface ScorerLine {
  side: Side;
  name: string;
  goals: number;
  ownGoal: boolean;
}

const other = (s: Side): Side => (s === "home" ? "away" : "home");
const given = (events: readonly MatchEvent[]) =>
  events.filter((e) => e.kind === "goal" && e.disallowedAt == null && e.side != null);

/** Starters AND bench — a substitute can score (the `commentary.ts#nameOf` rule). */
function nameIn(team: GameTeam, id: number | undefined): string {
  if (id == null) return "";
  return [...team.players, ...(team.bench ?? [])].find((p) => p.playerId === id)?.name ?? "";
}

export function scorersOf(result: MatchResult, home: GameTeam, away: GameTeam): ScorerLine[] {
  const teams = { home, away };
  const lines: ScorerLine[] = [];
  for (const e of given(result.events)) {
    const side = e.side!;
    const ownGoal = e.source === "own-goal";
    // An own goal's scorer belongs to the side that CONCEDED.
    const name = ownGoal
      ? nameIn(teams[other(side)], e.ownGoalBy)
      : nameIn(teams[side], e.playerId);
    if (name === "") continue;
    const hit = lines.find((l) => l.side === side && l.name === name && l.ownGoal === ownGoal);
    if (hit) hit.goals += 1;
    else lines.push({ side, name, goals: 1, ownGoal });
  }
  return lines;
}

export function headlineFor(
  result: MatchResult,
  home: GameTeam,
  away: GameTeam,
  coachSide: Side,
): HeadlineRef {
  const teams = { home, away };
  const opp = other(coachSide);
  const goals = given(result.events);
  const count = (s: Side) => goals.filter((e) => e.side === s).length;
  const cg = count(coachSide);
  const og = count(opp);
  const margin = cg - og;
  const values: HeadlineValues = {
    coach: teams[coachSide].name,
    opponent: teams[opp].name,
    coachGoals: cg,
    oppGoals: og,
    player: "",
    minute: 0,
  };

  let worst = 0;
  let run = 0;
  for (const e of goals) {
    run += e.side === coachSide ? 1 : -1;
    worst = Math.min(worst, run);
  }

  const xg = xgTotals(shotsOf(result.events));
  const xgDiff = xg[coachSide] - xg[opp];

  const decisive = (): MatchEvent | undefined => {
    if (margin === 0) return undefined;
    const winner = margin > 0 ? coachSide : opp;
    return goals.filter((e) => e.side === winner)[Math.min(cg, og)];
  };

  const hatTrickHero = (): MatchEvent | undefined => {
    const tally = new Map<string, number>();
    for (const e of goals) {
      if (e.source === "own-goal" || e.playerId == null) continue;
      const k = `${e.side}:${e.playerId}`;
      const n = (tally.get(k) ?? 0) + 1;
      tally.set(k, n);
      if (n === 3) return e;
    }
    return undefined;
  };

  const pick = (): HeadlineArc => {
    if (worst <= -2 && margin >= 0) return "comeback";
    const d = decisive();
    if (d != null && d.minute >= LATE_MINUTE) {
      values.player = nameIn(teams[d.side!], d.playerId);
      values.minute = d.minute;
      return margin > 0 ? "lateWinner" : "lateLoser";
    }
    if (margin < 0 && xgDiff >= XG_GAP) return "robbed";
    if (margin > 0 && -xgDiff >= XG_GAP) return "smashAndGrab";
    if (Math.abs(margin) >= ROUT_MARGIN) return margin > 0 ? "routWin" : "routLoss";
    const hero = hatTrickHero();
    if (hero != null) {
      values.player = nameIn(teams[hero.side!], hero.playerId);
      return "hatTrick";
    }
    const coachRed = result.events.some(
      (e) => e.kind === "card" && e.card === "red" && e.side === coachSide,
    );
    if (coachRed && margin >= 0) return "tenMen";
    const disallowed = result.events.some((e) => e.kind === "goal" && e.disallowedAt != null);
    if (disallowed && Math.abs(margin) <= 1) return "varDrama";
    if (cg + og === 0) return "boreDraw";
    if (cg + og >= THRILLER_GOALS) return "thriller";
    return margin > 0 ? "win" : margin === 0 ? "draw" : "loss";
  };

  const arc = pick();
  const variant = hashStr(`${result.seed}:${arc}`) % HEADLINE_POOL;
  return { arc, key: `game.report.headline.${arc}.${variant}`, values };
}
```

- [ ] **Step 4: Run to verify it passes** — PASS. Sabotage: drop `team.bench` from `nameIn` → the hat-trick/substitute test must fail; revert.
- [ ] **Step 5: Reachability sweep (add to the same test file)** — simulate real matches and assert every arc fires:

```ts
import { simulate } from "@/features/game/domain/simulate";
import type { HeadlineArc } from "@/features/game/domain/match-headline";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import type { PlayerRole } from "@/data/schemas";

function xi(base: Partial<PlayerRatings>, offset: number): GamePlayer[] {
  const roles: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
  return roles.map((role, i) => ({
    ...p(offset + i, `P${offset + i}`),
    role,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50,
      ...base,
    },
  }));
}

it("⭐ every arc is reachable from real engine output", () => {
  const seen = new Set<HeadlineArc>();
  const levels = [35, 50, 65, 80];
  for (const a of levels)
    for (const b of levels)
      for (let seed = 1; seed <= 150; seed++) {
        const home = makeGameTeam(
          1,
          "H",
          2020,
          shape,
          xi({ attack: a, defense: a, overall: a }, 0),
        );
        const away = makeGameTeam(
          2,
          "A",
          2020,
          shape,
          xi({ attack: b, defense: b, overall: b }, 100),
        );
        const r = simulate({ home, away, seed, targetGoalsPerMatch: 2.7 });
        seen.add(headlineFor(r, home, away, "home").arc);
      }
  expect([...seen].sort()).toEqual(
    [
      "boreDraw",
      "comeback",
      "draw",
      "hatTrick",
      "lateLoser",
      "lateWinner",
      "loss",
      "robbed",
      "routLoss",
      "routWin",
      "smashAndGrab",
      "tenMen",
      "thriller",
      "varDrama",
      "win",
    ].sort(),
  );
});
```

If an arc is NOT reached, do not loosen the sweep silently: report which arc and its measured rate to the owner (a dead arc is dead copy).

- [ ] **Step 6: Run** — PASS (sweep runs 2,400 sims; keep under ~10s, lower seeds per pair if slower).
- [ ] **Step 7: Commit** `feat(1815): headline arc from the coach's side`.

---

### Task 4: Messages + `PostMatchReport` component

**Chosen concept:** _(fill in from Task 1 before starting: "#N — name")_

**Files:**

- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json` (add `game.report`)
- Create: `src/features/game/components/PostMatchReport.tsx`
- Modify: `src/app/globals.css` (a `.pmr-*` block styled per the chosen concept, scoped under `.pmr-root`)
- Test: `tests/unit/game-report-catalog.test.ts`, `tests/unit/post-match-report.test.tsx`

**Interfaces:**

- Consumes: Task 2 (`shotsOf`, `xgSeries`, `xgTotals`, `formatXg`), Task 3 (`headlineFor`, `scorersOf`, `HeadlineArc`, `HEADLINE_POOL`), `localizeDigits` from `@/utils/format`.
- Produces: `PostMatchReport({ result, home, away, coachSide, locale }: { result: MatchResult; home: GameTeam; away: GameTeam; coachSide: Side; locale: string })`, with test ids `post-match-report`, `report-headline`, `report-standfirst`, `report-xg-chart`, `report-shot`.

Messages (`game.report`), en — 15 arcs × 3 wordings, retro tabloid, values `{coach} {opponent} {coachGoals} {oppGoals} {player} {minute}`:

```json
"report": {
  "masthead": "The Final Whistle",
  "aria": "Post-match report",
  "xgTitle": "Expected goals",
  "xgAria": "Expected goals timeline: {home} {homeXg}, {away} {awayXg}",
  "xgLine": "xG {homeXg}–{awayXg}",
  "ownGoal": "{name} (og)",
  "scorerCount": "{name} {goals}",
  "headline": {
    "comeback": { "0": "{coach} RISE FROM THE DEAD", "1": "NEVER IN DOUBT! {coach} STUN {opponent}", "2": "THE GREAT ESCAPE: {coach} FIGHT BACK" },
    "lateWinner": { "0": "{player} SNATCHES IT AT THE DEATH", "1": "{minute}' HEARTBREAK FOR {opponent}", "2": "LAST-GASP GLORY FOR {coach}" },
    "lateLoser": { "0": "SUCKER PUNCH! {coach} UNDONE LATE", "1": "{player} BREAKS {coach} HEARTS", "2": "SO CLOSE: {coach} FALL AT THE LAST" },
    "robbed": { "0": "DAYLIGHT ROBBERY!", "1": "{coach} DOMINATE — AND LOSE", "2": "FOOTBALL, BLOODY FOOTBALL" },
    "smashAndGrab": { "0": "SMASH AND GRAB!", "1": "{coach} PINCH IT", "2": "OUTPLAYED, NOT OUTSCORED" },
    "routWin": { "0": "{coach} RUN RIOT", "1": "MASSACRE! {coach} HIT {coachGoals}", "2": "{opponent} PUT TO THE SWORD" },
    "routLoss": { "0": "NIGHTMARE FOR {coach}", "1": "{coach} HUMBLED", "2": "{opponent} RUN RIOT" },
    "hatTrick": { "0": "HAT-TRICK HERO {player}", "1": "{player} TAKES THE MATCH BALL", "2": "THREE AND EASY FOR {player}" },
    "tenMen": { "0": "TEN-MAN {coach} HOLD FIRM", "1": "BACKS TO THE WALL — AND IT WORKS", "2": "DOWN A MAN, NOT DOWN AND OUT" },
    "varDrama": { "0": "VAR THE VILLAIN", "1": "SCREEN TIME: VAR DECIDES IT", "2": "MONITOR MAYHEM" },
    "boreDraw": { "0": "BORE DRAW", "1": "NIL-NIL NOTHING", "2": "STALEMATE" },
    "thriller": { "0": "GOAL FEST!", "1": "WHAT A GAME!", "2": "THRILLER AT THE FINAL WHISTLE" },
    "win": { "0": "JOB DONE FOR {coach}", "1": "{coach} TAKE THE POINTS", "2": "{coach} SEE OFF {opponent}" },
    "draw": { "0": "HONOURS EVEN", "1": "SPOILS SHARED", "2": "ALL SQUARE" },
    "loss": { "0": "{coach} COME UP SHORT", "1": "{opponent} TOO STRONG", "2": "NO WAY THROUGH FOR {coach}" }
  }
}
```

⚠️ Each pool is an object keyed `"0"`/`"1"`/`"2"`, never a JSON array — next-intl keys are dotted paths and `headline.win.0` must resolve; the catalog test below proves it. `ar.json` gets the same keys with Arabic copy of the same tone (headlines in Arabic; team/player names stay as values).

- [ ] **Step 1: Write the failing catalog test** (`tests/unit/game-report-catalog.test.ts`)

```ts
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { HEADLINE_POOL, type HeadlineArc } from "@/features/game/domain/match-headline";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";

const ARCS: HeadlineArc[] = [
  "comeback",
  "lateWinner",
  "lateLoser",
  "robbed",
  "smashAndGrab",
  "routWin",
  "routLoss",
  "hatTrick",
  "tenMen",
  "varDrama",
  "boreDraw",
  "thriller",
  "win",
  "draw",
  "loss",
];
type T = (k: string, v?: Record<string, string | number>) => string;
const VALUES = {
  coach: "C",
  opponent: "O",
  coachGoals: "1",
  oppGoals: "0",
  player: "P",
  minute: "88",
};

describe("report catalog", () => {
  for (const [locale, messages] of [
    ["en", en],
    ["ar", ar],
  ] as const) {
    it(`every headline key renders in ${locale} with no missing args`, () => {
      const t = createTranslator({
        locale,
        messages: messages as Record<string, never>,
      }) as unknown as T;
      for (const arc of ARCS)
        for (let i = 0; i < HEADLINE_POOL; i++) {
          const out = t(`game.report.headline.${arc}.${i}`, VALUES);
          expect(out, `${locale} ${arc}.${i}`).not.toMatch(/game\.report|\{/);
        }
    });
  }
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** add the messages to both catalogs. **Step 4: Run** → PASS (plus `tests/unit/i18n-catalog-parity.test.ts`).

- [ ] **Step 5: Write the failing component test** (`tests/unit/post-match-report.test.tsx`)

```tsx
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PostMatchReport } from "@/features/game/components/PostMatchReport";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";
import { renderWithIntl } from "./_helpers/intl";

const p = (id: number, name: string) =>
  ({
    cardId: `${id}@2020`,
    playerId: id,
    season: 2020,
    name,
    role: "CF",
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  }) as GamePlayer;
const shape = { name: "", season: 2020, slots: [] };
const HOME = makeGameTeam(1, "Rovers", 2020, shape, [p(1, "Smith")]);
const AWAY = makeGameTeam(2, "United", 2020, shape, [p(11, "Brown")]);
const result = (events: Partial<MatchEvent>[]): MatchResult => ({
  seed: 7,
  score: { home: 1, away: 0 },
  events: [
    { minute: 0, kind: "kickoff" },
    ...events,
    { minute: 92, kind: "fulltime" },
  ] as MatchEvent[],
});

describe("PostMatchReport", () => {
  it("renders headline, standfirst and an LTR chart with one dot per shot", () => {
    renderWithIntl(
      <PostMatchReport
        result={result([
          {
            minute: 30,
            kind: "goal",
            side: "home",
            playerId: 1,
            source: "open",
            goalStyle: "header",
          },
          { minute: 60, kind: "chance", side: "away", outcome: "saved" },
        ])}
        home={HOME}
        away={AWAY}
        coachSide="home"
        locale="en"
      />,
    );
    expect(screen.getByTestId("report-headline").textContent).not.toBe("");
    expect(screen.getByTestId("report-standfirst")).toHaveTextContent("Smith");
    expect(screen.getByTestId("report-standfirst")).toHaveTextContent("0.2–0.1");
    expect(screen.getByTestId("report-xg-chart")).toHaveAttribute("dir", "ltr");
    expect(screen.getAllByTestId("report-shot")).toHaveLength(2);
  });

  it("⛔ Arabic: Eastern-Arabic digits in the standfirst, chart still LTR", () => {
    renderWithIntl(
      <PostMatchReport
        result={result([{ minute: 30, kind: "chance", side: "home", outcome: "post" }])}
        home={HOME}
        away={AWAY}
        coachSide="home"
        locale="ar"
      />,
      "ar",
    );
    expect(screen.getByTestId("report-standfirst").textContent).toMatch(/[٠-٩]/);
    expect(screen.getByTestId("report-xg-chart")).toHaveAttribute("dir", "ltr");
  });

  it("a shotless 0–0 draws a flat chart with no NaN", () => {
    const { container } = renderWithIntl(
      <PostMatchReport
        result={{ ...result([]), score: { home: 0, away: 0 } }}
        home={HOME}
        away={AWAY}
        coachSide="home"
        locale="en"
      />,
    );
    expect(container.innerHTML).not.toContain("NaN");
    expect(screen.queryAllByTestId("report-shot")).toHaveLength(0);
  });
});
```

(`renderWithIntl(ui, locale)` always supplies the English catalog; the Arabic digits come from the component's own `locale` prop through `localizeDigits`, which is what this test pins.)

- [ ] **Step 6: Run** → FAIL. **Step 7: Implement** `PostMatchReport.tsx`:

```tsx
"use client";
import { useTranslations } from "next-intl";
import { headlineFor, scorersOf } from "@/features/game/domain/match-headline";
import type { MatchResult, Side } from "@/features/game/domain/match-types";
import { formatXg, shotsOf, xgSeries, xgTotals } from "@/features/game/domain/match-xg";
import type { GameTeam } from "@/features/game/domain/team";
import { localizeDigits } from "@/utils/format";

const W = 600;
const H = 180;
const DOT = { low: 3, medium: 5, high: 8 } as const;

/**
 * TASK-1815 — the front page at the final whistle. Everything is DERIVED from the
 * match's events on render: nothing is stored, the engine is untouched, and a replay of
 * the same match prints the same page.
 *
 * ⛔ The chart is `dir="ltr"` — a timeline is not text (the pitch rule). Every number
 * goes through `localizeDigits` (Intl returns Western digits for "ar" in the browser).
 */
export function PostMatchReport({
  result,
  home,
  away,
  coachSide,
  locale,
}: {
  result: MatchResult;
  home: GameTeam;
  away: GameTeam;
  coachSide: Side;
  locale: string;
}) {
  const t = useTranslations("game.report");
  const tRoot = useTranslations();
  const ld = (v: string | number) => localizeDigits(v, locale);

  const head = headlineFor(result, home, away, coachSide);
  const shots = shotsOf(result.events);
  const totals = xgTotals(shots);
  const end = result.events.at(-1)?.minute ?? 90;
  const series = xgSeries(shots, end);
  const maxMinute = Math.max(end, 90);
  const maxXg = Math.max(100, totals.home, totals.away);
  const x = (m: number) => (m / maxMinute) * W;
  const y = (h: number) => H - (h / maxXg) * H;
  // A STEP line: hold the running total until the next shot's minute, then jump.
  const path = (side: Side) => {
    let d = `M0 ${y(0)}`;
    for (const pt of series.slice(1)) d += ` H${x(pt.minute)} V${y(pt[side])}`;
    return d;
  };

  const v = head.values;
  const headline = (tRoot as unknown as (k: string, v: Record<string, string>) => string)(
    head.key,
    {
      coach: v.coach,
      opponent: v.opponent,
      player: v.player,
      coachGoals: ld(v.coachGoals),
      oppGoals: ld(v.oppGoals),
      minute: ld(v.minute),
    },
  );
  const scorers = scorersOf(result, home, away);
  const line = (side: Side) =>
    scorers
      .filter((s) => s.side === side)
      .map((s) => {
        const n = s.goals > 1 ? t("scorerCount", { name: s.name, goals: ld(s.goals) }) : s.name;
        return s.ownGoal ? t("ownGoal", { name: n }) : n;
      })
      .join(", ");
  const xgLine = t("xgLine", {
    homeXg: ld(formatXg(totals.home)),
    awayXg: ld(formatXg(totals.away)),
  });

  return (
    <section data-testid="post-match-report" aria-label={t("aria")} className="pmr-root">
      <p className="pmr-mast">{t("masthead")}</p>
      <h2 data-testid="report-headline" className="pmr-headline">
        {headline}
      </h2>
      <p data-testid="report-standfirst" className="pmr-standfirst">
        {[line("home"), line("away")].filter(Boolean).join(" · ")}
        {scorers.length > 0 ? " — " : ""}
        {xgLine}
      </p>
      <figure className="pmr-chart">
        <figcaption className="pmr-chart-title">{t("xgTitle")}</figcaption>
        <svg
          data-testid="report-xg-chart"
          dir="ltr"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t("xgAria", {
            home: home.name,
            away: away.name,
            homeXg: ld(formatXg(totals.home)),
            awayXg: ld(formatXg(totals.away)),
          })}
        >
          <line x1={x(45)} x2={x(45)} y1={0} y2={H} className="pmr-half" />
          <path d={path("home")} className="pmr-line pmr-home" />
          <path d={path("away")} className="pmr-line pmr-away" />
          {shots.map((s, i) => {
            // series[0] is the 0' origin, so shot i is series[i + 1] — the total AFTER it.
            const after = series[i + 1]!;
            return (
              <circle
                key={i}
                data-testid="report-shot"
                cx={x(s.minute)}
                cy={y(after[s.side])}
                r={DOT[s.band]}
                className={`pmr-shot pmr-${s.side}${s.goal && !s.disallowed ? " pmr-goal" : ""}`}
              />
            );
          })}
        </svg>
      </figure>
    </section>
  );
}
```

A shot dot sits at the running total AFTER that shot (index-aligned, so two shots in one minute both land right); with `maxXg` floored at 100 a shotless match never divides by zero.

- [ ] **Step 8: Style** — add the `.pmr-*` block to `globals.css` per the chosen concept (scoped under `.pmr-root`; colours from existing era tokens, no new `:root` variables; static only — motion comes in Task 6).
- [ ] **Step 9: Run** both test files → PASS. Sabotage: remove `dir="ltr"` → the Arabic test fails; revert.
- [ ] **Step 10: Commit** `feat(1815): post-match report component and messages`.

---

### Task 5: Mount on every full-time screen

**Files:**

- Modify: `src/features/game/components/MatchSummary.tsx` (new optional prop `report`)
- Modify: `src/features/game/components/GamePlay.tsx:819` (pass `report`)
- Modify: `src/features/game/components/SeasonFixturePlay.tsx:76` (pass `report` with `fixture.coachSide`)
- Modify: `src/features/game/components/DailyChallenge.tsx:281` (render inside `daily-result`)
- Test: `tests/unit/post-match-report-mount.test.tsx`; E2E `tests/e2e/post-match-report.spec.ts`

**Interfaces:**

- Consumes: Task 4 `PostMatchReport`.
- Produces: `MatchSummary` prop `report?: { result: MatchResult; home: GameTeam; away: GameTeam; coachSide: Side }` — absent renders nothing extra.

- [ ] **Step 1: Write the failing mount test** — render `MatchSummary` with a `report` prop (minimal props as other `MatchSummary` tests use; find one via `grep -l "MatchSummary" tests/unit`) and assert `getByTestId("post-match-report")`; render without it and assert `queryByTestId` is null. Add a `SeasonFixturePlay`-level assertion only if an existing test already renders it to full time (`tests/unit/season-fixture-flow.test.tsx`): there, assert the report headline is written from the coach's side by checking `report-headline` exists after full time.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
  - `MatchSummary`: add the prop; render `{report ? <PostMatchReport {...report} locale={locale} /> : null}` directly under the scoreline block, above decisions.
  - `GamePlay` summary branch: `report={{ result, home: match.home, away: match.away, coachSide: "home" }}`.
  - `SeasonFixturePlay`: `report={{ result: driver.result, home, away, coachSide: fixture.coachSide }}`.
  - `DailyChallenge`: inside `daily-result`, before the `<pre>`, `{driver.result && driver.match ? <PostMatchReport result={driver.result} home={driver.match.home} away={driver.match.away} coachSide="home" locale={locale} /> : null}` (use the component's existing `locale` source; add `useLocale()` if it has none).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: E2E** — `tests/e2e/post-match-report.spec.ts`, importing `test`/`expect` from `./_helpers/test` (never `@playwright/test`). Reuse the fastest existing path to full time (find the spec that finishes a `/game/draft` match and one that finishes the daily — `grep -l "summary\|daily-result" tests/e2e`) and assert `getByTestId("post-match-report")` is visible with a non-empty `report-headline`. No new route, so `scripts/warm-e2e-routes.sh` needs no change.
- [ ] **Step 6: Commit** `feat(1815): post-match report on every full-time screen`.

---

### Task 6: Motion (20-design animation gallery → build)

**Files:**

- Create: `design/post-match-gallery/motion.html` (standalone, like Task 1)
- Modify: `src/app/globals.css` (keyframes + reduce gate), `tests/unit/motion-audit.test.ts` only if its allowlist needs the new selectors registered
- Test: `tests/unit/post-match-report-motion.test.ts`

- [ ] **Step 1: Gallery** — 20 LIVE-animated entrance designs for the chosen concept (headline stamp/slide, lines drawing in, dots popping), desktop + mobile frames side by side, era + light/dark toggles. Commit; **STOP for the owner's pick.**
- [ ] **Step 2: Failing test** — assert the RULE, not the selector (the TASK-1833 vacuous-test lesson): for each animated selector `S`, the CSS contains `S {` … `animation:` AND `S` appears inside the `@media (prefers-reduced-motion: reduce)` block with `animation: none`.
- [ ] **Step 3: Implement** the picked motion with `transform`/`opacity` only (line draw-in via `stroke-dashoffset` is NOT allowed by the audit — use a `scaleX` reveal mask instead).
- [ ] **Step 4: Run** the motion test + `tests/unit/motion-audit.test.ts` → PASS. Sabotage: delete one reduce-gate selector → fails; revert.
- [ ] **Step 5: Commit** `feat(1815): post-match report motion`.

---

### Task 7: Verify, document, ship

**Files:**

- Modify: `TASKS.md` (TASK-1815 → `✅ Done` in the row AND the section header, with shipped notes), `CLAUDE.md` (a `features/game` bullet: report is derived, xG table frozen, set-piece double-count rule, coach-side rule), `README.md` (game feature list)

- [ ] **Step 1:** `pnpm type-check`, `CI=true pnpm lint`, and the touched unit files + `i18n-catalog-parity` + `motion-audit` + `game-routes-static` → all green. (Full vitest crashes locally — run touched files; CI runs the full suite.)
- [ ] **Step 2:** Docs (TASKS + CLAUDE.md + README in the same change — standing rule).
- [ ] **Step 3:** Commit, push `feat/task-1815-post-match-report`, open the PR (`--body-file`), wait for **CI and E2E** both green, squash-merge.
- [ ] **Step 4:** After the production deploy, verify in the browser pane: finish a `/game/draft` match and the daily — the report shows; switch `/ar` — digits are Eastern-Arabic and the chart is LTR; confirm `/game/draft` is still `x-vercel-cache` PRERENDER/HIT.
