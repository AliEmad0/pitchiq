# TASK-1801 — Game Domain Model + Read-Only Data Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `src/features/game/` with a pure `domain/` layer (player-season cards, formations, teams) and a server-only `adapter/` that maps committed JSON into that domain model, so every downstream Phase-18 ticket consumes the domain only — never raw data shapes.

**Architecture:** Two layers with a one-way dependency. `domain/` is pure TypeScript (types + total, I/O-free functions), importable from anywhere including the browser. `adapter/` is `import "server-only"`, calls the existing `@/data/loaders`, and maps `@/data/schemas` shapes → domain objects. The adapter is the *only* place that knows about raw JSON; a data-refresh can only break the sim if it breaks the adapter's tests. Ratings and provenance are forward-declared placeholder fields on the card that **TASK-1802** fills — 1801 leaves the seams, it does not compute ratings.

**Tech Stack:** TypeScript (strict), Zod (existing `@/data/schemas`), Vitest (`tests/unit/`, happy-dom, `server-only` stubbed), `@/` → `src/` path alias. Runs in WSL Ubuntu; commands below assume the `wsl -d Ubuntu -- bash -lc '…'` wrapper.

---

## Toolchain notes (WSL / PitchIQ)

- All commands run inside WSL: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && <cmd>'`.
- Run test/lint **binaries directly**, not through `pnpm run` (the husky/PATH trap). Vitest: `./node_modules/.bin/vitest run <path>`. Typecheck: `./node_modules/.bin/tsc --noEmit`.
- Commits use `git commit --no-verify` (the pre-commit hook is unreliable in this WSL setup; CI is the real gate).
- Work stays on branch `feat/task-1801-game-domain-adapter`. Never commit to `main`.
- `season` is a **number** (e.g. `2003`), matching `loadPlayers(season)` / `loadLineups(season)` in `@/data/loaders`.

## File Structure

**New — `src/features/game/domain/` (pure, no I/O, no `server-only`):**
- `card-id.ts` — the `PlayerSeasonId` branded string (`"1000457@2003"`), `makeCardId` / `parseCardId`.
- `ratings.ts` — **placeholder** `PlayerRatings` + `Provenance` + `RatingTier` types for TASK-1802 to expand. No logic.
- `player.ts` — `GamePlayer` (the player-season card type) + re-export of the `PlayerRole` union.
- `eligibility.ts` — `canPlay(player, slot)` for `GamePlayer`, delegating to the schema rule.
- `formation.ts` — `FormationSlot`, `Formation` types + `parseGrid` / `formationKey` pure helpers.
- `team.ts` — `GameTeam` type + `makeGameTeam` factory.
- `index.ts` — barrel re-exporting the public domain surface.

**New — `src/features/game/adapter/` (`import "server-only"`):**
- `player.ts` — `toGamePlayer(player, season)` (schema `Player` → `GamePlayer`) + `loadGamePlayer(id, season)`.
- `squad.ts` — `loadGameSquad(teamId, season)` (a team's player-season cards).
- `formation.ts` — `formationFromLineup(teamLineup)` (one real lineup → `Formation`) + `mineFormationTemplates(lineups)` aggregator + server-only `loadFormationTemplates(season)`.
- `index.ts` — barrel re-exporting the public adapter surface.

**New tests — `tests/unit/`:**
- `game-card-id.test.ts`, `game-eligibility.test.ts`, `game-adapter-player.test.ts`, `game-adapter-squad.test.ts`, `game-formation.test.ts`, `game-adapter-formation.test.ts`, `game-team.test.ts`.

**Modified:**
- `TASKS.md` — flip TASK-1801 to ✅ Done; correct the stale `🔴 Blocked (M56)` header labels on TASK-1801 and TASK-1802 (M56 shipped).

---

## Task 1: Player-season card identity

**Files:**
- Create: `src/features/game/domain/card-id.ts`
- Test: `tests/unit/game-card-id.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-card-id.test.ts
import { describe, expect, it } from "vitest";
import { makeCardId, parseCardId } from "@/features/game/domain/card-id";

describe("card-id", () => {
  it("builds an id@season key", () => {
    expect(makeCardId(1000457, 2003)).toBe("1000457@2003");
  });

  it("round-trips through parse", () => {
    expect(parseCardId(makeCardId(1000457, 2003))).toEqual({
      playerId: 1000457,
      season: 2003,
    });
  });

  it("rejects a malformed key", () => {
    expect(() => parseCardId("nope")).toThrow(/invalid card id/i);
    expect(() => parseCardId("12@34@56")).toThrow(/invalid card id/i);
    expect(() => parseCardId("abc@2003")).toThrow(/invalid card id/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-card-id.test.ts'`
Expected: FAIL — cannot resolve `@/features/game/domain/card-id`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/card-id.ts
/** A player-season card key, e.g. "1000457@2003" — Henry '03 ≠ Henry '06. */
export type PlayerSeasonId = `${number}@${number}`;

export function makeCardId(playerId: number, season: number): PlayerSeasonId {
  return `${playerId}@${season}`;
}

export function parseCardId(id: string): { playerId: number; season: number } {
  const match = /^(\d+)@(\d+)$/.exec(id);
  if (!match) throw new Error(`invalid card id: ${id}`);
  return { playerId: Number(match[1]), season: Number(match[2]) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-card-id.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/card-id.ts tests/unit/game-card-id.test.ts && git commit --no-verify -m "feat(game): player-season card id (TASK-1801)"'
```

---

## Task 2: Placeholder ratings & provenance types

**Files:**
- Create: `src/features/game/domain/ratings.ts`

No behavior yet — these are the seams TASK-1802 fills. Verification is the typecheck in Task 3 (the first task that consumes them). This task has no standalone test because it declares types only.

- [ ] **Step 1: Write the placeholder types**

```ts
// src/features/game/domain/ratings.ts
// Placeholder rating/provenance seams — TASK-1802 replaces the bodies with the
// real era-aware rating model. 1801 only reserves the shape on GamePlayer.

/** How trustworthy a card's ratings are, mirroring M56's RoleSource idea. */
export type RatingTier = "rich" | "sparse";

export interface Provenance {
  /** First-class so the UI can honestly badge a sparse-era card. */
  tier: RatingTier;
}

/** Filled by TASK-1802's rate(). Open-ended on purpose for now. */
export type PlayerRatings = Record<string, number>;
```

- [ ] **Step 2: Verify it compiles**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/tsc --noEmit'`
Expected: PASS (no new errors introduced by this file).

- [ ] **Step 3: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/ratings.ts && git commit --no-verify -m "feat(game): placeholder rating/provenance seams for TASK-1802 (TASK-1801)"'
```

---

## Task 3: `GamePlayer` card type + eligibility

**Files:**
- Create: `src/features/game/domain/player.ts`
- Create: `src/features/game/domain/eligibility.ts`
- Test: `tests/unit/game-eligibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-eligibility.test.ts
import { describe, expect, it } from "vitest";
import { canPlay } from "@/features/game/domain/eligibility";
import type { GamePlayer } from "@/features/game/domain/player";

const base: GamePlayer = {
  cardId: "1@2003",
  playerId: 1,
  season: 2003,
  name: "Test Player",
  role: "CB",
  altRoles: ["RB"],
  foot: "right",
  height: 180,
  ratings: null,
  provenance: null,
};

describe("game eligibility (hard ban)", () => {
  it("allows the primary role", () => {
    expect(canPlay(base, "CB")).toBe(true);
  });
  it("allows an alt role", () => {
    expect(canPlay(base, "RB")).toBe(true);
  });
  it("bans an unlisted role", () => {
    expect(canPlay(base, "GK")).toBe(false);
  });
  it("bans when role is null", () => {
    expect(canPlay({ ...base, role: null }, "CB")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-eligibility.test.ts'`
Expected: FAIL — cannot resolve `@/features/game/domain/eligibility`.

- [ ] **Step 3: Write the implementations**

```ts
// src/features/game/domain/player.ts
import type { PlayerRole } from "@/data/schemas";
import type { PlayerSeasonId } from "./card-id";
import type { PlayerRatings, Provenance } from "./ratings";

export type { PlayerRole } from "@/data/schemas";
export type Foot = "left" | "right" | "both";

/** A player-season card. Ratings/provenance are filled by TASK-1802. */
export interface GamePlayer {
  cardId: PlayerSeasonId;
  playerId: number;
  season: number;
  name: string;
  role: PlayerRole | null;
  altRoles: PlayerRole[];
  foot: Foot | null;
  height: number | null;
  ratings: PlayerRatings | null;
  provenance: Provenance | null;
}
```

```ts
// src/features/game/domain/eligibility.ts
import type { PlayerRole } from "@/data/schemas";
import type { GamePlayer } from "./player";

/**
 * The sole eligibility rule (owner decision: hard ban, no penalty tier).
 * Mirrors canPlay in @/data/schemas but typed for the game card.
 */
export function canPlay(
  player: Pick<GamePlayer, "role" | "altRoles">,
  slot: PlayerRole,
): boolean {
  return player.role === slot || player.altRoles.includes(slot);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-eligibility.test.ts'`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/player.ts src/features/game/domain/eligibility.ts tests/unit/game-eligibility.test.ts && git commit --no-verify -m "feat(game): GamePlayer card + hard-ban eligibility (TASK-1801)"'
```

---

## Task 4: `toGamePlayer` adapter mapping

**Files:**
- Create: `src/features/game/adapter/player.ts`
- Test: `tests/unit/game-adapter-player.test.ts`

`toGamePlayer` is a pure mapping (schema `Player` + season → `GamePlayer`) and is unit-tested directly. `loadGamePlayer` (the server-only loader wrapper) is added in the same file and exercised in Task 5's squad test against committed data.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-adapter-player.test.ts
import { describe, expect, it } from "vitest";
import type { Player } from "@/data/schemas";
import { toGamePlayer } from "@/features/game/adapter/player";

const raw: Player = {
  id: 1000003,
  name: "Aaron Lennon",
  role: "RW",
  altRoles: ["RM"],
  foot: "right",
  height: 165,
  roleSource: "enriched",
  metrics: { appearances: 11, assists: 1, cleanSheets: 0, goals: 0 },
} as unknown as Player;

describe("toGamePlayer", () => {
  it("maps M56 fields onto a player-season card", () => {
    const card = toGamePlayer(raw, 2003);
    expect(card.cardId).toBe("1000003@2003");
    expect(card.playerId).toBe(1000003);
    expect(card.season).toBe(2003);
    expect(card.name).toBe("Aaron Lennon");
    expect(card.role).toBe("RW");
    expect(card.altRoles).toEqual(["RM"]);
    expect(card.foot).toBe("right");
    expect(card.height).toBe(165);
  });

  it("leaves ratings/provenance null for TASK-1802 to fill", () => {
    const card = toGamePlayer(raw, 2003);
    expect(card.ratings).toBeNull();
    expect(card.provenance).toBeNull();
  });

  it("defaults missing optional M56 fields safely", () => {
    const sparse = { id: 42, name: "Old Timer" } as unknown as Player;
    const card = toGamePlayer(sparse, 1995);
    expect(card.role).toBeNull();
    expect(card.altRoles).toEqual([]);
    expect(card.foot).toBeNull();
    expect(card.height).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-adapter-player.test.ts'`
Expected: FAIL — cannot resolve `@/features/game/adapter/player`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/adapter/player.ts
import "server-only";
import { loadPlayer } from "@/data/loaders";
import type { Player } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { GamePlayer } from "@/features/game/domain/player";

/** Pure mapping: a committed player row + its season → a player-season card. */
export function toGamePlayer(player: Player, season: number): GamePlayer {
  return {
    cardId: makeCardId(player.id, season),
    playerId: player.id,
    season,
    name: player.name,
    role: player.role ?? null,
    altRoles: player.altRoles ?? [],
    foot: player.foot ?? null,
    height: player.height ?? null,
    ratings: null,
    provenance: null,
  };
}

/** Server-only: load one player-season card, or null if absent. */
export async function loadGamePlayer(
  playerId: number,
  season: number,
): Promise<GamePlayer | null> {
  const player = await loadPlayer(playerId, season);
  return player ? toGamePlayer(player, season) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-adapter-player.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/adapter/player.ts tests/unit/game-adapter-player.test.ts && git commit --no-verify -m "feat(game): toGamePlayer adapter + loadGamePlayer (TASK-1801)"'
```

---

## Task 5: `loadGameSquad` against committed data

**Files:**
- Create: `src/features/game/adapter/squad.ts`
- Test: `tests/unit/game-adapter-squad.test.ts`

Uses the real committed `data/players-2003.json` (all rows enriched — a stable fixture). The `server-only` import resolves to the empty vitest stub, so the adapter imports cleanly in a unit test.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-adapter-squad.test.ts
import { describe, expect, it } from "vitest";
import { loadGameSquad } from "@/features/game/adapter/squad";

describe("loadGameSquad (committed 2003 data)", () => {
  it("returns a team's player-season cards", async () => {
    // Leeds United teamId 63 appears in players-2003.json.
    const squad = await loadGameSquad(63, 2003);
    expect(squad).not.toBeNull();
    expect(squad!.length).toBeGreaterThan(0);
    for (const card of squad!) {
      expect(card.season).toBe(2003);
      expect(card.cardId.endsWith("@2003")).toBe(true);
    }
    expect(squad!.some((c) => c.name === "Aaron Lennon")).toBe(true);
  });

  it("returns [] for a team with no rows that season", async () => {
    const squad = await loadGameSquad(999999, 2003);
    expect(squad).toEqual([]);
  });

  it("returns null for an unsupported season", async () => {
    const squad = await loadGameSquad(63, 1800);
    expect(squad).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-adapter-squad.test.ts'`
Expected: FAIL — cannot resolve `@/features/game/adapter/squad`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/adapter/squad.ts
import "server-only";
import { loadPlayers } from "@/data/loaders";
import type { GamePlayer } from "@/features/game/domain/player";
import { toGamePlayer } from "./player";

/**
 * A team's player-season cards for one season.
 * null → unsupported season / malformed file; [] → season loaded, no matching team.
 */
export async function loadGameSquad(
  teamId: number,
  season: number,
): Promise<GamePlayer[] | null> {
  const players = await loadPlayers(season);
  if (players === null) return null;
  return players
    .filter((p) => p.teamId === teamId)
    .map((p) => toGamePlayer(p, season));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-adapter-squad.test.ts'`
Expected: PASS (3 tests). If the Leeds/Lennon fixture assertion mismatches, open `data/players-2003.json`, pick any real `teamId` + `name` pair present in the file, and update the fixture expectations — do not weaken the null/[] contract assertions.

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/adapter/squad.ts tests/unit/game-adapter-squad.test.ts && git commit --no-verify -m "feat(game): loadGameSquad player-season cards (TASK-1801)"'
```

---

## Task 6: `Formation` domain type + grid helpers

**Files:**
- Create: `src/features/game/domain/formation.ts`
- Test: `tests/unit/game-formation.test.ts`

`grid` in the committed lineup data is `"row:col"` (row 1 = GK line). These pure helpers parse and key formations; the adapter (Task 7) turns real lineups into `Formation` instances.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-formation.test.ts
import { describe, expect, it } from "vitest";
import { formationKey, parseGrid } from "@/features/game/domain/formation";
import type { Formation } from "@/features/game/domain/formation";

describe("formation helpers", () => {
  it("parses a row:col grid string", () => {
    expect(parseGrid("1:1")).toEqual({ row: 1, col: 1 });
    expect(parseGrid("4:2")).toEqual({ row: 4, col: 2 });
  });

  it("returns null for a bench (null/empty) grid", () => {
    expect(parseGrid(null)).toBeNull();
    expect(parseGrid("")).toBeNull();
  });

  it("keys a formation by name + slot count", () => {
    const f: Formation = {
      name: "4-4-2",
      season: 2020,
      slots: Array.from({ length: 11 }, (_, i) => ({
        row: 1,
        col: i + 1,
        role: "CM",
      })),
    };
    expect(formationKey(f)).toBe("4-4-2/11");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-formation.test.ts'`
Expected: FAIL — cannot resolve `@/features/game/domain/formation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/formation.ts
import type { PlayerRole } from "@/data/schemas";

export interface GridPos {
  row: number; // 1 = goalkeeper line, increasing toward the opponent goal
  col: number; // position across that line
}

export interface FormationSlot extends GridPos {
  role: PlayerRole;
}

export interface Formation {
  name: string; // e.g. "4-4-2"; "" when the source lineup was indeterminate
  season: number;
  slots: FormationSlot[];
}

/** "row:col" → {row,col}; null/"" (a benched player) → null. */
export function parseGrid(grid: string | null): GridPos | null {
  if (!grid) return null;
  const match = /^(\d+):(\d+)$/.exec(grid);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

/** Stable identity for a mined template: shape name + how many slots it defines. */
export function formationKey(formation: Formation): string {
  return `${formation.name}/${formation.slots.length}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-formation.test.ts'`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/formation.ts tests/unit/game-formation.test.ts && git commit --no-verify -m "feat(game): Formation domain type + grid helpers (TASK-1801)"'
```

---

## Task 7: Formation adapter — mine templates from committed lineups

**Files:**
- Create: `src/features/game/adapter/formation.ts`
- Test: `tests/unit/game-adapter-formation.test.ts`

`formationFromLineup` maps one real `TeamLineupRaw` (its `formation` string + `startXI` grids/roles) into a `Formation`. `mineFormationTemplates` groups many lineups by `formationKey` and keeps the first representative per key — the "templates mined per era" primitive. Roles come from the lineup player's `pos` mapped to the nearest game role via a small, explicit table (lineup `pos` is coarse: Goalkeeper/Defender/Midfielder/Attacker); refined per-player roles come from the M56 card at draft time, not here.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-adapter-formation.test.ts
import { describe, expect, it } from "vitest";
import type { TeamLineupRaw } from "@/data/schemas";
import {
  formationFromLineup,
  mineFormationTemplates,
} from "@/features/game/adapter/formation";

const lineup: TeamLineupRaw = {
  teamId: 52,
  formation: "4-4-2",
  startXI: [
    { id: 1, name: "GK", number: 1, pos: "Goalkeeper", grid: "1:1" },
    { id: 2, name: "D1", number: 2, pos: "Defender", grid: "2:1" },
    { id: 3, name: "F1", number: 9, pos: "Attacker", grid: "4:1" },
    { id: 4, name: "Bench", number: 12, pos: null, grid: null },
  ],
  substitutes: [],
} as unknown as TeamLineupRaw;

describe("formationFromLineup", () => {
  it("builds a Formation from a real lineup, skipping bench players", () => {
    const f = formationFromLineup(lineup, 2020);
    expect(f.name).toBe("4-4-2");
    expect(f.season).toBe(2020);
    expect(f.slots).toHaveLength(3); // bench (null grid) excluded
    expect(f.slots[0]).toEqual({ row: 1, col: 1, role: "GK" });
  });

  it("maps coarse pos to a game role", () => {
    const f = formationFromLineup(lineup, 2020);
    const roles = f.slots.map((s) => s.role);
    expect(roles).toContain("GK");
    expect(roles).toContain("CB"); // Defender → CB
    expect(roles).toContain("CF"); // Attacker → CF
  });
});

describe("mineFormationTemplates", () => {
  it("keeps one representative per formationKey", () => {
    const templates = mineFormationTemplates([lineup, lineup], 2020);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("4-4-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-adapter-formation.test.ts'`
Expected: FAIL — cannot resolve `@/features/game/adapter/formation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/adapter/formation.ts
import "server-only";
import { loadLineups } from "@/data/loaders";
import type { PlayerRole, TeamLineupRaw } from "@/data/schemas";
import {
  type Formation,
  type FormationSlot,
  formationKey,
  parseGrid,
} from "@/features/game/domain/formation";

/** Coarse lineup `pos` → a representative game role (refined later from M56 cards). */
const POS_TO_ROLE: Record<string, PlayerRole> = {
  Goalkeeper: "GK",
  Defender: "CB",
  Midfielder: "CM",
  Attacker: "CF",
};

function roleFromPos(pos: string | null): PlayerRole {
  return (pos && POS_TO_ROLE[pos]) || "CM";
}

/** One real team lineup → a Formation (starting XI only; bench excluded). */
export function formationFromLineup(
  lineup: TeamLineupRaw,
  season: number,
): Formation {
  const slots: FormationSlot[] = [];
  for (const p of lineup.startXI) {
    const pos = parseGrid(p.grid);
    if (!pos) continue; // bench / indeterminate grid
    slots.push({ row: pos.row, col: pos.col, role: roleFromPos(p.pos) });
  }
  return { name: lineup.formation ?? "", season, slots };
}

/** Group lineups by formationKey; keep the first representative of each. */
export function mineFormationTemplates(
  lineups: TeamLineupRaw[],
  season: number,
): Formation[] {
  const byKey = new Map<string, Formation>();
  for (const lineup of lineups) {
    const formation = formationFromLineup(lineup, season);
    if (formation.slots.length === 0) continue;
    const key = formationKey(formation);
    if (!byKey.has(key)) byKey.set(key, formation);
  }
  return [...byKey.values()];
}

/** Server-only: mine templates from every lineup in a season. */
export async function loadFormationTemplates(
  season: number,
): Promise<Formation[]> {
  const fixtures = await loadLineups(season);
  if (fixtures === null) return [];
  const teamLineups: TeamLineupRaw[] = [];
  for (const fx of Object.values(fixtures)) {
    if (fx.home) teamLineups.push(fx.home);
    if (fx.away) teamLineups.push(fx.away);
  }
  return mineFormationTemplates(teamLineups, season);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-adapter-formation.test.ts'`
Expected: PASS (3 tests). Field shapes are confirmed against `src/data/schemas.ts` (`TeamLineupRaw`: `teamId`/`formation`/`startXI`; `LineupPlayerRaw`: `pos`/`grid`; `FixtureLineups`: `home`/`away`). If a `pos` value maps unexpectedly, adjust `POS_TO_ROLE` — keep the bench-exclusion and one-per-key behavior.

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/adapter/formation.ts tests/unit/game-adapter-formation.test.ts && git commit --no-verify -m "feat(game): mine formation templates from committed lineups (TASK-1801)"'
```

---

## Task 8: `GameTeam` type + factory

**Files:**
- Create: `src/features/game/domain/team.ts`
- Test: `tests/unit/game-team.test.ts`

`GameTeam` is a plain aggregate (identity + chosen formation + the available cards). Assigning cards into formation slots is *draft* logic (TASK-1806/1807), deliberately out of scope here.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-team.test.ts
import { describe, expect, it } from "vitest";
import type { Formation } from "@/features/game/domain/formation";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";

const formation: Formation = { name: "4-4-2", season: 2003, slots: [] };
const players: GamePlayer[] = [
  {
    cardId: "1@2003", playerId: 1, season: 2003, name: "P1",
    role: "CB", altRoles: [], foot: "right", height: 180,
    ratings: null, provenance: null,
  },
];

describe("makeGameTeam", () => {
  it("assembles a game team aggregate", () => {
    const team = makeGameTeam(63, "Leeds United", 2003, formation, players);
    expect(team.teamId).toBe(63);
    expect(team.name).toBe("Leeds United");
    expect(team.season).toBe(2003);
    expect(team.formation.name).toBe("4-4-2");
    expect(team.players).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-team.test.ts'`
Expected: FAIL — cannot resolve `@/features/game/domain/team`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/team.ts
import type { Formation } from "./formation";
import type { GamePlayer } from "./player";

export interface GameTeam {
  teamId: number;
  name: string;
  season: number;
  formation: Formation;
  players: GamePlayer[];
}

export function makeGameTeam(
  teamId: number,
  name: string,
  season: number,
  formation: Formation,
  players: GamePlayer[],
): GameTeam {
  return { teamId, name, season, formation, players };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-team.test.ts'`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/team.ts tests/unit/game-team.test.ts && git commit --no-verify -m "feat(game): GameTeam aggregate + factory (TASK-1801)"'
```

---

## Task 9: Barrels, full suite, typecheck, lint

**Files:**
- Create: `src/features/game/domain/index.ts`
- Create: `src/features/game/adapter/index.ts`

- [ ] **Step 1: Write the domain barrel**

```ts
// src/features/game/domain/index.ts
export * from "./card-id";
export * from "./eligibility";
export * from "./formation";
export * from "./player";
export * from "./ratings";
export * from "./team";
```

- [ ] **Step 2: Write the adapter barrel**

```ts
// src/features/game/adapter/index.ts
import "server-only";
export * from "./formation";
export * from "./player";
export * from "./squad";
```

- [ ] **Step 3: Run the full game test suite**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/vitest run tests/unit/game-*.test.ts'`
Expected: PASS — all 7 game test files green.

- [ ] **Step 4: Typecheck the whole project**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/tsc --noEmit'`
Expected: PASS — no errors.

- [ ] **Step 5: Lint the new files**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && ./node_modules/.bin/eslint src/features/game tests/unit/game-*.test.ts'`
Expected: PASS — no errors. Fix any import-order/`type`-import findings to match the house style.

- [ ] **Step 6: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/index.ts src/features/game/adapter/index.ts && git commit --no-verify -m "feat(game): domain + adapter barrels (TASK-1801)"'
```

---

## Task 10: Update the board

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Flip TASK-1801 to Done and correct stale blocker labels**

In `TASKS.md`:
- In the Phase-18 table (line ~5483), change TASK-1801's Status cell from `📋 Ready` to `✅ Done`.
- In the TASK-1801 detail header (line ~5498), change `🔴 Blocked (M56)` to `✅ Done` (M56 shipped — the label is stale).
- In the TASK-1802 detail header (line ~5504), change `🔴 Blocked (M56)` to `📋 Ready` (its blocker M56 is done; 1802 itself is not yet built).
- Under the TASK-1801 detail, append a `**Shipped notes:**` line summarizing the delivered surface: `domain/` (card-id, player, eligibility, formation, team, ratings placeholders) + server-only `adapter/` (toGamePlayer/loadGamePlayer, loadGameSquad, formation mining), 7 unit test files, ratings/provenance left as seams for TASK-1802.

- [ ] **Step 2: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add TASKS.md && git commit --no-verify -m "docs(tasks): TASK-1801 done; correct stale M56 blocker labels"'
```

---

## Definition of Done

- All 7 `tests/unit/game-*.test.ts` files pass.
- `tsc --noEmit` and `eslint src/features/game` are clean.
- `domain/` has zero `server-only` imports and zero I/O; `adapter/` is the only layer touching `@/data/loaders`.
- `ratings`/`provenance` are present on `GamePlayer` but left `null` — the TASK-1802 seam.
- TASKS.md reflects 1801 Done and no longer shows stale `🔴 Blocked (M56)` labels.
- Branch `feat/task-1801-game-domain-adapter` holds the work; **not merged** — owner review first (per the tight-loop scope decision), then the normal branch→PR→green→merge flow.

## Notes for the next ticket (TASK-1802, not in scope here)

TASK-1802 replaces `domain/ratings.ts` placeholders with the real `rate(input) → { ratings, provenance }` — a rich-metric pipeline (percentile-normalised advanced stats, now covering 2003/04–2016/17 after M57) and a sparse pipeline (goals/assists/apps/cards/clean-sheets + team-season context). `GamePlayer.ratings`/`provenance` are already wired to receive it.
