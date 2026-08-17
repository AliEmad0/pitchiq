# TASK-1810 PR 1 — Rule Packs + Legacy Club Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the declarative rule-pack seam and ship **Legacy Club** through it, so the remaining four modes become data-only PRs.

**Architecture:** `domain/rule-packs.ts` holds each mode's pool as a **discriminated-union recipe** plus its constraints and objective — pure, no I/O. `adapter/pool.ts` reads a recipe and does the JSON work at build time. One parameterised `force-static` route `/game/[mode]` prerenders every live pack. The existing Chaos pool is re-expressed as a recipe, giving the seam a second real caller whose 252 cards are a diffable control.

**Tech Stack:** Next.js 15 App Router (`force-static` + `generateStaticParams`), React 19, TypeScript, next-intl (en + ar), Vitest + happy-dom.

**Spec:** [`docs/superpowers/specs/2026-08-17-task-1810-rule-packs-design.md`](../specs/2026-08-17-task-1810-rule-packs-design.md)

---

## Environment

```bash
wsl -d Ubuntu -- bash -lc 'source $HOME/.nvm/nvm.sh && nvm use 22 >/dev/null && cd /home/aliemad/projects/pq-1810 && <cmd>'
```

- Commit with `git commit --no-verify` (the husky hook fails `node: not found` under this PATH).
- ⛔ `next build` **cannot run here** — CI's Build check is the gate.
- `pnpm lint` needs `CI=true`. `npx vitest run` / `npx tsc --noEmit` skip pnpm and are faster.
- ⚠️ Vitest does **not** type-check. `tsc --noEmit` is a separate required gate.
- ⚠️ Quoting mangles through `wsl.exe` — write multi-line commit messages to a script file.
- ⚠️ A full-suite `ERR_IPC_CHANNEL_CLOSED` is a **flaky worker crash**, not a failure. Re-run on a quiet machine; the unmodified `main` checkout is the control.

**This worktree needs its own `node_modules`:**

```bash
CI=true pnpm install --prefer-offline
```

⛔ **Never symlink it to another checkout's** — running any `pnpm` script from inside a worktree whose `node_modules` is a symlink makes pnpm rewrite the *shared* top-level links to point at the worktree, so deleting it breaks the other checkout.

---

## File Structure

**Create**

| File | Responsibility |
| --- | --- |
| `src/features/game/domain/rule-packs.ts` | `PoolSpec` union, `RulePack`, the pack registry, `packFor`. Pure. |
| `src/features/game/adapter/pool.ts` | `buildPool(spec)` — the only place a recipe becomes cards. |
| `src/features/game/components/ModePlay.tsx` | The shared mode container: club chooser → `GamePlay`. |
| `src/app/[locale]/game/[mode]/page.tsx` | The parameterised route. |
| `tests/unit/game-rule-packs.test.ts` | The pure half + the layering guard. |
| `tests/unit/game-pool-builder.test.ts` | The Chaos control + Legacy's named assertions. |
| `tests/unit/game-mode-play.test.tsx` | The chooser and the handoff. |

**Modify**

| File | Change |
| --- | --- |
| `src/features/game/adapter/chaos-pool.ts` | Delegate to `buildPool(CHAOS_PACK.pool)`. |
| `src/features/game/domain/modes.ts` | `legacy` → `href: "/game/legacy"`, `single: "live"`. |
| `tests/unit/game-modes.test.ts` | Teach the href guard about dynamic segments **and** packs. |
| `tests/unit/game-routes-static.test.ts` | Floor 5 → 6. |
| `scripts/warm-e2e-routes.sh` | Add `/game/legacy`. |
| `src/i18n/messages/en.json`, `ar.json` | Chooser copy. |
| `TASKS.md` | A progress line; the ticket stays Backlog. |

---

## Task 1: The pure seam

**Files:**
- Create: `src/features/game/domain/rule-packs.ts`
- Create: `tests/unit/game-rule-packs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-rule-packs.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_MODES } from "@/features/game/domain/modes";
import { CHAOS_PACK, LEGACY_CLUBS, RULE_PACKS, packFor } from "@/features/game/domain/rule-packs";

describe("rule packs", () => {
  it("every pack id is a real mode id", () => {
    const ids = new Set(GAME_MODES.map((m) => m.id));
    for (const pack of RULE_PACKS) expect(ids.has(pack.id)).toBe(true);
  });

  it("packFor resolves a known id and refuses an unknown one", () => {
    expect(packFor("legacy")?.id).toBe("legacy");
    // ⚠️ null, never a throw: the mode comes from a URL segment a stranger controls.
    expect(packFor("nonsense")).toBeNull();
  });

  it("⚠️ Legacy offers exactly the TEN owner-chosen clubs", () => {
    // Pinned because the club menu IS the payload decision — one prerendered page holds
    // every selectable club's cards, so silently growing this grows the static payload.
    expect(LEGACY_CLUBS).toEqual([33, 40, 47, 42, 49, 45, 66, 34, 48, 50]);
  });

  it("Legacy's recipe is club-history shaped and Chaos's is top-teams shaped", () => {
    const legacy = packFor("legacy")!;
    expect(legacy.pool.kind).toBe("clubHistory");
    if (legacy.pool.kind !== "clubHistory") throw new Error("unreachable");
    expect(legacy.pool.teams).toEqual(LEGACY_CLUBS);
    expect(CHAOS_PACK.pool.kind).toBe("topTeams");
  });

  it("⚠️ Legacy needs a club chooser; Chaos needs none", () => {
    expect(packFor("legacy")!.chooser).toEqual({ kind: "club" });
    expect(CHAOS_PACK.chooser).toBeUndefined();
  });

  it("⛔ domain/rule-packs.ts imports nothing from adapter/", () => {
    // The seam's entire value is this boundary — an adapter import here would let a client
    // component pull server-only code, which the game's layering forbids outright.
    const src = readFileSync(
      path.resolve(__dirname, "../../src/features/game/domain/rule-packs.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["'].*adapter/);
    expect(src).not.toMatch(/server-only/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/game-rule-packs.test.ts`
Expected: FAIL — cannot resolve `@/features/game/domain/rule-packs`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/domain/rule-packs.ts
import type { ModeId } from "./modes";

/**
 * TASK-1810 — a mode's rules, as DATA.
 *
 * ⚠️ The pool is a declarative RECIPE, never a builder function. A `buildPool` slot here
 * would be a signature only server code can satisfy, which makes it trivial to pull
 * `adapter/*` into a client component — the one boundary the game's layering forbids. A
 * recipe keeps "modes are rule packs (data), not code paths" literally true, and lets the
 * whole registry be unit-tested with no I/O.
 */

/**
 * How a pool is gathered. A discriminated union rather than one shape with optional
 * fields, so each mode's recipe is exactly the shape it needs and `buildPool` cannot be
 * handed a half-specified spec.
 */
export type PoolSpec =
  | {
      /** The Chaos shape: a spread of seasons, the best of each season's top teams. */
      kind: "topTeams";
      seasons: number[];
      topTeamsPerSeason: number;
      cardsPerTeamSeason: number;
    }
  | {
      /** The Legacy shape: one club's history, sampled per ERA so an XI spans decades. */
      kind: "clubHistory";
      teams: number[];
      cardsPerEraPerTeam: number;
    };

/**
 * ⛔ Deliberately `never`, so `constraints` can only ever be `[]` today.
 *
 * No mode in this PR needs a constraint — Legacy's entire rule is a pool filter. Typing
 * this as `never` means the machinery cannot be quietly half-built: the first real
 * constraint (Budget Cap's spend cap, Captain's Draft's slot-1 rule) has to change this
 * type deliberately, with a caller in hand.
 */
export type Constraint = never;

/** Single-match modes all share one objective. It earns its keep in TASK-1811's seasons. */
export type Objective = "win";

/** A choice the pack needs before drafting. Labels come from DATA, never from source. */
export interface ChooserSpec {
  kind: "club";
}

export interface RulePack {
  id: ModeId;
  pool: PoolSpec;
  chooser?: ChooserSpec;
  constraints: Constraint[];
  objective: Objective;
}

/**
 * The ten clubs Legacy Club offers, by team id, in the owner's chosen order.
 *
 * ⚠️ THIS LIST IS THE PAYLOAD. One prerendered page holds every selectable club's cards
 * (~10 clubs × 3 eras × 10 cards ≈ 300, the same order as Chaos's 252), so adding clubs
 * grows the static payload of a `force-static` route. All 51 clubs would be ~1,530.
 *
 * Nine are ever-presents; Manchester City (29 seasons) was added by owner decision. Every
 * one has cards in all three provenance eras — measured, not assumed.
 */
export const LEGACY_CLUBS: readonly number[] = [
  33, // Manchester United — 34 seasons
  40, // Liverpool — 34
  47, // Tottenham Hotspur — 34
  42, // Arsenal — 34
  49, // Chelsea — 34
  45, // Everton — 34
  66, // Aston Villa — 31
  34, // Newcastle United — 31
  48, // West Ham United — 30
  50, // Manchester City — 29
];

/**
 * The Chaos pool, re-expressed as a recipe.
 *
 * ⚠️ These four numbers are the constants `adapter/chaos-pool.ts` shipped with. They are
 * reproduced exactly so the rebuilt pool is byte-comparable against the live one — that
 * diff is the control proving the seam changed no behaviour.
 */
export const CHAOS_PACK: RulePack = {
  id: "chaos",
  pool: {
    kind: "topTeams",
    seasons: [1996, 2004, 2008, 2012, 2019, 2023],
    topTeamsPerSeason: 3,
    cardsPerTeamSeason: 14,
  },
  constraints: [],
  objective: "win",
};

const LEGACY_PACK: RulePack = {
  id: "legacy",
  pool: { kind: "clubHistory", teams: [...LEGACY_CLUBS], cardsPerEraPerTeam: 10 },
  chooser: { kind: "club" },
  constraints: [],
  objective: "win",
};

/** Every pack. Chaos is included so the seam has two real callers, not one. */
export const RULE_PACKS: readonly RulePack[] = [CHAOS_PACK, LEGACY_PACK];

/**
 * Resolve a mode id that came from a URL segment.
 *
 * ⚠️ Returns null rather than throwing — this reads a value a stranger controls, so an
 * unknown mode is bad input, not a programming error. The route turns null into a 404.
 */
export function packFor(id: string): RulePack | null {
  return RULE_PACKS.find((p) => p.id === id) ?? null;
}

/** The packs the parameterised route prerenders. */
export const routedPacks = (): RulePack[] => RULE_PACKS.filter((p) => p.chooser != null);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/game-rule-packs.test.ts && npx tsc --noEmit`
Expected: PASS, 6 tests, clean `tsc`.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/rule-packs.ts tests/unit/game-rule-packs.test.ts
git commit --no-verify -m "feat(game): the rule-pack seam as declarative data (TASK-1810)"
```

---

## Task 2: `buildPool`, with Chaos as the control

**Files:**
- Create: `src/features/game/adapter/pool.ts`
- Create: `tests/unit/game-pool-builder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-pool-builder.test.ts
import { describe, expect, it } from "vitest";
import { buildPool } from "@/features/game/adapter/pool";
import { CHAOS_PACK, LEGACY_CLUBS, packFor } from "@/features/game/domain/rule-packs";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { eraForSeason } from "@/utils/era";

// Real committed data, real clubs. ⛔ No synthetic pool: the recurring failure in this
// codebase is a fixture that cannot occur.
describe("buildPool", () => {
  it("⛔ THE CONTROL — the Chaos recipe rebuilds the SAME cards the live pool ships", async () => {
    // This is the assertion that proves the seam is behaviour-preserving. Without it the
    // recipe could quietly drift and only a player would notice.
    const [viaRecipe, live] = await Promise.all([buildPool(CHAOS_PACK.pool), loadChaosPool()]);
    expect(viaRecipe.map((c) => c.cardId)).toEqual(live.map((c) => c.cardId));
  }, 120_000);

  it("⚠️ Legacy: Manchester United's pool holds ONLY Man Utd, across decades", async () => {
    // Asserted by NAME and by era, not by count — "returns 30 things" stays green through
    // a total change in output.
    const pool = await buildPool(packFor("legacy")!.pool);
    const utd = pool.filter((c) => c.teamId === 33);
    expect(utd.length).toBeGreaterThan(0);
    expect(new Set(utd.map((c) => c.teamId))).toEqual(new Set([33]));
    const eras = new Set(utd.map((c) => eraForSeason(c.season)));
    expect(eras.has("retro90s")).toBe(true);
    expect(eras.has("modern")).toBe(true);
  }, 120_000);

  it("⚠️ every one of the ten clubs contributes, and spans at least two eras", async () => {
    // A club whose data thins out (Man City has only 4 retro seasons) must fail loudly
    // rather than silently shipping a one-era pool.
    const pool = await buildPool(packFor("legacy")!.pool);
    for (const id of LEGACY_CLUBS) {
      const cards = pool.filter((c) => c.teamId === id);
      expect(cards.length, `club ${id} contributed nothing`).toBeGreaterThan(0);
      const eras = new Set(cards.map((c) => eraForSeason(c.season)));
      expect(eras.size, `club ${id} spans only ${[...eras]}`).toBeGreaterThanOrEqual(2);
    }
  }, 180_000);

  it("keeps the payload in the proven range", async () => {
    // Chaos ships 252 cards on a force-static route. Legacy must stay the same order.
    const pool = await buildPool(packFor("legacy")!.pool);
    expect(pool.length).toBeLessThan(450);
  }, 180_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/game-pool-builder.test.ts`
Expected: FAIL — cannot resolve `@/features/game/adapter/pool`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/game/adapter/pool.ts
import "server-only";
import { loadPlayers, loadStandings } from "@/data/loaders";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { PoolSpec } from "@/features/game/domain/rule-packs";
import { getAvailableSeasons } from "@/utils/season";
import { eraForSeason } from "@/utils/era";
import { cardBio, loadCareerIndex } from "./card-enrich";
import { resolvePhotos } from "./photo-kind";
import { loadRatedSquad } from "./ratings";

/**
 * TASK-1810 — the ONE place a rule pack's pool recipe becomes cards.
 *
 * Runs at BUILD TIME only: every `/game/*` route is `force-static`, so the whole pool is
 * baked into the prerendered payload. That is why a recipe's breadth is a payload
 * decision, not just a data decision.
 */

type Gathered = { card: EnrichedCard; rating: number };

async function cardsFor(
  teamId: number,
  teamName: string,
  season: number,
  career: Awaited<ReturnType<typeof loadCareerIndex>>,
): Promise<Gathered[]> {
  const [squad, players] = await Promise.all([loadRatedSquad(teamId, season), loadPlayers(season)]);
  if (squad == null) return [];
  const byId = new Map((players ?? []).map((p) => [p.id, p]));
  return squad
    .filter((p) => p.ratings != null)
    .map((p) => ({
      rating: p.ratings?.overall ?? 0,
      card: {
        ...p,
        club: teamName,
        teamId,
        ...cardBio(byId.get(p.playerId), p.playerId, season, career),
      } as EnrichedCard,
    }));
}

/** The Chaos shape: each season's top teams, their best cards. */
async function topTeams(
  spec: Extract<PoolSpec, { kind: "topTeams" }>,
  career: Awaited<ReturnType<typeof loadCareerIndex>>,
): Promise<EnrichedCard[]> {
  const out: EnrichedCard[] = [];
  for (const season of spec.seasons) {
    const standings = await loadStandings(season);
    if (!standings || standings.length === 0) continue;
    const top = [...standings].sort((a, b) => a.rank - b.rank).slice(0, spec.topTeamsPerSeason);
    for (const row of top) {
      const gathered = await cardsFor(row.teamId, row.teamName, season, career);
      out.push(
        ...gathered
          .sort((a, b) => b.rating - a.rating)
          .slice(0, spec.cardsPerTeamSeason)
          .map((g) => g.card),
      );
    }
  }
  return out;
}

/**
 * The Legacy shape: one club's whole history, sampled PER ERA.
 *
 * ⚠️ Per era, not simply top-rated overall. Taking the best N of a club's history would
 * skew modern — ratings rise with data coverage — and the mode's entire appeal is a 1990s
 * full-back beside a modern forward.
 */
async function clubHistory(
  spec: Extract<PoolSpec, { kind: "clubHistory" }>,
  career: Awaited<ReturnType<typeof loadCareerIndex>>,
): Promise<EnrichedCard[]> {
  const seasons = getAvailableSeasons();
  const out: EnrichedCard[] = [];
  for (const teamId of spec.teams) {
    const byEra = new Map<string, Gathered[]>();
    for (const season of seasons) {
      const standings = await loadStandings(season);
      const row = standings?.find((r) => r.teamId === teamId);
      if (row == null) continue; // the club was not in the top flight that season
      const era = eraForSeason(season);
      const bucket = byEra.get(era) ?? [];
      bucket.push(...(await cardsFor(teamId, row.teamName, season, career)));
      byEra.set(era, bucket);
    }
    for (const bucket of byEra.values()) {
      // One card per player per club-era: the same player across ten seasons would
      // otherwise fill the bucket alone.
      const best = new Map<number, Gathered>();
      for (const g of bucket) {
        const prior = best.get(g.card.playerId);
        if (prior == null || g.rating > prior.rating) best.set(g.card.playerId, g);
      }
      out.push(
        ...[...best.values()]
          .sort((a, b) => b.rating - a.rating)
          .slice(0, spec.cardsPerEraPerTeam)
          .map((g) => g.card),
      );
    }
  }
  return out;
}

export async function buildPool(spec: PoolSpec): Promise<EnrichedCard[]> {
  const career = await loadCareerIndex();
  const pool = spec.kind === "topTeams" ? await topTeams(spec, career) : await clubHistory(spec, career);

  // Pixel-inspect each photo to tell a transparent cutout from a background shot — the URL
  // alone lies for older players. Best-effort, build time only.
  const resolved = await resolvePhotos(pool.map((c) => c.photo));
  resolved.forEach((r, i) => {
    pool[i]!.photoKind = r.kind;
    pool[i]!.photoUrl = r.url;
  });
  return pool;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/game-pool-builder.test.ts`
Expected: PASS, 4 tests. The Chaos control is the one that matters — if it fails, the
recipe is not equivalent and the numbers in `CHAOS_PACK` are wrong.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/adapter/pool.ts tests/unit/game-pool-builder.test.ts
git commit --no-verify -m "feat(game): buildPool reads a rule pack's recipe (TASK-1810)"
```

---

## Task 3: Delegate Chaos to the seam

**Files:**
- Modify: `src/features/game/adapter/chaos-pool.ts`

⚠️ Behaviour-preserving. The Chaos control test from Task 2 is what proves it; do not edit
that test in this task.

- [ ] **Step 1: Replace the file body**

```ts
// src/features/game/adapter/chaos-pool.ts
import "server-only";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { CHAOS_PACK } from "@/features/game/domain/rule-packs";
import { buildPool } from "./pool";

/**
 * The Chaos Draft card pool.
 *
 * ⚠️ Now a thin call through the TASK-1810 seam: the season/team/card constants moved into
 * `CHAOS_PACK.pool` as a recipe, and `buildPool` does the work. Chaos is deliberately the
 * seam's SECOND caller — its 252 cards are the control that proves a recipe reproduces the
 * pool the game already shipped.
 */
export async function loadChaosPool(): Promise<EnrichedCard[]> {
  return buildPool(CHAOS_PACK.pool);
}
```

- [ ] **Step 2: Prove Chaos is unchanged**

Run: `npx vitest run tests/unit/game-pool-builder.test.ts tests/unit/game-chaos-draft.test.ts tests/unit/game-adapter-squad.test.ts`
Expected: PASS. The control now compares `buildPool` against a `loadChaosPool` that
delegates to it, so **also** run the broader game suite, whose fixtures came from the old
pool:

Run: `npx vitest run tests/unit/game-*.test.ts`
Expected: PASS, no test file edited.

⚠️ If the control passes only because both sides now run the same code, that is expected
here — its value was in Task 2, where the two implementations were still independent. Note
that in the commit message rather than pretending otherwise.

- [ ] **Step 3: Commit**

```bash
git add src/features/game/adapter/chaos-pool.ts
git commit --no-verify -m "refactor(game): Chaos builds through the rule-pack seam (TASK-1810)"
```

---

## ⚠️ AMENDMENT — Tasks 4+ were rewritten mid-implementation (2026-08-17)

Tasks 1–3 are **done and committed** (`5575a87`): the seam, `buildPool`, and Chaos
delegating through it with its 252-card control passing.

The owner then replaced Legacy's draft mechanic: **11 consecutive rounds, 3 cards each, from
the chosen club**, with the coach picking the formation first. See spec §5.1. Task 4 below is
superseded by Tasks 4a–4c; Tasks 5–7 are unchanged except that `ModePlay` now takes a
`DraftSpec`.

⭐ **The key discovery, which shrinks this a lot:** `roomReducer` already advances `open` to
the next unfilled slot on every `pick`. **Sequential progression is already the behaviour** —
free roam is only the UI permitting the `open` action. So no reducer change is needed.

⛔ `DraftRoom` and `room-state.ts` are shared with the shipped `/game/draft`. TASK-1823's
tests are the control and must pass **untouched**.

### Task 4a: `DraftSpec` on the rule pack, and a parameterised hand size

**Files:** `src/features/game/domain/rule-packs.ts`, `src/features/game/domain/draft-room.ts`,
`tests/unit/game-rule-packs.test.ts`, `tests/unit/game-draft-room.test.ts`

- [ ] Add to `rule-packs.ts`:

```ts
export interface DraftSpec {
  /** Cards offered per round. The room's shipped default is 5; Legacy uses 3. */
  handSize: number;
  /**
   * `free` — any slot clickable at any time (the shipped Draft Room).
   * `sequential` — 11 consecutive rounds; the room advances itself.
   * ⚠️ The reducer already advances on pick, so this only governs the UI.
   */
  roam: "free" | "sequential";
}
```

and `draft: { handSize: 3, roam: "sequential" }` on `LEGACY_PACK`.

- [ ] In `domain/draft-room.ts`, give `roomDeals` a fourth parameter
      `handSize: number = HAND_SIZE`, and use it in place of the constant. ⚠️ **Default to
      `HAND_SIZE`** so every existing caller is byte-identical.
- [ ] Test: `roomDeals(pool, shape, 42, 3)` yields hands of 3, and the existing 3-arg call
      still yields 5 — the second half is what proves `/game/draft` is unaffected.
- [ ] Run `npx vitest run tests/unit/game-draft-room.test.ts tests/unit/game-rule-packs.test.ts`
- [ ] Commit.

### Task 4b: `DraftRoom` learns `roam`

**Files:** `src/features/game/components/DraftRoom.tsx`, `tests/unit/game-draft-room-view.test.tsx`

- [ ] Add props `handSize?: number` and `roam?: "free" | "sequential"` (defaults `5` / `"free"`).
- [ ] Pass `handSize` into `roomDeals`.
- [ ] When `roam === "sequential"`, render slots as **inert `<span>` progress markers**, not
      buttons and ⛔ **not disabled buttons** — nine dead tab stops leading nowhere is the
      exact anti-pattern the mode gate's locked rule forbids. Show "Round N of 11".
- [ ] Test: with `roam="sequential"` there are **no** slot buttons and exactly `handSize`
      card buttons; picking advances the round. With defaults, TASK-1823's existing
      free-roam tests pass **untouched**.
- [ ] Commit.

### Task 4c: `ModePlay` — club → formation → rounds

**Files:** `src/features/game/components/ModePlay.tsx`, `src/features/game/components/GamePlay.tsx`,
`tests/unit/game-mode-play.test.tsx`, both message catalogs

- [ ] `ModePlay({ pool, chooser, draft })`: club picker (client-side filter, labels from
      card data) → shape picker → hand off.
- [ ] `GamePlay` takes optional `draft?: DraftSpec`; when present its `setup` phase renders
      the shape picker + `DraftRoom` (with `handSize`/`roam`) instead of `DraftHub`.
      Everything downstream — preview, live, summary — is untouched.
- [ ] Tests: choosing a club shows only that club's cards; a round offers exactly 3; the
      room is sequential; `GamePlay` without `draft` still renders the hub (the control).
- [ ] Commit.

---

## ~~Task 4: The shared mode container~~ (superseded by 4a–4c above; kept for its i18n keys and the chooser code, which are still correct)

**Files:**
- Create: `src/features/game/components/ModePlay.tsx`
- Create: `tests/unit/game-mode-play.test.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`

- [ ] **Step 1: Add the copy**

Add to the `game` namespace of `src/i18n/messages/en.json`:

```json
"legacyTitle": "Legacy Club",
"legacyPick": "Pick a club, then draft its greatest XI across the decades.",
"legacyCards": "{count} cards",
"modeBack": "Choose a different club"
```

And `src/i18n/messages/ar.json`:

```json
"legacyTitle": "نادي الإرث",
"legacyPick": "اختر نادياً، ثم اختر أفضل تشكيلة من كل العقود.",
"legacyCards": "{count} بطاقة",
"modeBack": "اختر نادياً آخر"
```

- [ ] **Step 2: Write the failing test**

```tsx
// tests/unit/game-mode-play.test.tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { ModePlay } = await import("@/features/game/components/ModePlay");

const ROLES: PlayerRole[] = ["GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "SS", "CF"];

/** Two clubs' worth of real-shaped cards, so the chooser has something to group. */
const card = (teamId: number, club: string, role: PlayerRole, i: number): PoolCard => ({
  cardId: makeCardId(teamId * 100 + i, 2020),
  playerId: teamId * 100 + i,
  season: 2020,
  name: `${club}-${role}-${i}`,
  role,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 60 },
  club,
  teamId,
});

const pool: PoolCard[] = [
  ...ROLES.flatMap((r, i) => [card(33, "Manchester United", r, i)]),
  ...ROLES.flatMap((r, i) => [card(40, "Liverpool", r, i + 50)]),
];

describe("ModePlay", () => {
  it("⚠️ shows a club chooser before any drafting, labelled from DATA", () => {
    // The AST guard rejects hardcoded strings in features/game, and a hardcoded club name
    // would also ship English into the Arabic UI. Names come off the cards.
    renderWithIntl(<ModePlay pool={pool} chooser={{ kind: "club" }} />);
    expect(screen.getByRole("button", { name: /Manchester United/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Liverpool/ })).toBeTruthy();
    expect(screen.queryByText(/Draft Room|Auto-fill/i)).toBeNull();
  });

  it("⛔ hands the draft ONLY the chosen club's cards", async () => {
    // The whole point of the mode. If the filter leaks, Legacy is just Chaos.
    const user = userEvent.setup();
    renderWithIntl(<ModePlay pool={pool} chooser={{ kind: "club" }} />);
    await user.click(screen.getByRole("button", { name: /Liverpool/ }));
    expect(screen.queryByText(/Manchester United-/)).toBeNull();
  });

  it("skips the chooser entirely when a pack does not need one", () => {
    renderWithIntl(<ModePlay pool={pool} />);
    expect(screen.queryByRole("button", { name: /Manchester United/ })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/game-mode-play.test.tsx`
Expected: FAIL — cannot resolve `@/features/game/components/ModePlay`.

- [ ] **Step 4: Write minimal implementation**

```tsx
// src/features/game/components/ModePlay.tsx
"use client";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { ChooserSpec } from "@/features/game/domain/rule-packs";
import { localizeDigits } from "@/utils/format";
import { useLocale } from "next-intl";
import { GamePlay } from "./GamePlay";

/**
 * TASK-1810 — the shared container every rule-pack mode runs through.
 *
 * ⚠️ The chooser is a CLIENT-SIDE FILTER, not a route and not a phase. Every selectable
 * club's cards are already in the prerendered payload, so choosing one filters an array —
 * no navigation, and nothing added to the match machine, which matters because pre-match
 * is a phase and the live session lives in component memory.
 */
export function ModePlay({ pool, chooser }: { pool: PoolCard[]; chooser?: ChooserSpec }) {
  const t = useTranslations("game");
  const locale = useLocale();
  const [teamId, setTeamId] = useState<number | null>(null);

  /** Club labels come from the CARDS, never from source — the AST guard forbids literals. */
  const clubs = useMemo(() => {
    const seen = new Map<number, { name: string; count: number }>();
    for (const c of pool) {
      if (c.teamId == null) continue;
      const e = seen.get(c.teamId) ?? { name: c.club, count: 0 };
      e.count += 1;
      seen.set(c.teamId, e);
    }
    return [...seen.entries()].map(([id, v]) => ({ id, ...v }));
  }, [pool]);

  const filtered = useMemo(
    () => (teamId == null ? pool : pool.filter((c) => c.teamId === teamId)),
    [pool, teamId],
  );

  if (chooser != null && teamId == null) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("legacyTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("legacyPick")}</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {clubs.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setTeamId(c.id)}
                className="border-border hover:bg-muted flex w-full items-baseline justify-between rounded-lg border px-4 py-3 text-start"
              >
                <span className="font-bold">{c.name}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  {t("legacyCards", { count: localizeDigits(c.count, locale) })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <GamePlay pool={filtered} initialPhase="setup" />;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/game-mode-play.test.tsx && npx tsc --noEmit`
Expected: PASS, 3 tests, clean `tsc`.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/components/ModePlay.tsx tests/unit/game-mode-play.test.tsx \
        src/i18n/messages/en.json src/i18n/messages/ar.json
git commit --no-verify -m "feat(game): the shared rule-pack container + club chooser (TASK-1810)"
```

---

## Task 5: The parameterised route

**Files:**
- Create: `src/app/[locale]/game/[mode]/page.tsx`
- Modify: `tests/unit/game-routes-static.test.ts`
- Modify: `scripts/warm-e2e-routes.sh`

- [ ] **Step 1: Raise the route-guard floor**

In `tests/unit/game-routes-static.test.ts`:

```ts
  it("finds every game route", () => {
    // If this drops the glob broke and every assertion below is vacuous. Raise it when
    // a route is added: /game (the gate), /game/demo, /game/chaos, /game/draft,
    // /game/daily, /game/[mode]. ⚠️ The last is ONE FILE standing for N modes
    // (TASK-1810), so this counts files, not prerendered pages — do not "fix" it downward.
    expect(files.length).toBeGreaterThanOrEqual(6);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/game-routes-static.test.ts`
Expected: FAIL — `expected 5 to be greater than or equal to 6`.

- [ ] **Step 3: Write the route**

```tsx
// src/app/[locale]/game/[mode]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildPool } from "@/features/game/adapter/pool";
import { ModePlay } from "@/features/game/components/ModePlay";
import { packFor, routedPacks } from "@/features/game/domain/rule-packs";

// force-static like every other /game route. The M71 arc exists to keep routes CDN-served.
export const dynamic = "force-static";
export const revalidate = 86400;

type Props = { params: Promise<{ locale: string; mode: string }> };

/**
 * One page file, one prerendered page per live rule pack.
 *
 * ⚠️ This is why unlocking a mode is a DATA change: add a pack with a chooser and its page
 * appears here. `/game/draft`, `/game/chaos` and `/game/daily` are unaffected — Next
 * resolves static segments before dynamic ones.
 */
export async function generateStaticParams(): Promise<Array<{ mode: string }>> {
  return routedPacks().map((p) => ({ mode: p.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, mode } = await params;
  setRequestLocale(locale);
  if (packFor(mode) == null) return {};
  const t = await getTranslations("game");
  return { title: t("legacyTitle"), description: t("legacyPick") };
}

export default async function ModePage({ params }: Props) {
  const { locale, mode } = await params;
  setRequestLocale(locale);

  // ⛔ An unknown segment 404s. There must be NO loading.tsx above this route: TASK-M72
  // proved any such file commits a 200 before the page runs, which is the soft-404 class
  // that ticket existed to remove.
  const pack = packFor(mode);
  if (pack == null) notFound();

  const pool = await buildPool(pack.pool);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <ModePlay pool={pool} chooser={pack.chooser} />
    </main>
  );
}
```

- [ ] **Step 4: Add the route to the E2E warm-up**

In `scripts/warm-e2e-routes.sh`, after `"/game/daily"`:

```bash
  "/game/legacy"
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/game-routes-static.test.ts`
Expected: PASS, 7 tests (6 route files each asserting `force-static`).

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/game/[mode]/page.tsx" tests/unit/game-routes-static.test.ts \
        scripts/warm-e2e-routes.sh
git commit --no-verify -m "feat(game): one parameterised /game/[mode] route (TASK-1810)"
```

---

## Task 6: Unlock the tile, and fix the href guard a dynamic route breaks

**Files:**
- Modify: `src/features/game/domain/modes.ts`
- Modify: `tests/unit/game-modes.test.ts`

⚠️ **`game-modes.test.ts`'s href guard walks directories**, so it yields `/game/[mode]` and
would fail on `/game/legacy`. Patching it to ignore misses cannot stand: with a dynamic
route an href can "exist" and still 404, because the segment only resolves if a pack backs
it. The guard has to get **stronger**, not looser.

- [ ] **Step 1: Write the failing test**

Replace the href test in `tests/unit/game-modes.test.ts` and add the pack check. Extend the
imports with `import { packFor } from "@/features/game/domain/rule-packs";`

```ts
  it("points every href at a route that exists", () => {
    // ⚠️ A dynamic segment matches any single path segment, so compare shape-wise rather
    // than literally — `/game/[mode]` covers `/game/legacy`.
    const patterns = gameRoutes().map(
      (r) => new RegExp(`^${r.replace(/\[[^\]]+\]/g, "[^/]+")}$`),
    );
    for (const mode of GAME_MODES) {
      if (mode.href == null) continue;
      expect(
        patterns.some((p) => p.test(mode.href!)),
        `${mode.id} -> ${mode.href}`,
      ).toBe(true);
    }
  });

  it("⛔ every href served by the DYNAMIC route is backed by a rule pack", () => {
    // The half a shape-wise match cannot see: `/game/anything` matches `/game/[mode]`, but
    // the page calls notFound() unless a pack resolves. Without this, a mode could be
    // flipped live and 404 on click while both other guards stayed green.
    const literal = new Set(gameRoutes());
    for (const mode of GAME_MODES) {
      if (mode.href == null || literal.has(mode.href)) continue;
      const id = mode.href.split("/").pop()!;
      expect(packFor(id), `${mode.id} -> ${mode.href} has no rule pack`).not.toBeNull();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/game-modes.test.ts`
Expected: PASS at this point (no mode yet points at the dynamic route) — the new test is
vacuous until Step 3 makes `legacy` live. That is expected and is why Step 4 re-runs it.

- [ ] **Step 3: Unlock the tile**

In `src/features/game/domain/modes.ts`, change only the `legacy` entry:

```ts
  {
    id: "legacy",
    group: "draftPacks",
    emoji: "🏛️",
    nameKey: "modeLegacyName",
    descriptionKey: "modeLegacyDesc",
    href: "/game/legacy",
    // TASK-1810: the single-match format. The season format ("season-by-season") is
    // TASK-1811 — the registry's per-format status is what lets those ship separately.
    formats: { single: "live", season: "planned" },
    ticket: "TASK-1810",
  },
```

- [ ] **Step 4: Run tests to verify they pass, and that the new guard is no longer vacuous**

Run: `npx vitest run tests/unit/game-modes.test.ts tests/unit/game-mode-gate.test.tsx`
Expected: PASS. `game-mode-gate` derives its tile count from `isPlayable`, so it absorbs the
new live mode without an edit.

Then prove the new guard bites: temporarily change `href` to `"/game/nope"` and re-run.
Expected: the "backed by a rule pack" test goes **red**. Restore it.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/modes.ts tests/unit/game-modes.test.ts
git commit --no-verify -m "feat(game): Legacy Club goes live, and the href guard learns about dynamic routes (TASK-1810)"
```

---

## Task 7: Verify in a real browser, then open the PR

**Files:**
- Modify: `TASKS.md`

⚠️ A green suite is not evidence the feature works.

- [ ] **Step 1: Full gates**

Run: `npx vitest run && npx tsc --noEmit && CI=true pnpm lint`
Expected: all green. If the suite dies with `ERR_IPC_CHANNEL_CLOSED`, that is the flaky
worker crash — quieten the machine and re-run rather than investigating a failure.

- [ ] **Step 2: Serve and drive it**

```bash
wsl -d Ubuntu -- bash -lc 'source $HOME/.nvm/nvm.sh && nvm use 22 >/dev/null && cd /home/aliemad/projects/pq-1810 && setsid npx next dev -p 3119 >/tmp/dev1810.log 2>&1 < /dev/null & sleep 32; curl -sL -o /dev/null -w "/game/legacy -> %{http_code}\n" http://localhost:3119/game/legacy'
```

Expected: `200`.

- [ ] **Step 3: Confirm the four things only a browser shows**

1. `/game/legacy` lists **ten** clubs, each with a card count.
2. Picking one enters the draft with **only** that club's cards — check a card's club label.
3. The pool spans decades: the chosen club's cards include a 1990s season and a 2020s one.
4. ⛔ `/game/nonsense` returns **404**, not a 200 with an empty page. Verify the status
   code, not the rendered text — a soft 404 renders like a 404 and is the M72 bug.
5. `/ar/game/legacy` — verify by **counting Arabic codepoints**, never by grepping, since
   next-intl serialises the whole catalog into every page.

Stop the server with `pkill -f "next[ ]dev"` — ⚠️ bracket the pattern, or the `pkill`
matches its own shell and kills the command that follows it.

- [ ] **Step 4: Record progress on the ticket**

In `TASKS.md`, under `### TASK-1810`, add a progress line naming Legacy as live and the
remaining four modes as pending, in the style TASK-1807 used for A/B1/B2/C.

⛔ **The ticket stays `📋 Backlog`.** Only one of five modes ships here — the same
discipline TASK-1812 used when two of its three thirds landed.

- [ ] **Step 5: Commit and open the PR**

```bash
git add TASKS.md
git commit --no-verify -m "docs: TASK-1810 PR 1 — the rule-pack seam and Legacy Club are live"
git push -u origin feat/task-1810-rule-packs
```

Open the PR against `main`, watch all three checks, squash-merge on green. ⛔ Never merge on
a red Build check — CI is the only place `next build` runs, so it is the sole proof
`/game/[mode]` actually prerenders its params rather than falling back to dynamic.

---

## Self-review notes

- **Spec §3 the seam** → Task 1 (types, registry, layering guard).
- **Spec §3 the Chaos control** → Task 2 (the control test) + Task 3 (the delegation).
- **Spec §4 the route + its three guards** → Task 5 (route, `force-static` floor, warm-up)
  and Task 6 (the href guard, which the spec flagged and which needed strengthening).
- **Spec §5 Legacy Club** → Task 1 (`LEGACY_CLUBS`), Task 2 (`clubHistory` per-era
  sampling), Task 4 (the client-side chooser).
- **Spec §6 testing** → distributed; the browser pass and the 404 check are Task 7.
- **Spec §9 ticket status** → Task 7 Step 4 (stays Backlog).
- **Not covered, deliberately:** `Constraint` machinery (spec §3 defers it to PRs 2–3) and
  the season format (spec §8, TASK-1811).
