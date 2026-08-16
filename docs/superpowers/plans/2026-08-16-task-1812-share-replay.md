# TASK-1812 Share + Replay + Summary Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A finished match becomes a URL that replays it for anyone who opens it, plus a downloadable Canvas summary card.

**Architecture:** A match is `(setup, seed, decisions[])`, so the tuple IS the match — no backend, no stored result. The URL carries 11 card ids, a formation slug, the seed, a compact token per coach decision, and a fingerprint. On arrival the receiver replays independently through the SAME code path resume uses, and always renders their own replay; the fingerprint only decides whether to warn.

**Tech Stack:** TypeScript, Next.js App Router (`force-static`), React 19, nuqs, next-intl (en + ar), Vitest, Canvas 2D.

**Spec:** [`docs/superpowers/specs/2026-08-16-task-1812-share-replay-design.md`](../specs/2026-08-16-task-1812-share-replay-design.md)

---

## Before you start

**Every node command must run through WSL** (the repo lives on the WSL filesystem; a Windows shell with a UNC cwd cannot spawn `cmd.exe`). Wrap each command shown in this plan:

```bash
wsl -d Ubuntu -- bash -c 'source $HOME/.nvm/nvm.sh && nvm use 22 > /dev/null && cd /home/aliemad/projects/pitchiq-1812 && <command>'
```

Steps below write just `pnpm test …`. Apply the wrapper yourself.

⚠️ `pnpm lint` must be prefixed `CI=true` (pnpm 11 aborts its deps check with no TTY).
⚠️ Vitest does **not** type-check. `pnpm type-check` is a separate, required step.

**Working branch:** `feat/1812-share-replay` in the worktree `/home/aliemad/projects/pitchiq-1812`, already rebased onto `main`. Never push to `main`; this ships as a PR.

**Never `git add -A`.** Add the exact files each commit step names.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/game/domain/formation.ts` | **Modify.** Gains `formationSlug`, `formationBySlug`, `formationNameFromKey` — formation identity already lives here. |
| `src/features/game/domain/decision-tokens.ts` | **Create.** The token codec. Encodes coach answers; materialises them back against live decisions. Knows nothing about URLs. |
| `src/features/game/domain/share-code.ts` | **Modify.** Pure string codec for the whole URL code. Fixes the formation-key defect, adds the token field. |
| `src/features/game/domain/summary-card.ts` | **Modify.** Rename `MatchSummary` → `SummaryCardData`; add `summaryFrom` to build it from teams + events. |
| `src/features/game/view/match-replay.ts` | **Modify.** One replay engine, an answer **source** and a drift **policy**. `replayMatch` (resume) keeps its exact signature; `replayShared` is added. |
| `src/features/game/view/share-link.ts` | **Create.** Builds a share code from live match state, and the locale-correct URL. |
| `src/features/game/components/GamePlay.tsx` | **Modify.** Reads `?m=`, enters a shared match, suppresses resume, never writes the slot. |
| `src/features/game/components/MatchSummary.tsx` | **Modify.** Hosts the share controls and the drift banner. |
| `src/features/game/components/ShareLink.tsx` | **Create.** Copy-the-link button. URL concern only. |
| `src/features/game/components/SummaryCard.tsx` | **Create.** Paints `SummaryCardData` to canvas; download button. Image concern only. |
| `src/i18n/messages/{en,ar}.json` | **Modify.** New `game.*` keys. |

---

## Task 1: The 30-concept gallery (throwaway — never merged)

The owner picks the card design before the painter is written. The card is text-only, so the gallery publishes as an Artifact and needs no dev server.

**Files:**
- Create (temporary, deleted at the end): `tests/unit/_scratch-summary-fixture.test.ts`
- Create (outside the repo): `<scratchpad>/summary-gallery.html`

- [ ] **Step 1: Dump one real finished match as fixture JSON**

Create `tests/unit/_scratch-summary-fixture.test.ts`:

```ts
import { writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { FORMATIONS } from "../../src/features/game/domain/chaos-draft";
import { chaosDraft } from "../../src/features/game/domain/chaos-draft";
import { loadChaosPool } from "../../src/features/game/adapter/chaos-pool";
import { buildSession } from "../../src/features/game/view/match-session";
import { scorersFrom } from "../../src/features/game/domain/summary-card";
import { displayName } from "../../src/features/game/domain/display-name";

describe("scratch", () => {
  it("dumps a finished match for the gallery", async () => {
    const pool = await loadChaosPool();
    const team = chaosDraft(pool, 20260816);
    const session = buildSession(pool, team.players, FORMATIONS[4]!, 20260816, {
      home: "Your XI",
      away: "The Rivals",
    });
    let step = session.stream.advance();
    const events = [...step.events];
    while (step.kind !== "done") {
      step = session.stream.answer({ kind: step.decision.kind, minute: step.decision.minute, side: step.decision.side } as never);
      events.push(...step.events);
    }
    const names = new Map(
      [...session.home.players, ...(session.home.bench ?? []), ...session.away.players, ...(session.away.bench ?? [])]
        .map((p) => [p.playerId, displayName(p.name)] as const),
    );
    writeFileSync(
      "/tmp/summary-fixture.json",
      JSON.stringify(
        {
          home: session.home.name,
          away: session.away.name,
          score: step.result.score,
          scorers: scorersFrom(events, (id) => names.get(id) ?? `#${id}`),
          formationName: FORMATIONS[4]!.name,
          seed: 20260816,
        },
        null,
        2,
      ),
    );
  });
});
```

- [ ] **Step 2: Run it and read the fixture**

Run: `pnpm test tests/unit/_scratch-summary-fixture.test.ts`
Expected: PASS, and `/tmp/summary-fixture.json` exists with a real scoreline and scorers.

- [ ] **Step 3: Build the gallery page**

Write `<scratchpad>/summary-gallery.html`: one `paint(ctx, data, concept)` function switched over 30 concept ids, thirty `<canvas>` tiles in a responsive grid, each labelled `01`–`30`, the SAME fixture data inlined into every tile. Vary layout, hierarchy, framing and type treatment only — **do not vary the data**, or the owner ends up comparing matches instead of designs. Keep the palette anchored to the shipped broadcast language (dark radial ground, cyan keylines, mono tabular numerals) so the winner drops into the app without a re-skin.

- [ ] **Step 4: Publish it and get the pick**

Publish with the Artifact tool. Ask the owner for a concept number. **Do not continue past Task 10 without it** — Task 11 paints the chosen design.

- [ ] **Step 5: Delete the scratch test**

```bash
rm tests/unit/_scratch-summary-fixture.test.ts
```

Nothing from this task is committed.

---

## Task 2: Formation slug helpers

⛔ The shipped `share-code.ts` validates the formation with `/^[a-z0-9-]{2,16}$/` but encodes `formationKey(formation)` = `` `${name}/${slots.length}` `` — e.g. `"4-3-2-1 Christmas Tree/11"`. **All 20 formations fail that regex.** The fix is to carry a slug of the NAME, resolved by matching, so `FORMATIONS`' order stays presentation-only.

**Files:**
- Modify: `src/features/game/domain/formation.ts`
- Test: `tests/unit/formation-slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/formation-slug.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FORMATIONS } from "../../src/features/game/domain/chaos-draft";
import {
  formationBySlug,
  formationKey,
  formationNameFromKey,
  formationSlug,
} from "../../src/features/game/domain/formation";

describe("formationSlug", () => {
  it("survives spaces, capitals and digits", () => {
    expect(formationSlug("4-3-2-1 Christmas Tree")).toBe("4-3-2-1-christmas-tree");
    expect(formationSlug("2-3-5 Pyramid")).toBe("2-3-5-pyramid");
  });

  // ⚠️ THE guard. Two names slugging to the same value would restore a shared match into
  // the WRONG shape — exactly the hazard formationKey's docstring exists to prevent.
  it("is unique across every shipped formation", () => {
    const slugs = FORMATIONS.map((f) => formationSlug(f.name));
    expect(new Set(slugs).size).toBe(FORMATIONS.length);
  });

  it("round-trips every shipped formation", () => {
    for (const f of FORMATIONS) {
      expect(formationBySlug(formationSlug(f.name))).toBe(f);
    }
  });

  it("returns null for an unknown slug rather than throwing", () => {
    expect(formationBySlug("4-4-2")).toBeNull();
    expect(formationBySlug("../../etc/passwd")).toBeNull();
  });

  it("recovers the name from a formation key", () => {
    const f = FORMATIONS[0]!;
    expect(formationNameFromKey(formationKey(f))).toBe(f.name);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/unit/formation-slug.test.ts`
Expected: FAIL — `formationSlug is not a function`.

- [ ] **Step 3: Implement**

Append to `src/features/game/domain/formation.ts`:

```ts
/**
 * A formation's URL-safe identity.
 *
 * ⚠️ NOT `formationKey` — that is `${name}/${slots.length}`, which carries a slash,
 * spaces and capitals and cannot go in a share code. And never an index: CLAUDE.md's rule
 * is that `FORMATIONS`' order is presentation only.
 */
export function formationSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolve a slug back to a shape. Null for anything unknown — a share code is untrusted. */
export function formationBySlug(slug: string): Formation | null {
  return FORMATIONS.find((f) => formationSlug(f.name) === slug) ?? null;
}

/** The name half of a formation key. `lastIndexOf` so a name containing "/" still works. */
export function formationNameFromKey(key: string): string {
  const i = key.lastIndexOf("/");
  return i === -1 ? key : key.slice(0, i);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/unit/formation-slug.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/formation.ts tests/unit/formation-slug.test.ts
git commit -m "feat(1812): formation slug identity for share codes"
```

---

## Task 3: Encode coach answers as tokens

The coach faces ~31 decisions per match (`SUB_WINDOW` 55'–85' raises a `sub-offer` every minute, plus responses/injuries/dismissals). A token encodes only **what was chosen** — `minute`, `side` and `kind` come back from the replay.

**Files:**
- Create: `src/features/game/domain/decision-tokens.ts`
- Test: `tests/unit/decision-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/decision-tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DecisionAnswer } from "../../src/features/game/domain/match-decisions";
import { encodeTokens } from "../../src/features/game/domain/decision-tokens";

const noop = (minute: number): DecisionAnswer => ({ kind: "sub-offer", minute, side: "home" });

describe("encodeTokens", () => {
  it("writes a single no-op as one character", () => {
    expect(encodeTokens([noop(55)])).toBe("-");
  });

  it("run-length encodes consecutive no-ops in base 36", () => {
    expect(encodeTokens([noop(55), noop(56)])).toBe("-2");
    expect(encodeTokens(Array.from({ length: 35 }, (_, i) => noop(55 + i)))).toBe("-z");
    expect(encodeTokens(Array.from({ length: 36 }, (_, i) => noop(55 + i)))).toBe("-10");
  });

  it("encodes each answer kind", () => {
    expect(encodeTokens([{ kind: "response", minute: 30, side: "home", choice: "overload" }])).toBe("o");
    expect(encodeTokens([{ kind: "response", minute: 30, side: "home", choice: "stabilize" }])).toBe("z");
    expect(encodeTokens([{ kind: "response", minute: 30, side: "home", choice: "hold" }])).toBe("h");
    expect(encodeTokens([{ kind: "sub-offer", minute: 60, side: "home", off: 36 }])).toBe("s10");
    expect(encodeTokens([{ kind: "sub-offer", minute: 60, side: "home", off: 1, on: 2 }])).toBe("s1-2");
    expect(encodeTokens([{ kind: "injury-sub", minute: 70, side: "home" }])).toBe("i");
    expect(encodeTokens([{ kind: "injury-sub", minute: 70, side: "home", on: 9 }])).toBe("i9");
    expect(encodeTokens([{ kind: "dismissal", minute: 80, side: "home" }])).toBe("d");
    expect(encodeTokens([{ kind: "dismissal", minute: 80, side: "home", off: 3, on: 4 }])).toBe("d3-4");
  });

  it("separates tokens with ~ and flushes a run before a real answer", () => {
    expect(
      encodeTokens([noop(55), noop(56), { kind: "response", minute: 57, side: "home", choice: "hold" }, noop(58)]),
    ).toBe("-2~h~-");
  });

  it("encodes an empty answer list as an empty string", () => {
    expect(encodeTokens([])).toBe("");
  });

  // ⚠️ `on` without `off` is not a substitution — simulate.ts ignores it. Making it
  // unencodable means a code can never carry an instruction the engine silently drops.
  it("REFUSES an answer the engine would silently drop", () => {
    expect(() => encodeTokens([{ kind: "sub-offer", minute: 60, side: "home", on: 5 }])).toThrow(/off/);
  });

  // ⚠️ No coach path sets `reason` today (DecisionPrompt and fallbackFor both omit it, and
  // simulate defaults to "tactical"). The token has no room for it, so if a future UI adds
  // one this throws at share time rather than shipping a link that quietly loses it.
  it("REFUSES a sub reason it cannot carry", () => {
    expect(() =>
      encodeTokens([{ kind: "sub-offer", minute: 60, side: "home", off: 1, on: 2, reason: "stamina" }]),
    ).toThrow(/reason/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/unit/decision-tokens.test.ts`
Expected: FAIL — cannot resolve `decision-tokens`.

- [ ] **Step 3: Implement the encoder**

Create `src/features/game/domain/decision-tokens.ts`:

```ts
import type { DecisionAnswer } from "./match-decisions";

/**
 * TASK-1812 — the coach's decisions as a compact, self-validating token stream.
 *
 * A token says only WHAT was chosen. `minute`, `side` and `kind` are recoverable from the
 * replay itself: for a given `(setup, seed)` the engine raises the same decisions in the
 * same order, and `createStream` surfaces only the coach's, so the nth token answers the
 * nth coach decision.
 *
 * That is not merely shorter than a verbatim `DecisionAnswer[]` (~15 characters against
 * ~210 for a typical match). It is CHECKABLE: a token whose kind disagrees with the
 * decision actually being raised proves the code is stale, tampered with, or from a
 * drifted build — and we can say so before rendering anything. A verbatim array cannot
 * make that check; it would be fed to the generator and quietly produce a different match.
 *
 * Every character used is URL-unreserved, so a share link never percent-encodes.
 */

const NOOP = "-";
const SEP = "~";

const b36 = (n: number) => Math.trunc(n).toString(36);

const RESPONSE_TOKEN = { overload: "o", stabilize: "z", hold: "h" } as const;

/**
 * Encode the coach's answers, in the order the engine asked.
 *
 * Throws only on programmer error — callers build this from their own live match, never
 * from external input. Both throws exist so a code can never carry an instruction the
 * engine would silently drop.
 */
export function encodeTokens(answers: readonly DecisionAnswer[]): string {
  const out: string[] = [];
  let run = 0;
  const flush = () => {
    if (run === 0) return;
    out.push(run === 1 ? NOOP : `${NOOP}${b36(run)}`);
    run = 0;
  };

  for (const a of answers) {
    if (a.kind === "sub-offer" || a.kind === "dismissal") {
      if (a.off == null && a.on != null) {
        throw new Error("decision-tokens: an answer with `on` and no `off` is not encodable");
      }
    }
    if (a.kind === "sub-offer" && a.reason != null) {
      throw new Error("decision-tokens: a sub `reason` cannot be carried by a share code");
    }

    if (a.kind === "sub-offer" && a.off == null) {
      run++;
      continue;
    }
    flush();

    switch (a.kind) {
      case "sub-offer":
        out.push(a.on == null ? `s${b36(a.off!)}` : `s${b36(a.off!)}-${b36(a.on)}`);
        break;
      case "response":
        out.push(RESPONSE_TOKEN[a.choice]);
        break;
      case "injury-sub":
        out.push(a.on == null ? "i" : `i${b36(a.on)}`);
        break;
      case "dismissal":
        out.push(
          a.off == null ? "d" : a.on == null ? `d${b36(a.off)}` : `d${b36(a.off)}-${b36(a.on)}`,
        );
        break;
    }
  }
  flush();
  return out.join(SEP);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/unit/decision-tokens.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/decision-tokens.ts tests/unit/decision-tokens.test.ts
git commit -m "feat(1812): encode coach decisions as a compact token stream"
```

---

## Task 4: Read tokens back against live decisions

**Files:**
- Modify: `src/features/game/domain/decision-tokens.ts`
- Test: `tests/unit/decision-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/decision-tokens.test.ts`:

```ts
import { readTokens } from "../../src/features/game/domain/decision-tokens";
import type { MatchDecision } from "../../src/features/game/domain/match-decisions";

const decision = (kind: MatchDecision["kind"], minute = 60): MatchDecision =>
  ({ kind, minute, side: "home", events: [], legalOff: [], legalOn: [] }) as unknown as MatchDecision;

describe("readTokens", () => {
  it("materialises minute and side from the decision, not the token", () => {
    const r = readTokens("-")!;
    const got = r.next(decision("sub-offer", 71));
    expect(got).toEqual({ ok: true, answer: { kind: "sub-offer", minute: 71, side: "home" } });
  });

  it("expands a run so each no-op answers one decision", () => {
    const r = readTokens("-3")!;
    for (let i = 0; i < 3; i++) expect(r.next(decision("sub-offer")).ok).toBe(true);
    expect(r.next(decision("sub-offer"))).toEqual({ ok: false, reason: "exhausted" });
  });

  it("round-trips every answer kind", () => {
    const cases: DecisionAnswer[] = [
      { kind: "response", minute: 60, side: "home", choice: "overload" },
      { kind: "sub-offer", minute: 60, side: "home", off: 1, on: 2 },
      { kind: "sub-offer", minute: 60, side: "home", off: 36 },
      { kind: "injury-sub", minute: 60, side: "home", on: 9 },
      { kind: "injury-sub", minute: 60, side: "home" },
      { kind: "dismissal", minute: 60, side: "home", off: 3, on: 4 },
      { kind: "dismissal", minute: 60, side: "home" },
    ];
    for (const a of cases) {
      const r = readTokens(encodeTokens([a]))!;
      expect(r.next(decision(a.kind))).toEqual({ ok: true, answer: a });
    }
  });

  // ⛔ The check a verbatim answers[] cannot make.
  it("reports MISMATCH when the token's kind is not the decision being raised", () => {
    const r = readTokens("o")!;
    expect(r.next(decision("sub-offer"))).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an ungrammatical stream outright", () => {
    expect(readTokens("q")).toBeNull();
    expect(readTokens("-1")).toBeNull(); // a run of 1 must be written "-"
    expect(readTokens("-0")).toBeNull();
    expect(readTokens("s")).toBeNull(); // `s` needs an off
    expect(readTokens("o5")).toBeNull(); // a response takes no argument
  });

  it("treats an empty stream as zero decisions", () => {
    expect(readTokens("")!.next(decision("sub-offer"))).toEqual({ ok: false, reason: "exhausted" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test tests/unit/decision-tokens.test.ts`
Expected: FAIL — `readTokens is not a function`.

- [ ] **Step 3: Implement the reader**

Append to `src/features/game/domain/decision-tokens.ts`:

```ts
import type { MatchDecision } from "./match-decisions";

const unb36 = (s: string): number | null => {
  if (!/^[0-9a-z]+$/.test(s)) return null;
  const n = parseInt(s, 36);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

const RESPONSE_CHOICE = { o: "overload", z: "stabilize", h: "hold" } as const;

export type NextAnswer =
  | { ok: true; answer: DecisionAnswer }
  | { ok: false; reason: "exhausted" | "mismatch" };

export interface TokenReader {
  /** Answer the decision the engine is raising now. */
  next(decision: MatchDecision): NextAnswer;
}

/** An upper bound on a run, so a hostile code cannot ask for a billion no-ops. */
const MAX_RUN = 200;

/**
 * Parse a token stream. Returns null for an ungrammatical one — this runs on a value a
 * stranger controls, so it must never throw into a render.
 */
export function readTokens(encoded: string): TokenReader | null {
  const raw = encoded === "" ? [] : encoded.split(SEP);
  const flat: string[] = [];

  for (const tok of raw) {
    if (tok === NOOP) {
      flat.push(NOOP);
      continue;
    }
    if (tok.startsWith(NOOP)) {
      const n = unb36(tok.slice(1));
      // A run of one must be written "-": two spellings of one thing is a second source
      // of truth, and the shorter one is the only one the encoder emits.
      if (n === null || n < 2 || n > MAX_RUN) return null;
      for (let i = 0; i < n; i++) flat.push(NOOP);
      continue;
    }
    if (!/^[szoihd][0-9a-z-]*$/.test(tok)) return null;
    if (materialiseShape(tok) === null) return null;
    flat.push(tok);
  }

  let i = 0;
  return {
    next(decision) {
      if (i >= flat.length) return { ok: false, reason: "exhausted" };
      const answer = materialise(flat[i++]!, decision);
      return answer === null ? { ok: false, reason: "mismatch" } : { ok: true, answer };
    },
  };
}

/** Is this token well-formed on its own, ignoring which decision it will answer? */
function materialiseShape(tok: string): true | null {
  const head = tok[0]!;
  const rest = tok.slice(1);
  const pair = (s: string, required: boolean): true | null => {
    if (s === "") return required ? null : true;
    const [a, b] = s.split("-");
    if (unb36(a ?? "") === null) return null;
    if (b !== undefined && unb36(b) === null) return null;
    return true;
  };
  if (head === "s") return pair(rest, true);
  if (head === "d") return pair(rest, false);
  if (head === "i") return rest === "" || unb36(rest) !== null ? true : null;
  if (head === "o" || head === "z" || head === "h") return rest === "" ? true : null;
  return null;
}

function materialise(tok: string, d: MatchDecision): DecisionAnswer | null {
  const base = { minute: d.minute, side: d.side };
  const head = tok[0]!;
  const rest = tok.slice(1);

  if (head === NOOP || head === "s") {
    if (d.kind !== "sub-offer") return null;
    if (head === NOOP) return { kind: "sub-offer", ...base };
    const [offRaw, onRaw] = rest.split("-");
    const off = unb36(offRaw ?? "");
    if (off === null) return null;
    if (onRaw === undefined) return { kind: "sub-offer", ...base, off };
    const on = unb36(onRaw);
    return on === null ? null : { kind: "sub-offer", ...base, off, on };
  }
  if (head === "o" || head === "z" || head === "h") {
    if (d.kind !== "response") return null;
    return { kind: "response", ...base, choice: RESPONSE_CHOICE[head] };
  }
  if (head === "i") {
    if (d.kind !== "injury-sub") return null;
    if (rest === "") return { kind: "injury-sub", ...base };
    const on = unb36(rest);
    return on === null ? null : { kind: "injury-sub", ...base, on };
  }
  if (head === "d") {
    if (d.kind !== "dismissal") return null;
    if (rest === "") return { kind: "dismissal", ...base };
    const [offRaw, onRaw] = rest.split("-");
    const off = unb36(offRaw ?? "");
    if (off === null) return null;
    if (onRaw === undefined) return { kind: "dismissal", ...base, off };
    const on = unb36(onRaw);
    return on === null ? null : { kind: "dismissal", ...base, off, on };
  }
  return null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test tests/unit/decision-tokens.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/decision-tokens.ts tests/unit/decision-tokens.test.ts
git commit -m "feat(1812): read tokens back against the decisions the engine raises"
```

---

## Task 5: Rewrite the share code around the slug and the tokens

**Files:**
- Modify: `src/features/game/domain/share-code.ts`
- Modify: `tests/unit/share-code.test.ts`

- [ ] **Step 1: Update the fixture to a REAL formation and add the failing cases**

In `tests/unit/share-code.test.ts`, replace the `match()` helper and add tests:

```ts
import { FORMATIONS } from "../../src/features/game/domain/chaos-draft";
import { formationSlug } from "../../src/features/game/domain/formation";

const match = (over: Partial<ShareableMatch> = {}): ShareableMatch => ({
  cardIds: squad(),
  // ⛔ A REAL formation. The previous fixture used "4-4-2", which no formation produces —
  // every shipped name has a qualifier ("4-4-2 Flat") and formationKey adds "/11". That
  // fixture is why KEY_RE rejecting all 20 shapes went unnoticed.
  formationSlug: formationSlug(FORMATIONS[4]!.name),
  seed: 123456789,
  tokens: "-2~h~-",
  fingerprint: 0xdeadbeef,
  ...over,
});

describe("every shipped formation survives a round trip", () => {
  it("encodes and decodes all 20", () => {
    for (const f of FORMATIONS) {
      const m = match({ formationSlug: formationSlug(f.name) });
      expect(decodeMatch(encodeMatch(m))).toEqual(m);
    }
  });
});

describe("the token field is validated, not trusted", () => {
  it("rejects an ungrammatical token stream", () => {
    const code = encodeMatch(match()).replace(".-2~h~-.", ".q~q.");
    expect(decodeMatch(code)).toBeNull();
  });

  it("accepts an empty token stream (a match with no coach decisions)", () => {
    expect(decodeMatch(encodeMatch(match({ tokens: "" })))?.tokens).toBe("");
  });
});
```

Delete any existing test that asserts a `formationKey` field.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/share-code.test.ts`
Expected: FAIL — `formationSlug` is not a property of `ShareableMatch`.

- [ ] **Step 3: Implement**

In `src/features/game/domain/share-code.ts`:

Replace the `ShareableMatch` type:

```ts
/** Everything needed to reproduce a match, as it travels in a URL. */
export type ShareableMatch = {
  cardIds: PlayerSeasonId[];
  /**
   * ⛔ A slug of the formation NAME — never `formationKey` (it is `${name}/${slots.length}`,
   * so it carries a slash, spaces and capitals) and never an index into `FORMATIONS`.
   */
  formationSlug: string;
  seed: number;
  /** The coach's decisions. See `decision-tokens.ts`. Empty means he took none. */
  tokens: string;
  /** The sender's event fingerprint, for drift detection only. */
  fingerprint: number;
};
```

Replace `KEY_RE` and add the token import:

```ts
import { readTokens } from "./decision-tokens";

/** Slugs are lowercase, digits and dashes. "4-3-2-1-christmas-tree" is 22 characters. */
const SLUG_RE = /^[a-z0-9-]{2,32}$/;
```

In `encodeMatch`, replace the formation guard and add the token field:

```ts
  if (!SLUG_RE.test(match.formationSlug)) {
    throw new Error(`share-code: invalid formation slug ${match.formationSlug}`);
  }
  ...
  return [
    SHARE_VERSION,
    b36(match.seed),
    match.formationSlug,
    cards,
    match.tokens,
    b36(match.fingerprint >>> 0),
  ].join(".");
```

In `decodeMatch`, take six fields and validate the tokens:

```ts
  const parts = code.split(".");
  if (parts.length !== 6) return null;

  const [version, seedRaw, formationSlug, cardsRaw, tokens, fpRaw] = parts;
  if (version !== SHARE_VERSION) return null;
  if (!SLUG_RE.test(formationSlug)) return null;
  // The grammar is checked here so a malformed stream fails as a bad CODE, before any
  // replay is attempted. Consistent with rule 1: a code is untrusted input.
  if (readTokens(tokens) === null) return null;
```

and return `{ cardIds, formationSlug, seed, tokens, fingerprint }`.

Update the module docstring's format line to
`` `v1.<seed36>.<formationSlug>.<cards>.<tokens>.<fingerprint36>` `` and note that the
payload carries the coach's decisions because a match is `(setup, seed, decisions[])`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/unit/share-code.test.ts`
Expected: PASS, all tests including the 20-formation round trip.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/share-code.ts tests/unit/share-code.test.ts
git commit -m "fix(1812): share codes carry a formation slug and the coach's decisions

KEY_RE rejected all 20 shipped formations — the old fixture used a key no
formation produces. The code also carried no decisions, so it could not
reproduce any match the coach intervened in."
```

---

## Task 6: One replay engine, an answer source and a drift policy

`storage/match-slot.ts` states that resume and share are deliberately one code path. Make that literally true.

**Files:**
- Modify: `src/features/game/view/match-replay.ts`
- Test: `tests/unit/match-replay-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/match-replay-source.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FORMATIONS } from "../../src/features/game/domain/chaos-draft";
import { formationKey } from "../../src/features/game/domain/formation";
import { hashEvents } from "../../src/features/game/domain/hash";
import { replayMatch, replayWith, arraySource } from "../../src/features/game/view/match-replay";
import { poolFixture } from "./_helpers/game-pool";

const NAMES = { home: "Your XI", away: "The Rivals" };

describe("replayWith", () => {
  it("reproduces a match and its fingerprint from an array source", () => {
    const pool = poolFixture();
    const setup = {
      cardIds: pool.slice(0, 11).map((c) => c.cardId),
      formationKey: formationKey(FORMATIONS[4]!),
      seed: 4242,
    };
    const first = replayWith(pool, setup, arraySource([]), NAMES, { onDrift: "keep" });
    expect(first).not.toBeNull();
    const again = replayWith(pool, setup, arraySource([]), NAMES, { onDrift: "keep" });
    expect(hashEvents(again!.events)).toBe(hashEvents(first!.events));
  });

  it("DISCARDS on drift when told to, and KEEPS when told to", () => {
    const pool = poolFixture();
    const setup = {
      cardIds: pool.slice(0, 11).map((c) => c.cardId),
      formationKey: formationKey(FORMATIONS[4]!),
      seed: 4242,
    };
    const wrong = 0x1234;
    expect(
      replayWith(pool, setup, arraySource([]), NAMES, { onDrift: "discard", expectedFingerprint: wrong }),
    ).toBeNull();

    const kept = replayWith(pool, setup, arraySource([]), NAMES, {
      onDrift: "keep",
      expectedFingerprint: wrong,
    });
    expect(kept).not.toBeNull();
    expect(kept!.drifted).toBe(true);
  });
});

describe("replayMatch (resume) is unchanged", () => {
  it("still returns null for a record whose fingerprint does not match", () => {
    const pool = poolFixture();
    const record = {
      cardIds: pool.slice(0, 11).map((c) => c.cardId),
      formationKey: formationKey(FORMATIONS[4]!),
      seed: 4242,
      answers: [],
      fingerprint: 0xbad,
      eventCount: 999,
    };
    expect(replayMatch(pool, record, NAMES)).toBeNull();
  });
});
```

⚠️ If `tests/unit/_helpers/game-pool.ts` does not exist, create it by lifting the pool
fixture the existing `tests/unit/match-replay.test.ts` builds — do not invent a new one, or
the two suites will drift.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/match-replay-source.test.ts`
Expected: FAIL — `replayWith` is not exported.

- [ ] **Step 3: Refactor `match-replay.ts`**

Add above `replayMatch`:

```ts
import type { NextAnswer, TokenReader } from "@/features/game/domain/decision-tokens";

/** Where a replay's answers come from. The ONLY difference between resume and share. */
export interface AnswerSource {
  next(decision: MatchDecision): NextAnswer;
}

/** Resume: a fixed list, applied in order, stopping when it runs out. */
export function arraySource(answers: readonly DecisionAnswer[]): AnswerSource {
  let i = 0;
  return {
    next: () =>
      i < answers.length
        ? { ok: true, answer: answers[i++]! }
        : { ok: false, reason: "exhausted" },
  };
}

/** Share: a token stream, materialised against each decision as it is raised. */
export function tokenSource(reader: TokenReader): AnswerSource {
  return reader;
}

export interface ReplaySetup {
  cardIds: readonly PlayerSeasonId[];
  formationKey: string;
  seed: number;
}

export interface ReplayOptions {
  /**
   * ⚠️ The asymmetry the fingerprint exists for. Resume DISCARDS — a stale save is not the
   * coach's problem. Share KEEPS and warns — the sender's version is unreachable, so
   * rendering our own replay is the only honest option.
   */
  onDrift: "discard" | "keep";
  expectedFingerprint?: number;
  /** Resume only. A share code carries none — see the spec. */
  expectedEventCount?: number;
}

export interface ReplayedMatch {
  session: MatchSession;
  events: MatchEvent[];
  answers: DecisionAnswer[];
  pending: MatchDecision | null;
  result: MatchResult | null;
  /** Our replay differs from the fingerprint we were handed. `onDrift: "keep"` only. */
  drifted: boolean;
}

export function replayWith(
  pool: PoolCard[],
  setup: ReplaySetup,
  source: AnswerSource,
  names: SessionNames,
  options: ReplayOptions,
): ReplayedMatch | null {
  const byId = new Map(pool.map((c) => [c.cardId, c]));
  const players: PoolCard[] = [];
  for (const id of setup.cardIds) {
    const card = byId.get(id);
    if (card == null) return null;
    players.push(card);
  }

  const formation = FORMATIONS.find((f) => formationKey(f) === setup.formationKey);
  if (formation == null) return null;
  if (formation.slots.length !== players.length) return null;

  const session = buildSession(pool, players, formation, setup.seed, names);
  const events: MatchEvent[] = [];
  const answers: DecisionAnswer[] = [];
  let pending: MatchDecision | null = null;
  let result: MatchResult | null = null;

  let step = session.stream.advance();
  events.push(...step.events);
  while (step.kind !== "done") {
    const next = source.next(step.decision);
    // A token that does not match the decision being raised proves the code is stale or
    // tampered with. Stopping is not an option — that would render a truncated match as
    // if it were whole.
    if (!next.ok && next.reason === "mismatch") return null;
    if (!next.ok) break;
    answers.push(next.answer);
    step = session.stream.answer(next.answer);
    events.push(...step.events);
  }
  if (step.kind === "done") result = step.result;
  else pending = step.decision;

  if (options.expectedEventCount != null && events.length !== options.expectedEventCount) {
    if (options.onDrift === "discard") return null;
  }
  const drifted =
    options.expectedFingerprint != null && hashEvents(events) !== options.expectedFingerprint;
  if (drifted && options.onDrift === "discard") return null;

  return { session, events, answers, pending, result, drifted };
}
```

Then reimplement `replayMatch` over it, keeping its exported signature and `RestoredMatch`
shape byte-identical so every B2 caller is untouched:

```ts
export function replayMatch(
  pool: PoolCard[],
  record: SavedMatch,
  names: SessionNames,
): RestoredMatch | null {
  const replayed = replayWith(
    pool,
    { cardIds: record.cardIds, formationKey: record.formationKey, seed: record.seed },
    arraySource(record.answers),
    names,
    {
      onDrift: "discard",
      expectedFingerprint: record.fingerprint,
      expectedEventCount: record.eventCount,
    },
  );
  if (replayed == null) return null;
  return {
    session: replayed.session,
    events: replayed.events,
    answers: record.answers,
    pending: replayed.pending,
    result: replayed.result,
    record,
  };
}
```

- [ ] **Step 4: Run the whole replay + storage suite**

Run: `pnpm test tests/unit/match-replay-source.test.ts tests/unit/match-replay.test.ts`
Expected: PASS. ⚠️ The pre-existing `match-replay` tests must pass **unmodified** — if one
needs editing, the refactor changed resume's behaviour and is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/view/match-replay.ts tests/unit/match-replay-source.test.ts tests/unit/_helpers/game-pool.ts
git commit -m "refactor(1812): one replay engine with an answer source and a drift policy"
```

---

## Task 7: Replay a shared code

**Files:**
- Create: `src/features/game/view/share-link.ts`
- Test: `tests/unit/share-link.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/share-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FORMATIONS } from "../../src/features/game/domain/chaos-draft";
import { formationKey } from "../../src/features/game/domain/formation";
import { hashEvents } from "../../src/features/game/domain/hash";
import { decodeMatch } from "../../src/features/game/domain/share-code";
import { arraySource, replayWith } from "../../src/features/game/view/match-replay";
import { buildShareCode, replayShared, shareUrl } from "../../src/features/game/view/share-link";
import { poolFixture } from "./_helpers/game-pool";

const NAMES = { home: "Your XI", away: "The Rivals" };

describe("a shared code replays to the sender's match", () => {
  it("round-trips a real match end to end", () => {
    const pool = poolFixture();
    const cardIds = pool.slice(0, 11).map((c) => c.cardId);
    const key = formationKey(FORMATIONS[4]!);

    // Play it once as the "sender", straight through the shared replay engine.
    const sent = replayWith(pool, { cardIds, formationKey: key, seed: 777 }, arraySource([]), NAMES, {
      onDrift: "keep",
    });
    expect(sent).not.toBeNull();

    const code = buildShareCode({
      cardIds,
      formationKey: key,
      seed: 777,
      answers: sent!.answers,
      fingerprint: hashEvents(sent!.events),
    });

    const received = replayShared(pool, decodeOrThrow(code), NAMES);
    expect(received).not.toBeNull();
    expect(received!.drifted).toBe(false);
    expect(hashEvents(received!.events)).toBe(hashEvents(sent!.events));
  });
});

describe("shareUrl", () => {
  it("points at the canonical draft route, per locale", () => {
    expect(shareUrl("v1.abc", "en")).toBe("/game/draft?m=v1.abc");
    expect(shareUrl("v1.abc", "ar")).toBe("/ar/game/draft?m=v1.abc");
  });
});
```

Add a local `decodeOrThrow` helper wrapping `decodeMatch` and throwing on null.

⚠️ Simplify the "sender" leg if the extra `formationKey` override reads awkwardly: playing
a match with `tokens: ""` produces the coach's default-free answers, which is all this test
needs. What must be asserted is that **encode → decode → replay reproduces the sender's
fingerprint**.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/share-link.test.ts`
Expected: FAIL — cannot resolve `share-link`.

- [ ] **Step 3: Implement**

Create `src/features/game/view/share-link.ts`:

```ts
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { encodeTokens, readTokens } from "@/features/game/domain/decision-tokens";
import { formationBySlug, formationKey, formationNameFromKey, formationSlug } from "@/features/game/domain/formation";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { encodeMatch, type ShareableMatch } from "@/features/game/domain/share-code";
import type { SessionNames } from "./match-session";
import { replayWith, tokenSource, type ReplayedMatch } from "./match-replay";

/** Build the code for a match the coach has just finished. */
export function buildShareCode(args: {
  cardIds: readonly PlayerSeasonId[];
  /** The stored key; the slug is derived from its name half. */
  formationKey: string;
  seed: number;
  answers: readonly DecisionAnswer[];
  fingerprint: number;
}): string {
  return encodeMatch({
    cardIds: [...args.cardIds] as PlayerSeasonId[],
    formationSlug: formationSlug(formationNameFromKey(args.formationKey)),
    seed: args.seed,
    tokens: encodeTokens(args.answers),
    fingerprint: args.fingerprint,
  });
}

/**
 * Replay a decoded code.
 *
 * ⚠️ Returns the RECEIVER's replay, always. `drifted` says the sender saw something else;
 * it never means "show the sender's version", which is unreachable by construction.
 */
export function replayShared(
  pool: PoolCard[],
  shared: ShareableMatch,
  names: SessionNames,
): ReplayedMatch | null {
  const formation = formationBySlug(shared.formationSlug);
  if (formation == null) return null;
  const reader = readTokens(shared.tokens);
  if (reader == null) return null;

  return replayWith(
    pool,
    { cardIds: shared.cardIds, formationKey: formationKey(formation), seed: shared.seed },
    tokenSource(reader),
    names,
    { onDrift: "keep", expectedFingerprint: shared.fingerprint },
  );
}

/** The canonical share URL. `/game/play` still 301s here and forwards `?m=`. */
export function shareUrl(code: string, locale: string): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  return `${prefix}/game/draft?m=${code}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/unit/share-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/view/share-link.ts tests/unit/share-link.test.ts
git commit -m "feat(1812): build and replay a shared match code"
```

---

## Task 8: Build the summary card's data

**Files:**
- Modify: `src/features/game/domain/summary-card.ts`
- Modify: `tests/unit/summary-card.test.ts`

- [ ] **Step 1: Rename the type and write the failing test**

In `tests/unit/summary-card.test.ts`, change the import `type MatchSummary` →
`type SummaryCardData` and every use, then append:

```ts
import { summaryFrom } from "../../src/features/game/domain/summary-card";
import type { GameTeam } from "../../src/features/game/domain/team";

const team = (name: string, ids: number[]): GameTeam =>
  ({
    teamId: -1,
    name,
    season: 0,
    formation: { name: "4-4-2 Flat", season: 0, slots: [] },
    players: ids.map((playerId) => ({ playerId, name: `Player ${playerId}` })),
  }) as unknown as GameTeam;

describe("summaryFrom", () => {
  it("names scorers from BOTH squads and their benches", () => {
    const out = summaryFrom({
      home: team("Your XI", [1]),
      away: team("The Rivals", [2]),
      events: [
        { minute: 10, kind: "goal", side: "home", playerId: 1, source: "open" },
        { minute: 20, kind: "goal", side: "away", playerId: 2, source: "penalty" },
      ] as never,
      score: { home: 1, away: 1 },
      formationName: "4-4-2 Flat",
      seed: 99,
      code: "v1.xyz",
    });
    expect(out.scorers.map((s) => s.name)).toEqual(["Player 1", "Player 2"]);
    expect(out.home).toBe("Your XI");
    expect(out.code).toBe("v1.xyz");
  });

  it("shortens a long name the way the rest of the app does", () => {
    const out = summaryFrom({
      home: team("Your XI", [1]),
      away: team("The Rivals", []),
      events: [{ minute: 10, kind: "goal", side: "home", playerId: 1, source: "open" }] as never,
      score: { home: 1, away: 0 },
      formationName: "4-4-2 Flat",
      seed: 1,
      code: "v1.x",
    });
    // `displayName` collapses "Player 1" to itself, but the call must go through it so a
    // three-part name renders as a surname here exactly as it does on a card.
    expect(out.scorers[0]!.name).toBe("Player 1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/summary-card.test.ts`
Expected: FAIL — `summaryFrom` is not exported.

- [ ] **Step 3: Implement**

In `src/features/game/domain/summary-card.ts`, rename `export type MatchSummary` →
`export type SummaryCardData` (and the `summaryFilename` parameter type), replacing
`formationKey: string` with `formationName: string`. Then append:

```ts
import { displayName } from "./display-name";
import type { GameTeam } from "./team";

/**
 * Assemble what the card says from a finished match.
 *
 * ⛔ Delegates to `scorersFrom`, which filters `disallowedAt != null`. A chalked-off goal
 * stays in the event stream on purpose — the scoreboard counts it until the review lands —
 * so a FINAL summary that skipped that filter would print a scorer for a goal that never
 * stood.
 */
export function summaryFrom(args: {
  home: GameTeam;
  away: GameTeam;
  events: readonly MatchEvent[];
  score: { home: number; away: number };
  formationName: string;
  seed: number;
  code: string;
}): SummaryCardData {
  const names = new Map(
    [
      ...args.home.players,
      ...(args.home.bench ?? []),
      ...args.away.players,
      ...(args.away.bench ?? []),
    ].map((p) => [p.playerId, displayName(p.name)] as const),
  );
  return {
    home: args.home.name,
    away: args.away.name,
    score: args.score,
    scorers: scorersFrom(args.events, (id) => names.get(id) ?? `#${id}`),
    formationName: args.formationName,
    seed: args.seed,
    code: args.code,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/unit/summary-card.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/summary-card.ts tests/unit/summary-card.test.ts
git commit -m "feat(1812): build summary-card data from a finished match"
```

---

## Task 9: Enter a shared match on arrival

**Files:**
- Modify: `src/features/game/components/GamePlay.tsx`
- Test: `tests/unit/game-play-shared.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/game-play-shared.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GamePlay } from "../../src/features/game/components/GamePlay";
import * as slot from "../../src/features/game/storage/match-slot";
import { poolFixture } from "./_helpers/game-pool";
import { renderWithProviders, shareCodeFor } from "./_helpers/game-play-harness";

describe("arriving with ?m=", () => {
  it("enters the shared match without touching the visitor's own saved slot", async () => {
    const save = vi.spyOn(slot, "saveMatch");
    const pool = poolFixture();
    renderWithProviders(<GamePlay pool={pool} initialPhase="setup" />, {
      search: `?m=${shareCodeFor(pool)}`,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // ⚠️ Asserted by reading the slot, not by inspecting the dialog: the rule is that a
    // shared match is never WRITTEN, and only the write proves it.
    expect(save).not.toHaveBeenCalled();
  });

  it("falls back to the ordinary hub when the code is malformed", async () => {
    const pool = poolFixture();
    renderWithProviders(<GamePlay pool={pool} initialPhase="setup" />, { search: "?m=not-a-code" });
    // The draft hub, not an error screen.
    await waitFor(() => expect(screen.getByTestId("draft-hub")).toBeInTheDocument());
  });
});
```

⚠️ Reuse the provider harness the existing `GamePlay` / `DraftHub` component tests already
use (next-intl provider + `NuqsAdapter`). If no `_helpers/game-play-harness` exists, lift it
from the existing `tests/unit/game-play*.test.tsx` rather than writing a second one. Add
`data-testid="draft-hub"` to `DraftHub`'s root if it has no stable handle.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/game-play-shared.test.tsx`
Expected: FAIL — `?m=` is ignored; the resume dialog logic runs.

- [ ] **Step 3: Implement in `GamePlay.tsx`**

Add imports:

```ts
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { decodeMatch } from "@/features/game/domain/share-code";
import { replayShared } from "@/features/game/view/share-link";
```

Add state and the `m` param beside the existing `phase` param:

```ts
  /**
   * A shared match, read from the URL.
   *
   * ⚠️ READ ONCE on mount. The phase machine stays the single driver of phase — this only
   * chooses which match we enter, never where we are in it.
   */
  const [shareCode, setShareCode] = useQueryState(
    "m",
    parseAsString.withOptions({ history: "replace", shallow: true }),
  );
  /** Watching someone else's match. Suppresses persistence and the resume offer. */
  const [shared, setShared] = useState(false);
  const [drifted, setDrifted] = useState(false);
```

Add the arrival effect **above** the existing restore effect:

```ts
  useEffect(() => {
    if (shareCode == null || shareCode === "") return;
    const decoded = decodeMatch(shareCode);
    if (decoded == null) {
      // ⚠️ A bad code is not an error screen. A stranger following a mangled link should
      // land on something that works.
      void setShareCode(null);
      return;
    }
    const replayed = replayShared(pool, decoded, { home: t("yourXi"), away: t("rivals") });
    if (replayed == null) {
      void setShareCode(null);
      return;
    }
    streamRef.current = replayed.session.stream;
    setMatch({
      home: replayed.session.home,
      away: replayed.session.away,
      seed: replayed.session.seed,
    });
    setEvents(replayed.events);
    setAnswers(replayed.answers);
    setResult(replayed.result);
    setPending(null);
    setSquad({ cardIds: decoded.cardIds, formationKey: formationKey(replayed.session.home.formation) });
    setShared(true);
    setDrifted(replayed.drifted);
    setOffer(null);
    dispatch({ type: "resume", seed: replayed.session.seed });
    // Mount only, deliberately — see the restore effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Guard the existing restore effect so a share link outranks a saved match:

```ts
    void (async () => {
      // ⚠️ A share link outranks a saved match. Offering Resume on top of someone else's
      // match would put two matches on one screen.
      if (shareCode != null && shareCode !== "") return;
      const record = await loadMatch();
```

Guard the persist effect:

```ts
    // ⚠️ Never persist a shared match. Watching someone else's must not overwrite your own.
    if (shared) return;
    if (state.phase !== "live" || match == null || squad == null || result != null) return;
```

Clear `?m=` when starting a fresh match, in the `MatchSummary` `onNewMatch` handler:

```ts
        onNewMatch={() => {
          void clearMatch();
          void setShareCode(null);
          setShared(false);
          setDrifted(false);
          dispatch({ type: "newMatch" });
        }}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test tests/unit/game-play-shared.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/GamePlay.tsx tests/unit/game-play-shared.test.tsx tests/unit/_helpers/game-play-harness.tsx
git commit -m "feat(1812): enter a shared match from ?m= without touching the visitor's slot"
```

---

## Task 10: Share controls and the drift banner on the summary

**Files:**
- Create: `src/features/game/components/ShareLink.tsx`
- Modify: `src/features/game/components/MatchSummary.tsx`
- Modify: `src/features/game/components/GamePlay.tsx`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Test: `tests/unit/share-link-component.test.tsx`

- [ ] **Step 1: Add the message keys**

In `src/i18n/messages/en.json` under `game`:

```json
"shareTitle": "Share this match",
"shareCopy": "Copy link",
"shareCopied": "Link copied",
"shareDownload": "Download card",
"shareDrift": "This match was shared from a different build, so what you just watched may differ from what the sender saw.",
"shareWatching": "You are watching a shared match."
```

In `src/i18n/messages/ar.json` under `game`, the Arabic equivalents:

```json
"shareTitle": "شارك هذه المباراة",
"shareCopy": "نسخ الرابط",
"shareCopied": "تم نسخ الرابط",
"shareDownload": "تنزيل البطاقة",
"shareDrift": "تمت مشاركة هذه المباراة من إصدار مختلف، لذا قد يختلف ما شاهدته عمّا رآه المُرسِل.",
"shareWatching": "أنت تشاهد مباراة مُشارَكة."
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/share-link-component.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShareLink } from "../../src/features/game/components/ShareLink";
import { withIntl } from "./_helpers/game-play-harness";

describe("ShareLink", () => {
  it("copies the absolute URL and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(withIntl(<ShareLink code="v1.abc" locale="en" />));
    await userEvent.click(screen.getByRole("button", { name: /copy link/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/game/draft?m=v1.abc"));
    expect(await screen.findByText(/link copied/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test tests/unit/share-link-component.test.tsx`
Expected: FAIL — cannot resolve `ShareLink`.

- [ ] **Step 4: Implement `ShareLink.tsx`**

```tsx
"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { shareUrl } from "@/features/game/view/share-link";

/**
 * Copy the match's link.
 *
 * The URL is absolutised in the browser rather than configured, so a link copied from a
 * preview deployment points at that deployment and not at production.
 */
export function ShareLink({ code, locale }: { code: string; locale: string }) {
  const t = useTranslations("game");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = new URL(shareUrl(code, locale), window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => void copy()}
        className="bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-bold"
      >
        {t("shareCopy")}
      </button>
      <span aria-live="polite" className="text-muted-foreground text-xs">
        {copied ? t("shareCopied") : null}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Wire it into `MatchSummary`**

Add to `Props`:

```ts
  /** The share code for this match, or null while one cannot be built. */
  shareCode: string | null;
  locale: string;
  /** This match arrived from someone else's link. */
  shared?: boolean;
  /** Our replay differs from the sender's fingerprint. */
  drifted?: boolean;
```

Render above the decisions list:

```tsx
      {shared ? (
        <p className="text-muted-foreground mb-2 text-sm">{t("shareWatching")}</p>
      ) : null}
      {drifted ? (
        <p
          role="status"
          className="mb-4 rounded-md bg-amber-500/10 p-3 text-sm text-amber-300 ring-1 ring-amber-400/30"
        >
          {t("shareDrift")}
        </p>
      ) : null}
```

and in the footer row, beside the seed:

```tsx
        {shareCode != null ? <ShareLink code={shareCode} locale={locale} /> : null}
```

- [ ] **Step 6: Pass the props from `GamePlay`**

Add the imports `GamePlay` does not yet have:

```ts
import { useLocale, useTranslations } from "next-intl";
import { formationNameFromKey } from "@/features/game/domain/formation";
import { summaryFrom } from "@/features/game/domain/summary-card";
import { buildShareCode } from "@/features/game/view/share-link";
```

(`hashEvents` and `formationKey` are already imported.) Then, in the `summary` branch,
build the code from live state:

```tsx
  if (state.phase === "summary" && result != null) {
    const code =
      squad == null
        ? null
        : buildShareCode({
            cardIds: squad.cardIds,
            formationKey: squad.formationKey,
            seed: match.seed,
            answers,
            fingerprint: hashEvents(events),
          });
    return (
      <MatchSummary
        homeName={match.home.name}
        awayName={match.away.name}
        score={result.score}
        decisions={answers}
        seed={match.seed}
        shareCode={code}
        locale={locale}
        shared={shared}
        drifted={drifted}
        onNewMatch={...}
      />
    );
  }
```

Get `locale` from `useLocale()` (next-intl) at the top of `GamePlay`.

- [ ] **Step 7: Run the tests**

Run: `pnpm test tests/unit/share-link-component.test.tsx tests/unit/game-play-shared.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/game/components/ShareLink.tsx src/features/game/components/MatchSummary.tsx src/features/game/components/GamePlay.tsx src/i18n/messages/en.json src/i18n/messages/ar.json tests/unit/share-link-component.test.tsx
git commit -m "feat(1812): share link and drift banner on the full-time screen"
```

---

## Task 11: Paint and download the summary card

Uses the concept the owner picked in Task 1. **Do not start this task without that number.**

**Files:**
- Create: `src/features/game/components/SummaryCard.tsx`
- Modify: `src/features/game/components/MatchSummary.tsx`
- Test: `tests/unit/summary-card-component.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/summary-card-component.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryCard } from "../../src/features/game/components/SummaryCard";
import type { SummaryCardData } from "../../src/features/game/domain/summary-card";
import { withIntl } from "./_helpers/game-play-harness";

const data: SummaryCardData = {
  home: "Your XI",
  away: "The Rivals",
  score: { home: 2, away: 1 },
  scorers: [
    { minute: 12, name: "Henry", side: "home", own: false, penalty: false },
    { minute: 70, name: "Carragher", side: "home", own: true, penalty: false },
  ],
  formationName: "4-4-2 Flat",
  seed: 4242,
  code: "v1.abc",
};

describe("SummaryCard", () => {
  // ⚠️ jsdom has no 2D context, so getContext returns null. The component must render its
  // controls anyway rather than throwing — the download simply cannot fire.
  it("renders without a 2D context", () => {
    render(withIntl(<SummaryCard data={data} />));
    expect(screen.getByRole("button", { name: /download card/i })).toBeInTheDocument();
  });

  it("labels the canvas for screen readers with the scoreline", () => {
    render(withIntl(<SummaryCard data={data} />));
    expect(screen.getByLabelText(/Your XI 2\D+1 The Rivals/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test tests/unit/summary-card-component.test.tsx`
Expected: FAIL — cannot resolve `SummaryCard`.

- [ ] **Step 3: Implement**

Create `src/features/game/components/SummaryCard.tsx`. Structure:

```tsx
"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { scorerLine, summaryFilename, type SummaryCardData } from "@/features/game/domain/summary-card";

const W = 1200;
const H = 630;

/**
 * The shareable card.
 *
 * The component only PAINTS — every decision about what the card says lives in
 * `domain/summary-card.ts`, because jsdom has no 2D context and anything computed inside a
 * paint function is untestable by construction.
 */
export function SummaryCard({ data }: { data: SummaryCardData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t = useTranslations("game");

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    // jsdom, and any browser that refuses a context. Controls still render.
    if (canvas == null || ctx == null) return;
    let cancelled = false;
    // ⚠️ Canvas does not repaint when a webfont arrives, so painting before the font
    // loads bakes a fallback face into the downloaded image.
    void document.fonts.ready.then(() => {
      if (!cancelled) paint(ctx, data);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const download = () => {
    ref.current?.toBlob((blob) => {
      if (blob == null) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = summaryFilename(data);
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div className="my-6">
      <canvas
        ref={ref}
        width={W}
        height={H}
        role="img"
        aria-label={`${data.home} ${data.score.home}–${data.score.away} ${data.away}`}
        className="w-full max-w-full rounded-2xl ring-1 ring-cyan-400/20"
      />
      <button
        type="button"
        onClick={download}
        className="bg-primary text-primary-foreground mt-3 rounded-md px-5 py-2 text-sm font-bold"
      >
        {t("shareDownload")}
      </button>
    </div>
  );
}

function paint(ctx: CanvasRenderingContext2D, data: SummaryCardData) {
  // The chosen concept from the Task 1 gallery, transcribed. Anchored to the broadcast
  // language: dark radial ground, cyan keylines, mono tabular numerals.
  // Draw, in order: ground, keyline, home/away names, the scoreline, the scorer lines
  // (via `scorerLine`, which prints "23' Henry (pen)" / "67' Carragher (og)"), then the
  // formation, seed and share code as a footer strip.
}
```

Transcribe the chosen concept into `paint`. Keep every string that appears on the card
coming from `data` or from `t(...)` — no hard-coded English.

- [ ] **Step 4: Mount it in `MatchSummary`**

Add `cardData: SummaryCardData | null` to `Props`, render `{cardData != null ? <SummaryCard data={cardData} /> : null}` under the scoreline, and build it in `GamePlay`'s summary branch:

```tsx
    const cardData =
      squad == null || code == null
        ? null
        : summaryFrom({
            home: match.home,
            away: match.away,
            events,
            score: result.score,
            formationName: formationNameFromKey(squad.formationKey),
            seed: match.seed,
            code,
          });
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test tests/unit/summary-card-component.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify the real paint in a browser, both locales**

Run `pnpm dev`, play a match to full time, and check:
- the card paints with the real font, not a fallback
- the download produces a PNG whose filename matches `summaryFilename`
- on `/ar/game/draft` the Arabic text **shapes correctly** and the digits match the app's convention

⚠️ This cannot be verified from the test suite — jsdom paints nothing. Rasterise and look.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/components/SummaryCard.tsx src/features/game/components/MatchSummary.tsx src/features/game/components/GamePlay.tsx tests/unit/summary-card-component.test.tsx
git commit -m "feat(1812): paint and download the match-summary card"
```

---

## Task 12: Full verification, docs, and the PR

**Files:**
- Modify: `TASKS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run everything**

```bash
pnpm test
```
Expected: the full suite green, with the new files' tests added to the count.

```bash
pnpm type-check
```
Expected: clean. ⚠️ Required — vitest does not type-check, so a dangling import survives a green suite.

```bash
CI=true pnpm lint
```
Expected: clean.

- [ ] **Step 2: Confirm no route went dynamic**

Run: `pnpm test tests/unit/game-routes-static.test.ts`
Expected: PASS. Then `pnpm build` and confirm `/game/draft` still prerenders (`●`) in both locales.

- [ ] **Step 3: End-to-end check by hand**

Play a match to full time, copy the link, open it in a **private window**, and confirm: the match plays out from the start with no prompts, the scoreline matches, no drift banner appears, and the visitor's own in-progress match (start one first in that window) is still offered afterwards — proving the slot was never written.

- [ ] **Step 4: Update `TASKS.md`**

Under `### TASK-1812`, replace the "PARTLY BUILT" block with a shipped-notes block recording: the two defects fixed (`KEY_RE` rejecting all 20 formations; the code carrying no decisions), the token design and why it is self-validating, the one-replay-path refactor with the drift asymmetry, and the arrival rules.

⚠️ **The ticket stays `📋 Backlog`, not `✅ Done`** — persisting runs/records is still blocked on TASK-1810/1811. Say so explicitly.

⚠️ **`COLLECTION_SURFACES`' `records` entry stays `status: "planned"`.** Do not flip it.

- [ ] **Step 5: Add the rule to `CLAUDE.md`**

In the `features/game/` section:

```markdown
- **⚠️ A share code is UNTRUSTED input, and its formation is a NAME SLUG.** `formationKey`
  is `${name}/${slots.length}` — a slash, spaces and capitals — so it can never go in a URL;
  `formationSlug`/`formationBySlug` carry identity instead, and a guard test pins that the
  20 slugs are unique (a collision would restore a match into the wrong shape). The coach's
  decisions travel as a token stream, one token per decision, materialised against the
  decision the engine actually raises — so a stale or tampered code is REFUSED rather than
  replayed into a different, plausible match. Resume and share are one replay path
  (`replayWith`); they differ only in drift policy — resume discards, share keeps its own
  replay and warns.
```

- [ ] **Step 6: Commit and open the PR**

```bash
git add TASKS.md CLAUDE.md
git commit -m "docs(1812): record the share/replay design and the untrusted-code rule"
git push -u origin feat/1812-share-replay
```

Open the PR against `main`, watch the three CI gates, and squash-merge on green. ⚠️ Never push to `main` directly.

---

## Notes for the implementer

- **Determinism is the core invariant.** Nothing added here may touch `Math.random()` or `Date.now()`. The `window.setTimeout` in `ShareLink` is a UI affordance outside the engine and is fine; anything inside `domain/` is not.
- **A green suite is not evidence that nothing changed.** Tests asserting relationships (same seed reproduces itself) stay green through a total change in output. Where this plan says verify by measurement — the fingerprint round trip, the Arabic paint, the untouched slot — measure.
- **`replayMatch`'s existing tests must pass unmodified.** They are the proof that the Task 6 refactor did not change resume.
