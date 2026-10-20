# TASK-1816 — What-If Scenarios: step into a real Premier League collapse and rewrite it

**Status:** design written 2026-10-20 for owner review · **Ticket:** `TASKS.md` TASK-1816 · P3 · M
**Owner decisions (2026-10-20):** **rescues only** (no "hold" seat); a **team talk at the
start whistle** (substitutions + a response the moment the scenario begins); a **1-in-4
success target**, with a What-If-only **boost** allowed to reach it. Every other decision the
owner did not state is marked **(my call)**.

## Intent

The archive holds hundreds of real matches where a side was two or three goals down and came
back — Spurs 3–5 Man United (3–0 at half-time, 2001), Newcastle 4–4 Arsenal (0–4 after 26
minutes, 2011), Crystal Palace 3–3 Liverpool ("Crystanbul", 2014), West Brom 5–5 Man United
(Ferguson's last match, 2013). The mode drops the coach into **the exact moment of the
deficit** — that minute, that score, that club's real squad from that season — and asks him
to do what the real team did, or better. Every scenario ends on the post-match report
(TASK-1815), so a successful rescue gets its own front page ("ROVERS RISE FROM THE DEAD").

It is for the player who knows the history and wants to feel it: the scenario is real, the
starting state is real, only the next 60 minutes are his.

## Goals

1. A **What-If** mode, live on the `/game` gate (the registry entry `whatIf` already exists,
   ⏳, accent `#2dd4bf`; flipping it to live is a data change).
2. A **curated list of scenarios** drawn from real matches, each starting at the real minute
   and score of the biggest deficit, with the trailing side's real club-season squad.
3. The coach plays out the remaining minutes on the shared engine with the normal coaching
   controls (substitutions, responses), under that season's real substitution rules.
4. A clear **verdict** against history: _Rewrote history_ (did better than the real side),
   _Matched history_ (same outcome), _History repeated_ (did worse).
5. **Rescues only (owner):** the coach always takes the side that was behind. The "hold"
   seat (the side that was ahead) is out of scope for this ticket.
6. A **best result per scenario**, kept locally, so the list shows which ones you have
   rewritten.

## Non-goals

- **No Champions League or cup matches.** The ticket's own example (Istanbul 2005) is a
  Champions League final; the app covers the Premier League only. The first scenario list
  is Premier League only.
- No custom "build your own scenario" editor (pick any match, any minute) in this ticket.
- No global leaderboard or server-side record (the same rule as the daily: client-only).
- No change to how other modes play. The engine extension below is inert when unused.

## Anti-goals (would be a failure even if it technically works)

- **Inventing history.** A scenario must never start from a minute, score or deficit that
  did not happen. Every scenario is derived from the committed events and checked against
  the committed final score; a match whose goals do not add up to its score is excluded.
- **A rescue that is free or impossible.** If the engine makes every 0–3 at half-time a
  routine win, or never once lets it happen, the mode is broken however correct the code is.
  Difficulty must be **measured** against real engine output before shipping.
- **Moving cost onto a Vercel meter.** No new request-time route, no `revalidate`, no fetch
  from a request-time path. Every `/game/*` route stays `force-static`.
- **Breaking determinism or old matches.** A scenario replays byte-for-byte from its seed and
  decisions; every existing mode, save, share code and daily record is untouched.

## Constraints (from the project rules)

- `domain/` stays pure (no I/O, no `Math.random`/`Date.now`); `adapter/` is the only raw-JSON
  boundary and is server-only.
- Every `/game/*` route `force-static`, `revalidate = false`.
- Strings in both `en` and `ar` catalogs (Arabic is parked, but catalog parity is enforced),
  numbers through `localizeDigits`.
- The owner's rituals: the mode's screens come from a **30-concept gallery** and their motion
  from a **20-design animation gallery** (desktop + mobile frames, era + light/dark), both as
  HTML files, before the UI is built.
- Merge only when CI **and** E2E are green.

## The how — decided

### Scenarios are DATA, frozen, generated at build time from the archive (my call)

- A scenario is `{ id, fixtureId, season, side: "home" | "away",
startMinute, startScore: { home, away }, history: { home, away } }`.
- `startMinute` is the minute of the goal that created the **largest deficit** in the real
  match; play starts at the next minute with that score.
- The list is **curated**: a frozen set of ~12–20 scenarios chosen for fame and spread across
  eras, plus a frozen golden test (the `DAILY_SHAPES` rule) — changing the list's ids or
  start states would silently change what old records mean. Starting set (from the archive
  scan, all with score-consistent events): Spurs 3–5 Man United (2001), Newcastle 4–4
  Arsenal (2011), Crystal Palace 3–3 Liverpool (2014), West Brom 5–5 Man United (2013),
  Bournemouth 4–3 Luton (2024), Norwich 4–4 Middlesbrough (2005), Liverpool 3–3 Man United
  (1994), Southampton 3–3 Liverpool (2000), Chelsea 3–3 Man United (2012), West Ham 3–4
  Wimbledon (1998). The builder may add or drop entries after measuring them, but each must
  pass the derivation check below.
- **The derivation check (a test):** for every scenario, re-deriving `startMinute`,
  `startScore` and `history` from the committed `events-<season>.json` and
  `fixtures-<season>.json` must reproduce the frozen values exactly.

### The engine learns to start part-way through (the one engine change)

- `MatchSetup` gains an optional `startState?: { minute: number; score: { home: number;
away: number }; sentOff?: { home: number; away: number }; subsUsed?: { home: number; away:
number } }`.
- When absent the engine is **byte-identical** to today — pinned by a test that replays a
  sweep of existing seeds and compares fingerprints before and after.
- When present, the minute loop begins at `startState.minute + 1`, the score starts at the
  given values, and the side states carry the given dismissals and substitutions already used.
  Decisions and events are only produced for the remaining minutes.
- Real red cards and real substitutions **before** the start minute are applied (a scenario
  that starts after a real sending-off starts a man down) — derived from the events, never
  invented.

### The team talk at the start whistle (owner)

- The scenario opens on a **team-talk decision** before play resumes: the coach may make
  substitutions (within that season's rules, counting real substitutions already made before
  the start minute) and choose a response (overload / stabilize / hold, the existing
  `response` choices). This is a decision the engine raises at `startState.minute`, outside
  the normal 55'–85' substitution window, and it travels in the decision stream like every
  other answer so replays stay byte-exact.
- After it, the normal coaching windows apply for the rest of the match.

### Difficulty: a 1-in-4 target, with a What-If-only boost (owner)

- **Target:** roughly **1 in 4** rescues succeed (draw or better) over a few hundred engine
  runs per scenario with the default coaching answer at the team talk. Acceptable band per
  scenario **15–35% (my call)**; a scenario outside it after tuning is dropped from the list.
- **The boost** is a What-If-only `Modifier` passed through `MatchSetup.modifiers`, never a
  change to the baseline engine, so no other mode moves. Its shape is the builder's choice
  (e.g. a trailing-side attacking lift that grows with the deficit, akin to the existing
  late-desperation modifier), but it is **one** boost with **one** fitted constant, applied
  to every scenario alike — not a per-scenario fudge — and the fitted value is pinned by a
  test alongside the measured rates.
- The measurement harness is part of the work: it prints, per scenario, the success rate with
  and without the boost, and the shipped list is the scenarios that land in the band.

### Squads (my call)

- Both sides field the **real club-season squad** from the existing prerendered
  `/api/game/classic/[season]` data (no new route). The starting XI is the **real starting
  XI** from `lineups-<season>.json` where every name maps onto that club-season's squad, else
  `classicLineup`'s best legal XI for that squad. Which one was used is visible on the
  pre-match screen ("Real line-up" / "Best available").
- The opponent plays the same way: real XI where it maps, else best available.
- The season's real substitution rules apply (the Classic `substitutions` policy, by date).

### Verdict and record

- Outcome is judged from the coach's (trailing) side by comparing **(result, then goal
  difference)** against the real match: `win > draw > loss` first, and within the same
  result a better goal difference is better **(my call)**. _Rewrote_ if better than history,
  _Matched_ if equal on both, _Repeated_ if worse. So a seat whose real side already won
  (Man United at Spurs, 3–5) is rewritten by winning by more — every scenario can be
  rewritten. "Best score" in the local record is ranked the same way.
- The best verdict per scenario is stored locally (the existing `features/game/storage`
  IndexedDB, a new small store; builder decides the version bump). Only `(scenarioId, best
verdict, best score)`, never the match itself.
- The full-time screen is the shared `MatchSummary` with the post-match report, plus a verdict
  banner. The headline arcs already cover comebacks from the coach's side.

### Routes

- `/game/whatif` — `force-static`: the scenario list (small, baked into the page).
- The match itself runs client-side after fetching the scenario's season from the existing
  `/api/game/classic/[season]`. **The builder must measure that file's size** for the seasons
  in the list; if a season's file is too heavy for a single match (owner's rule of thumb from
  TASK-1810: measure before shipping, bound the payload), add a per-scenario prerendered JSON
  carrying only the two squads instead.
- Share links and resume follow the existing replay-tuple rules if they come for free; they
  are not a goal of this ticket (my call).

## The how — left to the builder

- Exact scenario list after measuring each one's difficulty.
- How the start-state is threaded through `runMatch` internally, as long as the inertness
  test holds.
- The IndexedDB version bump and store shape.
- The layout and motion — from the owner's galleries.

## Success, measured

1. `/game/whatif` lists the scenarios; each opens on the team talk at its real minute and
   score with real squads; the match plays to full time and shows the verdict and the
   post-match report.
2. The derivation test proves every scenario's start state matches the archive.
3. The engine inertness test proves no existing match changed.
4. **Difficulty is measured and recorded**: for each scenario, the rescue success rate over a
   few hundred engine runs (with and without the boost); every shipped scenario sits in the
   15–35% band around the owner's 1-in-4 target.
5. CI and E2E green; no new request-time route; type-check clean.
