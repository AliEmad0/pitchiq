# TASK-1810 Legacy match screens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the two designed-but-unbuilt Legacy match screens — `?phase=preview` (the matchday programme) and `?phase=live` (the split feed) — against the agreed design at `docs/superpowers/specs/2026-08-18-task-1810-match-screens-design.md`.

**Architecture:** Both screens are PHASES inside the existing `GamePlay` container, never routes — the generator, the seed and the drafted XI live in its memory. They are selected by a new `screens` field on the rule pack, exactly as `draft` already selects the setup screen, so `/game/draft`, `/game/chaos` and `/game/daily` keep the shipped `MatchupPreview`/`MatchView` untouched and their tests stay a valid control. One `.lg-root` token block carries the pitch-and-chalk theme for the whole Legacy flow.

**Tech Stack:** Next 15 App Router (`force-static`), React 19 client components, Tailwind v4 + hand-written CSS in `globals.css`, next-intl (en + ar), nuqs for the phase mirror, vitest + Testing Library.

---

## Context an implementer needs before starting

Read these first. Each one has already cost a cycle when skipped.

1. **`commentaryArgs()` is mandatory.** Commentary is an i18n ref whose catalog entries
   interpolate `{homeScoreFmt}` / `{minuteFmt}`. Those are DERIVED by
   `src/features/game/view/commentary-view.ts`. Passing `ref.values` straight to `t()`
   renders every scoreline as a bare dash. Always `t(ref.key, commentaryArgs(ref))`.
2. **A card that is itself a `<button>` cannot host another button.** `PlayerCard` already
   has `interactive={false}` for this; use it anywhere a card is a pick target.
3. **A pick target inside a 3D flip does not hit-test.** Keep any control outside the
   turning faces.
4. **`align-items: stretch` does not equalise the pitch and the feed** — the feed's own
   content grows the grid row. Take the feed OUT of flow (absolutely positioned inside a
   `position: relative` pane) so the pitch's `aspect-ratio` sets the row height.
5. **Every decision the engine raises must be answered or the generator hangs.** There is
   no "leave it pending" option. Declining is an ANSWER: a `sub-offer` answer with `off`
   undefined means no change.
6. **`force-static` + `dynamicParams = false`** are already on both game routes. Do not
   read `searchParams` on the server; the phase is client state mirrored to the URL.

### ⭐ Discovery that changes the spec's §3.4

`src/features/game/view/coach-policy.ts` **already implements the Bench-button model** —
`createCoachState`, `requestSubstitution`, `shouldOpenPrompt`, `spendRequest`, with a full
test file at `tests/unit/game-coach-policy.test.ts` — and **it is wired into nothing.**
`GamePlay` renders `<DecisionPrompt>` for every pending decision instead, which is exactly
the "appears unbidden and blocks the match" complaint that produced this redesign.

This plan wires the existing policy rather than writing a new one. Its shipped rules:

- A sub-offer opens the dialog only if the coach REQUESTED a change (`requestedAt != null`).
- The request opens at the next stoppage, or after `REQUEST_GRACE` (5) minutes anyway.
- Making the change and cancelling both `spendRequest()` — one window, one opportunity.

### Owner ruling, 2026-08-18 — the unanswered decision

Spec §5.3 was open. The owner's call:

- **Default:** the clock keeps running; the Bench button glows amber; after **20 seconds**
  the engine **executes its own recommendation**.
- **A "Manual Subs Only" toggle** bypasses the timer entirely: the clock still runs, the
  window expires with **no substitution made**, and nothing is ever decided for the coach.

⚠️ **This differs from the shipped `fallbackFor()`**, which answers a lapsed sub-offer with
`{kind:"sub-offer", minute, side}` — no `off`, i.e. **decline**. The default path must
therefore use `defaultAnswer(d)` (which takes the suggestion when `engineSuggests` is true),
not `fallbackFor(d)`. The Manual path is the one that uses `fallbackFor`.

⚠️ **A sub-offer is raised EVERY MINUTE of the window, for both sides.** A 20-second timer
on every one of them would stall the match for minutes of real time. The timer therefore
runs **only while the dialog is open or a suggestion is flagged**; every other sub-offer is
answered immediately with `fallbackFor` (decline) so the clock never holds. This is what
`shouldOpenPrompt` is for.

---

## File structure

**Created**

| Path                                              | Responsibility                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/game/domain/captaincy.ts`           | Count real captaincies; rank a squad into captain + vice; the handover rule. Pure, no I/O.                                           |
| `src/features/game/domain/matchup.ts`             | Pre-match maths: role-group strengths for the Tale of the Tape, squad average, decade span, the star of each side. Pure.             |
| `src/features/game/view/bench-state.ts`           | The bench dialog's own state machine on top of `coach-policy` — auto vs manual, which off/on are chosen, when Confirm enables.       |
| `src/features/game/components/MatchProgramme.tsx` | `?phase=preview` — masthead, spotlight, tape, both XIs as cards, conditions, kick off.                                               |
| `src/features/game/components/MatchLive.tsx`      | `?phase=live` — scoreboard, the split, team sheets, the Bench control.                                                               |
| `src/features/game/components/LivePitch.tsx`      | Both XIs on one pitch, away mirrored, full markings, armband + bookings on the pip. Static (see §3.1 — the animation is NOT agreed). |
| `src/features/game/components/BenchDialog.tsx`    | The substitution popup: cards, off + on, Confirm gated, three ways to close.                                                         |
| `src/features/game/components/TeamSheets.tsx`     | Two ruled columns; each player's own match on his row.                                                                               |
| `tests/unit/game-captaincy.test.ts`               | Captaincy counting, tie-breaks, the empty-record fallback, the handover.                                                             |
| `tests/unit/game-matchup.test.ts`                 | Tape maths, decade span, star selection.                                                                                             |
| `tests/unit/game-bench-state.test.ts`             | Auto vs manual, Confirm gating, spend-once.                                                                                          |
| `tests/unit/game-match-programme.test.tsx`        | The preview renders both XIs, the tape, the conditions; kick off fires.                                                              |
| `tests/unit/game-match-live.test.tsx`             | The split renders; commentary resolves through `commentaryArgs`; Bench opens; manual toggle declines.                                |

**Modified**

| Path                                           | Change                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/globals.css`                          | Add the `.lg-root` token block + the two screens' CSS.                                                                            |
| `src/features/game/domain/rule-packs.ts`       | Add `screens?: ScreensSpec` to the pack; declare it on Legacy.                                                                    |
| `src/features/game/components/GamePlay.tsx`    | Accept `screens` + `captaincies`; branch preview/live on it; drop the unconditional `DecisionPrompt` when `screens === "legacy"`. |
| `src/app/[locale]/game/[mode]/[club]/page.tsx` | Build and pass `captaincies`; pass `pack.screens`.                                                                                |
| `src/features/game/adapter/pool.ts`            | Export `captaincyCounts(playerIds)` — build-time only.                                                                            |
| `src/i18n/messages/en.json`, `ar.json`         | New `game.*` keys.                                                                                                                |
| `TASKS.md`                                     | Flip TASK-1810's status as part of shipping (standing owner rule).                                                                |

**Shipped files deliberately NOT touched:** `MatchupPreview.tsx`, `MatchView.tsx`,
`DecisionPrompt.tsx`, `DraftRoom.tsx`, `DailyChallenge.tsx`. They remain the path for
`/game/draft`, `/game/chaos` and `/game/daily`, and their tests are the control that proves
this change did not reach them.

---

## PR split

- **PR A — Tasks 1-7:** the theme, the pre-match maths, `?phase=preview`, wiring.
- **PR B — Tasks 8-15:** captains, the bench policy, `?phase=live`, team sheets.

Each PR is shippable on its own: after PR A the Legacy flow is sheet → draft → programme →
the SHIPPED live view; PR B replaces only that last screen.

---

# PR A — the matchday programme

### Task 1: The Legacy theme tokens

**Files:**

- Modify: `src/app/globals.css` (append a new block at the end, after the `.pd-*` block)

- [ ] **Step 1: Append the token block**

⚠️ Scoped to `.lg-root`, NOT `:root`. These are the Legacy flow's palette; leaking them
app-wide would put a second meaning on names like `--home` across every other feature.

```css
/* ---------------------------------------------------------------------------
   TASK-1810 — one theme for the whole Legacy flow (owner instruction, 2026-08-18).

   The three chosen pre-match concepts each arrived with a different palette
   (neutral cards, light newsprint, wood-framed green). The owner's instruction
   was explicit: ONE theme. Everything sits on pitch-and-chalk.

   ⛔ Zero hard-coded colours outside this block. The coding is consistent per
   section: your side is ALWAYS gold, theirs ALWAYS rose, and --cta is reserved
   for the single action on a page.
--------------------------------------------------------------------------- */
.lg-root {
  --ground: #0a0f0d;
  --panel: #101714;
  --panel-2: #16201c;
  --rule: #24332c;
  --chalk: #e8efe9;
  --chalk-dim: #93a89b;
  --chalk-faint: #63776b;
  --home: #f2d98a;
  --home-deep: #b7892a;
  --away: #ff7d9b;
  --away-deep: #a8324c;
  --cta: #35e0ff;
  --alert: #ffc63d;
  --turf-a: #123a2a;
  --turf-b: #0e3022;
  --ink-home: #2b1e00;
  --ink-away: #2b0710;
  --ink-cta: #00232b;

  background: var(--ground);
  color: var(--chalk);
}
```

- [ ] **Step 2: Write the failing guard test**

Create `tests/unit/game-legacy-theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

/** The block, from its opening selector to the closing brace of `.lg-root`. */
function legacyBlock(): string {
  const start = css.indexOf(".lg-root {");
  expect(start).toBeGreaterThan(-1);
  return css.slice(start);
}

describe("the Legacy theme", () => {
  it("defines every token the two screens read", () => {
    const block = legacyBlock();
    for (const token of [
      "--ground",
      "--panel",
      "--panel-2",
      "--rule",
      "--chalk",
      "--chalk-dim",
      "--chalk-faint",
      "--home",
      "--home-deep",
      "--away",
      "--away-deep",
      "--cta",
      "--alert",
      "--turf-a",
      "--turf-b",
      "--ink-home",
      "--ink-away",
      "--ink-cta",
    ]) {
      expect(block).toContain(`${token}:`);
    }
  });

  it("scopes them to .lg-root so they cannot leak app-wide", () => {
    // A token named --home defined on :root would collide with every other feature.
    expect(css).not.toMatch(/:root\s*\{[^}]*--home:/);
  });
});
```

- [ ] **Step 3: Run it**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-legacy-theme.test.ts
```

Expected: PASS once Step 1 is in. If Step 1 was skipped, FAIL on `indexOf` returning -1.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css tests/unit/game-legacy-theme.test.ts
git commit -m "feat(game): the Legacy flow's one theme, as scoped tokens (TASK-1810)"
```

---

### Task 2: Pre-match maths — `domain/matchup.ts`

The Tale of the Tape, the star of each side, and the decade span. Pure functions over
`GameTeam`, so the whole screen is testable with no React.

**Files:**

- Create: `src/features/game/domain/matchup.ts`
- Test: `tests/unit/game-matchup.test.ts`

- [ ] **Step 1: Add the `makeTeam` helper**

⚠️ The shipped `matchSetup` helper CANNOT be used here. Its `SHAPE` is
`{ name: "", season: 2020, slots: [] }` — an **empty slots array** — and every bar in the
Tale of the Tape is bucketed by the formation slot's role, so it would report 0/0/0 and the
test would pass against a function that does nothing.

Append to `tests/unit/_helpers/match-setup.ts`:

```ts
import { formationByName } from "@/features/game/domain/formation";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * A team with REAL formation slots, for anything that groups an XI by position.
 *
 * ⚠️ 4-4-2 Flat's slot order is GK, LB, CB, CB, RB, LM, CM, CM, RM, CF, CF — so the
 * defence bucket is FIVE players (the keeper included), the midfield four and the attack
 * two. Get that wrong and the expected values in a tape test are quietly nonsense.
 */
export function makeTeam(opts: {
  name?: string;
  ratings?: Array<number | null>;
  seasons?: number[];
}): GameTeam {
  const shape = formationByName("4-4-2 Flat"); // non-nullable — it throws on an unknown name
  const players: GamePlayer[] = shape.slots.map((slot, i) => {
    const overall = opts.ratings?.[i] ?? 75;
    return {
      cardId: `${500 + i}@${opts.seasons?.[i] ?? 2020}`,
      playerId: 500 + i,
      season: opts.seasons?.[i] ?? 2020,
      name: `${opts.name ?? "T"}${i}`,
      role: slot.role,
      altRoles: [],
      foot: null,
      height: null,
      provenance: null,
      ratings: overall == null ? null : { ...RATINGS, overall },
    };
  });
  return makeGameTeam(1, opts.name ?? "T", 2020, shape, players, []);
}
```

⚠️ Confirm the resolver's exported name in `src/features/game/domain/formation.ts` before
using it — the module exists to keep `FORMATIONS`' array ORDER presentation-only, so
resolve by NAME and never by index.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { decadeSpan, squadAverage, starOf, taleOfTheTape } from "@/features/game/domain/matchup";
import { makeTeam } from "./_helpers/match-setup";

describe("taleOfTheTape", () => {
  it("splits the XI into overall, attack, midfield and defence", () => {
    // 4-4-2 Flat: GK+LB+CB+CB+RB | LM+CM+CM+RM | CF+CF
    const team = makeTeam({ ratings: [80, 70, 70, 70, 70, 75, 75, 75, 75, 85, 85] });
    const tape = taleOfTheTape(team);
    expect(tape.defence).toBe(72); // (80+70+70+70+70)/5
    expect(tape.midfield).toBe(75);
    expect(tape.attack).toBe(85);
    expect(tape.overall).toBe(75); // 830/11 = 75.45
  });

  it("ignores players with no rating rather than counting them as zero", () => {
    const team = makeTeam({ ratings: [...Array(10).fill(80), null] });
    expect(taleOfTheTape(team).overall).toBe(80);
  });

  it("reports 0 rather than NaN for a group with nobody rated", () => {
    // A real case: one-season clubs and thin data both produce it, and NaN renders
    // as the string "NaN" inside the bar's label.
    const team = makeTeam({ ratings: [80, 80, 80, 80, 80, 80, 80, 80, 80, null, null] });
    expect(taleOfTheTape(team).attack).toBe(0);
  });
});

describe("starOf", () => {
  it("returns the highest-rated player", () => {
    const team = makeTeam({ ratings: [...Array(10).fill(70), 91] });
    expect(starOf(team)?.ratings?.overall).toBe(91);
  });

  it("is null for a squad with no ratings at all", () => {
    expect(starOf(makeTeam({ ratings: Array(11).fill(null) }))).toBeNull();
  });
});

describe("decadeSpan", () => {
  it("reports the first and last season the XI is drawn from", () => {
    const team = makeTeam({
      seasons: [1994, 2001, 2001, 2008, 2008, 2008, 2015, 2015, 2019, 2019, 2019],
    });
    expect(decadeSpan(team)).toEqual({ first: 1994, last: 2019 });
  });
});

describe("squadAverage", () => {
  it("rounds to a whole number", () => {
    expect(squadAverage(makeTeam({ ratings: [81, ...Array(10).fill(80)] }))).toBe(80);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-matchup.test.ts
```

Expected: FAIL — `Failed to resolve import "@/features/game/domain/matchup"`.

- [ ] **Step 4: Implement**

```ts
import type { PlayerRole } from "@/data/schemas";
import type { GamePlayer } from "./player";
import type { GameTeam } from "./team";

/** The four bars the Tale of the Tape draws. */
export interface Tape {
  overall: number;
  attack: number;
  midfield: number;
  defence: number;
}

/**
 * Role → group, for the comparison bars only.
 *
 * ⚠️ Presentation, never selection. Nothing drafts or simulates through these — the
 * formation's own slots decide who plays where. This exists so three bars can be drawn.
 */
const GROUP: Record<PlayerRole, "attack" | "midfield" | "defence"> = {
  GK: "defence",
  RB: "defence",
  CB: "defence",
  LB: "defence",
  CDM: "midfield",
  CM: "midfield",
  CAM: "midfield",
  RM: "midfield",
  LM: "midfield",
  RW: "attack",
  LW: "attack",
  SS: "attack",
  CF: "attack",
};

const rated = (players: GamePlayer[]): number[] =>
  players.map((p) => p.ratings?.overall).filter((r): r is number => r != null);

/**
 * The mean, rounded.
 *
 * ⚠️ Returns 0 for an empty list rather than NaN. A club with no rated player in a group
 * is a real case — `captains.json`-thin clubs and one-season sides both produce it — and a
 * NaN would render as "NaN" in the bar's label.
 */
const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);

/**
 * Group the XI by the FORMATION SLOT's role, not the player's own.
 *
 * A card's `role` is nullable and can differ from where the coach fielded him; the slot is
 * what he is actually playing, and it is never null.
 */
export function taleOfTheTape(team: GameTeam): Tape {
  const buckets: Record<"attack" | "midfield" | "defence", number[]> = {
    attack: [],
    midfield: [],
    defence: [],
  };
  team.formation.slots.forEach((slot, i) => {
    const r = team.players[i]?.ratings?.overall;
    if (r == null) return;
    buckets[GROUP[slot.role]].push(r);
  });
  return {
    overall: mean(rated(team.players)),
    attack: mean(buckets.attack),
    midfield: mean(buckets.midfield),
    defence: mean(buckets.defence),
  };
}

/** The best card in the XI, or null when nothing in it is rated. */
export function starOf(team: GameTeam): GamePlayer | null {
  let best: GamePlayer | null = null;
  for (const p of team.players) {
    const r = p.ratings?.overall;
    if (r == null) continue;
    if (best == null || r > (best.ratings?.overall ?? 0)) best = p;
  }
  return best;
}

/** First and last season the XI is drawn from — the programme's subline. */
export function decadeSpan(team: GameTeam): { first: number; last: number } {
  const seasons = team.players.map((p) => p.season).filter((s) => Number.isFinite(s));
  if (seasons.length === 0) return { first: 0, last: 0 };
  return { first: Math.min(...seasons), last: Math.max(...seasons) };
}

export const squadAverage = (team: GameTeam): number => mean(rated(team.players));
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-matchup.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Type-check**

⚠️ Vitest does NOT type-check. This is a separate, required gate.

```bash
cd ~/projects/pitchiq && npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/domain/matchup.ts tests/unit/game-matchup.test.ts
git commit -m "feat(game): pre-match maths for the programme screen (TASK-1810)"
```

---

### Task 3: `screens` on the rule pack

**Files:**

- Modify: `src/features/game/domain/rule-packs.ts`
- Test: `tests/unit/game-rule-packs.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/game-rule-packs.test.ts`:

```ts
describe("screens", () => {
  it("Legacy declares the programme + split-feed screens", () => {
    expect(packFor("legacy")?.screens).toBe("legacy");
  });

  it("a pack without the field keeps the shipped screens", () => {
    // /game/draft and /game/chaos must be untouched by TASK-1810's redesign.
    for (const id of ["draft", "chaos"] as const) {
      expect(packFor(id)?.screens).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-rule-packs.test.ts
```

Expected: FAIL — `screens` does not exist on the pack type.

- [ ] **Step 3: Implement**

In `src/features/game/domain/rule-packs.ts`, add above the pack interface:

```ts
/**
 * Which match screens a pack uses.
 *
 * ⚠️ A pack FIELD rather than a component swap, for the same reason `draft` is one:
 * "modes are rule packs (data), not code paths" is the locked architecture. Absent means
 * the shipped `MatchupPreview`/`MatchView`, which is what keeps `/game/draft`,
 * `/game/chaos` and `/game/daily` — and their tests, the control for this change —
 * completely untouched by TASK-1810.
 */
export type ScreensSpec = "legacy";
```

Add `screens?: ScreensSpec;` to the pack interface, and `screens: "legacy",` to the Legacy
pack's literal.

- [ ] **Step 4: Run to verify it passes**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-rule-packs.test.ts && npx tsc --noEmit
```

Expected: PASS; no tsc output.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/rule-packs.ts tests/unit/game-rule-packs.test.ts
git commit -m "feat(game): a pack declares which match screens it uses (TASK-1810)"
```

---

### Task 4: i18n keys for the programme

**Files:**

- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`

- [ ] **Step 1: Add the keys under `game`**

English:

```json
"progKicker": "Matchday",
"progVersus": "v",
"progSubline": "{shape} · avg {avg} · {first}–{last}",
"progSpotlight": "The spotlight",
"progYourStar": "Your talisman",
"progTheirStar": "Theirs",
"progTape": "Tale of the tape",
"progOverall": "Overall",
"progAttack": "Attack",
"progMidfield": "Midfield",
"progDefence": "Defence",
"progTeams": "The teams",
"progConditions": "Conditions",
"progYourXi": "Your XI",
"progTheirXi": "Their XI",
"progKickOff": "Kick off",
"progBack": "Back to the squad",
"progTapeAria": "{label}: yours {home}, theirs {away}"
```

Arabic (mirrors the shipped tone in `ar.json` — check neighbouring `game.*` keys and match
their register before committing):

```json
"progKicker": "يوم المباراة",
"progVersus": "ضد",
"progSubline": "{shape} · المعدل {avg} · {first}–{last}",
"progSpotlight": "تحت الأضواء",
"progYourStar": "نجم فريقك",
"progTheirStar": "نجمهم",
"progTape": "المقارنة",
"progOverall": "الإجمالي",
"progAttack": "الهجوم",
"progMidfield": "الوسط",
"progDefence": "الدفاع",
"progTeams": "التشكيلتان",
"progConditions": "الظروف",
"progYourXi": "تشكيلتك",
"progTheirXi": "تشكيلتهم",
"progKickOff": "انطلاق المباراة",
"progBack": "العودة إلى التشكيلة",
"progTapeAria": "{label}: لك {home}، لهم {away}"
```

- [ ] **Step 2: Verify both catalogs agree**

The repo has a key-parity check. Run the suite that covers it:

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/i18n
```

Expected: PASS. If no such test exists, run `npx vitest run` and rely on the messages test
that does exist; a missing Arabic key must fail something.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/ar.json
git commit -m "i18n(game): the matchday programme's strings (TASK-1810)"
```

---

### Task 5: `MatchProgramme.tsx`

**Files:**

- Create: `src/features/game/components/MatchProgramme.tsx`
- Modify: `src/app/globals.css` (append the `.lg-prog-*` rules)
- Test: `tests/unit/game-match-programme.test.tsx`

Layout, top to bottom, one column, `max-width: 980px`:
masthead → spotlight → tape → both XIs as cards (three across) → conditions → kick off.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "./_helpers/intl";
import { makeTeam } from "./_helpers/match-setup";

const { MatchProgramme } = await import("@/features/game/components/MatchProgramme");

const home = makeTeam({ name: "Liverpool", ratings: [85, ...Array(10).fill(78)] });
const away = makeTeam({ name: "Liverpool", ratings: [82, ...Array(10).fill(70)] });

describe("MatchProgramme", () => {
  it("shows both XIs as cards, not as a list", () => {
    renderWithIntl(
      <MatchProgramme
        home={home}
        away={away}
        referee="strict"
        weather="rain"
        onKickOff={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // 22 players, every one rendered.
    expect(screen.getAllByTestId("prog-card")).toHaveLength(22);
  });

  it("draws the four comparison bars", () => {
    renderWithIntl(
      <MatchProgramme
        home={home}
        away={away}
        referee="strict"
        weather="rain"
        onKickOff={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId("prog-bar")).toHaveLength(4);
  });

  it("names the referee and the weather with what each one DOES", () => {
    renderWithIntl(
      <MatchProgramme
        home={home}
        away={away}
        referee="strict"
        weather="rain"
        onKickOff={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/books far more|strict/i)).toBeInTheDocument();
  });

  it("kicks off", async () => {
    const onKickOff = vi.fn();
    renderWithIntl(
      <MatchProgramme
        home={home}
        away={away}
        referee="strict"
        weather="rain"
        onKickOff={onKickOff}
        onBack={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /kick off/i }));
    expect(onKickOff).toHaveBeenCalledOnce();
  });

  it("survives a side with no rated players", () => {
    const bare = makeTeam({ name: "Barnsley", ratings: Array(11).fill(null) });
    renderWithIntl(
      <MatchProgramme
        home={bare}
        away={away}
        referee={null}
        weather={null}
        onKickOff={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    // No crash, and the spotlight simply has nothing to show on that side.
    expect(screen.getAllByTestId("prog-bar")).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-match-programme.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
"use client";
import { useTranslations } from "next-intl";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";
import { decadeSpan, squadAverage, starOf, taleOfTheTape } from "@/features/game/domain/matchup";
import type { GameTeam } from "@/features/game/domain/team";
import { prefersReducedMotion } from "@/utils/motion";
import { PlayerCard } from "./PlayerCard";

interface Props {
  home: GameTeam;
  away: GameTeam;
  /**
   * ⚠️ READ from the first segment's events, never recomputed. `pickReferee(rng())` and
   * `pickWeather(rng())` are the first two draws inside `runMatch`; drawing them again
   * out here consumes a different stream and shows an official who is not the one taking
   * charge. Carried over verbatim from `MatchupPreview`.
   */
  referee: RefereeStyle | null;
  weather: Weather | null;
  onKickOff: () => void;
  onBack: () => void;
}

const REFEREE_KEY: Record<RefereeStyle, string> = {
  strict: "refereeStrict",
  lenient: "refereeLenient",
  "crowd-influenced": "refereeCrowdInfluenced",
};
const REFEREE_IMPACT_KEY: Record<RefereeStyle, string> = {
  strict: "refereeStrictImpact",
  lenient: "refereeLenientImpact",
  "crowd-influenced": "refereeCrowdInfluencedImpact",
};
const WEATHER_KEY: Record<Weather, string> = {
  clear: "weatherClear",
  rain: "weatherRain",
  "heavy-rain": "weatherHeavyRain",
  wind: "weatherWind",
  snow: "weatherSnow",
};
const WEATHER_IMPACT_KEY: Record<Weather, string> = {
  clear: "weatherClearImpact",
  rain: "weatherRainImpact",
  "heavy-rain": "weatherHeavyRainImpact",
  wind: "weatherWindImpact",
  snow: "weatherSnowImpact",
};

/**
 * TASK-1810 — `?phase=preview`, the matchday programme.
 *
 * Owner-picked hybrid of concepts 12 (Star Spotlight), 21 (Programme Spread) and
 * 22 (Chalk & Compare). Each arrived with its own palette; the owner's instruction was one
 * theme, so all three sit on the `.lg-root` pitch-and-chalk tokens.
 *
 * ⚠️ A PHASE, not a route. The session — the generator, the seed, the drafted XI — lives
 * in `GamePlay`'s memory; a `/game/pre-match` URL would drop it.
 */
export function MatchProgramme({ home, away, referee, weather, onKickOff, onBack }: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();

  const tape = { home: taleOfTheTape(home), away: taleOfTheTape(away) };
  const span = { home: decadeSpan(home), away: decadeSpan(away) };
  const star = { home: starOf(home), away: starOf(away) };

  const BARS = [
    { key: "progOverall", h: tape.home.overall, a: tape.away.overall },
    { key: "progAttack", h: tape.home.attack, a: tape.away.attack },
    { key: "progMidfield", h: tape.home.midfield, a: tape.away.midfield },
    { key: "progDefence", h: tape.home.defence, a: tape.away.defence },
  ];

  return (
    <div className="lg-root lg-prog">
      {/* 1 — masthead */}
      <header className="lg-prog-mast">
        <p className="lg-kicker">{t("progKicker")}</p>
        <h1 className="lg-prog-title">
          <span className="lg-home">{home.name}</span>
          <span className="lg-prog-v">{t("progVersus")}</span>
          <span className="lg-away">{away.name}</span>
        </h1>
        <p className="lg-prog-sub">
          {t("progSubline", {
            shape: home.formation.name,
            avg: squadAverage(home),
            first: span.home.first,
            last: span.home.last,
          })}
        </p>
      </header>

      {/* 2 — star spotlight */}
      <section className="lg-prog-stars" aria-label={t("progSpotlight")}>
        {(["home", "away"] as const).map((side) => {
          const p = star[side];
          return (
            <article key={side} className={`lg-star lg-star-${side}`}>
              <span className="lg-star-tag">
                {side === "home" ? t("progYourStar") : t("progTheirStar")}
              </span>
              <span className="lg-star-ovr">{p?.ratings?.overall ?? "—"}</span>
              <span className="lg-star-name">{p?.name ?? "—"}</span>
              <span className="lg-star-season">{p?.season ?? ""}</span>
            </article>
          );
        })}
      </section>

      {/* 3 — tale of the tape */}
      <section className="lg-prog-tape">
        <h2 className="lg-h2">{t("progTape")}</h2>
        {BARS.map((b) => {
          const total = b.h + b.a || 1;
          return (
            <div
              key={b.key}
              data-testid="prog-bar"
              className="lg-tape-row"
              role="img"
              aria-label={t("progTapeAria", { label: t(b.key), home: b.h, away: b.a })}
            >
              <span className="lg-tape-n lg-home">{b.h}</span>
              <span className="lg-tape-track">
                <span className="lg-tape-fill-home" style={{ width: `${(b.h / total) * 100}%` }} />
                <span className="lg-tape-fill-away" style={{ width: `${(b.a / total) * 100}%` }} />
              </span>
              <span className="lg-tape-n lg-away">{b.a}</span>
              <span className="lg-tape-label">{t(b.key)}</span>
            </div>
          );
        })}
      </section>

      {/* 4 — both XIs as CARDS (owner change: this was a list) */}
      <section className="lg-prog-teams">
        <h2 className="lg-h2">{t("progTeams")}</h2>
        <div className="lg-prog-grid">
          {(["home", "away"] as const).map((side) => (
            <div key={side} className={`lg-xi lg-xi-${side}`}>
              <h3 className="lg-xi-title">
                {side === "home" ? t("progYourXi") : t("progTheirXi")}
              </h3>
              <div className="lg-xi-cards">
                {(side === "home" ? home : away).players.map((p, i) => (
                  <div key={`${p.cardId}-${i}`} data-testid="prog-card" className="lg-xi-card">
                    {/* ⛔ interactive={false}: at this size the card is furniture, and a
                        card that is itself a button cannot host one. */}
                    <PlayerCard card={p as EnrichedCard} reduced={reduced} interactive={false} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 5 — conditions */}
      <section className="lg-prog-cond">
        <h2 className="lg-h2">{t("progConditions")}</h2>
        <dl className="lg-cond-grid">
          <div className="lg-cond">
            <dt>{t("playReferee")}</dt>
            <dd className="lg-cond-v">{referee != null ? t(REFEREE_KEY[referee]) : "—"}</dd>
            {referee != null ? (
              <dd className="lg-cond-i">{t(REFEREE_IMPACT_KEY[referee])}</dd>
            ) : null}
          </div>
          <div className="lg-cond">
            <dt>{t("playWeather")}</dt>
            <dd className="lg-cond-v">{weather != null ? t(WEATHER_KEY[weather]) : "—"}</dd>
            {weather != null ? (
              <dd className="lg-cond-i">{t(WEATHER_IMPACT_KEY[weather])}</dd>
            ) : null}
          </div>
        </dl>
      </section>

      {/* 6 — kick off, FULL WIDTH, the one --cta on the page */}
      <div className="lg-prog-go">
        <button type="button" onClick={onBack} className="lg-ghost">
          {t("progBack")}
        </button>
        <button type="button" onClick={onKickOff} className="lg-kick">
          {t("progKickOff")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append the CSS**

⛔ The kick-off pulse animates **`box-shadow` and `transform` ONLY**. The motion audit
rejects `filter`, and a glowing button is exactly where reflex reaches for it.

```css
/* ---- TASK-1810 · ?phase=preview — the matchday programme ---- */
.lg-prog {
  max-width: 980px;
  margin-inline: auto;
  padding: 24px 16px 64px;
}
.lg-kicker {
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--chalk-faint);
}
.lg-h2 {
  font-size: 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--chalk-dim);
  border-bottom: 1px solid var(--rule);
  padding-bottom: 6px;
  margin-bottom: 14px;
}
.lg-home {
  color: var(--home);
}
.lg-away {
  color: var(--away);
}

.lg-prog-mast {
  border-bottom: 3px double var(--rule);
  padding-bottom: 16px;
}
.lg-prog-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 12px;
  font-size: clamp(28px, 6vw, 46px);
  font-weight: 900;
  letter-spacing: -0.02em;
  margin-top: 6px;
}
.lg-prog-v {
  color: var(--chalk-faint);
  font-size: 0.5em;
}
.lg-prog-sub {
  margin-top: 8px;
  font-family: var(--font-mono), monospace;
  font-size: 12px;
  color: var(--chalk-dim);
}

.lg-prog-stars {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
  margin: 22px 0;
}
.lg-star {
  position: relative;
  display: grid;
  gap: 2px;
  padding: 18px 16px 16px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--rule);
  overflow: hidden;
}
/* the accent hairline along the top edge */
.lg-star::before {
  content: "";
  position: absolute;
  inset-inline: 0;
  top: 0;
  height: 3px;
}
.lg-star-home::before {
  background: linear-gradient(90deg, var(--home), var(--home-deep));
}
.lg-star-away::before {
  background: linear-gradient(90deg, var(--away), var(--away-deep));
}
.lg-star-tag {
  font-family: var(--font-mono), monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--chalk-faint);
}
.lg-star-ovr {
  font-size: 68px;
  line-height: 1;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.lg-star-home .lg-star-ovr {
  color: var(--home);
}
.lg-star-away .lg-star-ovr {
  color: var(--away);
}
.lg-star-name {
  font-size: 18px;
  font-weight: 800;
}
.lg-star-season {
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  color: var(--chalk-dim);
}

.lg-prog-tape {
  margin: 26px 0;
}
.lg-tape-row {
  display: grid;
  grid-template-columns: 3ch 1fr 3ch;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.lg-tape-n {
  font-family: var(--font-mono), monospace;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.lg-tape-track {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--panel-2);
}
.lg-tape-fill-home {
  background: linear-gradient(90deg, var(--home-deep), var(--home));
}
.lg-tape-fill-away {
  background: linear-gradient(90deg, var(--away), var(--away-deep));
  margin-inline-start: auto;
}
.lg-tape-label {
  grid-column: 1 / -1;
  text-align: center;
  font-family: var(--font-mono), monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--chalk-faint);
}

.lg-prog-grid {
  display: grid;
  gap: 20px;
}
@media (min-width: 860px) {
  .lg-prog-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.lg-xi-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.lg-xi-home .lg-xi-title {
  color: var(--home);
}
.lg-xi-away .lg-xi-title {
  color: var(--away);
}
.lg-xi-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.lg-xi-card {
  min-width: 0;
}

.lg-cond-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}
.lg-cond {
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 10px;
  padding: 12px 14px;
}
.lg-cond dt {
  font-family: var(--font-mono), monospace;
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--chalk-faint);
}
.lg-cond-v {
  font-size: 15px;
  font-weight: 800;
  margin-top: 4px;
}
.lg-cond-i {
  font-size: 12px;
  color: var(--chalk-dim);
  margin-top: 4px;
}

.lg-prog-go {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
}
.lg-ghost {
  border: 1px solid var(--rule);
  color: var(--chalk-dim);
  border-radius: 8px;
  padding: 12px 18px;
  font-weight: 700;
  font-size: 14px;
}
.lg-kick {
  flex: 1;
  border-radius: 10px;
  padding: 18px;
  font-size: 17px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--cta);
  color: var(--ink-cta);
  animation: lg-kick-pulse 2400ms var(--ease-in-out-soft) infinite;
}
/* ⛔ box-shadow + transform ONLY. `filter` is rejected by the motion audit and would
   repaint every frame besides. */
@keyframes lg-kick-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--cta) 55%, transparent);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 14px color-mix(in srgb, var(--cta) 0%, transparent);
    transform: scale(1.012);
  }
}
@media (prefers-reduced-motion: reduce) {
  .lg-kick {
    animation: none;
  }
}
```

- [ ] **Step 5: Run the test**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-match-programme.test.tsx && npx tsc --noEmit
```

Expected: PASS, 5 tests; no tsc output.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/components/MatchProgramme.tsx src/app/globals.css tests/unit/game-match-programme.test.tsx
git commit -m "feat(game): the matchday programme, ?phase=preview (TASK-1810)"
```

---

### Task 6: Wire the programme into `GamePlay`

**Files:**

- Modify: `src/features/game/components/GamePlay.tsx`
- Modify: `src/app/[locale]/game/[mode]/[club]/page.tsx`
- Test: `tests/unit/game-pitch-draft.test.tsx` (append a screens case)

- [ ] **Step 1: Add the prop and the branch**

In `GamePlay`'s props:

```tsx
  /** Which match screens this pack uses. Absent = the shipped ones. */
  screens,
```

with the type `screens?: ScreensSpec;` and this doc comment:

```tsx
/**
 * ⚠️ A pack FIELD, not a mode check. `GamePlay` must never learn about game modes —
 * "modes are rule packs, not code paths" is the locked architecture, and a
 * `mode === "legacy"` branch here is exactly the shape that rule forbids.
 */
```

Replace the preview branch body:

```tsx
if (state.phase === "preview") {
  const onKickOff = () => dispatch({ type: "kickOff" });
  const onBack = () => {
    // ⚠️ Cleared in the handler, never in an effect. An effect gated on "phase is not
    // live" would race the restore effect on mount and wipe the record before it could
    // be read.
    void clearMatch();
    dispatch({ type: "backToSetup" });
  };
  return screens === "legacy" ? (
    <MatchProgramme
      home={match.home}
      away={match.away}
      referee={referee}
      weather={weather}
      onKickOff={onKickOff}
      onBack={onBack}
    />
  ) : (
    <MatchupPreview
      home={match.home}
      away={match.away}
      referee={referee}
      weather={weather}
      onKickOff={onKickOff}
      onBack={onBack}
    />
  );
}
```

- [ ] **Step 2: Pass it from the route**

In `src/app/[locale]/game/[mode]/[club]/page.tsx`, add `screens={pack.screens}` to the
`<GamePlay>` element.

- [ ] **Step 3: Add the regression test**

Append to `tests/unit/game-pitch-draft.test.tsx`:

```tsx
it("a pack with no screens field keeps the shipped preview", async () => {
  // The control for TASK-1810: /game/draft and /game/chaos must not move.
  renderWithNuqs(<GamePlay pool={pool} initialPhase="setup" />);
  expect(screen.queryByTestId("prog-card")).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run the full game suite**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-
```

Expected: PASS. ⚠️ If you see `ERR_IPC_CHANNEL_CLOSED` / exit 15, that is a flaky worker
crash under load, not a failure — re-run when the machine is quiet, and check an unmodified
checkout as a control before believing it.

- [ ] **Step 5: Commit**

```bash
git add -u && git commit -m "feat(game): Legacy enters the programme at ?phase=preview (TASK-1810)"
```

---

### Task 7: PR A — verify and ship

- [ ] **Step 1: Full gates**

```bash
cd ~/projects/pitchiq && npx tsc --noEmit && CI=true pnpm lint && npx vitest run
```

⛔ `next build` CANNOT run here — every Google Fonts request from Node times out. **CI's
Build check is the gate; do not burn time locally.**

- [ ] **Step 2: Verify in a real browser, by measurement**

A green suite is not evidence the screen renders. Start the dev server, drive to
`/game/legacy/31?phase=preview` via a draft, and confirm by script that 22 cards and 4 bars
are in the DOM and that the computed background of `.lg-root` is the token value.

- [ ] **Step 3: Flip the ticket**

Update `TASKS.md` — TASK-1810's preview row. The owner expects statuses flipped as PART of
shipping, not deferred.

- [ ] **Step 4: Branch → PR → squash-merge on green**

Per `pitchiq-git-workflow`: `gh` is not in WSL; use the token from `~/.git-credentials`
with the Python `urllib` REST helper. ⛔ Never push to `main`.

---

# PR B — the split feed

### Task 8: `domain/captaincy.ts`

**Files:**

- Create: `src/features/game/domain/captaincy.ts`
- Test: `tests/unit/game-captaincy.test.ts`

The rule (spec §3.5): the armband goes to the player with the **most real captaincies**
across `data/captains.json`; next most is **vice**; with no record at all, fall back to
rating. If the captain leaves the pitch — red card or substitution — the vice inherits it.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { armbandAt, rankCaptains } from "@/features/game/domain/captaincy";

const counts = new Map([
  [1004839, 4], // Gerrard
  [1002313, 3], // van Dijk
]);

const squad = [
  { playerId: 1004839, rating: 88 },
  { playerId: 1002313, rating: 91 },
  { playerId: 999, rating: 95 },
];

describe("rankCaptains", () => {
  it("gives the armband to the most-capped captain, not the best player", () => {
    const r = rankCaptains(squad, counts);
    expect(r.captain).toBe(1004839);
    expect(r.vice).toBe(1002313);
  });

  it("falls back to rating when nobody in the XI has a record", () => {
    // captains.json covers 20 seasons thinly — this is common, not an edge case.
    const r = rankCaptains(squad, new Map());
    expect(r.captain).toBe(999);
    expect(r.vice).toBe(1002313);
  });

  it("breaks a tie on captaincies by rating", () => {
    const tied = new Map([
      [1004839, 2],
      [1002313, 2],
    ]);
    expect(rankCaptains(squad, tied).captain).toBe(1002313); // 91 beats 88
  });

  it("has no vice in a one-man squad", () => {
    expect(rankCaptains([{ playerId: 7, rating: 70 }], new Map()).vice).toBeNull();
  });
});

describe("armbandAt", () => {
  it("keeps the captain while he is on the pitch", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set())).toBe(1);
  });

  it("hands it to the vice when the captain is sent off or substituted", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set([1]))).toBe(2);
  });

  it("returns null when both have left", () => {
    expect(armbandAt({ captain: 1, vice: 2 }, new Set([1, 2]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-captaincy.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * TASK-1810 — who wears the armband (owner requirement, 2026-08-18).
 *
 * Pure and data-free: the COUNTS are handed in, because `captains.json` is a server-only
 * read and this runs in a client component.
 */

export interface Captaincy {
  captain: number | null;
  vice: number | null;
}

export interface CaptainCandidate {
  playerId: number;
  rating: number;
}

/**
 * Rank an XI into captain and vice.
 *
 * ⚠️ Real captaincies OUTRANK rating, always. Measured on the sample XI: Gerrard's 4
 * takes the armband from van Dijk's 3 even though van Dijk is the better card.
 *
 * ⚠️ The rating fallback is NOT an edge case. `captains.json` covers 20 seasons thinly
 * (1997 has two entries in the whole file), so most Legacy XIs will have no recorded
 * captain at all and land here.
 */
export function rankCaptains(
  squad: CaptainCandidate[],
  counts: ReadonlyMap<number, number>,
): Captaincy {
  const ranked = [...squad].sort((a, b) => {
    const ca = counts.get(a.playerId) ?? 0;
    const cb = counts.get(b.playerId) ?? 0;
    if (ca !== cb) return cb - ca;
    return b.rating - a.rating;
  });
  return { captain: ranked[0]?.playerId ?? null, vice: ranked[1]?.playerId ?? null };
}

/**
 * Who is wearing it right now.
 *
 * ⛔ The vice is NEVER displayed as such while the captain is on — he is only the
 * fallback. He inherits the armband the moment the captain leaves the pitch, by red card
 * or substitution, and the handover is written into the commentary.
 */
export function armbandAt(c: Captaincy, offPitch: ReadonlySet<number>): number | null {
  if (c.captain != null && !offPitch.has(c.captain)) return c.captain;
  if (c.vice != null && !offPitch.has(c.vice)) return c.vice;
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-captaincy.test.ts && npx tsc --noEmit
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/captaincy.ts tests/unit/game-captaincy.test.ts
git commit -m "feat(game): the armband goes to the most-capped captain (TASK-1810)"
```

---

### Task 9: Plumb the captaincy counts through the build

**Files:**

- Modify: `src/features/game/adapter/pool.ts`
- Modify: `src/app/[locale]/game/[mode]/[club]/page.tsx`

- [ ] **Step 1: Add the build-time counter**

Append to `src/features/game/adapter/pool.ts`:

```ts
import { loadCaptains } from "@/data/loaders";

/**
 * How many real captaincies each player in the pool has, across every season and club.
 *
 * ⚠️ Build time only, like everything else in this file, and NARROWED to the pool — the
 * full map is season → team → player for 34 seasons, and shipping all of it to the client
 * would put a second data payload on a page that already carries ~900 cards.
 *
 * ⚠️ Counted per PLAYER across all clubs, not per club. Gerrard's four are Liverpool's,
 * but the rule is "most real captaincies", full stop.
 */
export async function captaincyCounts(
  playerIds: Iterable<number>,
): Promise<Record<number, number>> {
  const captains = await loadCaptains();
  if (captains == null) return {};
  const wanted = new Set(playerIds);
  const out: Record<number, number> = {};
  for (const bySeason of Object.values(captains)) {
    for (const playerId of Object.values(bySeason)) {
      if (!wanted.has(playerId)) continue;
      out[playerId] = (out[playerId] ?? 0) + 1;
    }
  }
  return out;
}
```

⚠️ Confirm the exported name of the loader first — `src/data/loaders.ts:183` reads
`captains.json` and merges the overrides. Use whatever that function is actually called.

- [ ] **Step 2: Pass it from the route**

In `ModeClubPage`, after the pool is built:

```tsx
const pool = await buildPool(pack.pool, choice.id);
const captaincies = await captaincyCounts(pool.map((c) => c.playerId));
```

and add `captaincies={captaincies}` to `<GamePlay>`.

- [ ] **Step 3: Verify the payload did not blow up**

```bash
cd ~/projects/pitchiq && node -e "console.log('inspect the built page payload after CI builds')"
```

Sanity-check by counting: a club's pool is ~900 cards over ~300 distinct players, so the
map is at most a few hundred small entries. If it is larger than that, the narrowing is
broken.

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "feat(game): ship each club's real captaincy counts (TASK-1810)"
```

---

### Task 10: `view/bench-state.ts` — the substitution policy

Wires the **already-built, never-wired** `coach-policy.ts` and adds the owner's
auto/manual ruling on top.

**Files:**

- Create: `src/features/game/view/bench-state.ts`
- Test: `tests/unit/game-bench-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import type { SubOfferDecision } from "@/features/game/domain/match-decisions";
import { answerFor, benchLabel } from "@/features/game/view/bench-state";

const offer = (minute: number, suggests: boolean): SubOfferDecision => ({
  kind: "sub-offer",
  minute,
  side: "home",
  events: [],
  stoppage: false,
  engineSuggests: suggests,
  suggestedOff: 3,
  legalOff: [],
  legalOn: [],
});

describe("answerFor", () => {
  it("auto mode takes the engine's own recommendation", () => {
    const a = answerFor(offer(60, true), "auto");
    expect(a.kind).toBe("sub-offer");
    expect((a as { off?: number }).off).toBe(3);
  });

  it("manual mode never substitutes for you", () => {
    // The owner's ruling: with Manual Subs Only the window expires with no change made.
    expect((answerFor(offer(60, true), "manual") as { off?: number }).off).toBeUndefined();
  });

  it("declines when the engine is not suggesting anything, in either mode", () => {
    for (const mode of ["auto", "manual"] as const) {
      expect((answerFor(offer(60, false), mode) as { off?: number }).off).toBeUndefined();
    }
  });

  it("always answers — a pending decision hangs the generator", () => {
    expect(answerFor(offer(60, false), "manual")).toMatchObject({ minute: 60, side: "home" });
  });
});

describe("benchLabel", () => {
  it("reads Change available only while one actually is", () => {
    expect(benchLabel(offer(60, true))).toBe("available");
    expect(benchLabel(offer(60, false))).toBe("idle");
    expect(benchLabel(null)).toBe("idle");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-bench-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import {
  type DecisionAnswer,
  type MatchDecision,
  type SubOfferDecision,
  defaultAnswer,
} from "@/features/game/domain/match-decisions";
import { fallbackFor } from "@/features/game/components/DecisionPrompt";

/** Whether an ignored offer resolves itself. Owner ruling, 2026-08-18. */
export type SubMode = "auto" | "manual";

/**
 * What an offer the coach did not answer becomes.
 *
 * ⛔ There is no "leave it pending". Every decision the engine raises must be answered or
 * the generator hangs, so BOTH modes return an answer — they differ only in what it says.
 *
 * ⚠️ `auto` uses `defaultAnswer`, NOT `fallbackFor`. The shipped `fallbackFor` declines a
 * lapsed sub-offer; the owner asked for the engine to execute its own recommendation, and
 * `defaultAnswer` is the one that takes `suggestedOff` when `engineSuggests` is true.
 */
export function answerFor(d: MatchDecision, mode: SubMode): DecisionAnswer {
  if (mode === "manual") return fallbackFor(d);
  return defaultAnswer(d);
}

/** What the Bench button should read. `available` turns it amber. */
export function benchLabel(pending: SubOfferDecision | null): "idle" | "available" {
  return pending?.engineSuggests === true ? "available" : "idle";
}
```

⚠️ If importing `fallbackFor` from a `"use client"` component into a view module trips the
lint boundary, move `fallbackFor` into `domain/match-decisions.ts` and re-export it from
`DecisionPrompt` so the shipped import path keeps working.

- [ ] **Step 4: Run to verify it passes**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/game-bench-state.test.ts && npx tsc --noEmit
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/view/bench-state.ts tests/unit/game-bench-state.test.ts
git commit -m "feat(game): the bench's auto/manual substitution policy (TASK-1810)"
```

---

### Task 11: `LivePitch.tsx` — both XIs, one pitch

⛔ **STATIC.** The player animation is NOT agreed (spec §3.1) — two attempts were rejected
and it needs its own design pass. A static both-teams pitch is the agreed first cut. Do NOT
port the prototype's motion, and do NOT reimplement its `Math.random`, which breaks the
Phase-18 determinism rule besides.

⛔ When the motion IS designed, move players by **`transform: translate()`**, never
`left`/`top` — animating layout properties re-lays-out the pitch every frame.

**Files:**

- Create: `src/features/game/components/LivePitch.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useTranslations } from "next-intl";
import type { PitchPlayer } from "@/features/game/view/match-view-model";

interface Pip {
  player: PitchPlayer;
  booked: boolean;
  sentOff: boolean;
  captain: boolean;
}

interface Props {
  home: Pip[];
  away: Pip[];
  /** Rows in each side's formation, for the coordinate maths. */
  homeRows: number;
  awayRows: number;
  label: string;
}

/**
 * TASK-1810 — the live mini-map: both XIs on one pitch.
 *
 * Yours attacks right; theirs is MIRRORED (`x` → `100 - x`) so the two shapes face each
 * other instead of overlapping. Positions come from each side's own formation slots.
 */
export function LivePitch({ home, away, homeRows, awayRows, label }: Props) {
  const t = useTranslations("game");

  const place = (pips: Pip[], rows: number, mirror: boolean, side: "home" | "away") =>
    pips.map((pip, i) => {
      const { row, col } = pip.player;
      const inRow = pips.filter((p) => p.player.row === row).length;
      // Half the pitch each: home occupies 0-50%, away 50-100% once mirrored.
      const x = (row / (rows + 1)) * 50;
      const y = (col / (inRow + 1)) * 100;
      return (
        <span
          key={`${side}-${i}`}
          className={`lg-pip lg-pip-${side}${pip.sentOff ? " lg-pip-off" : ""}`}
          style={{ insetInlineStart: `${mirror ? 100 - x : x}%`, top: `${y}%` }}
          title={pip.player.name}
        >
          <span className="lg-pip-n">{pip.player.number}</span>
          {pip.captain ? (
            <span className="lg-pip-c" aria-hidden="true">
              C
            </span>
          ) : null}
          {pip.booked ? <span className="lg-pip-y" aria-hidden="true" /> : null}
        </span>
      );
    });

  return (
    <div className="lg-pitch" role="img" aria-label={label}>
      <span className="lg-line lg-halfway" />
      <span className="lg-circle" />
      <span className="lg-spot lg-spot-c" />
      <span className="lg-box lg-box-l" />
      <span className="lg-box lg-box-l lg-box-six" />
      <span className="lg-spot lg-spot-l" />
      <span className="lg-box lg-box-r" />
      <span className="lg-box lg-box-r lg-box-six" />
      <span className="lg-spot lg-spot-r" />
      {place(home, homeRows, false, "home")}
      {place(away, awayRows, true, "away")}
      <span className="sr-only">{t("pitchAria")}</span>
    </div>
  );
}
```

- [ ] **Step 2: Append the CSS**

```css
/* ---- TASK-1810 · the live pitch ---- */
.lg-pitch {
  position: relative;
  width: 100%;
  aspect-ratio: 105 / 68;
  border-radius: 10px;
  border: 2px solid color-mix(in srgb, var(--chalk) 26%, transparent);
  background: repeating-linear-gradient(90deg, var(--turf-a) 0 8.33%, var(--turf-b) 8.33% 16.66%);
  overflow: hidden;
}
.lg-halfway {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  background: color-mix(in srgb, var(--chalk) 26%, transparent);
}
.lg-circle {
  position: absolute;
  left: 50%;
  top: 50%;
  height: 30%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border: 2px solid color-mix(in srgb, var(--chalk) 26%, transparent);
  border-radius: 50%;
}
.lg-box {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 58%;
  width: 15%;
  border: 2px solid color-mix(in srgb, var(--chalk) 26%, transparent);
}
.lg-box-l {
  left: -1px;
  border-left: 0;
}
.lg-box-r {
  right: -1px;
  border-right: 0;
}
.lg-box-six {
  height: 27%;
  width: 6.5%;
}
.lg-spot {
  position: absolute;
  top: 50%;
  height: 4px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: color-mix(in srgb, var(--chalk) 60%, transparent);
  transform: translate(-50%, -50%);
}
.lg-spot-c {
  left: 50%;
}
.lg-spot-l {
  left: 11%;
}
.lg-spot-r {
  left: 89%;
}

.lg-pip {
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-family: var(--font-mono), monospace;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 2px 6px rgb(0 0 0 / 45%);
}
.lg-pip-home {
  background: var(--home);
  color: var(--ink-home);
}
.lg-pip-away {
  background: var(--away);
  color: var(--ink-away);
}
.lg-pip-off {
  opacity: 0.28;
}
.lg-pip-c {
  position: absolute;
  top: -5px;
  inset-inline-end: -5px;
  font-size: 8px;
  background: var(--chalk);
  color: var(--ground);
  border-radius: 3px;
  padding: 0 2px;
}
.lg-pip-y {
  position: absolute;
  bottom: -4px;
  inset-inline-start: -3px;
  width: 5px;
  height: 7px;
  border-radius: 1px;
  background: var(--alert);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/game/components/LivePitch.tsx src/app/globals.css
git commit -m "feat(game): both XIs on one pitch, away mirrored (TASK-1810)"
```

---

### Task 12: `TeamSheets.tsx` — each player's own match

Two ruled columns, gold and rose, each row `POS · name · rating`, caption carrying
formation, decade span and the captain. Each row carries that player's own events — the
same stream regrouped by _who_ rather than _when_. ⚠️ A red card renders 🟥, not the yellow
badge.

**Files:**

- Create: `src/features/game/components/TeamSheets.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useTranslations } from "next-intl";
import type { ViewEvent } from "@/features/game/view/match-view-model";
import type { PitchPlayer } from "@/features/game/view/match-view-model";

export interface SheetRow {
  player: PitchPlayer;
  captain: boolean;
  /** This player's own match, in minute order. */
  own: ViewEvent[];
}

interface Props {
  home: SheetRow[];
  away: SheetRow[];
  homeCaption: string;
  awayCaption: string;
}

/** One glyph per thing that happened to him. ⚠️ A red card is 🟥, never the yellow badge. */
function marks(own: ViewEvent[]): string {
  return own
    .map((e) =>
      e.kind === "goal"
        ? "⚽"
        : e.kind === "card"
          ? e.card === "red"
            ? "🟥"
            : "🟨"
          : e.kind === "substitution"
            ? "🔄"
            : e.kind === "injury"
              ? "🚑"
              : "",
    )
    .join("");
}

export function TeamSheets({ home, away, homeCaption, awayCaption }: Props) {
  const t = useTranslations("game");
  const column = (rows: SheetRow[], side: "home" | "away", caption: string) => (
    <div className={`lg-sheet lg-sheet-${side}`}>
      <p className="lg-sheet-cap">{caption}</p>
      <ul className="lg-sheet-list">
        {rows.map((r, i) => {
          const m = marks(r.own);
          return (
            <li key={`${side}-${i}`} className={`lg-sheet-row${m !== "" ? " lg-sheet-live" : ""}`}>
              <span className="lg-sheet-pos">{r.player.role}</span>
              <span className="lg-sheet-name">
                {r.player.name}
                {r.captain ? <span className="lg-sheet-c">C</span> : null}
              </span>
              <span className="lg-sheet-marks" aria-hidden="true">
                {m}
              </span>
              <span className="lg-sheet-ovr">{r.player.rating ?? "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <section className="lg-sheets" aria-label={t("lineups")}>
      {column(home, "home", homeCaption)}
      {column(away, "away", awayCaption)}
    </section>
  );
}
```

- [ ] **Step 2: Append the CSS**

```css
/* ---- TASK-1810 · the team sheets ---- */
.lg-sheets {
  display: grid;
  gap: 16px;
  margin-top: 22px;
}
@media (min-width: 760px) {
  .lg-sheets {
    grid-template-columns: 1fr 1fr;
  }
}
.lg-sheet-cap {
  font-family: var(--font-mono), monospace;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--chalk-faint);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--rule);
}
.lg-sheet-home .lg-sheet-cap {
  color: var(--home);
}
.lg-sheet-away .lg-sheet-cap {
  color: var(--away);
}
.lg-sheet-row {
  display: grid;
  grid-template-columns: 4ch 1fr auto 3ch;
  align-items: center;
  gap: 8px;
  padding: 7px 4px;
  border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent);
  transition: transform var(--motion-duration-fast) var(--ease-out-soft);
}
/* Rows with events lift slightly. */
.lg-sheet-live {
  transform: translateX(3px);
  background: color-mix(in srgb, var(--panel-2) 70%, transparent);
}
.lg-sheet-pos {
  font-family: var(--font-mono), monospace;
  font-size: 10px;
  color: var(--chalk-faint);
}
.lg-sheet-name {
  font-size: 14px;
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lg-sheet-c {
  display: inline-grid;
  place-items: center;
  margin-inline-start: 6px;
  font-size: 9px;
  font-weight: 800;
  background: var(--chalk);
  color: var(--ground);
  border-radius: 3px;
  padding: 0 3px;
}
.lg-sheet-marks {
  font-size: 12px;
  letter-spacing: 1px;
}
.lg-sheet-ovr {
  font-family: var(--font-mono), monospace;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  text-align: end;
}
@media (prefers-reduced-motion: reduce) {
  .lg-sheet-row {
    transition: none;
  }
  .lg-sheet-live {
    transform: none;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/game/components/TeamSheets.tsx src/app/globals.css
git commit -m "feat(game): team sheets carrying each player's own match (TASK-1810)"
```

---

### Task 13: `BenchDialog.tsx` — the substitution popup

⛔ **Nothing on screen uninvited.** The Bench button is an ordinary control that is always
present; when a change is available the SAME button turns amber and reads "Change
available". No new panel appears until it is pressed.

Rules: every player is a **card**, not a list row; choose one **off** and one **on**;
**Confirm stays disabled until both are picked**; the engine's recommendation carries a
**SUGGESTED** flag and the captain is flagged too; closes three ways — Close, Not now,
Escape.

**Files:**

- Create: `src/features/game/components/BenchDialog.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { GamePlayer } from "@/features/game/domain/player";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { prefersReducedMotion } from "@/utils/motion";
import { PlayerCard } from "./PlayerCard";

interface Props {
  legalOff: GamePlayer[];
  legalOn: GamePlayer[];
  suggestedOff?: number;
  captainId: number | null;
  onConfirm: (off: number, on: number) => void;
  onClose: () => void;
}

export function BenchDialog({
  legalOff,
  legalOn,
  suggestedOff,
  captainId,
  onConfirm,
  onClose,
}: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [off, setOff] = useState<number | null>(null);
  const [on, setOn] = useState<number | null>(null);

  // Escape is the third way out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickList = (
    players: GamePlayer[],
    chosen: number | null,
    choose: (id: number) => void,
    kind: "off" | "on",
  ) => (
    <div className="lg-bench-grid">
      {players.map((p) => (
        // ⛔ The card is NOT the button. A card that is itself a button cannot host
        // another, and a control inside the card's 3D flip does not hit-test.
        <div
          key={p.cardId}
          className={`lg-bench-card${chosen === p.playerId ? " lg-bench-picked" : ""}`}
        >
          <PlayerCard card={p as EnrichedCard} reduced={reduced} interactive={false} />
          <div className="lg-bench-flags">
            {kind === "off" && p.playerId === suggestedOff ? (
              <span className="lg-flag lg-flag-sug">{t("benchSuggested")}</span>
            ) : null}
            {p.playerId === captainId ? (
              <span className="lg-flag lg-flag-cap">{t("benchCaptain")}</span>
            ) : null}
          </div>
          <button
            type="button"
            className="lg-bench-hit"
            aria-pressed={chosen === p.playerId}
            aria-label={t(kind === "off" ? "benchTakeOff" : "benchBringOn", { name: p.name })}
            onClick={() => choose(p.playerId)}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="lg-veil" role="dialog" aria-modal="true" aria-label={t("benchTitle")}>
      <div className="lg-bench">
        <div className="lg-bench-head">
          <h2 className="lg-bench-title">{t("benchTitle")}</h2>
          <button type="button" onClick={onClose} className="lg-ghost">
            {t("benchClose")}
          </button>
        </div>

        <h3 className="lg-h2">{t("benchComingOff")}</h3>
        {pickList(legalOff, off, setOff, "off")}

        <h3 className="lg-h2">{t("benchGoingOn")}</h3>
        {pickList(legalOn, on, setOn, "on")}

        <div className="lg-bench-go">
          <button type="button" onClick={onClose} className="lg-ghost">
            {t("benchNotNow")}
          </button>
          <button
            type="button"
            // ⛔ Disabled until BOTH are chosen.
            disabled={off == null || on == null}
            onClick={() => {
              if (off != null && on != null) onConfirm(off, on);
            }}
            className="lg-confirm"
          >
            {t("benchConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Append the CSS**

```css
/* ---- TASK-1810 · the bench popup ---- */
.lg-veil {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--ground) 88%, transparent);
  backdrop-filter: blur(3px);
}
.lg-bench {
  width: min(980px, 100%);
  max-height: 88vh;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 14px;
  padding: 20px;
}
.lg-bench-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.lg-bench-title {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.01em;
}
.lg-bench-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  margin-bottom: 20px;
}
/* ⛔ `position: relative` on the WRAPPER, so the hit target can cover the card without
   living inside it — a control inside PlayerCard's 3D flip does not hit-test. */
.lg-bench-card {
  position: relative;
  border-radius: 10px;
  outline: 2px solid transparent;
  transition: outline-color var(--motion-duration-fast) var(--ease-out-soft);
}
.lg-bench-picked {
  outline-color: var(--alert);
}
.lg-bench-hit {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
}
.lg-bench-flags {
  position: absolute;
  inset-block-start: 4px;
  inset-inline-start: 4px;
  z-index: 3;
  display: grid;
  gap: 3px;
  justify-items: start;
  pointer-events: none;
}
.lg-flag {
  font-family: var(--font-mono), monospace;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  border-radius: 3px;
  padding: 1px 4px;
}
.lg-flag-sug {
  background: var(--alert);
  color: var(--ink-home);
}
.lg-flag-cap {
  background: var(--chalk);
  color: var(--ground);
}
.lg-bench-go {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--rule);
}
.lg-confirm {
  background: var(--cta);
  color: var(--ink-cta);
  border-radius: 8px;
  padding: 12px 22px;
  font-weight: 900;
  font-size: 14px;
}
.lg-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .lg-bench-card {
    transition: none;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/features/game/components/BenchDialog.tsx src/app/globals.css
git commit -m "feat(game): the bench popup — cards, off and on, Confirm gated (TASK-1810)"
```

---

### Task 13b: i18n for the live screen, and the armband handover line

**Files:**

- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Modify: `src/features/game/domain/commentary.ts` (the handover line only)

- [ ] **Step 1: Add the live screen's keys under `game`**

English:

```json
"benchTitle": "The bench",
"benchOpen": "Bench",
"benchAvailable": "Change available",
"benchComingOff": "Coming off",
"benchGoingOn": "Going on",
"benchSuggested": "Suggested",
"benchCaptain": "Captain",
"benchConfirm": "Make the change",
"benchNotNow": "Not now",
"benchClose": "Close",
"benchTakeOff": "Take {name} off",
"benchBringOn": "Bring {name} on",
"benchManualOnly": "Manual subs only",
"benchManualHint": "Never substitute for me",
"liveSheetCaption": "{shape} · {first}–{last} · {captain}",
"liveNoCaptain": "no recorded captain"
```

Arabic:

```json
"benchTitle": "دكة البدلاء",
"benchOpen": "البدلاء",
"benchAvailable": "تغيير متاح",
"benchComingOff": "الخارج",
"benchGoingOn": "الداخل",
"benchSuggested": "مقترح",
"benchCaptain": "القائد",
"benchConfirm": "نفّذ التبديل",
"benchNotNow": "ليس الآن",
"benchClose": "إغلاق",
"benchTakeOff": "إخراج {name}",
"benchBringOn": "إدخال {name}",
"benchManualOnly": "تبديلات يدوية فقط",
"benchManualHint": "لا تُجرِ أي تبديل نيابةً عني",
"liveSheetCaption": "{shape} · {first}–{last} · {captain}",
"liveNoCaptain": "لا يوجد قائد مسجَّل"
```

- [ ] **Step 2: Add the armband handover commentary line**

⚠️ Spec §3.5 requires the handover to be **written into the commentary**, not merely
reflected on the pitch. `armbandAt` decides WHO wears it; this is what SAYS so.

Add to the commentary catalog (`game.commentary.*`, matching the shipped key shape — open
`src/features/game/domain/commentary.ts` and follow whatever prefix the existing refs use):

```json
"armbandHandover": "The armband goes to {name}."
```

Arabic:

```json
"armbandHandover": "شارة القيادة تنتقل إلى {name}."
```

⛔ It is emitted by the VIEW, not the engine. The engine must not learn that a human is
coaching — that is the determinism rule the whole interruptible-engine arc rests on. So
`MatchLive` renders this line into the feed at the minute the captain's dismissal or
substitution lands; it is never pushed into `MatchEvent[]`.

- [ ] **Step 3: Verify catalog parity**

```bash
cd ~/projects/pitchiq && npx vitest run tests/unit/i18n && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/i18n/messages/en.json src/i18n/messages/ar.json src/features/game/domain/commentary.ts
git commit -m "i18n(game): the bench, the sheets and the armband handover (TASK-1810)"
```

---

### Task 14: `MatchLive.tsx` — the split feed, and the wiring

**Files:**

- Create: `src/features/game/components/MatchLive.tsx`
- Modify: `src/features/game/components/GamePlay.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/unit/game-match-live.test.tsx`

Structure: scoreboard across the top (names, score, beating clock, referee + weather chips
beneath a rule) → the split (pitch left, commentary right) → team sheets → the Bench
control + the Manual Subs Only toggle.

⚠️ **The split must be equal-height.** `align-items: stretch` does NOT do it — the feed's
own content grows the row. Put the feed in a `position: relative` pane with the list
`position: absolute; inset: 0; overflow-y: auto`, so the pitch's `aspect-ratio` alone sets
the row height.

⛔ Commentary resolves through `commentaryArgs()`. The catalog also carries a trailing
`({minuteFmt}')`; the feed prints the minute in its own column, so strip it once here
rather than rendering it twice.

- [ ] **Step 1: Write the failing test**

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
const { MatchLive } = await import("@/features/game/components/MatchLive");

describe("MatchLive", () => {
  it("resolves commentary through commentaryArgs, so a scoreline is never a bare dash", () => {
    // The owner caught this in a prototype: substituting ref.values leaves "…buries it. –".
    renderWithIntl(<MatchLive {...fixtureWithAGoal()} />);
    expect(screen.queryByText(/\s–\s*$/)).not.toBeInTheDocument();
    expect(screen.getByText(/1-0|1–0/)).toBeInTheDocument();
  });

  it("keeps the bench out of the way until it is asked for", () => {
    renderWithIntl(<MatchLive {...fixtureWithAGoal()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the bench on the button, and Confirm is dead until both are picked", async () => {
    renderWithIntl(<MatchLive {...fixtureWithAnOffer()} />);
    await userEvent.click(screen.getByRole("button", { name: /bench|change available/i }));
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("hands the armband to the vice when the captain goes off", () => {
    renderWithIntl(<MatchLive {...fixtureWithCaptainSentOff()} />);
    // Exactly one C on the home side, and it is not the dismissed captain.
    expect(screen.getAllByText("C")).toHaveLength(2); // one per side
  });
});
```

⚠️ Build the fixtures from a **genuinely simulated match** over the real pool helper, not a
hand-written event list. A fixture that cannot occur proves nothing — that rule has caught
three defects a green suite hid.

- [ ] **Step 2: Run to verify it fails, implement `MatchLive`, run to verify it passes.**

The component owns: the clock (lifted from `MatchView` — reuse `TICK_MS`, `DWELL_MS`,
`SPEEDS`, the `holdAt` ceiling and the `held` ref verbatim; that logic is what protects the
VAR drama and must not be re-derived), `lineupAt` for both sides, `scoreAt`, `rankCaptains`

- `armbandAt`, the `SubMode` toggle, and `answerFor` on the 20-second lapse.

* [ ] **Step 3: Branch it in `GamePlay`**

```tsx
  return (
    <div>
      {model != null ? (
        screens === "legacy" ? (
          <MatchLive
            model={model}
            holdAt={pending?.minute ?? (result == null ? 0 : undefined)}
            pending={pending}
            captaincies={captaincies}
            referee={referee}
            weather={weather}
            onAnswer={driver.answer}
          />
        ) : (
          <MatchView model={model} holdAt={pending?.minute ?? (result == null ? 0 : undefined)} />
        )
      ) : null}
      {/* ⛔ The shipped prompt is for the OTHER packs only. Legacy's affordance is the
          Bench button, and a modal appearing over it is the complaint this redesign
          exists to answer. */}
      {pending != null && screens !== "legacy" ? (
        <DecisionPrompt decision={pending} limit={DECISION_LIMIT} onAnswer={driver.answer} />
      ) : null}
      …
```

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "feat(game): the split feed, ?phase=live (TASK-1810)"
```

---

### Task 15: PR B — verify and ship

- [ ] **Step 1: Full gates** — `npx tsc --noEmit && CI=true pnpm lint && npx vitest run`
- [ ] **Step 2: Prove the OTHER modes did not move.** `/game/draft`, `/game/chaos` and
      `/game/daily` must still render `MatchupPreview`/`MatchView` and still show
      `DecisionPrompt`. Their existing tests are the control — if none of them would fail
      when `screens` is forced to `"legacy"`, the control is not real. **Verify the gate by
      making it fail** before trusting it.
- [ ] **Step 3: Confirm the CPU guards.** Both routes keep `force-static`,
      `dynamicParams = false`, and `/game/*` stays in the daily cache-guard probe.
- [ ] **Step 4: Browser verification by measurement** — the split's two panes must report
      equal `getBoundingClientRect().height`.
- [ ] **Step 5: Flip `TASKS.md`, open the PR, squash-merge on green.**

---

## Still open after this plan

1. ⛔ **The pitch mini-map animation.** Two attempts rejected; needs its own design pass.
   The live screen ships with a static pitch until then.
2. ⏸ **The 30-concept animation galleries** — parked by the owner, 2026-08-18.
3. **The commentary suffix.** The catalog carries a trailing `({minuteFmt}')` and the feed
   prints the minute in its own column. Decide once, in `MatchLive`, and strip it there.
