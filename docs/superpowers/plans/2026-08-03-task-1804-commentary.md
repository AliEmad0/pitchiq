# TASK-1804 — Commentary System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach a localizable `CommentaryRef { key, values }` to every match `MatchEvent` via a pure `commentate` pass, add the `commentary.*` ICU keys to en + ar, and a locale-aware render bridge that produces Eastern-Arabic digits — all without touching the engine or tripping the i18n guards.

**Architecture:** `domain/commentary.ts` (pure, locale-free) folds the event stream into `CommentedEvent[]` with pooled, hash-selected phrasing keys. `view/commentary-view.ts` (pure, locale-aware) adds the display-localized `{…Fmt}` digit args at render. Catalog keys interpolation-only (no plurals). The engine (TASK-1803) is untouched. Design: `docs/superpowers/specs/2026-08-03-task-1804-commentary-design.md`.

**Tech Stack:** TypeScript, next-intl v4 (`createTranslator` for the render-validity test), Vitest (`tests/unit/`), `localizeDigits` from `@/utils/format`. WSL via `wsl -d Ubuntu -- bash -lc '…'`.

## Toolchain notes (WSL / PitchIQ)

- Pin node PATH: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`.
- Binaries directly: `./node_modules/.bin/vitest run <path>`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint <paths>`. Commit `--no-verify`. Branch `feat/task-1804-commentary`.

## Constraints (from exploration)

- Catalogs: `src/i18n/messages/{en,ar}.json`; `tests/unit/i18n-catalog-parity.test.ts` requires every en key path to exist in ar. No `game`/`commentary` namespace yet.
- Eastern-Arabic digits come from `localizeDigits(n, locale)` (`src/utils/format.ts`) at render, via separate `{…Fmt}` args — ICU keeps plain `"ar"` and won't localize digits. `localizeDigits` accepts a number, returns a string (no-op for en).
- The hardcoded-string AST guard scans `.tsx` only → not triggered (this ticket adds no `.tsx`). Key strings in `.ts` are fine.
- `MatchEvent = { minute, kind, side?, playerId?, card? }`; `MatchResult = { score, events, seed }`. Scorer name is reachable via `GameTeam.players` by `playerId` + `side`.

## File Structure

**New:** `src/features/game/domain/commentary.ts`, `src/features/game/view/commentary-view.ts`, `src/features/game/view/index.ts`.
**Modify:** `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`, `src/features/game/domain/index.ts`, `TASKS.md`.
**New tests:** `tests/unit/game-commentary.test.ts`, `tests/unit/game-commentary-view.test.ts`, `tests/unit/game-commentary-catalog.test.ts`.

---

## Task 1: The commentate pass

**Files:** Create `src/features/game/domain/commentary.ts`; Test `tests/unit/game-commentary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-commentary.test.ts
import { describe, expect, it } from "vitest";
import { commentate } from "@/features/game/domain/commentary";
import type { MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";

function player(playerId: number, name: string): GamePlayer {
  return {
    cardId: `${playerId}@2020`, playerId, season: 2020, name, role: "CF", altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  };
}
const home = makeGameTeam(1, "Home", 2020, { name: "", season: 2020, slots: [] }, [player(10, "Scorer H"), player(11, "Booked H")]);
const away = makeGameTeam(2, "Away", 2020, { name: "", season: 2020, slots: [] }, [player(20, "Scorer A")]);

const result: MatchResult = {
  seed: 1,
  score: { home: 2, away: 1 },
  events: [
    { minute: 0, kind: "kickoff" },
    { minute: 12, kind: "goal", side: "home", playerId: 10 },
    { minute: 30, kind: "card", side: "home", playerId: 11, card: "yellow" },
    { minute: 44, kind: "goal", side: "away", playerId: 20 },
    { minute: 45, kind: "halftime" },
    { minute: 70, kind: "goal", side: "home", playerId: 10 },
    { minute: 82, kind: "card", side: "away", playerId: 999, card: "red" }, // 999 not on roster → anon
    { minute: 90, kind: "fulltime" },
  ],
};

describe("commentate", () => {
  const commented = commentate(result, home, away);

  it("attaches a commentary ref to every event, preserving the event fields", () => {
    expect(commented).toHaveLength(result.events.length);
    expect(commented[0]).toMatchObject({ minute: 0, kind: "kickoff" });
    for (const e of commented) expect(typeof e.commentary.key).toBe("string");
  });

  it("maps kinds to the right key families", () => {
    expect(commented[0].commentary.key).toBe("commentary.kickoff");
    expect(commented[1].commentary.key).toMatch(/^commentary\.goal\.\d$/);
    expect(commented[2].commentary.key).toMatch(/^commentary\.cardYellow\.\d$/);
    expect(commented[4].commentary.key).toBe("commentary.halftime");
    expect(commented[7].commentary.key).toBe("commentary.fulltime");
  });

  it("resolves the scorer name and folds the running score", () => {
    expect(commented[1].commentary.values).toMatchObject({ player: "Scorer H", minute: 12, homeScore: 1, awayScore: 0 });
    expect(commented[3].commentary.values).toMatchObject({ player: "Scorer A", homeScore: 1, awayScore: 1 });
    expect(commented[4].commentary.values).toMatchObject({ homeScore: 1, awayScore: 1 }); // halftime score
    expect(commented[5].commentary.values).toMatchObject({ player: "Scorer H", homeScore: 2, awayScore: 1 });
    expect(commented[7].commentary.values).toMatchObject({ homeScore: 2, awayScore: 1 }); // final
  });

  it("uses an anon key when the player is not on the roster", () => {
    expect(commented[6].commentary.key).toBe("commentary.cardAnon");
    expect(commented[6].commentary.values).toEqual({ minute: 82 });
  });

  it("is deterministic (same result → same refs)", () => {
    expect(commentate(result, home, away)).toEqual(commented);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-commentary.test.ts'`

- [ ] **Step 3: Implement**

```ts
// src/features/game/domain/commentary.ts
import type { MatchEvent, MatchResult } from "./match-types";
import type { GameTeam } from "./team";

export interface CommentaryValues {
  player?: string;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
}
export interface CommentaryRef {
  key: string;
  values: CommentaryValues;
}
export interface CommentedEvent extends MatchEvent {
  commentary: CommentaryRef;
}

const GOAL_POOL = 4;
const CARD_YELLOW_POOL = 3;
const CARD_RED_POOL = 2;

/** FNV-1a → non-negative int. Deterministic; drives phrasing variety. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function variantOf(event: MatchEvent, pool: number): number {
  return hashStr(`${event.kind}:${event.minute}:${event.playerId ?? 0}`) % pool;
}

function nameOf(event: MatchEvent, home: GameTeam, away: GameTeam): string | null {
  if (event.playerId == null || event.side == null) return null;
  const roster = event.side === "home" ? home.players : away.players;
  return roster.find((p) => p.playerId === event.playerId)?.name ?? null;
}

export function commentate(result: MatchResult, home: GameTeam, away: GameTeam): CommentedEvent[] {
  let h = 0;
  let a = 0;
  const out: CommentedEvent[] = [];

  for (const event of result.events) {
    let commentary: CommentaryRef;
    switch (event.kind) {
      case "kickoff":
        commentary = { key: "commentary.kickoff", values: {} };
        break;
      case "goal": {
        if (event.side === "home") h += 1;
        else if (event.side === "away") a += 1;
        const player = nameOf(event, home, away);
        commentary = player
          ? { key: `commentary.goal.${variantOf(event, GOAL_POOL)}`, values: { player, minute: event.minute, homeScore: h, awayScore: a } }
          : { key: "commentary.goalAnon", values: { minute: event.minute, homeScore: h, awayScore: a } };
        break;
      }
      case "card": {
        const player = nameOf(event, home, away);
        const isRed = event.card === "red";
        const family = isRed ? "cardRed" : "cardYellow";
        const pool = isRed ? CARD_RED_POOL : CARD_YELLOW_POOL;
        commentary = player
          ? { key: `commentary.${family}.${variantOf(event, pool)}`, values: { player, minute: event.minute } }
          : { key: "commentary.cardAnon", values: { minute: event.minute } };
        break;
      }
      case "halftime":
        commentary = { key: "commentary.halftime", values: { homeScore: h, awayScore: a } };
        break;
      case "fulltime":
        commentary = { key: "commentary.fulltime", values: { homeScore: h, awayScore: a } };
        break;
      default: {
        const _never: never = event.kind;
        commentary = { key: "commentary.kickoff", values: {} };
        void _never;
      }
    }
    out.push({ ...event, commentary });
  }
  return out;
}
```

- [ ] **Step 4: Run test — expect PASS (5)**
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/commentary.ts tests/unit/game-commentary.test.ts && git commit --no-verify -m "feat(game): commentate pass — CommentaryRef per event (TASK-1804)"'
```

---

## Task 2: Render bridge (locale-aware digit args)

**Files:** Create `src/features/game/view/commentary-view.ts`, `src/features/game/view/index.ts`; Test `tests/unit/game-commentary-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/game-commentary-view.test.ts
import { describe, expect, it } from "vitest";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";

const goalRef: CommentaryRef = {
  key: "commentary.goal.0",
  values: { player: "Henry", minute: 45, homeScore: 2, awayScore: 1 },
};

describe("commentaryArgs", () => {
  it("passes raw values through and adds Western digit Fmt args for en", () => {
    const args = commentaryArgs(goalRef, "en");
    expect(args.player).toBe("Henry");
    expect(args.minuteFmt).toBe("45");
    expect(args.homeScoreFmt).toBe("2");
    expect(args.awayScoreFmt).toBe("1");
  });

  it("produces Eastern-Arabic digit Fmt args for ar", () => {
    const args = commentaryArgs(goalRef, "ar");
    expect(args.minuteFmt).toBe("٤٥");
    expect(args.homeScoreFmt).toBe("٢");
    expect(args.awayScoreFmt).toBe("١");
  });

  it("omits Fmt args for values that are absent", () => {
    const args = commentaryArgs({ key: "commentary.kickoff", values: {} }, "ar");
    expect(args.minuteFmt).toBeUndefined();
    expect(args.homeScoreFmt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/features/game/view/commentary-view.ts
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { localizeDigits } from "@/utils/format";

/**
 * Render bridge: raw ref values + display-localized digit args (`{…Fmt}`).
 * A future pitch UI renders a line as `t(ref.key, commentaryArgs(ref, locale))`.
 * Keeps `domain/` locale-free; `localizeDigits` is a no-op for en, Eastern-Arabic for ar.
 */
export function commentaryArgs(ref: CommentaryRef, locale: string): Record<string, string | number> {
  const v = ref.values;
  const args: Record<string, string | number> = { ...v };
  if (v.minute != null) args.minuteFmt = localizeDigits(v.minute, locale);
  if (v.homeScore != null) args.homeScoreFmt = localizeDigits(v.homeScore, locale);
  if (v.awayScore != null) args.awayScoreFmt = localizeDigits(v.awayScore, locale);
  return args;
}
```

```ts
// src/features/game/view/index.ts
export * from "./commentary-view";
```

- [ ] **Step 4: Run test — expect PASS (3)**. If `localizeDigits` requires a string, change calls to `localizeDigits(String(v.minute), locale)` and confirm the util's signature at `src/utils/format.ts`.
- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/view/ tests/unit/game-commentary-view.test.ts && git commit --no-verify -m "feat(game): commentary render bridge — Eastern-Arabic digit args (TASK-1804)"'
```

---

## Task 3: Catalog keys (en + ar)

**Files:** Modify `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`

No test in this task — Task 4 validates the keys. Add a new top-level `"commentary"` namespace to **both** files with **identical key structure** (parity test requires it). Insert it as a new top-level entry (e.g. after the existing `"seasons"` block), fixing the trailing comma so the JSON stays valid.

- [ ] **Step 1: Add to `src/i18n/messages/en.json`**

```json
"commentary": {
  "kickoff": "🟢 Kick-off!",
  "goal": {
    "0": "⚽ {player} scores! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
    "1": "⚽ GOAL — {player} finds the net! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
    "2": "⚽ {player} buries it. {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
    "3": "⚽ What a finish from {player}! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')"
  },
  "goalAnon": "⚽ Goal! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
  "cardYellow": {
    "0": "🟨 Yellow card for {player} ({minuteFmt}')",
    "1": "🟨 {player} goes into the book ({minuteFmt}')",
    "2": "🟨 Booking — {player} ({minuteFmt}')"
  },
  "cardRed": {
    "0": "🟥 Red card! {player} is sent off ({minuteFmt}')",
    "1": "🟥 {player} sees red and walks ({minuteFmt}')"
  },
  "cardAnon": "🟨 A booking ({minuteFmt}')",
  "halftime": "⏸ Half-time: {homeScoreFmt}–{awayScoreFmt}",
  "fulltime": "🏁 Full-time: {homeScoreFmt}–{awayScoreFmt}"
}
```

- [ ] **Step 2: Add to `src/i18n/messages/ar.json`** (same keys, Arabic text — `{…Fmt}` args carry the already-localized digits so they stay as `{…Fmt}` here too)

```json
"commentary": {
  "kickoff": "🟢 انطلاق المباراة!",
  "goal": {
    "0": "⚽ {player} يسجّل! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
    "1": "⚽ هدف — {player} يهزّ الشباك! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
    "2": "⚽ {player} يودعها الشباك. {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
    "3": "⚽ يا له من هدف من {player}! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')"
  },
  "goalAnon": "⚽ هدف! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')",
  "cardYellow": {
    "0": "🟨 بطاقة صفراء لـ {player} ({minuteFmt}')",
    "1": "🟨 {player} يُسجَّل في مفكرة الحكم ({minuteFmt}')",
    "2": "🟨 إنذار — {player} ({minuteFmt}')"
  },
  "cardRed": {
    "0": "🟥 بطاقة حمراء! يُطرد {player} ({minuteFmt}')",
    "1": "🟥 {player} يرى البطاقة الحمراء ويغادر ({minuteFmt}')"
  },
  "cardAnon": "🟨 إنذار ({minuteFmt}')",
  "halftime": "⏸ الشوط الأول: {homeScoreFmt}–{awayScoreFmt}",
  "fulltime": "🏁 نهاية المباراة: {homeScoreFmt}–{awayScoreFmt}"
}
```

- [ ] **Step 3: Verify JSON validity + catalog parity**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && node -e "JSON.parse(require(\"fs\").readFileSync(\"src/i18n/messages/en.json\"));JSON.parse(require(\"fs\").readFileSync(\"src/i18n/messages/ar.json\"));console.log(\"json ok\")" && ./node_modules/.bin/vitest run tests/unit/i18n-catalog-parity.test.ts'`
Expected: `json ok` + parity test PASS.

- [ ] **Step 4: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/i18n/messages/en.json src/i18n/messages/ar.json && git commit --no-verify -m "feat(i18n): commentary.* message catalog (en + ar) (TASK-1804)"'
```

---

## Task 4: Catalog coverage + ICU render validity

**Files:** Test `tests/unit/game-commentary-catalog.test.ts`

Proves every key `commentate` can emit exists in both catalogs AND renders through next-intl without error, with Eastern-Arabic digits on `ar`.

- [ ] **Step 1: Write the test**

```ts
// tests/unit/game-commentary-catalog.test.ts
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";

// Every key commentate can emit, with a representative ref.
const REFS: CommentaryRef[] = [
  { key: "commentary.kickoff", values: {} },
  { key: "commentary.goal.0", values: { player: "P", minute: 10, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goal.1", values: { player: "P", minute: 20, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goal.2", values: { player: "P", minute: 30, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goal.3", values: { player: "P", minute: 40, homeScore: 1, awayScore: 0 } },
  { key: "commentary.goalAnon", values: { minute: 50, homeScore: 1, awayScore: 0 } },
  { key: "commentary.cardYellow.0", values: { player: "P", minute: 11 } },
  { key: "commentary.cardYellow.1", values: { player: "P", minute: 22 } },
  { key: "commentary.cardYellow.2", values: { player: "P", minute: 33 } },
  { key: "commentary.cardRed.0", values: { player: "P", minute: 44 } },
  { key: "commentary.cardRed.1", values: { player: "P", minute: 55 } },
  { key: "commentary.cardAnon", values: { minute: 66 } },
  { key: "commentary.halftime", values: { homeScore: 1, awayScore: 0 } },
  { key: "commentary.fulltime", values: { homeScore: 2, awayScore: 1 } },
];

function lookup(messages: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>((o, part) => (o as Record<string, unknown>)?.[part], messages);
}

describe("commentary catalog", () => {
  it("every emittable key exists in en and ar", () => {
    for (const { key } of REFS) {
      expect(typeof lookup(en, key), `en missing ${key}`).toBe("string");
      expect(typeof lookup(ar, key), `ar missing ${key}`).toBe("string");
    }
  });

  it("renders every message in both locales with no missing args", () => {
    for (const locale of ["en", "ar"] as const) {
      const messages = locale === "en" ? en : ar;
      const t = createTranslator({ locale, messages });
      for (const ref of REFS) {
        const text = t(ref.key, commentaryArgs(ref, locale));
        expect(text.length, `${locale} ${ref.key}`).toBeGreaterThan(0);
      }
    }
  });

  it("renders Eastern-Arabic digits on ar", () => {
    const t = createTranslator({ locale: "ar", messages: ar });
    const goal = REFS[1]; // minute 10, score 1-0
    const text = t(goal.key, commentaryArgs(goal, "ar"));
    expect(text).toMatch(/[٠-٩]/); // contains at least one Eastern-Arabic digit
    expect(text).not.toMatch(/[0-9]/); // and no Western digits
  });
});
```

- [ ] **Step 2: Run test — expect PASS (3)**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-commentary-catalog.test.ts'`
Expected: PASS. If `createTranslator` import path differs, it is exported from the `next-intl` package root (v4). If JSON import of `@/i18n/messages/*.json` needs `resolveJsonModule` (it is already on — the app imports these), no change needed.

- [ ] **Step 3: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add tests/unit/game-commentary-catalog.test.ts && git commit --no-verify -m "test(game): commentary catalog coverage + ICU render validity (TASK-1804)"'
```

---

## Task 5: Barrel + full verification

**Files:** Modify `src/features/game/domain/index.ts`

- [ ] **Step 1: Add the domain export** (insert `export * from "./commentary";` in alphabetical position, after `./card-id`)

```ts
export * from "./card-id";
export * from "./commentary";
export * from "./eligibility";
```

(Leave the rest of the barrel as-is. `view/` is imported directly by path — no game barrel change needed there.)

- [ ] **Step 2: Full game suite**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run tests/unit/game-*.test.ts'`
Expected: PASS — the 68 existing game tests + the 3 new commentary files.

- [ ] **Step 3: Typecheck + lint**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/tsc --noEmit; echo TSC=$?; ./node_modules/.bin/eslint src/features/game tests/unit/game-*.test.ts; echo ESLINT=$?'`
Expected: `TSC=0`, `ESLINT=0`. Fix import-order / `type`-import findings to house style.

- [ ] **Step 4: Full unit suite (no regression, incl. the no-hardcoded-strings + parity guards)**

Run: `wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" && ./node_modules/.bin/vitest run 2>&1 | tail -4'`
Expected: PASS — all files.

- [ ] **Step 5: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add src/features/game/domain/index.ts && git commit --no-verify -m "feat(game): export commentary from domain barrel (TASK-1804)"'
```

---

## Task 6: Update the board

**Files:** Modify `TASKS.md`

- [ ] **Step 1: Flip TASK-1804 to Done + shipped notes**

- Table row TASK-1804: `📋 Backlog` → `✅ Done`.
- TASK-1804 detail header: `📋 Backlog` → `✅ Done`.
- Append a `**Shipped notes:**` line: pure `domain/commentary.ts` (`commentate(result, home, away) → CommentedEvent[]` — folds running score, pooled phrasing via FNV-1a hash of event data, named + `*Anon` fallback keys); locale-aware `view/commentary-view.ts` (`commentaryArgs` — adds `{minuteFmt, homeScoreFmt, awayScoreFmt}` via `localizeDigits`, Eastern-Arabic on ar); `commentary.*` catalog (~13 keys, en + ar, interpolation-only, no plurals, minute as `45'`); 3 test files incl. ICU render-validity via `createTranslator`. Engine untouched (determinism intact). **Deferred:** pitch-UI render (1808), Arabic player-name resolution via `entity-names` (1808), context-aware phrasing (1814/1815). Design: `docs/superpowers/specs/2026-08-03-task-1804-commentary-design.md`.

- [ ] **Step 2: Commit**

```bash
wsl -d Ubuntu -- bash -lc 'cd ~/projects/pitchiq && git add TASKS.md && git commit --no-verify -m "docs(tasks): TASK-1804 commentary system done"'
```

---

## Definition of Done

- 3 new `game-commentary*` test files pass; 68 existing game tests still pass; full unit suite green (incl. catalog-parity + no-hardcoded-strings guards).
- `tsc --noEmit` + `eslint src/features/game` clean.
- `domain/commentary.ts` is pure/locale-free (determinism intact — engine untouched); `view/commentary-view.ts` holds the only locale-aware code.
- Every emittable `commentary.*` key exists in en + ar and renders through next-intl with Eastern-Arabic digits on ar.
- Branch `feat/task-1804-commentary` → PR → merge on green.

## Notes for the next tickets

- **TASK-1808** (pitch UI) renders the stream: `t(ref.key, commentaryArgs(ref, locale))`, and can override `values.player` with the `entity-names`-resolved Arabic name; wrap scorelines in `bidiIsolate` for RTL.
- **TASK-1805/1806** (opponent + Chaos Draft) — the first playable slice consumes `commentate` output for its match feed.
- Phrasing pools are v1 — expand / add context-aware variants under 1814/1815.
