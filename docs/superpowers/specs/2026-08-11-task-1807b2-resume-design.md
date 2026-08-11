# TASK-1807 B2 — URL-sync and resume by replay

**Date:** 2026-08-11
**Status:** design agreed, ready for planning
**Depends on:** TASK-1807 B1 (the live loop), TASK-1830 (the interruptible engine)
**Followed by:** 1807 C (Draft Room, TASK-1823); TASK-1812 builds seed-sharing on this record

## Scope

B1 made a match playable. B2 makes one **survive a refresh**, and establishes the app's
first IndexedDB layer — which TASK-1812, 1813, 1816, 1817 and 1819 all inherit.

Two pieces:

1. **Resume by replay** — an in-progress match is stored as its replay tuple and offered
   back on return.
2. **URL-sync** — the play phase is mirrored into the query string.

## Why resume is replay, not a snapshot

The state that would need snapshotting is a **running generator**, and a generator cannot
be serialized. There is no way to freeze `runMatch` mid-match and thaw it later.

Replay is not a workaround for that — it is the shape TASK-1830 was built for. A match is
a pure function of `(setup, seed, decisions[])`, so re-running the tuple reproduces it
byte for byte, and the whole 90 minutes simulates in under 100ms. Resume therefore costs
nothing perceptible.

The strategic argument matters more than the cost: **replay is already the seed-share code
path** (TASK-1812). Building resume on it means resume gets exercised by every sharing
test and vice versa, rather than becoming its own branch that nobody runs.

## The record

```ts
interface SavedMatch {
  cardIds: PlayerSeasonId[];  // 11, ordered — the index IS the slot
  formationKey: string;       // resolved against FORMATIONS
  seed: number;
  answers: DecisionAnswer[];  // the coach's only
  fingerprint: number;        // FNV-1a over the events seen
  eventCount: number;
}
```

**Only the coach's answers are stored.** `createStream` answers the opponent's with
`defaultAnswer`, which is deterministic, so replaying the coach's answers in order
reproduces the opponent's too. Storing both would duplicate derivable state and invite the
two to disagree.

**No score, no minute, no timestamp.** Those are outputs of the replay, which has already
run by the time anything is shown — denormalising them would only create a second source
of truth that can go stale.

`eventCount` is not redundant with `fingerprint`: it is a cheap reject before any hashing,
and it distinguishes a genuine hash collision from a match.

⚠️ **`DecisionAnswer` must survive JSON.** It is plain data today; a test pins that for
every answer kind so a future variant carrying a function or a class fails loudly here
rather than silently truncating a stored match.

⚠️ **`formationKey`, not an index into `FORMATIONS`.** The hub picks formations by index
(`FORMATIONS[i]`), but an index is positional — reordering the array would silently
resurrect stored matches into the wrong shape. The key is meaningful. A test asserts the
keys are unique across `FORMATIONS`, since the lookup depends on it.

## Storage

Two small modules, no runtime dependency:

- **`storage/idb.ts`** — one database, one object store, promise-wrapped `get` / `put` /
  `del`. Raw IndexedDB is event-based and clumsy, but at this scope the clumsiness is
  contained in one small file that is fully tested. The `onupgradeneeded` handler is where
  1812's records and 1813's achievements add their own stores, so it creates stores
  idempotently by name rather than assuming a single fixed schema.
- **`storage/match-slot.ts`** — typed `saveMatch` / `loadMatch` / `clearMatch` over the
  single key `"current"`.

⚠️ **Every entry point guards `typeof indexedDB === "undefined"` and resolves null.** All
four `/game/*` routes are `force-static`; storage may only be touched after mount. This is
the same rule as the PR #96/#97 seed swap and it exists for the same reason — a
prerendered page is built in an environment with no browser storage, and reading it during
render either crashes the build or poisons the CDN copy with one visitor's state.

⚠️ **Writes are fire-and-forget and failure is swallowed.** Private browsing, a quota
error or a blocked upgrade must never interrupt a running match. A match that fails to
save is simply a match you cannot resume.

## Replay and verification

`view/match-replay.ts` rebuilds `{ home, away, seed }` from `(pool, record)`, feeds
`record.answers` through a fresh stream in order, and hashes the events produced.

`domain/hash.ts` takes `hashStr` out of `domain/commentary.ts`, where it is currently
module-private. Commentary's existing determinism tests guard the extraction — if the
function moves and the pooled phrasing changes, they fail.

### The stale-record problem

Resume replays a stored tuple against a **current** engine and a **current** card pool.
Both drift underneath it as a matter of routine: a data refresh (PR #121 was one), a
rating-model change, an engine calibration tweak. Any of those and the same
`(setup, seed, answers)` produces a **different match** — and it does so silently, which
is the failure mode this project has been bitten by repeatedly.

**The gate is a fingerprint, not a version constant.** On resume the replay must reproduce
the hash stored with the record. Match → resume is offered. Diverged → the slot is
discarded and you get a clean hub, with no error shown, because a stale save is not the
coach's problem.

A `POOL_VERSION` constant was rejected. It is cheaper and says *why* a record was dropped,
but it depends on somebody remembering to bump it — and a forgotten bump fails in exactly
the direction that hurts, offering a Resume that replays into a different match. The
fingerprint is self-maintaining: it catches any cause of drift, including causes nobody
anticipated, and requires no discipline.

## The resume gate — a dialog, not a fifth phase

The prerendered HTML contains the draft hub, always. After mount the record is read,
replayed and verified; if it survives, a **dialog opens over the hub** offering Resume or
Start over.

⚠️ **This deliberately avoids the PR #97 trap.** That fix existed because a prerendered
placeholder squad painted first and was then swapped for the visitor's real one, which
read as a bug. Nothing here is swapped: the hub is the honest default and stays put, and a
dialog arriving a beat later reads as intentional. Replacing the whole screen with a
restored match would repeat the mistake exactly.

`playReducer` gains one action — `{ type: "resume" }`, valid **only** from `setup` to
`live`. One narrow, explicit entry point keeps the ignore-by-default guarantee that caught
the dead preview button in B1.

Choosing Start over clears the slot before anything else happens, so a record that the
coach has rejected cannot be offered twice.

## The URL

`useQueryState("phase", …)` with `history: "replace"`, written on every transition and
**never read**.

⚠️ **Full push semantics were rejected.** Back/forward through all four phases would make
the browser a second, uncontrolled driver of the state machine: Forward into `live` would
have to re-enter a running generator, and Back from `summary` would have to reverse full
time. `playReducer` ignores out-of-phase transitions precisely so that no such path
exists, and the B1 dead-button catch is evidence that the guarantee earns its keep.

**Consequence, stated plainly: in B2 the URL is a write-only mirror.** It makes the current
phase legible in the address bar and gives TASK-1812 the parameter seed-sharing will be
built on, but it drives nothing. Making a `?phase=live` deep link skip the ask and resume
directly is a deliberate non-goal here — it partly reverses the ask-first decision below,
so it belongs with 1812's sharing work if it is wanted at all.

## Write points

Saved on kick-off and after every answer — roughly five writes per match. Cleared at full
time, and on `backToSetup` and `newMatch`.

The slot does not survive full time. Persisting results is TASK-1812's job (records plus
the canvas summary card), and duplicating it here would put two owners on the same data.
The accepted cost: refreshing on the summary screen loses the scoreline.

## Testing

- **Round trip** — play a match with several answers, save, replay, assert identical
  events and an identical fingerprint.
- **⚠️ Divergence is refused, and the test is verified to fail first.** Mutate a stored
  record (swap a card id) and assert resume is not offered. Per the rating-harness lesson,
  a gate is confirmed to fire against the thing it forbids before it is trusted — the
  degenerate TASK-1821 implementation passed twelve of thirteen assertions.
- **`DecisionAnswer` JSON round-trip** for every answer kind.
- **`formationKey` uniqueness** across `FORMATIONS`.
- **No flash** — the prerendered markup contains the hub and no resume dialog.
- **Storage** — the slot logic against an in-memory fake; the wrapper itself against a real
  `IDBFactory` via **`fake-indexeddb` as a devDependency**. A dev-only dependency is a fair
  trade for honestly testing the one file that touches the browser API; a runtime
  dependency on a public repo would not be.
- **Determinism snapshots unmoved.** B2 adds no engine surface, so a moved snapshot means
  something has leaked into the domain.
- The `force-static` guard from A already covers all four routes.

## Out of scope

- Records, seed-sharing, the canvas summary card — **TASK-1812**.
- The round-based Draft Room — **1807 C** / TASK-1823.
- Resuming a *finished* match, or a part-built draft.
- Any deep link that resumes without asking.

## Decisions taken

Owner, 2026-08-11:

1. **Ask before resuming.** A refresh mid-match offers a dialog rather than dropping the
   coach straight back in, and rather than replaying the match from kick-off on the clock.
2. **The slot holds a live match only**, cleared at full time.
3. **The URL mirrors, never pushes.** The reducer stays the single driver of phase.
4. **Divergence is caught by fingerprint**, not by a version stamp.
5. **The IndexedDB layer is a small in-repo wrapper**, not a runtime dependency.

## No open questions
