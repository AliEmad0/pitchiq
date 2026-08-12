# TASK-1823 — The Draft Room

**Date:** 2026-08-12
**Status:** design agreed, ready for planning
**Depends on:** TASK-1806, TASK-1807 A (the hub), TASK-1831 (the formation set)
**Is:** sub-project **C** of TASK-1807 — the last piece of that arc

## Scope

A slot-based entry into the draft hub. Eleven slots, five eligible candidates each, a
15-second clock on a slot you have not filled yet. It **hands off to** the builder; it
does not replace it (owner decision, 2026-08-11).

⚠️ **The ticket's original wording — "eleven rounds" in sequence — no longer describes
this.** The owner opened it up on 2026-08-12: any slot is clickable at any time, and a
filled slot can be reopened. "Round" survives only as the name for one visit to one slot.

## Where it lives

**Inside the hub's setup phase, not on a new route.** `DraftHub` gains an entry choice —
build it yourself, or open the room — and the room hands its completed XI into the hub's
existing draft state.

Rejected: a separate `/game/room` route. The XI would then have to cross a route boundary,
which means either serialising it through the IndexedDB layer B2 built (a persistence
mechanism used as a message bus) or lifting state above both routes. Keeping the room
inside the container that already owns the squad avoids inventing either. `/game/draft`
keeps working untouched, which is the constraint A shipped under.

## The deal is precomputed, in slot order

`domain/draft-room.ts` exposes `roomDeals(pool, formation, seed)` → eleven hands of five,
dealt **in formation-slot order** against one shared used-set.

Two consequences, both wanted:

1. **No player appears in two hands**, so a duplicate pick is impossible by construction.
2. **The order you visit slots cannot change what any slot offers.** The hands exist
   before you touch anything.

⚠️ **Point 2 is what lets free roam and seed-sharing coexist.** If hands were dealt lazily
as you opened slots, the five candidates for the left-back would depend on which slots you
had already visited — and a room would stop replaying from `(seed)` alone, breaking the
shareable-room requirement this ticket inherits from TASK-1812. Dealing up front in a
fixed order is the whole trick.

The hard ban is enforced **by construction**: every candidate in a slot's hand satisfies
`canPlay` for that slot, so unlike the hub there is nothing to validate afterwards.

⚠️ **If a role cannot supply five eligible cards, the hand is SHORT — never padded with
ineligible ones.** An illegal candidate must never be offered, and padding would smuggle
one in through the only path that has no validation behind it. With the current 252-card
pool this never triggers (TASK-1831 measured every slot of every shape against it), so it
is a guard rather than an expected case — and it needs a test with a deliberately starved
pool, since the real pool cannot reach it.

## Free roam and editing

Every slot on the chalkboard is clickable at any time (owner, 2026-08-12).

| | |
| --- | --- |
| **Open an unfilled slot** | A timed round. Pick one of five. |
| **Open a filled slot** | The **identical five**, your current pick marked, **untimed**. |

Re-opening deals the same hand because the hand is a property of the slot and the seed,
never of your history. A fresh deal per visit was rejected: it makes the room depend on
how many times you changed your mind, so `(seed)` would no longer reproduce it and sharing
would have to carry an edit log.

There is no forced order and no "next" button that overrides your choice. A default order
(keeper first, then out through the lines) is offered by highlighting the next unfilled
slot, but it is a suggestion, not a rail.

## The timer never reaches the domain

⚠️ The countdown is **view state only**. `Date.now()` inside anything the engine or the
deal reads would break the determinism rule locked for Phase 18 — the elapsed time
influences *which* card you pick, and the pick is the input; the clock is not.

A timeout takes the **highest-rated candidate** in the hand and records it as an ordinary
pick, so a lapsed clock is indistinguishable from a deliberate choice on replay. Same rule
that governs `DecisionPrompt`.

Per WCAG 2.2.1 the limit is adjustable and disableable, matching `DecisionPrompt`'s
`limit: number | null`. Editing a filled slot runs no timer at all.

## Completion

The room is complete when all eleven slots hold a card. It then hands the XI to the hub —
the same `onConfirm(players, formation)` seam A deliberately kept as one function — with
every slot still editable there. The room is an *entry path*, so finishing it must leave
the coach in the builder, not in a match.

## Look and motion

**Concept 09 "Tactics Blueprint"** (owner, 2026-08-12, chosen from the 30-concept gallery).
A chalk pitch on the left with the active slot circled; the round's candidates pinned
beside it. It was chosen because the pitch carries slot identity *and* overall progress at
once, so "why this slot now" never needs explaining — and with free roam it doubles as the
navigation surface.

**Animation 07 "Flip Reveal"** (owner, 2026-08-12, from the 30-animation gallery).
Candidates arrive face-down and turn over on the Y axis; rejected cards fold away on the X
axis. Accepting and discarding therefore read as opposites in the same physical language
rather than as two unrelated effects.

⚠️ **Motion-audit constraints, already checked against the gallery:** keyframes may animate
`transform`, `opacity` and `box-shadow` only — `filter` is rejected and animating `width`
fails. Both chosen effects are pure `transform` + `opacity`. Keyframes live in
`globals.css`, and the surface is `prefers-reduced-motion`-gated; the reduced view is the
static board with no entrance, which is concept 30 of the gallery.

## Testing

- **Deals are deterministic** from `(pool, formation, seed)`.
- **No player appears in two hands.**
- **Every candidate is eligible** for its slot — the hard ban, by construction.
- ⚠️ **Visiting order does not change any hand.** Open slots in several different orders
  and assert the hands are identical. This is the assertion that protects seed-sharing,
  and it must be verified to fail against a lazily-dealt implementation.
- **Re-opening a filled slot yields the identical five**, with the current pick marked.
- **A starved pool produces a short hand, never an ineligible candidate** — tested with a
  deliberately thin pool, because the real one cannot reach this branch.
- **Editing runs no timer.**
- **A timeout picks the highest-rated candidate** and is recorded as a normal pick.
- **Completion hands a full, valid XI to the hub** — eleven slots, every player eligible.
- The `force-static` route guard still covers `/game/draft`.

## Out of scope

- Bench selection. The room fills the XI; the bench still comes from the auto-drafted
  opponent side, as in A.
- Squad chemistry — **TASK-1824**.
- The tactical-style picker — **TASK-1825**.
- Persisting a half-finished room. B2's slot holds a **live match** only; a partly-drafted
  room is cheap to redo and storing it would widen that record's ownership.

## Decisions taken

Owner, 2026-08-11: the room **hands off to** the hub rather than replacing it.

Owner, 2026-08-12:
1. Concept **09 Tactics Blueprint**.
2. Animation **07 Flip Reveal**.
3. **Any slot is clickable** — free roam and re-editing, not a fixed round sequence.
4. Re-opening a filled slot deals **the same five, always**.
5. The timer runs on **new slots only**; editing is untimed.

## No open questions
