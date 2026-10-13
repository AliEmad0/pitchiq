# TASK-1815 — Post-match report: xG timeline + retro newspaper headline

**Status:** design approved in chat (owner, 2026-10-13) · **Ticket:** `TASKS.md` TASK-1815 · P3 · M

## Intent

Every match ends with its own front page: a retro newspaper **headline** that tells the
match's dramatic arc, and an **xG timeline** that shows how the chances built up minute by
minute. It is for the coach who just played — a payoff moment at the final whistle that
explains _why_ the result happened ("we were robbed: 2.4 xG to 0.9").

**Owner decisions (2026-10-13):**

- **Placement:** every full-time screen — `MatchSummary` (every drafted mode + season
  fixtures) **and** the daily challenge's result screen. Not the PNG share card.
- **xG source:** **estimated from what each event already records**, via a frozen table in
  `domain/`. The engine is not touched.

**Success criteria**

1. Every full-time screen shows a headline + standfirst and an xG timeline.
2. A replay of the same match (resume, share link, daily record) prints the **same**
   headline and the same timeline.
3. No saved match, share code or daily record changes or breaks.
4. No new route, server read or Vercel meter movement (owner's standing rule: never move
   cost onto another meter).

## Approach (chosen)

**Derive everything at full time from the match's `MatchEvent[]`.** Nothing is stored,
nothing is added to the engine. Rejected alternatives:

- _Store analytics with the save_ — another field every rebuild path must remember (the
  defect class that shipped twice: `opponent`, `budget`), and old saves would have none.
- _Headline as a final commentary line_ — buried in the feed; no front-page moment.

## Design

### 1. `domain/match-xg.ts` — the estimate (pure, frozen)

Each shot-bearing event gets ONE value from a frozen table. Counting rules matter because
the engine emits a set piece as its own event **and** a separate `goal`:

| Event                                           | xG                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `penalty` (any `penaltyOutcome`)                | 0.76                                                                                                |
| `freekick` (any `freeKickOutcome`)              | 0.06                                                                                                |
| `goal` with `source: "open"`, by `goalStyle`    | tap-in 0.55 · counter 0.30 · header 0.18 · chip 0.15 · volley 0.12 · trivela 0.05 · long-range 0.04 |
| `goal` with `source: "open"` and no `goalStyle` | 0.30                                                                                                |
| `goal` with `source` `penalty` / `freekick`     | 0 — the shot was counted on its set-piece event                                                     |
| `goal` with `source: "own-goal"`                | 0 — nobody took a shot                                                                              |
| `chance` by `outcome`                           | post 0.20 · crossbar 0.20 · saved 0.12 · wide 0.06 · blocked 0.05                                   |
| everything else                                 | not a shot                                                                                          |

- A goal later **disallowed by VAR keeps its xG** — the chance was real, and that is how
  real-world xG treats it.
- Each shot also gets a **danger band** for the timeline markers: `low` < 0.10 ≤ `medium`
  < 0.30 ≤ `high`.
- Output: `ShotXg[]` (`minute`, `side`, `xg`, `band`, `goal: boolean`, `disallowed: boolean`)
  and `xgTotals: { home, away }`, plus a cumulative step series per side.
- Values are carried in **integer hundredths** internally so totals do not drift with float
  addition (the Budget Cap integer-tenths lesson); formatted to one decimal for display.
- ⛔ **The table is FROZEN** and pinned by a golden test — the `DAILY_SHAPES` rule. Editing a
  value silently changes the report for every match ever played or shared.

### 2. `domain/match-headline.ts` — the arc

`headlineFor(result, ctx)` returns `{ key, values }` (a message reference, the TASK-1804
commentary convention) plus a standfirst reference. It is pure, deterministic and written
from the **coach's** side (`ctx.coachSide`, normally `home`; season fixtures can be `away`).

Arcs are tested in priority order; the first that matches wins:

1. **Comeback** — the coach trailed by 2+ and finished level or ahead.
2. **Late winner** — the decisive goal (the one that took the winner ahead for good) came at 85'+.
3. **Robbed** — the coach lost while out-xG-ing the opponent by ≥ 1.0.
4. **Smash-and-grab** — the coach won while out-xG'd by ≥ 1.0.
5. **Rout** — a winning margin of 4+ (either direction; the wording follows who won).
6. **Hat-trick hero** — a player scored 3+ (given, not disallowed).
7. **Red-card drama** — a red card and the shorthanded side still drew or won.
8. **VAR heartbreak** — a goal was disallowed and the match was decided by one goal or drawn.
9. **Bore draw** — 0–0.
10. **Thriller** — 5+ goals.
11. **Fallback** — by result: win / draw / loss.

- Scores and goal counts use **given goals only** (`disallowedAt == null`) — the same rule as
  `view/score.ts`.
- Each arc has **2–3 wordings**; the variant is `hashStr(\`${seed}:${arc}\`) % pool`, so a
  replay reprints the same headline.
- **Values:** coach team name, opponent name, score, hero name, minute, xG figures. Names are
  resolved from starters **and** bench (the `commentary.ts#nameOf` rule — a substitute can
  score).
- **Standfirst:** scorers per side with counts ("Smith 2, Jones") and "xG 2.4–0.9".

### 3. Messages

- New `game.report.*` keys in **both** `en` and `ar` catalogs (Arabic is parked, but the
  catalog-parity tests require both and the ticket asks for both).
- ICU plurals where counts appear; every number shown through `localizeDigits` (⛔
  `Intl.NumberFormat("ar")` returns Western digits in the browser).
- Headlines are **retro tabloid** in tone, never mocking a nationality or a real person
  beyond the football (standing content boundary).

### 4. `components/PostMatchReport.tsx` — the UI

- Props: `result: MatchResult`, `home`/`away` teams (or their names + rosters), `coachSide`,
  `locale`.
- A newspaper block (masthead, headline, standfirst) above an **SVG xG timeline**: two
  cumulative step lines over 0–90(+added), goal markers, shot dots sized by danger band,
  half-time divider. Hand-drawn SVG, **not recharts** — light on a static page and needs no
  `ResponsiveContainer` mock.
- `dir="ltr"` on the chart (a timeline is not text — the pitch rule), while the newspaper
  text follows the locale.
- **The visual treatment is chosen through the owner's rituals before it is built:** a
  **30-concept gallery** for the layout, then the **20-design animation gallery** (live
  animation, desktop + mobile frames side by side, era + light/dark toggles). Motion is
  `transform`/`opacity` only and `prefers-reduced-motion`-gated (motion audit).

### 5. Placement

- `MatchSummary` renders `<PostMatchReport>` — covers every drafted mode (`GamePlay`) and
  season fixtures (`SeasonFixturePlay`). `MatchSummary` gains the props it needs (the result
  and the two teams); callers already hold them at full time.
- `DailyChallenge` renders it inside `daily-result`.
- Season results stored in the table carry **no events**, so the report appears only at the
  final whistle, never when browsing a past week. This is correct, not a gap.

### 6. Cost and safety

- Pure client computation over data already in memory at full time: no route, no fetch, no
  storage write, no engine change. Every `/game/*` route stays `force-static`.
- Saves, share codes and daily records are untouched — the report is derived from the replay
  every path already produces.

## Testing

- **Golden xG table** — every row above pinned; a sabotage (edit one value) must fail.
- **Counting** — a penalty that scores counts 0.76 once, not 0.76 + the goal; an own goal
  counts 0; a disallowed goal keeps its xG; totals equal the sum of shots.
- **Each arc** — a hand-built event fixture per arc, plus a priority test (a comeback that is
  also a late winner reads as the comeback).
- **Reachability** — sweep real engine seeds and assert every arc fires at least once, so no
  arc is dead copy.
- **Determinism** — same `(result, seed)` → same key, variant and values.
- **Coach side** — the same match read from `away` flips win/loss arcs.
- **Key parity** — every key `headlineFor` can return resolves in en **and** ar.
- **Component** — renders headline + chart; digits localized under `ar`; chart is `dir="ltr"`.
- **E2E** — the report appears on a finished `/game/draft` match and on the daily result.
- `pnpm type-check` before claiming done (Vitest does not type-check).

## Out of scope

- The PNG share card (owner chose screens only).
- Storing the report, or showing it for past season weeks.
- Changing the engine or making xG drive outcomes.
