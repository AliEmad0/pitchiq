# TASK-1828 Weekly Ladder · TASK-1826 Market Value · Mentality — design

Owner, 2026-10-21: "start on 1828 with 1826 and Mentality in one PR". The weekly ladder "should
feel like a cumulative, multi-day league tournament with real competitive depth — a true
marathon compared to the quick sprint of the daily challenge." The owner then skipped the
remaining questions ("go ahead and start building"), so every other decision below is
**Claude's call** and is marked as such.

## 1. Weekly Ladder (TASK-1828) — `/game/weekly`

**What it is.** One league tournament per ISO week (UTC, Monday–Sunday), identical for every
player: the same week's ruleset, the same deal, the same seven rival clubs, the same fixtures.
The coach drafts one XI on any day of the week and lives with it. Each day unlocks one more
matchday, so the week is a seven-match marathon in an eight-club single round robin.

- **Owner:** cumulative, multi-day, a league, a marathon against the daily's sprint.
- **Claude's calls:**
  - Eight clubs and seven matchdays. Matchday _n_ unlocks on ISO weekday _n_, so Monday opens
    matchday 1.
  - Missed matchdays can be caught up later the same week. They must be played in order.
  - When the week ends, any matchday not played is recorded as a 0–3 **no-show** loss. That
    is the same forfeit score the season already uses, and it is what makes coming back
    every day matter.
  - The rivals are seven real clubs, drawn from the week's seed. Each fields its best-available
    XI from its club history (`buildLeagueTeams`, policy `best`), which is exactly how a Legacy
    season league is built. Each club costs one static `/api/game/rivals/[club]` fetch.
  - The coach's deal is the daily's deal rules (`standout`, `onePerPlayer`) over the daily's
    pool, in the week's formation, on the week's seed.
  - Rival-versus-rival fixtures are simulated when the coach finishes his matchday. That whole
    matchday's results are **stored** (never re-derived), per the season rule on engine drift.
- **The week's ruleset** comes from a **frozen** list, chosen by `hash(weekKey) % length`
  (golden-pinned like `DAILY_SHAPES`). It applies to every ladder fixture as
  `MatchSetup.conditions`:
  - Monsoon Week: heavy rain.
  - Iron Ref Week: a strict referee.
  - VAR Week: three times the video reviews.
  - Big Freeze: snow.
  - Home Comforts: a crowd-influenced referee.
  - Gale Week: wind.
  - Open Week: no override.
- **Engine.** `MatchSetup.conditions` is absent everywhere else. The referee and weather draws
  still consume their random numbers when overridden, so the rest of the match keeps the same
  stream. Absent conditions mean byte-identical output, pinned by the existing goldens.
- **Clock.** `domain/weekly.ts` reads no clock. The view reads `new Date()` and passes the week
  key down, which is the ticket's "setup input, never read inside the engine". UTC getters only.
  A run is filed under the week it was drafted in and never changes week.
- **Personal bests (derived, never stored):**
  - weeks played
  - titles (finished first)
  - best finish
  - best points
  - the title streak in consecutive ISO weeks
- **Storage.** New IndexedDB store `weekly`, keyed by week (DB v6).
- **Trophy Room.** Each played fixture goes through `recordFullTime` with the key
  `l:<week>:<matchday>`. The 16 achievements stay frozen, so the ladder adds none.
- **Non-goals:**
  - A global leaderboard, which is TASK-1904 and needs a server.
  - A mid-match resume. A refresh restarts the fixture from kick-off, as it does in season play.

## 2. Market value (TASK-1826) — inside every Legacy-style season run and the ladder

- **Base.** Synthesised from the card's overall rating, `2.0 × 1.075^(OVR − 60)` £m, clamped
  to £0.5m–£40m. It is shown in tenths of a million and **labelled an in-game valuation**,
  never a real fee.
- **Movement.** Movement comes from in-run output only:
  - goals, assists and appearances
  - clean sheets, for keepers and defenders only
  - team results
  - time out of the side, which slowly erodes value
- **What is stored.** Per coach fixture, one compact line: who appeared, who scored, who
  assisted, goals conceded, and the result. It is captured once from the real events, live or
  simmed, at the moment the week is committed. Values and the trajectory are **derived** by
  folding those lines, so the formula can be retuned without rewriting a save. Old saves carry
  no lines and simply start flat.
- **Surface.** A "Squad valuation" panel shows the total, the change since the run began,
  sparkline bars per matchweek, and the top risers and fallers.
- **Non-goals:**
  - buying and selling (TASK-1906)
  - Classic and Survival runs (a different controller; deferred)

## 3. Mentality — on the Scout's Dossier

- Three stances: **Attacking**, **Balanced** (the default) and **Defensive**. Each is a pure
  modifier on the coach's side:
  - Attacking: attack up, defence down.
  - Defensive: the reverse.
  - Each is tuned by a real-engine sweep so that it changes goals for **and** against
    without dominating the win rate.
- It is match **identity**, like style:
  - `RivalSetup.mentality` and `SavedMatch.mentality`.
  - Share code **v4** = v3 plus one stance token. It is written only when a stance other than
    Balanced was picked, so v2 and v3 codes still decode unchanged.
  - Absent means no modifier, which is byte-identical.
- In the ladder the stance is picked per matchday on the hub. Season fixtures elsewhere keep
  playing without it.

## Motion

No new animations. The standing rule is a 20-design gallery before any animation, so these
surfaces reuse existing transitions only. A design gallery round can restyle them afterwards.
