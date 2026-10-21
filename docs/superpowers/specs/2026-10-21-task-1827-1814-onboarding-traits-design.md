# TASK-1827 Onboarding · TASK-1814 Momentum and traits — design

Owner, 2026-10-21. Order: 1827 and 1814 first, then 1829 and 1818 ("1827 + 1814 first"). For
a first-time player: "jump straight into a quick, punchy 30-second rescue scenario (like turning
around a famous losing match). Once it's over, they should instantly understand the core hook:
PitchIQ isn't a tedious full-season sim, it's an exciting tactical game where your decisions
rewrite football history." The owner then said "go ahead and start building", so everything
below that the quote does not settle is **Claude's call**.

## TASK-1827 — the first run (`/game/start`)

**Three steps, nothing else (owner's shape; the details are Claude's call):**

1. A coach name and one of eight crests. Skippable.
2. The tutorial rescue.
3. The hook: what you just did, and where to do it again (What-If, the daily, the weekly ladder).

**The tutorial is a What-If, not a special code path.** The ticket asks for a normal run on a
hand-chosen seed. `TUTORIAL` is the scenario `2000-sou-liv`: Southampton 0–3 Liverpool at 64',
which really finished 3–3. It plays on the What-If boost.

- Claude's call: this is the scenario with the latest start, so only 26 minutes remain. At
  `TICK_MS` 280 that is about 30 seconds of play, the owner's figure.
- **The seed is fixed at 2400, chosen by measurement:** an Overload team talk wins it, and a
  Hold team talk loses it. The first decision a new coach makes visibly rewrites the result,
  which is the hook. Pinned by `onboarding.test.tsx`.

**Tips:** one line on the team-talk screen and one line above the live match. They cover the
team talk, the bench, the 20-second decision clock and the late momentum swing.

**First run:** `/game` shows a banner to a browser with no coach profile, linking to
`/game/start`. A returning coach is greeted by name and crest, with a "replay the first match"
link. Claude's call: no forced redirect, so a deep link is never hijacked.

**Storage:** IndexedDB **v7** `profile` (`me`). It is strictly local; accounts are TASK-1902.

## TASK-1814 — momentum and personality traits

**Traits are data-derived.** They are read off a card's own rating dimensions (`traitsOf`). There
is no hand-picked table, and the same card carries the same traits everywhere.

| Trait    | Who                              | What it does                                              |
| -------- | -------------------------------- | --------------------------------------------------------- |
| Talisman | outfield, overall ≥ 91           | Once per side: attack +7 while his side trails, after 70' |
| Rock     | keeper or defender, defence ≥ 85 | Up to 2: defence +4 each while his side leads, after 75'  |
| Engine   | outfield, physical ≥ 80          | Up to 2: attack +2.5 each after 60'                       |
| Hot-Head | outfield, discipline ≤ 15        | Up to 2: foul +8 and card +10 each, all match             |

Measured on the real pool, each trait is on 6–14% of cards.

**Late swing:** a goal from 75' onwards gives the scorers attack +6 for 5 minutes. The side that
conceded gets foul +10, card +6 and defence −4 for the same 5 minutes. A goal VAR disallows stops
counting at its verdict minute.

**One pure modifier, `personalityModifier`.** The engine itself is untouched.

- Measured over 800 matches: goals per match move under 2%, cards after 75' rise about 17%, and
  76% of matches play out differently.
- **Identity:** `RivalSetup.personality` and `SavedMatch.personality`. **Share code v5** is
  written only when traits played.
  - Absent means byte-identical, so every older save and link replays as it was played.
  - The daily turns traits on from **2026-10-22**, derived from the day.
  - Season fixtures and the ladder store results rather than replays, so they play with traits
    from now on.
  - Claude's call: What-If (and so the tutorial) and Classic stay without traits. What-If's
    difficulty band is pinned, and Classic is history.
- **The Personalities panel** shows on every pre-match screen of a match that plays with traits.

**Not in scope (Claude's call):**

- The "crisis prompt" (fatigued at 75', risk it or sub?) needs a new decision kind and a
  share-token head. It is left for its own ticket.
- Trait badges on `PlayerCard` are left for the owner's card-design gallery.

## Motion

None new. The standing rule is a 20-design gallery before any animation.
