# TASK-1810 — Legacy match screens: approved designs

**Status:** designs AGREED with the owner, and **ALL FOUR SCREENS ARE NOW BUILT** — the club
sheet and the draft in #167, `?phase=preview` in #169, `?phase=live` in #170.

⛔ **One thing in here is still unsolved: the pitch mini-map player animation (§3.1).** Two
attempts were rejected and it needs its own design pass; `LivePitch` ships deliberately
static. ⏸ The 30-concept animation galleries remain **parked**.

✅ **§5.3 is now CLOSED** (owner, 2026-08-18): the clock keeps running, the Bench glows amber,
and after 20 seconds the engine executes its own recommendation — with a **"Manual subs
only"** toggle that bypasses the timer so the window expires with no change made. ⚠️ Note
that the shipped `fallbackFor` **declines** rather than executes, so auto-mode uses
`defaultAnswer`; and because a sub-offer is raised _every minute_ of the window, only a
genuine "change available" opens the amber window.

Each design was chosen through the owner's 30-concept gallery ritual and then iterated as a
playable prototype. The prototypes are the specification — build against them.

| Screen                | Design                                                                     | State             |
| --------------------- | -------------------------------------------------------------------------- | ----------------- |
| `/game/legacy`        | Concept 09 **Sticker Album** + motion 06 **Foil Sweep**                    | ✅ shipped (#167) |
| `/game/legacy/[club]` | **Centre-pitch draft**, landscape                                          | ✅ shipped (#167) |
| `?phase=preview`      | Hybrid of **12 Star Spotlight + 21 Programme Spread + 22 Chalk & Compare** | ✅ shipped (#169) |
| `?phase=live`         | Concept 02 **Split Feed**                                                  | ✅ shipped (#170) |

**Prototypes (the source of truth for layout and behaviour):**

- Pre-match — https://claude.ai/code/artifact/01cfa9f6-0a77-4e32-a5ce-b706b0203f96
- Live — https://claude.ai/code/artifact/58373674-910c-41e3-884c-866758f9935a
- Draft (already built) — https://claude.ai/code/artifact/bc2dce5b-ee81-4d57-be04-61dc3976568a

---

## 1. One theme across the whole flow

⚠️ The three chosen pre-match concepts each arrived with a **different palette** (neutral
cards, light newsprint, wood-framed green). The owner's instruction was explicit: one theme.
Everything now sits on the pitch-and-chalk token set the draft already uses.

```
--ground #0a0f0d   --panel #101714   --panel-2 #16201c   --rule #24332c
--chalk  #e8efe9   --chalk-dim #93a89b   --chalk-faint #63776b
--home   #f2d98a / --home-deep #b7892a      (YOUR side, always gold)
--away   #ff7d9b / --away-deep #a8324c      (THEIRS, always rose)
--cta    #35e0ff                            (reserved for the ONE action on a page)
--alert  #ffc63d                            (a waiting decision, a goal, the clock)
--turf-a #123a2a / --turf-b #0e3022         (mown stripes)
--ink-home / --ink-away / --ink-cta         (text ON each accent)
```

⛔ **Zero hard-coded colours** outside that block — verified programmatically on both
prototypes. The colour coding is consistent per section: your rating is gold in the
spotlight, in the comparison bars, in the teamsheet and on the pitch.

---

## 2. `?phase=preview` — the matchday programme

Top to bottom, one column, max ~980px:

1. **Masthead** — kicker, `HOME v AWAY` with a double rule, subline of shapes / squad
   averages / the decade span the XI is drawn from.
2. **Star Spotlight** — each side's best player, rating at ~68px, name, season, a tag
   ("Your talisman" / "Theirs"), with an accent hairline along the card's top edge.
3. **Tale of the Tape** — Overall / Attack / Midfield / Defence as **opposed bars**, gold
   left, rose right, computed from the XI's role groups.
4. **The teams** — both XIs **as cards**, three across, gold and rose, each carrying rating,
   position, season and a reserved portrait window. ⚠️ Owner change: this was a list; it is
   cards now. At this size the five attribute numbers are omitted deliberately.
5. **Conditions** — referee and weather, each with a line on what it _does_.
6. **Kick off** — ⚠️ **full width**, with a pulse that breathes a glow ring outward every
   2.4s plus a barely-there scale. It animates **box-shadow and transform ONLY** — the
   motion audit rejects `filter`, and a glowing button is exactly where you would reach for
   it by reflex.

---

## 3. `?phase=live` — the split feed

**Scoreboard** across the top: names, score, a beating clock, and **referee + weather chips
beneath a rule**.

**The split** — pitch left, commentary right, ⚠️ **stretched to the same row height**
(`align-items: stretch`, feed is a flex column with a scrolling body).

### 3.1 The pitch — ✅ NOW FULLY AGREED AND BUILT

**Agreed and ready to build:**

- **Both XIs** on one pitch: yours attacking right, theirs **mirrored** (`x` → `100 - x`).
  Positions come from each side's own formation slots.
- **Full markings**: touchlines, goal lines, both penalty areas, six-yard boxes, centre
  circle, and the three spots.
- **Captain armband** and **bookings** ride on the player's pip.
- The pitch **sets the row height** (see §3 above).

✅ **The player animation is AGREED AND BUILT (owner's architecture, 2026-08-18).**

The owner supplied the design after rejecting two attempts. It is implemented as
`domain/minimap.ts` (pure, seeded) plus `components/MiniMapCanvas.tsx` (Canvas 2D +
`requestAnimationFrame`).

- **Normalised pitch**, 105 × 68 m. Every actor carries `pos`, `target`, `vel` and a
  `state` (`idle` / `running` / `pressing` / `carrying` / `shooting` / `keeper`).
- **The loop never touches React state.** 23 moving objects through `useState` would
  re-render the subtree 60 times a second; the sim lives in a ref and paints straight to
  the canvas, so React re-runs only when the MINUTE changes.
- **Lerp smoothing**, `dt`-scaled — a 144 Hz screen must not run the match faster.
- **A virtual z-axis** for lofted passes and shots: `z(t) = 4h·t·(1−t)`, with a shadow
  left on the turf and the ball's dot scaled by height.
- **One-to-one marking**, assigned greedily by distance, each marker sitting goal-side of
  his man and LEADING him by his velocity. This is what makes the two sets of dots
  interleave; marking "the nearest attacker" independently let three defenders converge on
  one man and produced the two-blocks read that was rejected.
- **The nearest outfielder presses the carrier**, leading him and closing faster than a
  player holding shape. Aimed at where the carrier _is_, a presser trails him forever.
- **The penalty scene** clears all twenty other players outside the box, puts the ball on
  the spot and the keeper on his line.
- ⛔ **Seeded throughout.** `Math.random()` would break byte-for-byte replay, which is why
  the prototype's code was not ported.

⚠️ Two rules the build had to discover: a set-piece scene must OWN its targets (re-aiming
during a penalty drags everyone back into the box), and the map is keyed by **slot**, not
by player — built from the starting eleven, a substitute gets no dot and his side finishes
with ten.

Kept for the record, the two rejected attempts:

The owner reviewed two attempts and rejected both:

1. _Ambient possession_ — random passes between players. Rejected: unrelated to the match.
2. _Event-driven replay_ — each event makes its side attack, both teams shift into one half,
   the ball goes to the named player, a shot flies at the goal being attacked and a goal
   ticks the scoreline. **Closer, and the requirements below came from it, but the motion
   itself was still not right.**

His stated requirement, verbatim in substance: it should read like **the FIFA mini-map** —
the attacking team pressing and **mixing with** the defending team, **defenders blocking
attackers**, and everything **tied to the events**: to score, the home side must be in the
away half with the ball, and the shot hitting the away net is what records the goal.

⭐ The diagnosis in the second rejection was right: it needed **per-player movement with
marking and pressing, not a whole-team offset**. That is exactly what `aim()` now does.

⚠️ `domain/pitch-sim.ts` still backs the SHIPPED `MatchView` for the other packs. The
mini-map is a separate, richer model; the two are not merged, and neither uses
`Math.random`.

⛔ The `transform: translate()` rule no longer applies here — nothing is laid out by CSS.
The pitch, the markings, the dots and the ball are all painted to a canvas, so there are no
layout properties to animate.

### 3.2 Commentary — "the comments"

- Newest first, minute in its own column, **weighted by importance**: a goal gets an amber
  wash and heavier type; a half-chance recedes.
- ⛔ **Resolve through `commentaryArgs()`, not `ref.values`.** The catalog interpolates the
  DISPLAY args (`{homeScoreFmt}`, `{minuteFmt}`) which that bridge derives. Substituting the
  raw values leaves every scoreline as a bare dash — _"…buries it. –"_, _"Half-time: –"_.
  This actually shipped into a prototype and the owner caught it.
- The template also carries a trailing `({minuteFmt}')`. The feed prints the minute in its
  own column, so decide once whether to keep the suffix — do not render it twice.

### 3.3 Team sheets

Two ruled columns, gold and rose, each row `POS · name · rating`, with the caption carrying
formation, decade span and the captain. **Each player carries his own match on his row** —
the same event stream regrouped by _who_ rather than _when_. Rows with events lift slightly.
⚠️ A red card renders 🟥, not the yellow badge.

### 3.4 The substitution — a button and a popup

⛔ **Nothing sits on screen uninvited.** This was the owner's complaint about the shipped
`DecisionPrompt`, which appears unbidden and blocks the match.

- **Bench** is an ordinary control that is always present. When a change is available the
  _same_ button turns amber and reads "Change available". No new panel appears.
- Opening it gives a decision screen where every player is a **card**, not a list row.
- Choose one **off** and one **on**; **Confirm stays disabled until both are picked**.
- The engine's own recommendation is surfaced as a **SUGGESTED** flag, and the captain is
  flagged too.
- Closes three ways: Close, Not now, Escape.
- ⚠️ The prototype's popup is created on open and removed on dismiss. In the app, the
  decision still **pauses the generator** — the button is the affordance, not a way to
  ignore a decision the engine is waiting on. Resolve that: either the clock keeps running
  behind an unanswered decision, or the match visibly waits. **Not yet decided.**

### 3.5 Captains — owner requirement

- The armband goes to the player with the **most real captaincies** in `data/captains.json`
  (season → teamId → playerId; count per player). Next most is **vice**. With no record at
  all, fall back to rating.
- Measured on the sample XI: **Steven Gerrard 4 → captain, van Dijk 3 → vice.**
- Shown as a **C** badge on the pitch pip and beside the name on the sheet; **V** for vice.
- ⛔ **If the captain leaves the pitch — red card or substitution — the vice inherits the
  armband**, and the handover is written into the commentary.
- ⚠️ `captains.json` covers **20 seasons thinly** (1997 has 2 entries), so many clubs will
  have no recorded captain at all. The fallback is not an edge case.

---

## 4. Settled by the owner — do NOT re-raise

- **The same player may appear on both teams.** Legacy draws the opponent from the same
  club's history, so van Dijk 94 can face van Dijk 92. This is fine.
- **The squads may be uneven.** 87 v 67 is fine; the draft takes the best card in each hand
  while the opponent is generated another way.

---

## 5. Still open — in the owner's priority order

1. ✅ **The pitch mini-map animation (§3.1) — DONE.** The owner supplied the architecture
   and it is built; see §3.1.
2. ⏸ **The 30-concept animation galleries — PARKED by the owner (2026-08-18).** The draft,
   the pre-match and the live screen have not had a motion ritual and are **not to get one
   for now**. Only `/game/legacy` has one (Foil Sweep), and it shipped.
3. **§3.4's unanswered-decision question** — what the match does while a decision the engine
   is waiting on goes unanswered.
4. Both screens must ship with the CPU guards the rest of `/game/*` has: `force-static`,
   `dynamicParams = false` on dynamic segments, and the daily cache-guard probe.

⭐ **Everything else on these two screens is agreed and buildable as-is.** The layouts, the
theme, the cards, the commentary treatment, the team sheets, the captain rule and the
bench-button substitution are all settled — the open items above do not block starting.
