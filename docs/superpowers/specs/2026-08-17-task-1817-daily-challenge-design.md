# TASK-1817 — Daily seeded challenge (client-only)

**Date:** 2026-08-17
**Ticket:** [TASK-1817](../../../TASKS.md) · `P3` · `M` · Phase 18
**Depends on:** TASK-1806 (Chaos pool), TASK-1812 (share code, replay path, IndexedDB)

One deterministic challenge per day. The same formation, the same eleven hands and the
same opponent for everyone, derived client-side from the UTC date. One attempt per day,
local streaks and personal bests, a Wordle-shaped text share, and replay by seed URL.

**No global leaderboard.** Option A is 100% client-side; a leaderboard needs a backend and
stays in Phase 19.

---

## 1. Owner decisions

Taken 2026-08-17, before any code:

| # | Decision | Chosen |
| --- | --- | --- |
| D1 | The loop | **Daily Chaos Draft** — same pool, hands, opponent and match seed for everyone; you draft, then you coach |
| D2 | The score | **Result + goal difference** — the scoreline *is* the score; streak = consecutive days won |
| D3 | When the attempt is spent | **At kickoff, resumable** — re-draft freely, kickoff spends the day, a refresh resumes |
| D4 | The share text | **Result + a six-cell match-story strip** — encodes the drama, not the XI |
| D5 | The formation | **Fixed by the day** — forced by `roomDeals`, see §3 |

### Why D5 was not optional

`roomDeals(pool, formation, seed)` deals a hand **per formation slot**. If the coach chose
the shape, two coaches would be offered different cards and the day would stop being the
same challenge — the ticket's "the same match for everyone" would degrade to "the same
pool". The shape therefore comes from the day.

### Why the Draft Room, not the Draft Hub

`DraftHub` offers a formation picker, auto-fill, reroll and the entire `CardPool`. Every
one of those breaks a fixed daily challenge. `DraftRoom` is exactly the constrained
surface the mode needs, and its deal is already precomputed in slot order against one
shared used-set — so visit order cannot change what any slot offers, and no player can
appear in two hands.

---

## 2. Route and shell

`src/app/[locale]/game/daily/page.tsx` — `force-static`, `revalidate = 86400`,
`loadChaosPool()`, renders `<DailyChallenge pool={pool} />`.

⚠️ **The prerendered HTML must contain nothing day-specific.** The route is CDN-cached and
served identically to everyone for up to a day, so baking today's shape or seed into it
would serve a stale challenge tomorrow. The day resolves **after mount**, the same
discipline as `DraftHub`'s fixed `INITIAL_SEED` and Chaos's "entropy only arrives when the
coach asks for it". The shell renders the hero plus a skeleton; the day arrives on
hydration.

`domain/modes.ts` flips the `daily` entry to `href: "/game/daily"` and
`formats: { single: "live", season: "planned" }`. That is the whole gate change — the
roster is data and the gate never branches on a mode's identity.

---

## 3. `domain/daily.ts` — the day, pure

`domain/` may not read a clock, so **every function here takes the day as an argument**.
`Date` is read once, in `view/`, and passed down. This is the ticket's "a `setup` input,
never read inside the engine".

```ts
export const DAILY_EPOCH_UTC = "2026-08-17";   // day #1

dayKey(d: Date): string                 // UTC "YYYY-MM-DD"
dayNumber(key: string): number          // 1-based from the epoch, clamped to >= 1
daySeeds(key: string): { formation: number; deal: number; match: number }
dayFormation(key: string): Formation
```

`daySeeds` hashes the key with FNV-1a to a uint32, then XOR-splits it with three distinct
golden constants — the idiom `chaosMatchup` already uses (`seed ^ 0x9e3779b9`). Three
independent streams, one source of truth.

### ⚠️ `DAILY_SHAPES` — a frozen roster, not an index into `FORMATIONS`

The day's shape is drawn from an explicit, frozen list of formation **names** declared in
this file, resolved through `formationByName`.

Drawing from `FORMATIONS` directly would be wrong twice over. That array's order is
presentation-only and a guard test already forbids positional access; worse, **reordering
or extending it would silently rewrite every past day's challenge**, so a stored record
would replay into a different match than the one that was played. The roster is documented
**append-only, never reorder**, which pins each day's shape permanently.

`DAILY_SHAPES` starts as all twenty names in a fixed order.

---

## 4. The loop

```
mount → resolve day → read today's record
  │
  ├─ no record      → Draft Room (day's shape, day's hands)
  │                     └─ confirm → preview → KICKOFF ─┐
  │                                                      │ writes { done: false }
  │                                                      ▼  THE DAY IS SPENT
  ├─ record, !done  → resume by replay ────────────────► live
  │                                                      │
  └─ record, done   → result screen                      └─ full time → { done: true, score }
```

Kickoff is the commit point — `MatchupPreview`'s `onKickOff`, which is already the single
transition into `live`. Leaving before kickoff costs nothing; the Draft Room may be
re-entered and re-drafted freely.

Abandoning after kickoff leaves the day **unfinished, not lost and not a forced loss** — it
resumes exactly where it stopped, because the record holds the replay tuple.

---

## 5. Storage

`storage/idb.ts` gains `"daily"` in `STORES` and `DB_VERSION` → 2. The upgrade handler
already creates stores idempotently by name, so an existing database gains the store and
in-progress `match` records survive — that property was designed in for exactly this and
is worth an explicit test.

`idbGetAll<T>(store)` is added for the stats read.

`storage/daily-slot.ts`, one record per day keyed by `dayKey`:

```ts
interface DailyRecord {
  day: string;                  // "2026-08-17" — the key, stored too, so a read is self-describing
  cardIds: PlayerSeasonId[];
  answers: DecisionAnswer[];
  fingerprint: number;
  eventCount: number;
  done: boolean;
  score?: { home: number; away: number };
}
```

⚠️ **`seed` and `formationKey` are deliberately NOT stored** — both are derived from `day`.
Storing them would create a second source of truth that could disagree with the day.

Resume reuses the existing path rather than growing a second one: the record plus the
day-derived `seed` and `formationKey` compose the `SavedMatch` that `replayMatch` already
takes, so the daily inherits `replayWith`'s drift policy (**discard**, as resume does)
without a new replay branch.

If `DAILY_SHAPES` or the epoch ever changed, a stored record would replay against a
different shape and its **fingerprint would not match**, so it is discarded rather than
resumed into a different match — the TASK-1807 B2 rule, inherited for free.

Every operation swallows failure, matching `match-slot.ts`: a challenge that cannot be
saved is better than a thrown error at the 90th minute.

---

## 6. Stats — computed, never counted

`domain/daily-stats.ts`:

```ts
computeStats(records: DailyRecord[], todayKey: string): {
  played: number; won: number;
  currentStreak: number; bestStreak: number; bestMargin: number;
}
```

Derived from the record history on every read. There is **no stored counter**, so nothing
can drift out of sync with the history it summarises.

Streak rules, chosen to be one unambiguous sentence: a streak is consecutive **calendar
days won**. A loss breaks it, a draw breaks it, and an unplayed day breaks it. The current
streak counts back from today, or from yesterday when today is unplayed — so an
in-progress streak is not shown as zero before you have played.

---

## 7. The share

`domain/daily-share.ts`:

```ts
matchStrip(events: MatchEvent[], side: Side): string    // six cells
shareText(args): string
```

Six cells of 15 minutes: `0–15, 16–30, 31–45, 46–60, 61–75, 76–90`, with stoppage-time
goals folding into the last cell. Per cell: 🟩 only we scored, 🟥 only they did, 🟨 both,
⬜ neither.

⚠️ **A goal chalked off by VAR must not paint a 🟩.** The strip applies the same
`disallowedAt` rule as `scoreAt`, evaluated at full time. ⚠️ **Own goals carry `side` = the
side the goal counts FOR** and `playerId` undefined, so the strip reads `e.side` and needs
no special case — the shape TASK-1812 got wrong first time.

⚠️ Every number the user sees goes through `localizeDigits`; `Intl.NumberFormat("ar")`
returns Western digits.

```
PitchIQ Daily #1 · 4-2-3-1
3–1 ✅
⬜🟩⬜🟥🟩🟩
🔥 5   🏆 12
<url>
```

**Seed-URL replay reuses TASK-1812 unchanged.** "Watch my match" builds the existing `?m=`
code and links to `/game/draft`. No new URL scheme, no second codec.

---

## 8. Architecture — extracting `useMatchDriver`

`GamePlay` is 417 lines and owns the generator, events, answers, result, persistence,
share and resume. The daily needs all of that with a different seed source, a different
draft surface and a different record.

**Chosen: extract the match-driving glue into `useMatchDriver`** (in `view/`), holding
`streamRef`, `events`, `answers`, `pending`, `result`, `consume`, `answer` and `start`.

- `GamePlay` keeps H2H: `DraftHub`, the `match` slot, the share code.
- `DailyChallenge` is a second small container: `DraftRoom`, the `daily` record, the strip.

Rejected: branching inside `GamePlay` (grows an over-large component and gives it mode
knowledge the locked "modes are rule packs, not code paths" rule says it should not need);
and duplicating the driver (~150 lines, and resume and share drifting apart is precisely
the bug TASK-1812 collapsed into one path).

The extraction is behaviour-preserving. `GamePlay`'s existing tests are the control: they
must pass **untouched**, the same proof TASK-1812 used when `replayMatch` kept its
signature.

---

## 9. Testing

⛔ **Real data, real formations, real engine output.** Three defects in TASK-1812 hid
behind fixtures that could not occur — a regex that rejected all twenty real formation
keys while its test passed on a key no formation produces, a share code that carried no
coach decisions at all, and an own goal given a `playerId` real ones never have. Every
fixture here is built from `loadChaosPool` output and a genuinely simulated match.

- **Determinism** — a day key yields the same shape, hands, opponent and match across
  runs; two adjacent days differ. Assert against a *named* expected shape, not merely
  self-consistency: a relationship test stays green through a total change in output.
- **Roster stability** — appending to `DAILY_SHAPES` leaves earlier days' shapes unchanged.
- **Strip** — against a real simulated match, including a VAR-disallowed goal and an own
  goal. Both-scored → 🟨; a 90+ goal lands in cell six.
- **Stats** — a gap day breaks the streak; a draw breaks it; today-unplayed still shows
  yesterday's streak; `bestStreak` survives a later break.
- **The lock, verified by making it fail** — remove the kickoff write and exactly one test
  must go red. ⚠️ A guard can pass vacuously: TASK-1812's "never writes the slot" test
  passed with *and* without its guard. The assertion must exercise a state that only the
  guard prevents.
- **Store upgrade** — a database at version 1 holding a `match` record gains `daily` and
  keeps the match.
- **i18n** — both locales; Arabic verified by **counting Arabic codepoints**, never by
  grepping (next-intl serialises the whole catalog into every page, so a grep always
  finds the string).
- **`GamePlay`'s existing tests pass untouched** — the extraction's control.

Standing guards that need updating, both of which fail CI if missed:
`tests/unit/game-routes-static.test.ts` (the new route must declare `force-static`) and
`scripts/warm-e2e-routes.sh` (an uncompiled route blows the 12s E2E timeout on its own).

⚠️ New test files must **describe** the index anti-pattern in prose — the guard matches
source text, not an AST, and flags the pattern inside a comment.

⚠️ `pnpm type-check` must run: vitest does not type-check, so a dangling import survives a
fully green suite.

---

## 10. Out of scope

- **No global leaderboard** — needs a backend; Phase 19.
- **No past-day archive.** The per-day records make one possible later; it is not built.
- **No run model.** TASK-1812's remaining third stays blocked on TASK-1810 + 1811, and
  `COLLECTION_SURFACES.records` stays `planned`. Nothing here scaffolds it.
- **No new share codec.** Replay is TASK-1812's `?m=` code, unchanged.

---

## 11. Ticket status

TASK-1817 flips to ✅ Done when this ships — unlike TASK-1812, it has no blocked third.
Statuses are flipped as **part of** shipping, not deferred.
