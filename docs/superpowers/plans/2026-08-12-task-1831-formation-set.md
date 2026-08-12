# The Full Formation Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow `FORMATIONS` from 4 shapes to 20 across three families, and make the array's order stop being load-bearing.

**Architecture:** The shapes are pure data in `domain/chaos-draft.ts` using the existing `formation()` / `slot()` helpers. Before any are added, every index read of `FORMATIONS` is converted to a `formationByName` lookup — otherwise inserting a shape silently repoints `FORMATIONS[2]` and the hard-ban test starts passing for the wrong reason. The hub's picker becomes a grouped `<select>`.

**Tech Stack:** TypeScript, React 19, Next 15 (App Router, `force-static`), next-intl, Vitest + happy-dom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-12-task-1831-formation-set-design.md`

---

## Before you start

**Toolchain.** Run every command with a Linux-only PATH pinned first, or `node` resolves to a Windows shim and the husky pre-commit hook dies with `exec: node: not found`:

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
```

Run binaries directly, never `pnpm <script>` — pnpm 11 tries to purge the platform-mixed `node_modules` with no TTY and aborts. The one exception is lint, which only resolves its plugins through pnpm's linker: `source $HOME/.nvm/nvm.sh && nvm use 22 && pnpm lint`.

Run the unit suite on the **default** vitest pool. `--pool=forks --singleFork` reports ~45 phantom failures.

**Branch off the merged specs**, not off this worktree's current branch.

---

## File Structure

**Create:** nothing. This ticket is data plus a lookup.

**Modify:**

| File | Change |
| --- | --- |
| `src/features/game/domain/formation.ts` | Add `formationByName`. |
| `src/features/game/domain/chaos-draft.ts` | 4 shapes → 20; rename the existing four to carry their variant. |
| `src/features/game/components/DraftHub.tsx` | Grouped `<select>`; named default instead of `FORMATIONS[0]`. |
| `src/i18n/messages/{en,ar}.json` | Three family group labels. |
| `tests/unit/game-formation.test.ts` | `formationByName` + the structural sweep. |
| `tests/unit/game-draft-state.test.ts` | Name lookups; a second hard-ban case. |
| `tests/unit/game-draft-eligibility.test.ts` | Name lookup. |
| `tests/unit/game-fill-gaps.test.ts` | Name lookup. |
| `tests/unit/game-match-replay.test.ts` | Name lookup. |
| `tests/unit/game-match-session.test.ts` | Name lookups (3 sites). |
| `tests/unit/game-tactical-pitch.test.tsx` | Name lookup. |
| `tests/unit/game-draft-hub.test.tsx` | Picker is now a `<select>`. |
| `TASKS.md` | Flip 1831 to done. |

**⚠️ Scope trim, flag it to the owner.** The spec mentions showing each shape's one-line tactical note beside the picker. This plan **omits it**. Twenty notes are prose, so they would need localising into both catalogs — forty strings — and the shape name already carries the information ("4-3-3 False 9" says what it is). If the owner wants the notes, they are a small follow-up, not a reason to hold this.

---

### Task 1: `formationByName`

**Files:**
- Modify: `src/features/game/domain/formation.ts`
- Test: `tests/unit/game-formation.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/game-formation.test.ts`:

```ts
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";

describe("formationByName", () => {
  it("resolves a shipped formation", () => {
    expect(formationByName("4-4-2 Flat").name).toBe("4-4-2 Flat");
  });

  it("resolves every shipped formation", () => {
    for (const f of FORMATIONS) expect(formationByName(f.name)).toBe(f);
  });

  it("⚠️ throws on an unknown name rather than returning undefined", () => {
    // A silent undefined here surfaces as a crash somewhere far from the cause —
    // typically inside a reducer that assumed it had a shape.
    expect(() => formationByName("4-4-3")).toThrow(/unknown formation/i);
  });
});
```

⚠️ `tests/unit/game-formation.test.ts` already exists and has its own imports. Add these imports to the existing block rather than duplicating `describe`/`expect` imports.

- [ ] **Step 2: Run the test to verify it fails**

```bash
node_modules/.bin/vitest run tests/unit/game-formation.test.ts
```

Expected: FAIL — `formationByName` is not exported.

- [ ] **Step 3: Write the implementation**

Add to the end of `src/features/game/domain/formation.ts`:

```ts
import { FORMATIONS } from "./chaos-draft";

/**
 * Resolve a formation by its name.
 *
 * ⚠️ Exists so that `FORMATIONS`'s ORDER is presentation only. Reading the array by index
 * makes inserting a shape a silent behaviour change: the hard-ban test in
 * `game-draft-state.test.ts` pins slot 4 precisely because that is the only index whose
 * role differs between 4-4-2 and 3-5-2, so repointing `FORMATIONS[2]` would leave it
 * passing for the wrong reason.
 *
 * Throws rather than returning undefined — a missing shape is a programming error, and a
 * silent undefined surfaces as a crash far from its cause.
 */
export function formationByName(name: string): Formation {
  const found = FORMATIONS.find((f) => f.name === name);
  if (!found) throw new Error(`unknown formation: ${name}`);
  return found;
}
```

⚠️ **Check for an import cycle.** `chaos-draft.ts` already imports types from `formation.ts`. If that import is `import type`, the edge erases at compile time and there is no runtime cycle. If `tsc` or vitest reports one, move `formationByName` into `chaos-draft.ts` beside `FORMATIONS` instead and update the test's import path.

- [ ] **Step 4: Run the test to verify it passes**

```bash
node_modules/.bin/vitest run tests/unit/game-formation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/domain/formation.ts tests/unit/game-formation.test.ts
git commit -m "feat(game): resolve a formation by name, so array order stops mattering"
```

---

### Task 2: Convert every index read to a name lookup

**Files:**
- Modify: `src/features/game/components/DraftHub.tsx:48`
- Modify: `tests/unit/game-draft-state.test.ts:32,97,121`
- Modify: `tests/unit/game-draft-eligibility.test.ts:27`
- Modify: `tests/unit/game-fill-gaps.test.ts:41`
- Modify: `tests/unit/game-match-replay.test.ts:52`
- Modify: `tests/unit/game-match-session.test.ts:55,69,76`
- Modify: `tests/unit/game-tactical-pitch.test.tsx:25`

This lands **before** any new shape, so the suite proves the conversion changed nothing while the array is still the familiar four.

- [ ] **Step 1: Replace each index read**

In every file above, replace `FORMATIONS[0]` with `formationByName("4-4-2")` and `FORMATIONS[2]` with `formationByName("3-5-2")`, adding to each file's imports:

```ts
import { formationByName } from "@/features/game/domain/formation";
```

In `src/features/game/components/DraftHub.tsx:48`:

```ts
  const [state, dispatch] = useReducer(draftReducer, createDraftState(FORMATIONS[0], INITIAL_SEED));
```

becomes

```ts
  // An explicit default, not "whatever happens to be first".
  const [state, dispatch] = useReducer(
    draftReducer,
    createDraftState(formationByName(DEFAULT_FORMATION), INITIAL_SEED),
  );
```

with this constant near the top of the file:

```ts
/** The shape the hub opens on. Named, so reordering FORMATIONS cannot change it. */
const DEFAULT_FORMATION = "4-4-2";
```

⚠️ `DraftHub.tsx:88` (`dispatch({ type: "setFormation", formation: FORMATIONS[i] })`) is a **dynamic** index driven by the user's selection, not a positional assumption. Leave it.

- [ ] **Step 2: Run the affected tests**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-state.test.ts tests/unit/game-draft-eligibility.test.ts tests/unit/game-fill-gaps.test.ts tests/unit/game-match-replay.test.ts tests/unit/game-match-session.test.ts tests/unit/game-tactical-pitch.test.tsx tests/unit/game-draft-hub.test.tsx
```

Expected: PASS, with no expectation changed. The names still resolve because the shapes have not been renamed yet.

- [ ] **Step 3: Add the guard that stops the dependency creeping back**

Add to `tests/unit/game-formation.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";

it("⚠️ no test or component reads FORMATIONS by index", () => {
  // Index access makes the array's ORDER load-bearing: inserting a shape then silently
  // repoints every downstream assumption. `DraftHub` indexes by the user's selection,
  // which is dynamic rather than positional, so it is allowed.
  const files = [
    ...readdirSync("tests/unit").map((f) => `tests/unit/${f}`),
    "src/features/game/components/DraftHub.tsx",
  ].filter((f) => /\.tsx?$/.test(f));

  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/FORMATIONS\[(\w+)\]/g)) {
      if (m[1] === "i") continue; // the hub's user-driven selection
      offenders.push(`${file}: ${m[0]}`);
    }
  }
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 4: Run it to verify it passes**

```bash
node_modules/.bin/vitest run tests/unit/game-formation.test.ts
```

Expected: PASS. Then temporarily reintroduce `FORMATIONS[0]` in one test file and re-run to confirm the guard reports it, and revert.

- [ ] **Step 5: Commit**

```bash
git add src/features/game/components/DraftHub.tsx tests/unit/
git commit -m "refactor(game): look formations up by name, never by index"
```

---

### Task 3: The twenty shapes

**Files:**
- Modify: `src/features/game/domain/chaos-draft.ts:19-68`
- Test: `tests/unit/game-formation.test.ts`

- [ ] **Step 1: Write the failing structural test**

Add to `tests/unit/game-formation.test.ts`:

```ts
import type { PlayerRole } from "@/data/schemas";
import { formationKey } from "@/features/game/domain/formation";

const ROLES: PlayerRole[] = [
  "GK", "RB", "CB", "LB", "CDM", "CM", "CAM", "RM", "LM", "RW", "LW", "SS", "CF",
];

describe("the formation set", () => {
  it("ships twenty shapes", () => {
    expect(FORMATIONS).toHaveLength(20);
  });

  it("every shape is eleven slots with exactly one keeper", () => {
    for (const f of FORMATIONS) {
      expect(f.slots, f.name).toHaveLength(11);
      expect(f.slots.filter((s) => s.role === "GK"), f.name).toHaveLength(1);
    }
  });

  it("every slot role is a real PlayerRole", () => {
    for (const f of FORMATIONS) {
      for (const s of f.slots) expect(ROLES, `${f.name} ${s.role}`).toContain(s.role);
    }
  });

  it("⚠️ every key is unique", () => {
    // formationKey is `${name}/${slots.length}` and every shape has 11 slots, so two
    // variants both named "4-3-3" would collide — and TASK-1807 B2 resolves a stored
    // match by that key, so a collision restores a saved match into the WRONG shape.
    const keys = FORMATIONS.map(formationKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the three families are all represented", () => {
    for (const name of ["4-4-2 Flat", "3-5-2", "2-3-5 Pyramid"]) {
      expect(FORMATIONS.map((f) => f.name)).toContain(name);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
node_modules/.bin/vitest run tests/unit/game-formation.test.ts
```

Expected: FAIL — "ships twenty shapes" reports 4.

- [ ] **Step 3: Replace the FORMATIONS array**

In `src/features/game/domain/chaos-draft.ts`, replace the whole `export const FORMATIONS: Formation[] = [ … ];` block with the following. Row 1 is the keeper line, increasing toward the opponent goal; `col` runs left to right.

```ts
/** Build a shape from lines of roles, keeper line first. */
const shape = (name: string, lines: PlayerRole[][]): Formation =>
  formation(
    name,
    lines.flatMap((line, r) => line.map((role, c) => slot(r + 1, c + 1, role))),
  );

/**
 * The full formation set — twenty shapes in three families (TASK-1831).
 *
 * ⚠️ NAMES CARRY THE VARIANT, and that is load-bearing. `formationKey` is
 * `${name}/${slots.length}` and every shape here is 11 slots, so two variants both called
 * "4-3-3" would collide on "4-3-3/11" — and TASK-1807 B2 resolves a stored match by that
 * key, so a collision restores a saved match into the wrong shape.
 *
 * ⚠️ Order is presentation only. Resolve shapes with `formationByName`, never by index.
 */
export const FORMATIONS: Formation[] = [
  // ---- Back four ----
  shape("4-3-3 Holding", [["GK"],["LB","CB","CB","RB"],["CDM","CM","CM"],["LW","CF","RW"]]),
  shape("4-3-3 Flat", [["GK"],["LB","CB","CB","RB"],["CM","CM","CM"],["LW","CF","RW"]]),
  shape("4-3-3 False 9", [["GK"],["LB","CB","CB","RB"],["CDM","CM","CM"],["LW","CAM","RW"]]),
  shape("4-2-3-1", [["GK"],["LB","CB","CB","RB"],["CDM","CDM"],["LW","CAM","RW"],["CF"]]),
  shape("4-4-2 Flat", [["GK"],["LB","CB","CB","RB"],["LM","CM","CM","RM"],["CF","CF"]]),
  shape("4-4-2 Diamond", [["GK"],["LB","CB","CB","RB"],["CDM"],["CM","CM"],["CAM"],["CF","CF"]]),
  shape("4-1-4-1", [["GK"],["LB","CB","CB","RB"],["CDM"],["LM","CM","CM","RM"],["CF"]]),
  shape("4-3-2-1 Christmas Tree", [["GK"],["LB","CB","CB","RB"],["CDM","CM","CM"],["CAM","CAM"],["CF"]]),
  shape("4-5-1", [["GK"],["LB","CB","CB","RB"],["LM","CDM","CM","CDM","RM"],["CF"]]),
  shape("4-2-2-2 Magic Rectangle", [["GK"],["LB","CB","CB","RB"],["CDM","CDM"],["CAM","CAM"],["CF","CF"]]),
  // ---- Back three or five ----
  shape("3-5-2", [["GK"],["CB","CB","CB"],["LM","CM","CAM","CM","RM"],["CF","CF"]]),
  shape("3-4-3 Flat", [["GK"],["CB","CB","CB"],["LM","CM","CM","RM"],["LW","CF","RW"]]),
  shape("3-4-2-1", [["GK"],["CB","CB","CB"],["LM","CM","CM","RM"],["CAM","CAM"],["CF"]]),
  shape("3-1-4-2", [["GK"],["CB","CB","CB"],["CDM"],["LM","CM","CM","RM"],["CF","CF"]]),
  shape("5-3-2", [["GK"],["LB","CB","CB","CB","RB"],["CM","CM","CM"],["CF","CF"]]),
  shape("5-4-1", [["GK"],["LB","CB","CB","CB","RB"],["LM","CM","CM","RM"],["CF"]]),
  // ---- Historic ----
  shape("4-2-4", [["GK"],["LB","CB","CB","RB"],["CM","CM"],["LW","CF","CF","RW"]]),
  shape("3-2-2-3 W-M", [["GK"],["CB","CB","CB"],["CM","CM"],["CAM","CAM"],["LW","CF","RW"]]),
  shape("2-3-5 Pyramid", [["GK"],["LB","RB"],["LM","CM","RM"],["LW","SS","CF","SS","RW"]]),
  shape("4-6-0 Strikerless", [["GK"],["LB","CB","CB","RB"],["LM","CDM","CM","CM","CAM","RM"]]),
];
```

⚠️ **The existing four are renamed**, not kept alongside: "4-4-2" → "4-4-2 Flat", "4-3-3" → the three variants, "3-5-2" and "4-2-3-1" unchanged. Every `formationByName("4-4-2")` from Task 2 must therefore become `formationByName("4-4-2 Flat")`.

- [ ] **Step 4: Update the name lookups Task 2 introduced**

```bash
grep -rn 'formationByName("4-4-2")' src tests
```

Replace each hit with `formationByName("4-4-2 Flat")`. `"3-5-2"` is unchanged.

- [ ] **Step 5: Run the affected tests**

```bash
node_modules/.bin/vitest run tests/unit/game-formation.test.ts tests/unit/game-draft-state.test.ts tests/unit/game-fill-gaps.test.ts tests/unit/game-match-session.test.ts tests/unit/game-match-replay.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/game/domain/chaos-draft.ts tests/unit/ src/features/game/components/DraftHub.tsx
git commit -m "feat(game): the full formation set — 20 shapes in three families"
```

---

### Task 4: Prove the pool can actually deal every shape

**Files:**
- Test: `tests/unit/game-formation.test.ts`

TASK-1823 deals five eligible candidates per slot. A shape the pool cannot supply would produce short hands, so the constraint is checked here, where the shapes are defined.

- [ ] **Step 1: Write the test**

```ts
import { canPlay } from "@/features/game/domain/eligibility";

it("⚠️ the pool can deal five distinct eligible candidates for every slot of every shape", () => {
  // TASK-1823's rooms need 5 per slot with no reuse, so a shape needing N of a role needs
  // 5*N eligible cards. Measured at spec time: RM is thinnest at 18, and no shape asks
  // for more than two.
  const supply = new Map<string, number>();
  for (const f of FORMATIONS) {
    for (const s of f.slots) {
      if (!supply.has(s.role)) {
        supply.set(s.role, POOL.filter((c) => canPlay(c, s.role)).length);
      }
    }
  }
  for (const f of FORMATIONS) {
    const need = new Map<string, number>();
    for (const s of f.slots) need.set(s.role, (need.get(s.role) ?? 0) + 1);
    for (const [role, n] of need) {
      expect(supply.get(role) ?? 0, `${f.name} needs ${n} × ${role}`).toBeGreaterThanOrEqual(n * 5);
    }
  }
});
```

⚠️ `POOL` must be the **real** pool, not the synthetic fixture the other tests use — a
synthetic pool with six cards per role passes trivially and proves nothing. Load it inside
the test:

```ts
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";

// ... inside the test body, before the assertions:
const POOL = await loadChaosPool();
```

and give the test a long timeout, since it reads six seasons of committed JSON:

```ts
}, 60_000);
```

`adapter/chaos-pool.ts` begins with `import "server-only"`, which vitest aliases to an
empty stub (see `vitest.config.ts`), so importing it from a test is fine.

- [ ] **Step 2: Run it**

```bash
node_modules/.bin/vitest run tests/unit/game-formation.test.ts
```

Expected: PASS. If a shape fails, do **not** relax the assertion — either the shape's roles are wrong or the pool composition changed, and both are real findings.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/game-formation.test.ts
git commit -m "test(game): every shape is dealable from the real card pool"
```

---

### Task 5: The grouped picker

**Files:**
- Modify: `src/features/game/components/DraftHub.tsx:104-120`
- Modify: `src/i18n/messages/en.json`, `src/i18n/messages/ar.json`
- Test: `tests/unit/game-draft-hub.test.tsx`

- [ ] **Step 1: Add the family labels**

In `src/i18n/messages/en.json`, inside `"game"`:

```json
    "formationBackFour": "Back four",
    "formationBackThree": "Back three or five",
    "formationHistoric": "Historic",
```

In `src/i18n/messages/ar.json`, same position:

```json
    "formationBackFour": "رباعي الدفاع",
    "formationBackThree": "ثلاثي أو خماسي الدفاع",
    "formationHistoric": "تشكيلات تاريخية",
```

- [ ] **Step 2: Verify catalog parity**

```bash
node_modules/.bin/vitest run tests/unit/i18n-catalog-parity.test.ts
```

Expected: PASS.

- [ ] **Step 3: Write the failing test**

Add to `tests/unit/game-draft-hub.test.tsx`:

```tsx
it("offers all twenty formations, grouped by family", async () => {
  renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
  const select = screen.getByRole("combobox", { name: "Formation" });
  expect(select.querySelectorAll("option")).toHaveLength(20);
  expect(select.querySelectorAll("optgroup")).toHaveLength(3);
});

it("changing formation still renders eleven slots", async () => {
  // Asserted on slot COUNT rather than on role labels: `TacticalPitch` builds each slot
  // button's accessible name itself, and pinning that string here would couple this test
  // to that component's copy. Eleven is true of every shape and is the thing that matters.
  const user = userEvent.setup();
  renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
  const pitch = screen.getByRole("group", { name: "Pitch" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Formation" }), "2-3-5 Pyramid");
  expect(pitch.querySelectorAll("button")).toHaveLength(11);
});
```

⚠️ `"Pitch"` is whatever `game.draftPitchAria` resolves to in `en.json` — read that key and
use its exact value, since `getByRole` matches the rendered accessible name.

- [ ] **Step 4: Run it to verify it fails**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx
```

Expected: FAIL — there is no combobox; the picker is still buttons.

- [ ] **Step 5: Replace the picker**

In `src/features/game/components/DraftHub.tsx`, replace the `<div role="group" …>` block containing the formation buttons with:

```tsx
      <div className="mb-3">
        <label htmlFor="formation" className="sr-only">
          {t("draftFormation")}
        </label>
        <select
          id="formation"
          value={formationIndex}
          onChange={(e) => changeFormation(Number(e.target.value))}
          className="border-border bg-background rounded-md border px-3 py-1.5 font-mono text-xs font-bold"
        >
          {FAMILIES.map(({ labelKey, from, to }) => (
            <optgroup key={labelKey} label={t(labelKey)}>
              {FORMATIONS.slice(from, to).map((f, i) => (
                <option key={f.name} value={from + i}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
```

and add this beside `DEFAULT_FORMATION`:

```tsx
/**
 * Family boundaries into `FORMATIONS`, for grouping the picker only.
 *
 * ⚠️ Presentation, not identity. Nothing may resolve a shape through these — use
 * `formationByName`. If the array is reordered, only these three ranges change.
 */
const FAMILIES = [
  { labelKey: "formationBackFour", from: 0, to: 10 },
  { labelKey: "formationBackThree", from: 10, to: 16 },
  { labelKey: "formationHistoric", from: 16, to: 20 },
] as const;
```

⚠️ The `<option>` text is `{f.name}` — an expression, not a string literal — so the no-hardcoded-strings AST guard is satisfied. Formation names stay English in both locales, consistent with the English-only card decision (PR #97).

- [ ] **Step 6: Run it to verify it passes**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-hub.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/game/components/DraftHub.tsx src/i18n/messages/en.json src/i18n/messages/ar.json tests/unit/game-draft-hub.test.tsx
git commit -m "feat(game): group the formation picker by family"
```

---

### Task 6: The hard ban across two new shapes

**Files:**
- Modify: `tests/unit/game-draft-state.test.ts`

The one way the hard ban can be violated is a formation change re-roling slots under a placed XI. With twenty shapes that is far likelier, so the existing case gains a sibling.

- [ ] **Step 1: Write the test**

Add to `tests/unit/game-draft-state.test.ts`:

```ts
it("⚠️ a formation change can strand a placed player, across the new shapes too", () => {
  // 4-2-3-1 slot 5 is CDM; 2-3-5 Pyramid slot 5 is CM... read both shapes and pick an
  // index whose role GENUINELY differs, then assert on that index. A pair that happens to
  // agree would pass for the wrong reason — the trap the original 4-4-2 → 3-5-2 case was
  // written to avoid.
  const a = formationByName("4-2-3-1");
  const b = formationByName("4-6-0 Strikerless");
  const differing = a.slots.findIndex((s, i) => s.role !== b.slots[i].role);
  expect(differing).toBeGreaterThanOrEqual(0);

  let s = createDraftState(a, 1);
  const card = pool.find((c) => c.role === a.slots[differing].role)!;
  s = draftReducer(s, { type: "place", index: differing, cardId: card.cardId });
  s = draftReducer(s, { type: "setFormation", formation: b });

  const errors = validateSquad(s, pool);
  expect(errors.some((e) => e.slotIndex === differing)).toBe(true);
});
```

The action is `{ type: "place", index, cardId }` and `SquadError` is
`{ slotIndex, role, cardId, playerName }` — note the field is **`slotIndex`**, not `index`.
Both confirmed against `src/features/game/view/draft-state.ts`.

- [ ] **Step 2: Run it**

```bash
node_modules/.bin/vitest run tests/unit/game-draft-state.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/game-draft-state.test.ts
git commit -m "test(game): the hard ban holds across the new shapes"
```

---

### Task 7: Full verification

- [ ] **Step 1: Type-check**

```bash
node_modules/.bin/tsc --noEmit
```

Expected: no output. ⚠️ Vitest does not type-check — this is the only thing that catches a dangling import.

- [ ] **Step 2: Lint**

```bash
source $HOME/.nvm/nvm.sh && nvm use 22 && pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Full suite**

```bash
node_modules/.bin/vitest run
```

Expected: PASS.

⚠️ **The five chaos determinism tests must stay green UNCHANGED.** They are relational — same seed reproduces itself, eleven distinct players, the shape is a member of `FORMATIONS`, every card eligible, different seeds differ — so a different-but-valid draft still satisfies them. **If one of them moves, stop and find out why**: it means something pins chaos output that this ticket did not account for.

- [ ] **Step 4: Build**

```bash
export NODE_OPTIONS=--network-family-autoselection-attempt-timeout=2000
node_modules/.bin/next build > /tmp/f-build.log 2>&1; echo "EXIT:$?"; grep -E "/(en|ar)/game" /tmp/f-build.log
```

Expected: all four `/game/*` routes `●` in both locales. Do not pipe to `tail` — the pipeline exits with tail's status and masks a failed build.

- [ ] **Step 5: ⚠️ Confirm by eye that the chaos draft actually changed**

The suite cannot see this, and that is the point: `/game/chaos` now deals a different XI
for the same seed and no test watches it.

The route renders a **generating** state on the server and draws the real seed after
hydration (PR #97), so the prerendered HTML holds no lineup to diff. Compare the drafted
formation directly instead, which is the thing that actually changed:

```bash
node -e '
const { chaosDraft } = require("./src/features/game/domain/chaos-draft.ts");
' 2>/dev/null || node_modules/.bin/vitest run tests/unit/game-chaos-draft.test.ts --reporter=verbose
```

Simplest reliable check — add a throwaway assertion that prints the shape for three fixed
seeds, run it on this branch and on `main`, and confirm the names differ:

```ts
it("TEMP: what shape does each seed draft?", () => {
  for (const seed of [1, 42, 777]) console.log(seed, chaosDraft(pool, seed).formation.name);
});
```

Record the before/after in the commit message, then delete the temporary test.

- [ ] **Step 6: Commit any fixes**

```bash
git add -u
git commit -m "fix(game): verification fallout"
```

Skip if nothing changed. ⚠️ **Stage explicit paths, never `git add -A`** — other sessions share this checkout.

---

### Task 8: Documentation

**Files:**
- Modify: `TASKS.md`

- [ ] **Step 1: Flip the ticket**

Change the table row:

```markdown
| [TASK-1831](#task-1831) | The full formation set — 20 shapes in three families            | 📋 Backlog | P2       | M   |
```

to `✅ Done`, and the heading line `**The full formation set — 20 shapes in three families** · 📋 Backlog · ...` to `· ✅ Done (2026-08-12) ·`.

- [ ] **Step 2: Add the shipped note**

Append to the TASK-1831 body:

```markdown
**✅ Shipped 2026-08-12.** Plan: [`docs/superpowers/plans/2026-08-12-task-1831-formation-set.md`](../docs/superpowers/plans/2026-08-12-task-1831-formation-set.md).

**⚠️ The array's order was load-bearing and is not any more.** `FORMATIONS` was read by index in ten places — nine tests plus the hub — and inserting shapes would have silently repointed `FORMATIONS[2]`, leaving the hard-ban test passing for the wrong reason. `formationByName` replaced every positional read, and a guard test now fails if index access returns.

**⚠️ The chaos determinism tests did NOT move, and that is a weaker signal than it looks.** All five are relational, so a completely different draft still satisfies them. The chaos output really did change; nothing tests it. Verified by eye instead.
```

- [ ] **Step 3: Commit**

```bash
git add TASKS.md
git commit -m "docs(tasks): TASK-1831 shipped"
```

---

## Done when

- 20 shapes, all 11 slots, one keeper each, unique keys, every role valid.
- No index read of `FORMATIONS` outside the hub's user-driven selection, with a guard.
- The picker is a grouped select offering all twenty.
- The real pool can deal five eligible candidates for every slot of every shape.
- `tsc`, lint and the full suite are clean, with the chaos determinism tests **unchanged**.
- `next build` marks all four `/game/*` routes `●` in both locales.
- The chaos-draft change was confirmed by eye, not inferred from a green suite.

Then follow [[pitchiq-git-workflow]]: branch → push → PR → watch the three CI gates → squash-merge on green. Never push to `main`.
