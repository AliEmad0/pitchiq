# TASK-1807 A — the `/game/draft` interactive hub

**Date:** 2026-08-11
**Status:** design agreed, ready for planning
**Depends on:** TASK-1801 (eligibility), TASK-1806 (chaos draft + pool), TASK-1830 (interruptible engine)
**Followed by:** 1807 B (`/game/play` state controller), 1807 C (Draft Room, TASK-1823)

## Scope

TASK-1807 as expanded covers three things that each produce working software on their own, so it is split. **This spec is A only:** the interactive draft hub, and the `/game/*` namespace it establishes.

Out of scope here, deliberately: the `/game/play` FSM and the `events` snapshot on `MatchDecision` (B), the round-based Draft Room (C), chemistry (1824), tactical style picker (1825).

## What it is

One screen that serves both paths (owner decision, 2026-08-11): start from an empty formation and fill it yourself, or hit **Auto-fill** and edit what you were dealt. Every slot stays editable either way.

Placement is **click-to-place with eligibility highlight** — no drag-and-drop library. Lighter, works on touch, works in RTL, and nothing to fight the motion audit.

Visual language is **Broadcast Teamsheet** (concept 01 of 30): a TV pre-match graphic — dark ground, cyan keylines, a lower-third pool strip — deliberately the same world as the shipped `MatchView`, so draft → match reads as one continuous broadcast rather than two apps.

Signature motion is **Grid Cascade** (21 of 30): the pool re-sorts in a staggered wave whenever eligibility changes, so **the pool is the feedback surface** rather than a banner or a toast.

## Route

`/game/draft`, under `[locale]`, `export const dynamic = "force-static"`, prerendered for `en` and `ar`.

**Nested under `/game/*`, never top-level.** Route-splitting keeping game cost off the encyclopedia routes is a locked architecture decision and the whole point of the M71 arc — `/hub`, `/market`, `/career` at the root would put game weight back on the encyclopedia's namespace.

`/game` and `/game/chaos` keep working untouched. `/game/chaos` becomes an entry point into the hub in C, not in this slice.

The card pool comes from the existing build-time `loadChaosPool()` (252 enriched cards across six seasons), so the page stays static and no new adapter is needed.

## State

A pure reducer in `view/draft-state.ts`. No React state machine library — `useReducer` plus context matches what is already shipped and adds nothing to the bundle.

```ts
interface DraftState {
  formation: Formation;
  /** By slot index. `null` = empty. Holds cardIds, not cards — one source of truth. */
  slots: (PlayerSeasonId | null)[];
  /** What the coach has picked up: a slot awaiting a card, or a card awaiting a slot. */
  selection: { kind: "slot"; index: number } | { kind: "card"; cardId: PlayerSeasonId } | null;
  seed: number;
}
```

Actions: `selectSlot`, `selectCard`, `place`, `clearSlot`, `setFormation`, `autoFill`, `reset`.

**Selection is bidirectional** — click a slot then a card, or a card then a slot. Both are common instincts and supporting only one reads as broken to whoever has the other.

**Placing a card already on the pitch moves it** rather than duplicating it. A card is a player-season; the same player cannot occupy two slots, and silently allowing it would produce an XI the engine cannot assemble.

## Eligibility and the hard ban

`canPlay(card, slot.role)` is the only rule — hard ban, no penalty tier.

- **Selecting a slot** dims every ineligible card in the pool and cascades the eligible ones to the front.
- **Selecting a card** highlights only the slots it can legally fill.
- An ineligible placement is **not offered**, so under normal use the ban is enforced by construction.

**⚠️ Validation is still required, and this is the case that makes it necessary:** changing formation after placing players re-roles the slots underneath them. Put a CB in slot 3 of a 4-4-2, switch to 3-5-2, and slot 3 is now a CM with a centre-back standing in it. That is the only way an illegal XI can arise through the UI, and it is easy to hit.

So `validateSquad(state, pool) → SquadError[]` returns `{ slotIndex, role, cardId, playerName }` per offence, and:

- **Play is blocked, not warned** — the button is disabled and the offending slots are marked.
- The error names **the player and the slot**, per the ticket.
- The same function gates auto-fill's output and any future save/lock.

**On a formation change, misplaced players are not silently dropped.** They stay in their slots, flagged. Dropping them would quietly discard the coach's work; blocking Play makes the problem visible and fixable.

## Auto-fill

**Not `chaosDraft` directly.** That function picks its own formation at random and drafts a whole XI plus bench, which is wrong on both counts here — the coach has already chosen a formation, and anything he has placed must survive.

So a new pure `fillGaps(pool, formation, slots, seed) → (PlayerSeasonId | null)[]` in `domain/`, sharing `chaosDraft`'s per-slot selection (eligible-first via `canPlay`, seeded pick, no player used twice):

1. It fills **only empty slots**, leaving anything already placed alone. Auto-fill is a helper, not a re-roll.
2. It takes the **currently chosen formation** as an argument rather than picking one.
3. Already-placed cards count as used, so it never duplicates a player the coach put there himself.

`chaosDraft` is then expressible as `fillGaps` over an empty slot array with a random formation, so the two do not drift apart. ⚠️ Refactoring `chaosDraft` onto `fillGaps` must not change its seeded output — `/game/chaos` prerenders from it, and its draft order is pinned by existing tests.

`Re-roll` clears and re-fills everything, and steps the seed via `randomSeed()` — the per-visitor entropy fix from PR #96, drawn after hydration.

⚠️ The route is `force-static`, so the **server render must not contain a squad**. PR #97's lesson: an XI in the prerendered HTML is served identically to everyone and then visibly swapped. The server renders the empty formation, which is the honest starting state here anyway.

## Grid Cascade

The pool re-sorts in a staggered wave as eligibility changes.

**⚠️ It must be FLIP, or transform-only in place.** The CI motion audit fails any `@keyframes` animating a layout property, and a genuine re-sort moves elements. So: measure positions before the change, apply the new order, then animate the delta with `transform` only. Keyframes live in `globals.css`, and the whole thing is gated on `prefersReducedMotion`.

Derived companions, all falling out of the same motion so the screen has one idea rather than six:

| Moment               | Motion                                                                        |
| -------------------- | ----------------------------------------------------------------------------- |
| Entry                | the cascade played once as the pool populates                                 |
| Placement            | the pool closes the gap behind the departing card                             |
| Rejection            | a stuttered half-step that reverses — the cascade refusing to admit           |
| Formation change     | **Formation Morph** (concept 29) — all eleven travel to new positions at once |
| Handoff to the match | the cascade in reverse                                                        |

Formation Morph is the one motion the cascade cannot cover, because it happens on the pitch rather than in the pool.

## Components

| File                               | Responsibility                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `view/draft-state.ts`              | The reducer, actions, and `validateSquad`. Pure, no React.                                            |
| `view/draft-eligibility.ts`        | `eligibleCards(pool, role)` / `eligibleSlots(formation, card)` — the two directions of the highlight. |
| `components/TacticalPitch.tsx`     | The formation as clickable slots. Broadcast styling, Formation Morph.                                 |
| `components/CardPool.tsx`          | The lower-third strip. Grid Cascade lives here.                                                       |
| `components/DraftHub.tsx`          | Client container: reducer, selection, auto-fill, validation, handoff.                                 |
| `app/[locale]/game/draft/page.tsx` | `force-static` route; loads the pool at build time.                                                   |

`TacticalPitch` and `CardPool` are presentational and take everything as props, so the reducer can be tested without rendering and the components can be tested without the engine.

## Handoff

**Play** assembles a `GameTeam` from the slots and hands off to the existing `MatchView`, exactly as `/game/chaos` does today. That keeps this slice end-to-end usable on its own.

B replaces that handoff with `/game/play`. Nothing here should assume it is permanent — the assembly step is a single function so B can redirect it.

## Testing

- **Reducer** — place, move, clear, formation change, bidirectional selection, auto-fill filling only gaps. Pure, no rendering.
- **⚠️ The formation-change offence** — place a legal XI, switch formation, assert `validateSquad` reports the now-misplaced players by name and slot, and that Play is blocked. This is the case the hard ban exists for; a test suite without it is testing a rule that cannot fire.
- **Eligibility both directions** — selecting a slot dims the right cards; selecting a card lights the right slots.
- **A player cannot occupy two slots** — place, then place the same card elsewhere, assert it moved rather than duplicated.
- **Auto-fill leaves placed players alone**, and its output passes validation.
- **Render** — the pool and pitch render, an ineligible card is not clickable for the selected slot, Play is disabled while an offence stands.
- **Route** — `/en/game/draft` and `/ar/game/draft` build as `●` prerendered, and the prerendered HTML contains **no** squad.
- Guards: no hardcoded strings (`.tsx` AST guard), en/ar catalogue parity, motion audit, `prefersReducedMotion` honoured.

## Known traps, carried forward

- `&apos;` fails the hardcoded-string guard (it contains the letters "apos"); a literal `'` fails `react/no-unescaped-entities`. Use `{"'"}`.
- Never import `@/features/game/adapter/*` into a client component — it is `server-only`.
- Drafted `GameTeam.players` is typed `GamePlayer[]` but is `EnrichedCard` at runtime; cast at the card-rendering boundary.
- Stat acronyms rendered from a const array as `{expr}` are guard-safe; real words must go through `t()`.
- Running `prettier --write` over the feature reformats pre-existing files — revert unrelated reformats to keep the diff focused.

## Open question

**Where does the bench come from?** The engine needs five substitutes (TASK-1822 Phase 4) and `chaosDraft` drafts them after the XI. This spec assumes auto-fill supplies the bench and the coach does not pick it manually, because a 16-slot manual draft is a much longer funnel and the owner's UX direction was to shorten it. If manual bench selection is wanted, it is a second pitch panel and belongs in C alongside the Draft Room.
