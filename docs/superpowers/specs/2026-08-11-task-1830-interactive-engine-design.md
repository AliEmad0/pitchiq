# TASK-1830 — Segmented interactive match engine

**Date:** 2026-08-11
**Status:** design agreed, ready for planning
**Blocks:** TASK-1807 (`/draft` hub + `/game/*` restructure)
**Depends on:** TASK-1822 (the dynamic match engine, complete)

## The problem

`simulate(setup)` runs all 90 minutes in one pass and returns a finished `MatchResult`. Every UI over it — `MatchView`, the pitch, the roster, the commentary feed — is a **renderer over a match that has already happened**, driven by a minute cursor.

The owner's player-journey spec (2026-08-11) requires two decisions to be made _by the coach, during the match_:

- **The response window.** Conceding opens a 15-minute window (`RESPONSE_WINDOW`). Today the engine automatically raises the conceding side's `momentum` by `RESPONSE_URGENCY`. The spec wants the coach to choose: _Aggressive Overload_ or _Defensive Stabilization_.
- **Substitutions.** Today the engine picks who comes off (`pickPlayerOff`) and who comes on (`pickPlayerOn`). The spec wants the coach to choose, including designating Super Subs.

Neither can exist over a pre-computed stream. If the whole match is simulated before the first prompt renders, the outcome is already fixed and the choice is theatre.

## What makes this safe

The two decision points sit on seams that consume **no PRNG rolls at all**:

- `pickPlayerOff(onPitch, bookedIds, gameState)` and `pickPlayerOn(bench, available, role)` in `domain/squad.ts` take no `rng` argument. They are deterministic selections over sorted candidates.
- The response-window effect in `scoreGoal` is three plain assignments to `momentum` and `respondingUntil`. No roll.

The rolls that _precede_ them — `rng() < subRate` deciding whether a substitution opportunity arises this minute, `resolveInjury(rng())` deciding severity, the injured-player pick — all stay exactly where they are and keep consuming exactly what they consume today.

So the engine keeps rolling **whether an opportunity occurs**, and the coach only chooses **what to do with it**. Substituting the coach's answer for the engine's changes zero rolls in either direction. This is the single property that makes the whole design tractable, and it is the thing to protect in review: the PRNG-discipline rule from TASK-1822 says every branch must consume the same rolls regardless of outcome, and here that holds for free.

## Approach

**A generator, not a state-machine rewrite.**

```ts
export function* runMatch(
  setup: MatchSetup,
): Generator<MatchDecision, MatchResult, DecisionAnswer>;
```

The existing 683-line `simulate` body becomes the generator body essentially unchanged. At a decision point it `yield`s a `MatchDecision` describing the choice; the caller resumes it with `.next(answer)`. Because a generator suspends its whole stack frame, **all the local state stays exactly where it is** — `rng`, `referee`, `weather`, `squads`, `benches`, the `substitute` closure, every rate constant. Nothing has to be lifted into a serializable blob.

### Alternatives rejected

- **Extract an explicit `EngineState` and a `stepMinute(state) → state` reducer.** The textbook answer, and wrong here. It means dismantling a function that shipped nine days ago across six phases with a large determinism-snapshot test suite, and re-threading roughly fifteen closure variables through an interface — all to gain serializability that the replay model (below) makes unnecessary.
- **Pre-compute every branch.** Two decisions per match with three-plus options each, compounding over the 90 minutes. Combinatorially dead.
- **Let the UI mutate the finished event list.** Produces a match whose narrative contradicts its own scoreline.

## The decision points

Four, all optional — an absent handler falls back to today's behaviour exactly.

| Decision       | Raised when                                   | Options                                                          | Engine effect                                |
| -------------- | --------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `response`     | This side concedes, at the goal's minute      | `overload` / `stabilize` / `hold`                                | Sets `momentum` + `respondingUntil`          |
| `substitution` | The coach requested one, at the next stoppage | `{ off, on }` from the legal sets, or `cancel`                   | Calls the existing `substitute()`            |
| `injury-sub`   | A moderate or severe injury forces a change   | `{ on }` from the bench (who comes off is decided by the injury) | Calls `substitute()` with `reason: "injury"` |
| `dismissal`    | This side loses a player to a red card        | `{ off, on }` to reshape, or `decline`                           | Optional `substitute()`; never forced        |

### When substitutions are raised (owner decision, 2026-08-11)

A modal that interrupts the match every time the engine fancies a change is the wrong feel. The trigger model is:

- **Normal substitutions are coach-initiated.** He clicks _Request Substitution_ at any point in the sub window. The prompt does not open immediately — it opens **at the next stoppage**, and playback pauses there. Making the change _or_ cancelling the prompt **spends the opportunity** (owner decision): the roll count stays fixed and the coach cannot re-open the prompt repeatedly to shop around.
- **Two events force a prompt automatically**, because in both the coach has no choice about facing the situation:
  1. **A moderate or severe injury** — the player cannot continue. ⚠️ Note this is _moderate and severe_, not severe alone: `InjurySeverity` is documented as "moderate and severe both force him off, the difference being how quickly and how it looks". A `knock` is treated and the player carries on, and must not prompt.
  2. **A dismissal** — a red card. See the caveat below.

**⚠️ A red card does not force a substitution, and the spec should not imply it does.** A dismissed player is not replaced; the side plays a man short. What the coach actually needs is a _tactical reset_ — usually sacrificing an attacker to restore shape, which is a normal substitution he may or may not want and may not have the budget for. So `dismissal` is a **prompt with a real decline**, it does not consume a requested-substitution opportunity, and it is still bound by `MAX_SUBS` and bench availability like any other change.

**⚠️ Recommend triggering `dismissal` on any red, not only a straight red.** The owner's wording says straight red. But a second yellow leaves the side in an identical position — ten men, shape broken — and `CardReason` already distinguishes `second-yellow`, `dogso`, `violent-conduct` and `altercation`, all of which end with a player walking. Prompting on a straight red but not a second yellow would read as a bug to anyone who has just gone down to ten. Flagged for the owner; built as "any dismissal" unless told otherwise.

### "The next stoppage" has to be defined, because the engine has no such concept

There is no ball-out-of-play event. `MatchEventKind` has no throw-in, goal kick or corner — the engine models consequential events only, so "the next stoppage" cannot be read literally off the stream.

Define `STOPPAGE_KINDS` as the existing events during which play is genuinely dead: `goal`, `card`, `penalty`, `freekick`, `injury`, `var`, `altercation`, `substitution`, `halftime`. At roughly 40 events per match these arrive often, but nothing _guarantees_ one within any given span.

So the request needs a bound: **if no stoppage occurs within `REQUEST_GRACE` minutes, the prompt opens anyway** at the end of that span. Without it a request can be silently swallowed for a quarter of an hour, which the coach experiences as a broken button. Halftime is always a stoppage, so the worst unbounded case is capped regardless; the grace period exists for the second half.

⚠️ **The `rng() < subRate` roll must stay exactly where it is and keep firing every minute of the window**, even though a coach-driven match ignores its result. It is what `DEFAULT_POLICY` uses to decide whether to make a change, and removing or gating it would shift every subsequent roll and break every determinism snapshot in the suite. The coach's request is an _independent input_ layered over an unchanged stream — the same discipline the set-piece rolls already follow ("rolled every minute for BOTH sides regardless of outcome, so the PRNG consumption pattern stays fixed").

The request itself is recorded in `decisions[]` as a `request-substitution` entry stamped with the minute it was made, so replay reproduces the timing exactly.

`response` is the interesting one, because it is the first place a coach's choice touches the weight stack rather than the roster:

- **`overload`** — the current behaviour, plus a little more: `momentum += RESPONSE_URGENCY`, but `defense` is weighted down for the window. Higher chance of scoring and of conceding again.
- **`stabilize`** — `momentum` is left flat and `defense` is weighted up for the window. Trades the comeback for control.
- **`hold`** — exactly today's numbers. This is the default and the fallback.

The `overload`/`stabilize` effects arrive as **`Modifier`s pushed onto `setup.modifiers`** for the duration of the window, not as new branches inside the minute loop. That is the seam TASK-1803 locked and TASK-1805 already used for tactical counters; using it again means the interactive layer adds no engine branches at all.

## Determinism and replay

The contract that everything else hangs on:

> A match is byte-reproducible from **`(setup, seed, decisions[])`**.

`decisions[]` is an ordered list of the answers given, each stamped with the minute and kind of the decision it answers, so a completed match carries its own replay input.

⚠️ **It does not go on `MatchResult`.** Adding a field to the type `simulate()` returns would break the determinism snapshots, which compare whole results with `toEqual` — and those snapshots are this refactor's only evidence that the engine still behaves as it did. The interactive driver returns a distinct `InteractiveMatchResult = MatchResult & { decisions: DecisionAnswer[] }`; `simulate()` keeps returning a bare `MatchResult`, byte-identical to today.

This extends rather than replaces the existing rule. Today `(setup, seed)` is sufficient because there are no free inputs; adding free inputs means recording them. `simulate(setup)` with no decisions is the special case where the list is empty.

**Replay** drives the generator with a recorded list instead of a live coach, answering each yield from the list in order. If the list runs out — a match abandoned midway — replay continues on the default policy, so a partial recording still produces a complete, valid match.

⚠️ **A decision list is only valid for the seed it was recorded against.** Changing the seed changes which minutes raise decisions, so answers would be applied to the wrong prompts. Replay must assert that each recorded answer's `(minute, kind)` matches the decision it is answering, and throw rather than silently mis-apply. This is the failure mode most likely to appear as "the shared link plays a different match".

## Resume by replay, not by snapshot

A generator cannot be serialized, so a mid-match refresh cannot snapshot the engine. It does not need to. Persisting `(setup, seed, decisions[])` to IndexedDB on every decision is enough: on reload, re-run the generator from minute 0, answer from the recorded list, and fast-forward the playback cursor to where the coach was. The run is deterministic, so the restored match is the same match down to the byte.

This is cheaper than snapshotting, smaller on disk, and it reuses the replay path — which means the resume path is exercised by every seed-share test rather than being its own untested branch.

## Timeouts

A live decision needs a time limit or the match stalls forever on a backgrounded tab.

**The clock must never reach the engine.** A wall-clock read inside the generator would break replay, and it is the same rule that governs the draft timer: a timeout **chooses a decision**, and that decision is the input. The engine is handed `hold` or `decline`; it has no idea a timer existed. Recorded and replayed, a timed-out decision is indistinguishable from a deliberate one, which is exactly right.

Per the WCAG 2.2.1 finding, the limit must be extendable and disableable, and it is a view-layer setting.

## Backwards compatibility — the gate

`simulate(setup)` **keeps its exact current signature and behaviour** and becomes a thin driver:

```ts
export function simulate(setup: MatchSetup): MatchResult {
  return drive(runMatch(setup), DEFAULT_POLICY);
}
```

`DEFAULT_POLICY` answers every decision the way the engine answers it today: `hold` for a response, and `pickPlayerOff`/`pickPlayerOn` for a substitution.

**The gate on this refactor is that the entire existing test suite passes untouched** — including the `toEqual` determinism snapshots and the match harness from TASK-1822. If a single snapshot moves, the extraction changed roll order and the refactor is wrong. No snapshot may be updated to accommodate this work; that would discard the only evidence that the engine still behaves as it did.

## UI contract — the minimal slice

Enough UI to make the loop real and testable, no more. Polish belongs to TASK-1807.

- `MatchView` playback stops when a decision arrives, the way it already holds for the ~2.5s commentary dwell on goals and cards. That pause mechanism exists; this reuses it.
- A `DecisionPrompt` component renders the options, the timer, and an explanation of what each choice does. All strings are ICU keys in `en.json`/`ar.json` — the hardcoded-string AST guard scans `.tsx`.
- A persistent **Request Substitution** control, enabled only inside the sub window and only while a change is actually available (bench not empty, `MAX_SUBS` not reached). Once pressed it shows a pending state — _at the next stoppage_ — so the delay reads as intentional rather than as an unresponsive button. This is the one piece of UI that has to exist for the coach-initiated model to be usable at all.
- Choosing resumes playback. The prompt is `role="dialog"` with focus moved into it, and the timer is announced politely rather than assertively so it does not interrupt the commentary feed.
- On a reduced-motion or paused-tab path, nothing auto-advances.

## Testing

- **Determinism unchanged** — the whole existing suite, untouched, is the primary gate.
- **Replay identity** — a match run with live answers and the same match replayed from its recorded `decisions[]` produce `toEqual` results. Run over a spread of seeds.
- **Decisions change outcomes** — `overload` and `stabilize` from the same seed and the same minute must produce measurably different distributions over many seeds. ⚠️ Assert on a distribution, not on one match: a single seed can easily give identical scorelines under both, and a test that passes on one seed proves nothing.
- **PRNG neutrality** — the roll count for a match is identical whether decisions are answered by the coach or by the default policy. This is the invariant that keeps replay honest, so it gets its own explicit test rather than being implied.
- **Mismatched replay throws** — a decision list recorded against one seed, replayed against another, fails loudly.
- **Empty-bench and exhausted-subs paths** — the prompt must not offer a substitution that `substitute()` will refuse; the legal sets are computed from the same state the engine uses.
- **A request opens at the next stoppage, not immediately** — request at a minute with no stoppage and assert the prompt arrives on the next `STOPPAGE_KINDS` event, not before.
- **The grace bound fires** — construct a run with a long stoppage-free stretch and assert the prompt opens at `REQUEST_GRACE` rather than being swallowed. ⚠️ Build the fixture so it genuinely has no stoppage in that span; a fixture that happens to contain one cannot express the defect, and would pass against code that ignores the bound entirely.
- **A spent opportunity cannot be re-requested** — cancel the prompt, then assert a second request in the same window is refused.
- **A knock does not prompt** — only `moderate` and `severe` raise `injury-sub`. This is the boundary most likely to be got wrong, since the owner's wording said "severe".
- **A dismissal prompt is declinable and does not force a change** — assert the side plays on a man short when declined, and that declining a `dismissal` leaves a normal substitution request still available.
- **Harness** — `tests/unit/game-match-harness.test.ts` re-run to confirm the results distribution has not moved. Per the TASK-1822 calibration rule, an interactive engine must not quietly change the goal rate.

## Out of scope

- The `/game/play` FSM, `/game/*` restructure, and the `/draft` hub — TASK-1807.
- Halftime team talks, formation changes mid-match, Super Sub designation — these are further decision kinds and slot into the same mechanism once it exists.
- Chemistry (TASK-1824) and tactical archetypes (TASK-1825) as engine inputs.
- Any persistence UI. This ticket writes `(setup, seed, decisions[])`; the run history around it is TASK-1812.

## Decisions taken

- **A spent opportunity is spent** (owner, 2026-08-11). Making the change or cancelling the prompt both consume it. Keeps the roll count fixed and stops the prompt being re-opened to shop around.
- **Normal substitutions are coach-initiated**, opening at the next stoppage; only a forcing injury or a dismissal auto-prompts (owner, 2026-08-11).

- **Any dismissal prompts, not only a straight red** (owner, 2026-08-11, confirming the recommendation). Playing with ten men demands an optional tactical reset regardless of the referee's booking sequence, and prompting for a straight red but not a second yellow would read as a bug to anyone who has just gone down to ten.

## No open questions

All three decisions above are settled and built. The one piece of scope this spec describes but does not deliver is the streaming match view, which moved to TASK-1807 with its design input recorded there — `MatchView` is a renderer over an already-finished `MatchViewModel`, and a `MatchDecision` does not yet carry the events so far.
