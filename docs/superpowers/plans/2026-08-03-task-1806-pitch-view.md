# TASK-1806 (pitch view) — Broadcast × Win-Probability Live Match View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the locked **Broadcast × Win-Probability** live match view with the **Glow Pulse** animation: win-probability logic, an XI assembler, a serializable view-model, the first game `.tsx` component playing a real simulated match minute-by-minute, and a `force-static` `/game` route — all passing the motion audit, the hardcoded-string guard, and the caching rules.

**Architecture:** Pure `domain/win-probability.ts` (Poisson model) + `view/match-view-model.ts` (serializable props builder) are browser-safe. A server-only `adapter/lineup.ts` assembles a real XI (rated squad → formation slots). The `/game` server page (`force-static`) assembles two fixed teams, simulates + builds the model at build time, and hands it to a client `MatchView` that plays it back. Glow Pulse is a `box-shadow` keyframe in `globals.css` (allowlisted) riding `var(--primary)`, reduce-gated. Design: chosen this session (Broadcast × Win-Prob + Glow Pulse #17).

**Tech Stack:** Next.js App Router, next-intl v4, Tailwind v4 (CSS tokens), Vitest (+happy-dom, `NextIntlClientProvider` in tests), Playwright (MSW). WSL via `wsl -d Ubuntu -- bash -lc '…'`.

## Toolchain notes (WSL / PitchIQ)

- Pin node PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`.
- Binaries: `./node_modules/.bin/vitest run <p>`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint <p>`. Commit `--no-verify`. Branch `feat/task-1806-pitch-view`.
- Playwright/E2E is flaky on nav specs — if the pipeline is red only on unrelated nav specs, rerun-failed-jobs (see the git-workflow memory). Write the new e2e with the **content-visible** pattern, never `toHaveURL` races.

## Conventions locked by exploration (obey these)

- **Route**: `src/app/[locale]/game/page.tsx`, server component. `export const dynamic = "force-static"; export const revalidate = 86400;` (both — `revalidate` alone falls back to dynamic). `await params` → `setRequestLocale(locale)` **before** any `getTranslations`. **NEVER read the server `searchParams` prop** (breaks static). Assemble + simulate at build time; pass results as props.
- **Motion audit** (`tests/unit/motion-audit.test.ts`): `@keyframes` live **only in `src/app/globals.css`**; animatable props allowlist **includes `box-shadow`** (NOT `filter`). Each autoplaying surface gets its own `@media (prefers-reduced-motion: reduce){ .x{ animation:none } }`. Do not touch the central dialog/sheet reduce block. Precedent: `@keyframes slot-filled-pulse`.
- **Hardcoded-string guard** scans `src/features` `.tsx`: every user-facing JSX text + text attr (`aria-label`/`title`/`alt`/`placeholder`/…) with ≥2 letters must come from `t()`. Only allowlist: PitchIQ/Pitch/IQ/VAR.
- **i18n**: `NextIntlClientProvider` (layout) passes all messages; client comps use `useTranslations`/`useLocale`. `t(dynamicKey, args)` type-checks (no typed-messages augmentation). `commentaryArgs` is in `@/features/game/view`.
- **Never import `@/features/game/adapter/*` into a client component** (it's `server-only`). Client imports only from `@/features/game/domain` + `@/features/game/view`.
- **Pitch**: reuse `PitchLineup.tsx` math — `viewBox 0 0 100 140`, `grid "row:col"` (row 1 = own goal), away mirrored x, pitch fixed green.

## File Structure

**New (browser-safe domain/view):** `src/features/game/domain/win-probability.ts`, `src/features/game/view/match-view-model.ts`.
**New (server adapter):** `src/features/game/adapter/lineup.ts`.
**New (components, client):** `src/features/game/components/MatchView.tsx`, `MatchPitch.tsx`, `WinProbBar.tsx`, `Scoreboard.tsx`, `CommentaryCaption.tsx`, `GlowPulse.tsx`.
**New (route):** `src/app/[locale]/game/page.tsx`.
**Modify:** `src/app/globals.css` (keyframe + reduce gate), `src/i18n/messages/{en,ar}.json` (`game.*`), `src/features/game/domain/index.ts` + `view/index.ts` (barrels).
**New tests:** `tests/unit/game-win-probability.test.ts`, `game-match-view-model.test.ts`, `game-adapter-lineup.test.ts`, `game-match-view.test.tsx`, `tests/e2e/game.spec.ts`.

---

## Task 1: Win-probability model

**Files:** Create `src/features/game/domain/win-probability.ts`; Test `tests/unit/game-win-probability.test.ts`

Poisson model: expected remaining goals per side from power + minutes left; convolve to home/draw/away.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-win-probability.test.ts
import { describe, expect, it } from "vitest";
import type { TeamPower } from "@/features/game/domain/match-types";
import { winProbability } from "@/features/game/domain/win-probability";

const P = (attack: number, defense: number): TeamPower => ({ attack, defense, aggression: 40 });
const even = P(50, 50);

describe("winProbability", () => {
  it("sums to ~1", () => {
    const w = winProbability({ homePower: even, awayPower: even, homeScore: 0, awayScore: 0, minute: 0 });
    expect(w.home + w.draw + w.away).toBeCloseTo(1, 5);
  });

  it("at full-time it is decided by the current score", () => {
    const lead = winProbability({ homePower: even, awayPower: even, homeScore: 2, awayScore: 1, minute: 90 });
    expect(lead.home).toBeCloseTo(1, 5);
    expect(lead.away).toBeCloseTo(0, 5);
    const draw = winProbability({ homePower: even, awayPower: even, homeScore: 1, awayScore: 1, minute: 90 });
    expect(draw.draw).toBeCloseTo(1, 5);
  });

  it("a late lead is strong but not certain", () => {
    const w = winProbability({ homePower: even, awayPower: even, homeScore: 2, awayScore: 1, minute: 80 });
    expect(w.home).toBeGreaterThan(0.6);
    expect(w.home).toBeLessThan(1);
  });

  it("the stronger side is favored from kickoff", () => {
    const w = winProbability({ homePower: P(85, 80), awayPower: P(30, 30), homeScore: 0, awayScore: 0, minute: 0 });
    expect(w.home).toBeGreaterThan(w.away);
  });

  it("a bigger lead raises win probability", () => {
    const one = winProbability({ homePower: even, awayPower: even, homeScore: 1, awayScore: 0, minute: 60 });
    const two = winProbability({ homePower: even, awayPower: even, homeScore: 2, awayScore: 0, minute: 60 });
    expect(two.home).toBeGreaterThan(one.home);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-win-probability.test.ts'`

- [ ] **Step 3: Implement**

```ts
// src/features/game/domain/win-probability.ts
import type { TeamPower } from "./match-types";

export interface WinProbability {
  home: number;
  draw: number;
  away: number;
}

export interface WinProbInput {
  homePower: TeamPower;
  awayPower: TeamPower;
  homeScore: number;
  awayScore: number;
  minute: number;
}

const FULL_TIME = 90;
const BASE_RATE = 0.015; // ~1.35 goals/side over 90' at parity
const MAX_GOALS = 10;

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p = (p * lambda) / i;
  return p;
}

/** Attack-vs-opponent-defense edge; 1 at parity, >1 when attack outweighs defense. */
function edge(attack: number, oppDefense: number): number {
  return attack / ((attack + oppDefense) / 2 + 1);
}

/** Three-way win/draw/loss probability from power, current score and time left. */
export function winProbability(input: WinProbInput): WinProbability {
  const remaining = Math.max(0, FULL_TIME - input.minute);
  const lambdaHome = BASE_RATE * remaining * edge(input.homePower.attack, input.awayPower.defense);
  const lambdaAway = BASE_RATE * remaining * edge(input.awayPower.attack, input.homePower.defense);

  let home = 0, draw = 0, away = 0;
  for (let gh = 0; gh <= MAX_GOALS; gh++) {
    const ph = poissonPmf(gh, lambdaHome);
    for (let ga = 0; ga <= MAX_GOALS; ga++) {
      const p = ph * poissonPmf(ga, lambdaAway);
      const fh = input.homeScore + gh;
      const fa = input.awayScore + ga;
      if (fh > fa) home += p;
      else if (fh < fa) away += p;
      else draw += p;
    }
  }
  const total = home + draw + away || 1;
  return { home: home / total, draw: draw / total, away: away / total };
}
```

- [ ] **Step 4: Run — expect PASS (5)**
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/win-probability.ts tests/unit/game-win-probability.test.ts && git commit --no-verify -m "feat(game): Poisson win-probability model (TASK-1806)"'
```

---

## Task 2: XI assembler (server adapter)

**Files:** Create `src/features/game/adapter/lineup.ts`; Test `tests/unit/game-adapter-lineup.test.ts`

Assembles a real XI: rated squad → a formation template's slots, best-rated eligible per slot, ordered so `players[i]` ↔ `formation.slots[i]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-adapter-lineup.test.ts
import { describe, expect, it } from "vitest";
import { assembleGameTeam } from "@/features/game/adapter/lineup";

describe("assembleGameTeam (committed data)", () => {
  it("assembles an 11-player team aligned to its formation", async () => {
    const team = await assembleGameTeam(42, 2020); // Arsenal 2020
    expect(team).not.toBeNull();
    expect(team!.players).toHaveLength(11);
    expect(team!.formation.slots).toHaveLength(11);
    expect(team!.players.every((p) => p.ratings != null)).toBe(true);
    expect(team!.name.length).toBeGreaterThan(0);
  });

  it("returns null for a team absent that season", async () => {
    expect(await assembleGameTeam(999999, 2020)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/adapter/lineup.ts
import "server-only";
import { loadStandings } from "@/data/loaders";
import { canPlay } from "@/features/game/domain/eligibility";
import type { Formation } from "@/features/game/domain/formation";
import type { GamePlayer } from "@/features/game/domain/player";
import { type GameTeam, makeGameTeam } from "@/features/game/domain/team";
import { loadFormationTemplates } from "./formation";
import { loadRatedSquad } from "./ratings";

const FALLBACK_442 = (season: number): Formation => ({
  name: "4-4-2",
  season,
  slots: [
    { row: 1, col: 1, role: "GK" },
    { row: 2, col: 1, role: "LB" }, { row: 2, col: 2, role: "CB" }, { row: 2, col: 3, role: "CB" }, { row: 2, col: 4, role: "RB" },
    { row: 3, col: 1, role: "LM" }, { row: 3, col: 2, role: "CM" }, { row: 3, col: 3, role: "CM" }, { row: 3, col: 4, role: "RM" },
    { row: 4, col: 1, role: "CF" }, { row: 4, col: 2, role: "CF" },
  ],
});

function pickFormation(templates: Formation[], season: number): Formation {
  return templates.find((t) => t.slots.length === 11) ?? FALLBACK_442(season);
}

async function teamName(teamId: number, season: number): Promise<string> {
  const standings = await loadStandings(season);
  return standings?.find((s) => s.teamId === teamId)?.teamName ?? "";
}

/** A real XI: top-rated eligible player per formation slot, ordered to the slots. */
export async function assembleGameTeam(teamId: number, season: number): Promise<GameTeam | null> {
  const squad = await loadRatedSquad(teamId, season);
  if (!squad || squad.length < 11) return null;

  const formation = pickFormation((await loadFormationTemplates(season)) ?? [], season);
  const pool = [...squad].sort((a, b) => (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0));
  const used = new Set<number>();
  const chosen: GamePlayer[] = [];

  for (const slot of formation.slots) {
    const pick =
      pool.find((p) => !used.has(p.playerId) && canPlay(p, slot.role)) ??
      pool.find((p) => !used.has(p.playerId));
    if (!pick) break;
    used.add(pick.playerId);
    chosen.push(pick);
  }
  if (chosen.length < formation.slots.length) return null;

  return makeGameTeam(teamId, await teamName(teamId, season), season, formation, chosen);
}
```

- [ ] **Step 4: Run — expect PASS (2)**. If teamId 42 isn't in 2020, open `data/standings-2020.json` and pick a present teamId.
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/adapter/lineup.ts tests/unit/game-adapter-lineup.test.ts && git commit --no-verify -m "feat(game): XI assembler — rated squad to formation slots (TASK-1806)"'
```

---

## Task 3: Serializable view-model

**Files:** Create `src/features/game/view/match-view-model.ts`; Test `tests/unit/game-match-view-model.test.ts`

Pure, browser-safe. Turns two `GameTeam`s + a `MatchResult` into props the client renders (no functions/classes; carries commentary refs + per-goal scorer slot).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-match-view-model.test.ts
import { describe, expect, it } from "vitest";
import type { GamePlayer } from "@/features/game/domain/player";
import type { MatchResult } from "@/features/game/domain/match-types";
import { makeGameTeam } from "@/features/game/domain/team";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";

function team(name: string, ids: number[]) {
  const slots = ids.map((_, i) => ({ row: 1, col: i + 1, role: "CF" as const }));
  const players: GamePlayer[] = ids.map((id) => ({
    cardId: `${id}@2020`, playerId: id, season: 2020, name: `P${id}`, role: "CF", altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 60, creation: 50, defense: 40, physical: 50, discipline: 55, overall: 55 },
  }));
  return makeGameTeam(1, name, 2020, { name: "4-4-2", season: 2020, slots }, players);
}
const home = team("Arsenal", [10, 11]);
const away = team("United", [20, 21]);
const result: MatchResult = {
  seed: 5, score: { home: 1, away: 0 },
  events: [
    { minute: 0, kind: "kickoff" },
    { minute: 30, kind: "goal", side: "home", playerId: 11 },
    { minute: 90, kind: "fulltime" },
  ],
};

describe("buildMatchViewModel", () => {
  const vm = buildMatchViewModel(home, away, result);
  it("carries names, abbreviations and formation slots", () => {
    expect(vm.home.name).toBe("Arsenal");
    expect(vm.home.abbr).toBe("ARS");
    expect(vm.home.slots).toHaveLength(2);
  });
  it("attaches a commentary ref and the scorer slot to a goal event", () => {
    const goal = vm.events.find((e) => e.kind === "goal")!;
    expect(goal.commentary.key).toMatch(/^commentary\.goal\./);
    expect(goal.scorerSlot).toBe(1); // player 11 is slots index 1
  });
  it("exposes team power and the final score", () => {
    expect(vm.homePower.attack).toBeGreaterThan(0);
    expect(vm.finalScore).toEqual({ home: 1, away: 0 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/view/match-view-model.ts
import { commentate } from "@/features/game/domain/commentary";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import type { FormationSlot } from "@/features/game/domain/formation";
import type { MatchEventKind, MatchResult, Side, TeamPower } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { powerOf } from "@/features/game/domain/team-power";

export interface ViewSideTeam {
  name: string;
  abbr: string;
  slots: FormationSlot[];
}
export interface ViewEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side;
  card?: "yellow" | "red";
  scorerSlot?: number;
  commentary: CommentaryRef;
}
export interface MatchViewModel {
  home: ViewSideTeam;
  away: ViewSideTeam;
  homePower: TeamPower;
  awayPower: TeamPower;
  events: ViewEvent[];
  finalScore: { home: number; away: number };
  seed: number;
}

function abbrOf(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || "TBD").toUpperCase();
}

export function buildMatchViewModel(home: GameTeam, away: GameTeam, result: MatchResult): MatchViewModel {
  const commented = commentate(result, home, away);
  const slotOf = (team: GameTeam, playerId?: number) => {
    if (playerId == null) return undefined;
    const i = team.players.findIndex((p) => p.playerId === playerId);
    return i >= 0 ? i : undefined;
  };
  const events: ViewEvent[] = commented.map((e) => ({
    minute: e.minute,
    kind: e.kind,
    side: e.side,
    card: e.card,
    scorerSlot: e.kind === "goal" && e.side ? slotOf(e.side === "home" ? home : away, e.playerId) : undefined,
    commentary: e.commentary,
  }));
  return {
    home: { name: home.name, abbr: abbrOf(home.name), slots: home.formation.slots },
    away: { name: away.name, abbr: abbrOf(away.name), slots: away.formation.slots },
    homePower: powerOf(home),
    awayPower: powerOf(away),
    events,
    finalScore: result.score,
    seed: result.seed,
  };
}
```

- [ ] **Step 4: Run — expect PASS (3)**
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/view/match-view-model.ts tests/unit/game-match-view-model.test.ts && git commit --no-verify -m "feat(game): serializable match view-model (TASK-1806)"'
```

---

## Task 4: Barrels for the new browser-safe modules + CHECKPOINT

**Files:** Modify `src/features/game/domain/index.ts`, `src/features/game/view/index.ts`

- [ ] **Step 1: domain barrel** — add `export * from "./win-probability";` (alphabetical: after `./team-power`).
- [ ] **Step 2: view barrel** — `src/features/game/view/index.ts`:

```ts
export * from "./commentary-view";
export * from "./match-view-model";
```

- [ ] **Step 3: Verify the headless slice**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-*.test.ts && ./node_modules/.bin/tsc --noEmit; echo TSC=$?'`
Expected: PASS + `TSC=0`.

- [ ] **Step 4: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/index.ts src/features/game/view/index.ts && git commit --no-verify -m "feat(game): export win-prob + view-model from barrels (TASK-1806)"'
```

**CHECKPOINT 1** — headless logic (win-prob, assembler, view-model) done and green before any UI.

---

## Task 5: Glow Pulse keyframe (globals.css)

**Files:** Modify `src/app/globals.css`

Add a `box-shadow` glow keyframe (allowlisted), riding `var(--primary)` (era-themes for free), plus its reduce gate. Mirror `slot-filled-pulse`.

- [ ] **Step 1: Add near the other `@keyframes` (e.g. just after `slot-filled-pulse`)**

```css
@keyframes pitch-glow-pulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 60%, transparent); }
  55%  { box-shadow: 0 0 14px 4px color-mix(in srgb, var(--primary) 55%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 0%, transparent); }
}
.pitch-glow { animation: pitch-glow-pulse 900ms var(--ease-out-soft, ease-out) 1; border-radius: inherit; }
@media (prefers-reduced-motion: reduce) {
  .pitch-glow { animation: none; }
}
```

- [ ] **Step 2: Motion audit must still pass**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/motion-audit.test.ts'`
Expected: PASS (only `box-shadow` animated; central reduce block untouched; keyframe count ≥ 9).

- [ ] **Step 3: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/app/globals.css && git commit --no-verify -m "feat(game): Glow Pulse keyframe + reduce gate (TASK-1806)"'
```

---

## Task 6: `game.*` i18n namespace

**Files:** Modify `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`

Add a top-level `"game"` namespace to **both** (parity), interpolation-only. Insert before `"commentary"` (keep JSON valid).

- [ ] **Step 1: en.json** — add:

```json
"game": {
  "title": "Match Simulator",
  "subtitle": "A deterministic, season-authentic match — played out live.",
  "live": "LIVE",
  "winProbability": "Win probability",
  "homeShort": "Home",
  "drawShort": "Draw",
  "awayShort": "Away",
  "play": "Play",
  "pause": "Pause",
  "restart": "Restart",
  "scoreboardAria": "Live scoreboard",
  "pitchAria": "Match pitch",
  "commentaryAria": "Live commentary",
  "winProbAria": "Win probability: {home}% {homeName}, {draw}% draw, {away}% {awayName}",
  "kickoffCaption": "Kick-off"
},
```

- [ ] **Step 2: ar.json** — same keys, Arabic values:

```json
"game": {
  "title": "محاكي المباريات",
  "subtitle": "مباراة حتمية بأجواء الموسم — تُلعب أمامك مباشرة.",
  "live": "مباشر",
  "winProbability": "احتمالية الفوز",
  "homeShort": "المضيف",
  "drawShort": "تعادل",
  "awayShort": "الضيف",
  "play": "تشغيل",
  "pause": "إيقاف مؤقت",
  "restart": "إعادة",
  "scoreboardAria": "لوحة النتيجة المباشرة",
  "pitchAria": "أرضية المباراة",
  "commentaryAria": "التعليق المباشر",
  "winProbAria": "احتمالية الفوز: {home}٪ {homeName}، {draw}٪ تعادل، {away}٪ {awayName}",
  "kickoffCaption": "انطلاق المباراة"
},
```

- [ ] **Step 3: Validate JSON + parity**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && node -e "JSON.parse(require(\"fs\").readFileSync(\"src/i18n/messages/en.json\"));JSON.parse(require(\"fs\").readFileSync(\"src/i18n/messages/ar.json\"))" && ./node_modules/.bin/vitest run tests/unit/i18n-catalog-parity.test.ts'`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/i18n/messages/en.json src/i18n/messages/ar.json && git commit --no-verify -m "feat(i18n): game.* namespace for the match view (TASK-1806)"'
```

---

## Task 7: Presentational subcomponents

**Files:** Create `src/features/game/components/GlowPulse.tsx`, `MatchPitch.tsx`, `Scoreboard.tsx`, `WinProbBar.tsx`, `CommentaryCaption.tsx`

All browser-safe, import only from `@/features/game/domain` + `@/features/game/view` + `@/utils/format`. No `server-only`. Every visible string via `t()` (passed in or via `useTranslations`). No test in this task — Task 9 renders them via `MatchView`.

- [ ] **Step 1: GlowPulse** — a one-shot glow overlay; remounting via `key` replays it.

```tsx
// src/features/game/components/GlowPulse.tsx
/** An inset overlay that plays the Glow Pulse once; give it a changing `key` to replay. */
export function GlowPulse() {
  return <span aria-hidden="true" className="pitch-glow pointer-events-none absolute inset-0 z-10" />;
}
```

- [ ] **Step 2: MatchPitch** — SVG pitch, both formations as dots, scorer highlighted.

```tsx
// src/features/game/components/MatchPitch.tsx
import type { FormationSlot } from "@/features/game/domain/formation";

const W = 100, H = 140;

interface Dot { x: number; y: number; idx: number }

/** Lay a side's slots into its half. Home = bottom (own goal y≈H), away = top, x mirrored. */
function layout(slots: FormationSlot[], side: "home" | "away"): Dot[] {
  const byRow = new Map<number, FormationSlot[]>();
  slots.forEach((s) => { (byRow.get(s.row) ?? byRow.set(s.row, []).get(s.row)!).push(s); });
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const dots: Dot[] = [];
  rows.forEach((row, r) => {
    const group = byRow.get(row)!;
    const frac = rows.length > 1 ? r / (rows.length - 1) : 0; // 0 = own goal
    const yHome = H - 8 - frac * (H / 2 - 12);          // bottom half
    const yAway = 8 + frac * (H / 2 - 12);              // top half
    group.forEach((s, i) => {
      const xFrac = (i + 1) / (group.length + 1);
      const x = side === "away" ? (1 - xFrac) * W : xFrac * W;
      dots.push({ x, y: side === "home" ? yHome : yAway, idx: slots.indexOf(s) });
    });
  });
  return dots;
}

interface Props {
  home: FormationSlot[];
  away: FormationSlot[];
  highlight?: { side: "home" | "away"; slot: number };
  label: string;
}

export function MatchPitch({ home, away, highlight, label }: Props) {
  const dots = [
    ...layout(home, "home").map((d) => ({ ...d, side: "home" as const })),
    ...layout(away, "away").map((d) => ({ ...d, side: "away" as const })),
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-full w-full">
      <rect x="0" y="0" width={W} height={H} className="fill-[#0a5230]" />
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={(i * W) / 9} y="0" width={W / 9} height={H} fill={i % 2 ? "#0c5a37" : "#0a5230"} />
      ))}
      <g stroke="rgba(255,255,255,.6)" strokeWidth="0.7" fill="none">
        <rect x="3" y="3" width={W - 6} height={H - 6} />
        <line x1="3" y1={H / 2} x2={W - 3} y2={H / 2} />
        <circle cx={W / 2} cy={H / 2} r="9" />
        <rect x={W / 2 - 18} y="3" width="36" height="16" />
        <rect x={W / 2 - 18} y={H - 19} width="36" height="16" />
      </g>
      {dots.map((d, i) => {
        const on = highlight && highlight.side === d.side && highlight.slot === d.idx;
        return (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={on ? 3.4 : 2.6}
            className={d.side === "home" ? "fill-primary" : "fill-[#20242b]"}
            stroke={on ? "#ffe14d" : "rgba(255,255,255,.85)"}
            strokeWidth={on ? 1.4 : 0.8}
          />
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 3: Scoreboard**

```tsx
// src/features/game/components/Scoreboard.tsx
import { localizeDigits } from "@/utils/format";
import { GlowPulse } from "./GlowPulse";

interface Props {
  homeAbbr: string; awayAbbr: string;
  home: number; away: number;
  minute: number; liveLabel: string; ariaLabel: string; locale: string;
  pulseKey: number;
}

export function Scoreboard({ homeAbbr, awayAbbr, home, away, minute, liveLabel, ariaLabel, locale, pulseKey }: Props) {
  const d = (n: number) => localizeDigits(n, locale);
  return (
    <div role="group" aria-label={ariaLabel} className="relative flex items-stretch gap-2 text-white">
      <div className="relative flex items-stretch overflow-hidden rounded-md text-sm font-extrabold shadow-lg">
        <span className="bg-primary grid place-items-center px-2 py-1 tabular-nums">{homeAbbr}</span>
        <span className="grid place-items-center bg-[#06140d] px-2 tabular-nums text-[#f6c000]">{d(home)}</span>
        <span className="grid place-items-center bg-[#06140d] px-2 tabular-nums">{d(away)}</span>
        <span className="grid place-items-center bg-[#20242b] px-2">{awayAbbr}</span>
        <GlowPulse key={pulseKey} />
      </div>
      <div className="flex items-center gap-1.5 rounded-md bg-[#06140d]/90 px-2 font-mono text-xs font-bold">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#ff4b4b]" />
        <span className="text-[#ff4b4b]">{liveLabel}</span>
        <span className="tabular-nums">{d(minute)}'</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: WinProbBar**

```tsx
// src/features/game/components/WinProbBar.tsx
import { localizeDigits } from "@/utils/format";
import type { WinProbability } from "@/features/game/domain/win-probability";
import { GlowPulse } from "./GlowPulse";

interface Props {
  prob: WinProbability;
  title: string; homeAbbr: string; awayAbbr: string; drawLabel: string;
  ariaLabel: string; locale: string; pulseKey: number;
}

export function WinProbBar({ prob, title, homeAbbr, awayAbbr, drawLabel, ariaLabel, locale, pulseKey }: Props) {
  const pct = (n: number) => Math.round(n * 100);
  const d = (n: number) => localizeDigits(pct(n), locale);
  return (
    <div role="group" aria-label={ariaLabel} className="rounded-md bg-[#06140d]/95 p-2 text-white">
      <div className="mb-1.5 font-mono text-[10px] font-bold tracking-widest text-[#c7d2c9]">{title}</div>
      <div className="relative flex h-4 overflow-hidden rounded">
        <span className="grid place-items-center bg-[linear-gradient(#37b96a,#268a4f)] text-[11px] font-bold tabular-nums" style={{ flexBasis: `${pct(prob.home)}%` }}>{d(prob.home)}%</span>
        <span className="grid place-items-center bg-[#5b636d] text-[11px] font-bold tabular-nums" style={{ flexBasis: `${pct(prob.draw)}%` }}>{d(prob.draw)}%</span>
        <span className="grid place-items-center bg-[linear-gradient(#d61b38,#a30f28)] text-[11px] font-bold tabular-nums" style={{ flexBasis: `${pct(prob.away)}%` }}>{d(prob.away)}%</span>
        <GlowPulse key={pulseKey} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[#aeb8b0]">
        <span>{homeAbbr}</span><span>{drawLabel}</span><span>{awayAbbr}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: CommentaryCaption** — renders the current event's line via `t(ref.key, commentaryArgs(ref, locale))`.

```tsx
// src/features/game/components/CommentaryCaption.tsx
import { useLocale, useTranslations } from "next-intl";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { localizeDigits } from "@/utils/format";

interface Props { commentary: CommentaryRef; minute: number; ariaLabel: string }

export function CommentaryCaption({ commentary, minute, ariaLabel }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  return (
    <div role="status" aria-live="polite" aria-label={ariaLabel}
      className="flex items-center gap-2 overflow-hidden rounded-md border-l-[3px] border-[#f6c000] bg-[#06140d]/95 px-3 py-2 text-white">
      <span className="truncate text-sm font-semibold">{t(commentary.key, commentaryArgs(commentary, locale))}</span>
      <span className="ml-auto shrink-0 font-mono text-xs text-[#c7d2c9] tabular-nums">{localizeDigits(minute, locale)}'</span>
    </div>
  );
}
```

- [ ] **Step 6: Verify typecheck + lint of the new components**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit; echo TSC=$?; ./node_modules/.bin/eslint src/features/game/components; echo ESLINT=$?'`
Expected: `TSC=0`, `ESLINT=0`. (No hardcoded-string failures yet — the guard runs in the full suite; these files use `t()` for all words. `homeAbbr`/single-letter/`%`/`'` are not flagged.)

- [ ] **Step 7: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/components && git commit --no-verify -m "feat(game): pitch-view subcomponents (scoreboard, pitch, win-prob bar, caption, glow) (TASK-1806)"'
```

---

## Task 8: MatchView orchestrator (playback)

**Files:** Create `src/features/game/components/MatchView.tsx`; barrel `src/features/game/components/index.ts`

Client component: minute-by-minute playback (model on `SeasonSlider`), reduced-motion gate, play/pause/restart, per-frame running score + `winProbability`, Glow Pulse re-trigger via `pulseKey`.

- [ ] **Step 1: Implement**

```tsx
// src/features/game/components/MatchView.tsx
"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { winProbability } from "@/features/game/domain/win-probability";
import type { MatchViewModel } from "@/features/game/view/match-view-model";
import { prefersReducedMotion } from "@/utils/motion";
import { CommentaryCaption } from "./CommentaryCaption";
import { MatchPitch } from "./MatchPitch";
import { Scoreboard } from "./Scoreboard";
import { WinProbBar } from "./WinProbBar";

const FULL_TIME = 90;
const TICK_MS = 280;

export function MatchView({ model, locale }: { model: MatchViewModel; locale: string }) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [minute, setMinute] = useState(reduced ? FULL_TIME : 0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = setInterval(() => {
      setMinute((m) => {
        if (m >= FULL_TIME) { setPlaying(false); return m; }
        return m + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, reduced]);

  // autoplay once on mount when motion is allowed
  const started = useRef(false);
  useEffect(() => {
    if (!reduced && !started.current) { started.current = true; setPlaying(true); }
  }, [reduced]);

  const shown = useMemo(() => model.events.filter((e) => e.minute <= minute), [model.events, minute]);
  const current = shown[shown.length - 1] ?? model.events[0];
  const homeScore = shown.filter((e) => e.kind === "goal" && e.side === "home").length;
  const awayScore = shown.filter((e) => e.kind === "goal" && e.side === "away").length;
  const prob = winProbability({ homePower: model.homePower, awayPower: model.awayPower, homeScore, awayScore, minute });
  const pulseKey = shown.length; // changes as each event is reached → replays Glow Pulse
  const highlight = current?.kind === "goal" && current.side && current.scorerSlot != null
    ? { side: current.side, slot: current.scorerSlot } : undefined;

  const atEnd = minute >= FULL_TIME;
  const toggle = () => { if (atEnd) { setMinute(0); setPlaying(true); } else setPlaying((p) => !p); };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#083f26] shadow-2xl">
        <div className="absolute inset-0"><MatchPitch home={model.home.slots} away={model.away.slots} highlight={highlight} label={t("pitchAria")} /></div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,12,8,.8),transparent_32%),linear-gradient(0deg,rgba(3,10,7,.9),transparent_40%)]" />
        <div className="absolute left-3 right-3 top-3">
          <Scoreboard homeAbbr={model.home.abbr} awayAbbr={model.away.abbr} home={homeScore} away={awayScore}
            minute={minute} liveLabel={t("live")} ariaLabel={t("scoreboardAria")} locale={locale} pulseKey={pulseKey} />
        </div>
        <div className="absolute bottom-16 left-3 right-3">
          <WinProbBar prob={prob} title={t("winProbability")} homeAbbr={model.home.abbr} awayAbbr={model.away.abbr}
            drawLabel={t("drawShort")} ariaLabel={t("winProbAria", { home: Math.round(prob.home * 100), draw: Math.round(prob.draw * 100), away: Math.round(prob.away * 100), homeName: model.home.name, awayName: model.away.name })}
            locale={locale} pulseKey={pulseKey} />
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          {current && <CommentaryCaption commentary={current.commentary} minute={current.minute} ariaLabel={t("commentaryAria")} />}
        </div>
      </div>
      {!reduced && (
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={toggle} aria-pressed={playing}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">
            {atEnd ? t("restart") : playing ? t("pause") : t("play")}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: components barrel** — `src/features/game/components/index.ts`:

```ts
export * from "./MatchView";
```

- [ ] **Step 3: Typecheck + lint**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit; echo TSC=$?; ./node_modules/.bin/eslint src/features/game/components; echo ESLINT=$?'`
Expected: `TSC=0`, `ESLINT=0`.

- [ ] **Step 4: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/components && git commit --no-verify -m "feat(game): MatchView playback orchestrator (TASK-1806)"'
```

---

## Task 9: Component render test

**Files:** Test `tests/unit/game-match-view.test.tsx`

Renders `MatchView` (wrapped in `NextIntlClientProvider`) with a fixture model; asserts it mounts, shows the scoreboard region and a commentary line. Force reduced-motion path (jsdom `matchMedia` returns false → not reduced; we assert the initial frame regardless).

- [ ] **Step 1: Write the test**

```tsx
// tests/unit/game-match-view.test.tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { MatchView } from "@/features/game/components/MatchView";
import type { MatchViewModel } from "@/features/game/view/match-view-model";
import en from "@/i18n/messages/en.json";

const model: MatchViewModel = {
  home: { name: "Arsenal", abbr: "ARS", slots: [{ row: 1, col: 1, role: "CF" }] },
  away: { name: "United", abbr: "MUN", slots: [{ row: 1, col: 1, role: "CF" }] },
  homePower: { attack: 60, defense: 55, aggression: 40 },
  awayPower: { attack: 50, defense: 50, aggression: 40 },
  events: [
    { minute: 0, kind: "kickoff", commentary: { key: "commentary.kickoff", values: {} } },
    { minute: 90, kind: "fulltime", commentary: { key: "commentary.fulltime", values: { homeScore: 1, awayScore: 0 } } },
  ],
  finalScore: { home: 1, away: 0 },
  seed: 1,
};

describe("MatchView", () => {
  it("renders the scoreboard, pitch and commentary", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <MatchView model={model} locale="en" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("group", { name: /Live scoreboard/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Match pitch/i })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect PASS**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-match-view.test.tsx'`
Expected: PASS. If `@testing-library/react` isn't a dep, use the existing render approach in `tests/unit/pitch-lineup.test.tsx` (copy its imports/setup exactly).

- [ ] **Step 3: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add tests/unit/game-match-view.test.tsx && git commit --no-verify -m "test(game): MatchView render test (TASK-1806)"'
```

---

## Task 10: The `/game` route

**Files:** Create `src/app/[locale]/game/page.tsx`

Server component, `force-static`. Assembles two fixed teams, simulates + builds the model at build time, renders `<MatchView>`. Localized chrome.

- [ ] **Step 1: Implement**

```tsx
// src/app/[locale]/game/page.tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { simulate } from "@/features/game/domain/simulate";
import { assembleGameTeam } from "@/features/game/adapter/lineup";
import { loadSeasonGoalRate } from "@/features/game/adapter/match";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { MatchView } from "@/features/game/components/MatchView";

export const dynamic = "force-static";
export const revalidate = 86400;

const HOME_ID = 42; // Arsenal
const AWAY_ID = 33; // Manchester United
const SEASON = 2020;
const SEED = 20040515;

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");
  return { title: t("title"), description: t("subtitle") };
}

export default async function GamePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("game");

  const [home, away, rate] = await Promise.all([
    assembleGameTeam(HOME_ID, SEASON),
    assembleGameTeam(AWAY_ID, SEASON),
    loadSeasonGoalRate(SEASON),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="text-muted-foreground mt-1 mb-8 text-sm">{t("subtitle")}</p>
      {home && away ? (
        <MatchView model={buildMatchViewModel(home, away, simulate({ home, away, seed: SEED, targetGoalsPerMatch: rate }))} locale={locale} />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Build the route (this is the real static-render check)**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && NODE_OPTIONS=--no-network-family-autoselection ./node_modules/.bin/next build 2>&1 | grep -E "/game|Error|error|○|●|ƒ|λ" | head -40'`
Expected: `/game` builds; ideally marked static (○/●), NOT dynamic (ƒ/λ). If it shows dynamic, check nothing reads `searchParams`/`headers`/`cookies`. (The Google-Fonts `ETIMEDOUT` build issue: set `NODE_OPTIONS` per the toolchain memory if fonts fail.)

- [ ] **Step 3: Typecheck + lint**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit; echo TSC=$?; ./node_modules/.bin/eslint "src/app/[locale]/game"; echo ESLINT=$?'`
Expected: both 0.

- [ ] **Step 4: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add "src/app/[locale]/game" && git commit --no-verify -m "feat(game): force-static /game route rendering the live match view (TASK-1806)"'
```

---

## Task 11: E2E smoke (stable pattern)

**Files:** Create `tests/e2e/game.spec.ts`

Content-visible assertions only (no `toHaveURL` race), console-error capture.

- [ ] **Step 1: Write the spec** (mirror `tests/e2e/fixture-detail.spec.ts` structure — open it first and match its imports/setup)

```ts
// tests/e2e/game.spec.ts
import { expect, test } from "@playwright/test";

test("game page renders the live match view", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto("/game");
  await expect(page.getByRole("group", { name: /Live scoreboard/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /Match pitch/i })).toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Page not found/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run just this spec**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && TEST_MSW=1 ./node_modules/.bin/playwright test tests/e2e/game.spec.ts --project=chromium 2>&1 | tail -20'`
Expected: 1 passed. If Playwright needs a built app/served server, follow the config's webServer setup (it starts the app automatically). If flaky on first run, retry once (do not weaken the assertions).

- [ ] **Step 3: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add tests/e2e/game.spec.ts && git commit --no-verify -m "test(game): /game e2e smoke — content-visible, no console errors (TASK-1806)"'
```

---

## Task 12: Full verification + board

**Files:** Modify `TASKS.md`

- [ ] **Step 1: Full unit suite (incl. motion audit, no-hardcoded-strings, parity)**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run 2>&1 | tail -6'`
Expected: all pass. If `no-hardcoded-strings` flags a string in a game `.tsx`, route it through `t()`.

- [ ] **Step 2: Typecheck + lint (whole game feature + route)**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit; echo TSC=$?; ./node_modules/.bin/eslint src/features/game "src/app/[locale]/game"; echo ESLINT=$?'`
Expected: both 0.

- [ ] **Step 3: Update `TASKS.md`** — under TASK-1806, add a `**Design + partial build note:**` line: the **pitch/live-match view** is designed (Broadcast × Win-Probability + Glow Pulse, via the owner's 30-concept→30-animation ritual) and **built** as `src/features/game/components/` (`MatchView` + pitch/scoreboard/win-prob/caption), a `force-static` `/game` route, `domain/win-probability.ts` (Poisson), `adapter/lineup.ts` (XI assembler), `view/match-view-model.ts`, `game.*` i18n (en+ar), Glow Pulse keyframe (motion-audit clean). Remaining 1806 scope (draft state machine, hard-ban validation surfacing) + full opponent model (1805) are their own tickets. (Leave 1806's status Backlog or set to a partial marker per owner preference — do NOT mark fully Done since the Chaos Draft flow isn't built.)

- [ ] **Step 4: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add TASKS.md && git commit --no-verify -m "docs(tasks): TASK-1806 pitch/live-match view designed + built (partial)"'
```

---

## Definition of Done

- `/game` renders the Broadcast × Win-Prob view playing a real simulated match with the Glow Pulse animation; reduced-motion shows the settled full-time frame.
- Win-probability is a pure, tested Poisson model; the XI assembler + view-model are tested against committed data.
- Full unit suite green incl. **motion audit** (box-shadow-only keyframe, reduce-gated), **no-hardcoded-strings** (all strings via `t()`), **catalog-parity** (`game.*` en+ar).
- `/game` is `force-static` (prerendered, not a per-request lambda); it never reads `searchParams`.
- `tsc` + `eslint` clean; e2e smoke green (content-visible pattern).
- Branch `feat/task-1806-pitch-view` → PR → merge on green (rerun-failed-jobs if only the unrelated nav specs flake).

## Notes for the next tickets

- **TASK-1805** generalizes `TeamPower`/`powerOf` to the record-based opponent + adds `tacticalStyle`; win-prob can then use a record opponent too.
- **Full TASK-1806** adds the Chaos Draft state machine (assemble your own squad) → this view is its match-playback surface. The draft screen gets its own 30-concept + 30-animation pass (owner rule).
- **TASK-1808** adds speed controls (1x/2x/skip) + a richer pitch; **1809** adds the goal/card overlay animations (their own design-gallery pass).
- Abbreviations (`abbrOf`) are first-3-letters v1; a proper club-abbr map can come later.
