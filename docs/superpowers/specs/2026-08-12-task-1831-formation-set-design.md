# TASK-1831 — The full formation set

**Date:** 2026-08-12
**Status:** design agreed, ready for planning
**Depends on:** TASK-1807 A (the draft hub and its picker)
**Blocks:** TASK-1823 (the Draft Room derives its rounds from the formation)

## Scope

`FORMATIONS` goes from **4 shapes to 20**, organised in three families, and the hub's
formation picker changes shape to carry them.

This ships **before** the Draft Room (owner decision, 2026-08-12) so the room is built
against the final formation set rather than retrofitted onto it, and so the determinism
churn below lands in a PR that can be reviewed on its own terms.

## The shapes

Twenty, in the owner's three categories. Row 1 is the goalkeeper line, increasing toward
the opponent goal; `col` runs left to right — the existing `formation()` / `slot()`
convention in `domain/chaos-draft.ts`, unchanged.

**Back four (10):** 4-3-3 Holding · 4-3-3 Flat · 4-3-3 False 9 · 4-2-3-1 · 4-4-2 Flat ·
4-4-2 Diamond · 4-1-4-1 · 4-3-2-1 Christmas Tree · 4-5-1 · 4-2-2-2 Magic Rectangle

**Back three or five (6):** 3-5-2 · 3-4-3 Flat · 3-4-2-1 · 3-1-4-2 · 5-3-2 · 5-4-1

**Historic (4):** 4-2-4 · 3-2-2-3 W-M · 2-3-5 Pyramid · 4-6-0 Strikerless

Every shape is exactly 11 slots with exactly one `GK`. Roles come from the existing
13-code `PlayerRole` enum — no new roles. The false nine is a `CAM` in the centre-forward
position, and 4-6-0 simply has no forward slot at all.

⚠️ **A shape is not required to be fillable by a "natural" XI.** 2-3-5 asks for five
forwards and 4-6-0 for none; `canPlay` still governs each slot individually, and the pool
was measured to supply five distinct eligible candidates for every slot of every shape
(see Validation).

## ⚠️ Names carry the variant, and that is load-bearing

`formationKey(f)` is `` `${name}/${slots.length}` `` and **every shape here has 11 slots**.
Two variants both named "4-3-3" would therefore produce the identical key `4-3-3/11`.

That is not cosmetic. TASK-1807 B2 stores a live match as `formationKey` and resolves it
back with `FORMATIONS.find(f => formationKey(f) === record.formationKey)` — a collision
means a saved match silently restores into **the wrong shape**, and the fingerprint check
would then reject it as drift. So the variants are named "4-3-3 Holding", "4-3-3 Flat",
"4-3-3 False 9", "4-4-2 Flat", "4-4-2 Diamond", "3-4-3 Flat".

The uniqueness assertion added in B2 (`tests/unit/game-match-replay.test.ts`) already
guards this. It must stay, and it must be seen to fail against a deliberately duplicated
name before this ticket is called done.

## ⚠️ This moves every existing chaos draft

`chaosDraft` picks its shape with `pick(FORMATIONS, rng)` — the array's **length** feeds
the seeded choice. Growing it from 4 to 20 changes which formation every seed produces,
and therefore the whole XI that follows it.

Consequences, all expected rather than defects:

- `/game/chaos` prerenders a different XI than it does today.
- Any match saved by B2 before this ships fails its fingerprint check and is discarded —
  the designed behaviour for exactly this kind of drift, not a bug to fix.

**The chaos determinism tests, however, do NOT move.** Checked rather than assumed: all
five in `tests/unit/game-chaos-draft.test.ts` are **relational** — same seed reproduces
itself, the XI is eleven distinct players, the shape is a member of `FORMATIONS`, every
card is eligible for its slot, different seeds differ. None pins a specific XI or
formation name, so a different-but-valid draft still satisfies every one of them.

⚠️ **That is a weaker guarantee than it looks.** Those tests cannot detect that the whole
chaos output changed. The change is real and user-visible; it simply has no test watching
it. Verify it by eye on `/game/chaos` before shipping rather than concluding from a green
suite that nothing moved.

## ⚠️ The array's ORDER is currently load-bearing, and must stop being

`FORMATIONS` is read **by index** in ten places — nine tests plus the hub:

| Site | Assumes |
| --- | --- |
| `DraftHub.tsx:48` | `FORMATIONS[0]` is the initial shape |
| `game-draft-state.test.ts:32,97,115-121` | `[0]` is 4-4-2 **and** `[2]` is 3-5-2 |
| `game-draft-eligibility.test.ts:27` | `[0]` |
| `game-fill-gaps.test.ts:41` | `[0]` is 4-4-2 |
| `game-match-replay.test.ts:52` | `[0]` |
| `game-match-session.test.ts:55,69,76` | `[0]` |
| `game-tactical-pitch.test.tsx:25` | `[0]` |

Inserting the new back-four shapes ahead of 3-5-2 would silently repoint `[2]`. The
hard-ban test in `game-draft-state.test.ts` is the dangerous one: it pins **slot 4**
precisely because that is the only index whose role differs between 4-4-2 and 3-5-2, so
against a different pair it would keep passing **for the wrong reason** — the exact failure
mode A's note warned about.

**So this ticket adds `formationByName(name)` to `domain/formation.ts` and converts every
index read to a name lookup.** After that the array's order is presentation only, and new
shapes can be inserted anywhere. `DraftHub`'s initial shape becomes an explicit named
default rather than "whatever is first".

## The picker

Twenty chips would wrap into a wall, so the hub's picker becomes a grouped `<select>` —
one `<optgroup>` per family, the shape's one-line note shown beside it. `DraftHub`
currently tracks `formationIndex` and dispatches `setFormation`; that stays, only the
control changes.

⚠️ **Changing formation can strand a placed XI in an illegal shape** — the single way the
hard ban can be violated, found in A. With twenty shapes the odds of a slot re-roling
under a placed player go up sharply. `validateSquad` already reports it by name and blocks
Play; nothing new is needed, but the A test that pins slot 4 across 4-4-2 → 3-5-2 should
gain a second case across two of the new shapes.

## Validation

Measured against the real 252-card chaos pool before this spec was written:

- 20 shapes, all exactly 11 slots, all exactly one `GK`
- all 20 keys unique
- role supply — `GK` 20, `CB` 76, `CM` 60, `CF` 58, `CAM` 54, `CDM` 49, `LW` 45, `RW` 43,
  `LB` 43, `RB` 42, `SS` 27, `LM` 21, `RM` 18 — is sufficient for every shape to deal five
  distinct eligible candidates per slot, which is what TASK-1823 needs

`RM` at 18 is the thinnest. No shape asks for more than two, so the worst case needs 10 of
18. Worth re-measuring if the pool composition ever changes.

## Testing

- Every shape has 11 slots and exactly one `GK`.
- **Keys are unique** — and the test is verified to fail against a duplicated name.
- Every slot role is a member of `PlayerRole`.
- For every shape, the pool supplies at least `5 × (count of that role)` eligible cards.
- `formationByName` resolves every shipped name, and throws on an unknown one rather than
  returning `undefined` — a silent `undefined` here becomes a crash far from the cause.
- **No test reads `FORMATIONS` by index any more**, asserted with a grep-style test so the
  dependency cannot creep back.
- The hard-ban formation-change case still pins a pair whose roles genuinely differ at the
  asserted slot, plus a second case over two of the new shapes.
- The chaos determinism tests are expected to stay green **unchanged**. If one does move,
  stop: it means something pins chaos output that this spec did not find.

## Out of scope

- The Draft Room — **TASK-1823**.
- Tactical styles as a picker — **TASK-1825**. The six values already exist from 1805; this
  ticket does not surface them.
- Per-formation engine behaviour. A formation is slots and roles; it does not modify the
  match engine. Any tactical effect belongs in the modifier stack (TASK-1803's rule).

## Decisions taken

Owner, 2026-08-12: the full categorised list ships as **its own ticket, before the Draft
Room**.

## No open questions
