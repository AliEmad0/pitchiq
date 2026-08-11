# TASK-1807 B — `/game/play`, the live match loop

**Date:** 2026-08-11
**Status:** design agreed, ready for planning
**Depends on:** TASK-1830 (the interruptible engine), TASK-1807 A (the draft hub)
**Followed by:** 1807 C (Draft Room, TASK-1823)

## Scope

B is the state controller that makes a match **playable rather than watchable**: it owns the generator, streams the match minute by minute, and stops for the coach's decisions.

**Split again.** B is two things that ship independently, so this spec is **B1 only**:

|        | Scope                                                                                                       |           |
| ------ | ----------------------------------------------------------------------------------------------------------- | --------- |
| **B1** | The live loop — the `events` snapshot, segmented playback, `DecisionPrompt` mounted, the `/game/play` route | this spec |
| **B2** | nuqs URL-sync for FSM state, IndexedDB auto-resume by replay                                                | next      |

B1 produces a match you can actually play. B2 makes it survive a refresh and a back button. Neither needs the other to be useful, and one spec covering both would bury the part that carries the real design risk.

## The problem, precisely

TASK-1830 made the engine interruptible, but **nothing drives it live**. `MatchView` takes a finished `MatchViewModel` and runs a minute cursor over `model.events` — every event already exists before the first frame renders.

The blocker is subtler than "wire it up": **`runMatch` yields only decisions, never events.** Events accumulate in the generator's internal `state.events` and are returned once, at the end. So a component driving the generator gets ~5 decision objects and then, eventually, the whole match — and has nothing to show in between.

## The fix, and why it is smaller than it looks

**`MatchDecision` gains `events: MatchEvent[]` — the match so far, at the moment the decision is raised.**

That single field turns the loop into something the existing playback can consume unchanged:

1. Run the generator to the first decision. This is fast — the whole 90 minutes simulates in under 100ms, so a segment is trivial.
2. Take `decision.events` and play them out on the clock, minute by minute, exactly as `MatchView` does today.
3. When the clock reaches the decision's minute, pause and open `DecisionPrompt`.
4. The coach answers; resume the generator to the next decision; append the new events; keep playing.
5. After the last decision the generator **returns** the final `MatchResult`, which carries the complete event list — so the tail after the final decision is covered without a special case.

The view therefore streams smoothly minute-by-minute while receiving the match in **segments**. It never waits on the engine, because the engine is always far ahead of the clock.

⚠️ **The snapshot must be a copy.** `state.events` is mutated in place for the rest of the match, so handing out the live array would let a rendered segment change under the view.

⚠️⚠️ **A snapshot legitimately runs AHEAD of its own minute, and only the clock protects the suspense.** `scoreGoal` pushes the VAR verdict at `minute + VAR_DECISION_DELAY` _before_ it yields the response decision at `minute` — so the snapshot at a goal already contains the verdict that chalks it off a minute later. Copying does not help here and never could; **the view must render only up to its own cursor.** Get this wrong and a goal is disallowed before the crowd has finished celebrating it, which destroys the exact drama `disallowedAt` was built to create. It is the one place where the streaming view can silently undo TASK-1822's headline feature.

⚠️ **Events are appended, not replaced.** Each decision's snapshot is cumulative, so the view must take only what is new (`slice(seen)`) or it will double-render every earlier event.

### Alternatives rejected

- **Yield events as well as decisions** (a `{kind:"event"} | {kind:"decision"}` union). Genuinely cleaner for streaming, and wrong to do now: it changes the generator's yield type, every consumer, and every one of the 1830 determinism tests. The snapshot buys the same behaviour for one optional field.
- **Re-run `simulate()` and diff.** Two runs, and the second is not guaranteed to match once decisions differ.
- **Let the view own a minute-by-minute engine step.** The engine has no per-minute entry point, and adding one re-opens everything 1830 deliberately closed.

## The state machine

`view/play-machine.ts`, a pure reducer. **`useReducer` plus context, not XState** (owner decision) — this is a five-state, mostly linear flow, and the existing `ChaosDraft`/`DraftHub` already use exactly this shape.

```ts
type PlayPhase =
  | "setup" // the draft hub from 1807 A
  | "preview" // VS screen: opponent, referee, weather
  | "live" // the match, streaming
  | "summary"; // scoreline, decisions taken, replay seed
```

The owner's architecture named five states; `DRAFT_SELECTION` is the round-based Draft Room, which is **C** — so B1 mounts the existing hub as `setup` and leaves the round-based path for later.

**`/game/draft` keeps working.** It stays a real route and mounts the same container pinned to `setup`. That preserves what A shipped, gives the setup step a deep link, and means the draft → match transition is a state change rather than a page load — which is the whole point of the owner's container model.

## Playback contract

`MatchView` is currently a renderer over a complete model. B1 needs it to render a **growing** one.

The smallest honest change: `MatchView` keeps taking a `MatchViewModel`, and the container rebuilds that model from the events it has so far. `buildMatchViewModel(home, away, result)` already takes a `MatchResult`, so the container can synthesise a partial result per segment.

⚠️ **`MatchViewModel.lastMinute` is derived from the events** (the Phase-6 fix). During a partial match that means the clock's end moves as segments arrive — correct for a live match, but it must not be mistaken for full-time. The container tracks completion explicitly rather than inferring it from the minute.

The pause mechanism already exists: goals and cards hold playback for ~2.5s. A decision is the same mechanism with an indefinite hold.

## What the coach sees

- **Preview** — opponent XI, referee style, weather, the tactical-style matchup edge. One decision lives here so the screen is not pure trivia: confirm or change your tactical style knowing the referee and conditions. (The six styles already exist from 1805; the picker itself is TASK-1825, so B1 shows the matchup and defers the control.)
- **Live** — the broadcast view, plus the persistent **Request Substitution** control built in 1830 and the `DecisionPrompt` that 1830 shipped and never mounted.
- **Summary** — final scoreline, the decisions taken and their minutes, and the seed. Records and sharing are TASK-1812.

## Testing

- **Snapshot correctness** — every decision's `events` is a prefix of the final event list, is cumulative, and is a copy (mutating it does not affect the result).
- **⚠️ Determinism unmoved** — the entire 1830 suite passes untouched. Adding an optional field must not change a single snapshot, and if one moves the field is not optional in practice.
- **Segmented playback equals batch** — driving the loop to completion and concatenating the segments yields exactly `simulate()`'s event list for the same seed with default answers. This is the assertion that proves streaming has not invented or dropped anything.
- **The clock pauses at a decision minute** and resumes only after an answer.
- **No double-render** — a container fed overlapping snapshots emits each event once. Deliberately tested, because the cumulative-snapshot shape makes this the likeliest defect.
- **The tail after the final decision is played** — a match whose last decision is at 70' still renders 71'–90'.
- **Route** — `/game/play` and `/game/draft` both build `●` in `en` and `ar`, and the `force-static` guard from A covers them.

## Out of scope

- nuqs URL-sync, IndexedDB resume — **B2**.
- The round-based Draft Room — **C** / TASK-1823.
- The tactical style picker (1825), chemistry (1824), post-match analytics (1815), records and seed-share (1812).

## Decisions taken

**The opponent is answered by `defaultAnswer`** (owner, 2026-08-11, confirming the recommendation). The engine raises `response`, `sub-offer`, `injury-sub` and `dismissal` for **both** sides; B1 prompts only for the home side and lets the away side behave exactly as it does today.

⚠️ **This is a filter on the driver, not a change to the engine.** Every decision the engine raises must still be answered — skipping one would hang the generator. The container answers away-side decisions immediately and silently, and only home-side decisions reach the UI.

If the opponent should ever visibly react — an AI that overloads when it concedes — that is a policy object swapped in at the driver, not a UI change, and it belongs with difficulty tuning rather than here.

## No open questions
