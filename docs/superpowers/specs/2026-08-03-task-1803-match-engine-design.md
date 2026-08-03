# TASK-1803 — Deterministic Seeded Match Engine — Design

**Status:** Approved 2026-08-03 (owner). Scope = **lean vertical**; calibration = **season-authentic**.

## Goal

A pure, deterministic football match engine under `src/features/game/`: `simulate(setup) → MatchResult` runs a minute loop weighing team Attack vs Defense power (from TASK-1802 ratings), emitting a `MatchEvent[]` that is **byte-reproducible from `(setup, seed)`** and completes in **<100ms**. The engine is built as a **pure reducer over `MatchState` with a composable modifier stack** (the architecture locked on the board 2026-08-03), so later tickets add drama by pushing modifiers, not by changing the engine.

## Decisions locked

- **Lean vertical:** the reducer + modifier framework + baseline modifiers (team power, stamina decay, basic momentum) + core events (kickoff/goal/card/halftime/fulltime). Tactical counters (1805), rich momentum + traits (1814), injuries, and a deeper chance/shot tree are **out of scope** — they arrive as their own modifier tickets.
- **Season-authentic calibration:** total scoring is calibrated to a `targetGoalsPerMatch` passed in `setup`; the adapter derives it from that season's standings (`Σ goalsFor / Σ played` ≈ 2.6–2.8). Keeping it a setup input keeps the engine pure + deterministic. 2003 scores like 2003.
- **Determinism standing rule (phase-wide):** real-world date / daily values are `setup` inputs baked into the seed, never read inside the engine. mulberry32 PRNG is the sole entropy source.

## Data grounding (from exploration)

- **No PRNG exists** → build `mulberry32` fresh.
- Real per-minute timing is in **`data/events-<season>.json`** (loader `loadEvents(id, season)`), carrying goal **and** card minutes. The goal-minute histogram peaks at 45–50 and spikes again at 90+ (stoppage clustering) — the shape the minute curve targets. (The ticket's pointer to `fixture-extras-*` was wrong; that's attendance/venue only.)
- Real scoring rate ≈ **2.7 goals/match** (2.61 / 2.80 / 2.70 for 2000 / 2010 / 2020, from both standings and the event corpus).
- `MatchEventRaw` already exists in `@/data/schemas` (real-data input type). The engine's emitted type is `MatchEvent`, namespaced in the game domain — distinct module, no collision.

## Architecture

### Types (game domain, pure)

```ts
// domain/rng.ts
function mulberry32(seed: number): () => number; // [0,1), deterministic

// domain/match-types.ts
type Side = "home" | "away";
type MatchEventKind = "kickoff" | "goal" | "card" | "halftime" | "fulltime";
interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side;            // present for goal/card
  playerId?: number;      // scorer / booked player
  card?: "yellow" | "red";
}
interface TeamPower { attack: number; defense: number; aggression: number; } // 0–100
interface MinuteWeights { attack: number; defense: number; foul: number; card: number; }
interface SideState { power: TeamPower; score: number; stamina: number; momentum: number; }
interface MatchState { minute: number; home: SideState; away: SideState; events: MatchEvent[]; }

type Modifier = (ctx: { state: MatchState; side: Side }) => Partial<MinuteWeights>;

interface MatchSetup {
  home: GameTeam; away: GameTeam;
  seed: number;
  targetGoalsPerMatch: number;   // season-authentic, from adapter
  modifiers?: Modifier[];        // extra modifiers layered on top of the baseline set
}
interface MatchResult {
  score: { home: number; away: number };
  events: MatchEvent[];
  seed: number;
}
```

### Team power aggregation — `domain/team-power.ts`

`powerOf(team: GameTeam): TeamPower`. Over the XI's `PlayerRatings`, weighted by each player's role via `ROLE_WEIGHTS` (from 1802):
- `attack` = role-attack-weighted mean of players' `attack`/`creation` dims (forwards dominate).
- `defense` = role-defense-weighted mean of players' `defense`/`physical` dims (defenders/GK dominate).
- `aggression` = `100 − mean(discipline)`.
Players with `ratings === null` are skipped (guard). This is the `TeamPower` shape TASK-1805 later extends to the "record" opponent case.

### Modifier stack — `domain/modifiers.ts`

Each minute, for each side: base `MinuteWeights` derive from `TeamPower`; then the modifier list is folded in (`Partial<MinuteWeights>` deltas summed). Baseline modifiers shipped in 1803:
- **stamina** — attack/defense scaled by the side's `stamina` (decays over the match; late-game legs).
- **momentum** — recent-goal swing: scorer side's attack nudged up, conceding side's defense nudged down; decays toward 0.

`applyModifiers(base, ctx, modifiers) → MinuteWeights` is the pure fold. `setup.modifiers` are appended after the baseline set (1805/1814 inject here).

### Minute model — `domain/minute-model.ts`

- **Hazard curve** `minuteWeight(minute) → number`: a shape raising goal hazard toward each half's end (the 45+ and 90+ stoppage spikes from the real histogram). v1 is a simple parameterised curve, not a perfect histogram fit.
- **Goal probability** from a side's final attack weight vs the opponent's final defense weight, scaled by a global constant `K` so that expected total goals over 90 minutes ≈ `targetGoalsPerMatch`. `K` is derived from the target, not hardcoded.
- **Foul/card probability** from the foul/card weights × aggression.
- Scorer/booked selection: pick a player from the XI weighted by role (attack roles score; any role can be booked, defenders/physical roles slightly more).

### The loop — `domain/simulate.ts`

`simulate(setup) → MatchResult`: seed the RNG once; init `MatchState` (`powerOf` each side); for minute 1..90 (+ deterministic stoppage): decay stamina, compute per-side final weights (base + modifiers), roll chance→goal (update score, momentum, push `goal`), roll foul→card (push `card`); push `kickoff`/`halftime`/`fulltime` markers. Return `{ score, events, seed }`. Pure — same `(setup, seed)` → identical result.

### Adapter — `adapter/match.ts` (`server-only`)

- `loadSeasonGoalRate(season): Promise<number>` — `Σ goalsFor / Σ played` from `loadStandings(season)` (fallback ~2.7 if unavailable).
- A real-data smoke path for the integration test (rate a real squad via `loadRatedSquad`, wrap in a trivial formation + `makeGameTeam`, simulate). **Full real-XI assembly (pick + slot 11) is deferred to TASK-1806's draft** — 1803's engine consumes caller-provided `GameTeam`s.

## Testing

- `rng`: determinism (same seed → same sequence), range [0,1), different seeds diverge.
- `team-power`: a strong-attack XI → high `attack`; role weighting respected; null-ratings guard.
- `modifiers`: stamina reduces weights as it decays; momentum shifts after a goal; `applyModifiers` folds deltas.
- `minute-model`: aggregate expected rate ≈ target; late-half minutes carry higher hazard than mid-half.
- `simulate`: **determinism** (`toEqual` across two runs, same seed), divergence on different seed, plausible scorelines over many seeds (mean total goals ≈ target ± tolerance), well-formed events (kickoff first, fulltime last, goals sum to score), **`<100ms`** for a full match (`performance.now()`).
- `adapter/match`: `loadSeasonGoalRate` on committed standings returns ~2.6–2.8; the real-data smoke simulates without error.
- Engine unit tests use **inline synthetic `GameTeam`s** (I/O-free, stable); one adapter test hits committed data.

## Out of scope (explicit)

Tactical counters (1805), rich momentum/panic + personality traits (1814), injuries, chance/shot/save sub-events, in-match substitutions logic, live UI (1808/1809), commentary text (1804 — the engine emits structured events; text keys come later), full real-XI draft assembly (1806). Exact per-minute histogram matching is v1-tunable.
