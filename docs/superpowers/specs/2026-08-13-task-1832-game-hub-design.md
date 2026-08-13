# TASK-1832 — The game hub: `/game` as the mode-selection gate

**Date:** 2026-08-13
**Status:** design approved, ready for planning
**Owner decisions:** taken live in this session via the visual companion

---

## Problem

The game is unreachable.

Nothing in the app links to any `/game/*` route — not the header, not the footer, not the
mobile drawer, not the dashboard. The routes are also absent from `src/app/sitemap.ts`, so
they are not indexed either. The only place they are enumerated is
`scripts/warm-e2e-routes.sh`. **Every `/game/*` route today is reachable only by typing the
URL.**

Compounding it:

- **`/game` is a broadcast demo, not a hub.** It hard-codes Arsenal v Man Utd, season 2020,
  seed `20040515`, simulates the whole match at build time, and hands `MatchView` a finished
  model. It is a showcase with no way into the game.
- **`/game/draft` and `/game/play` are byte-identical.** Both render
  `<GamePlay pool={pool} initialPhase="setup" />`. Two URLs, one experience, no canonical.
- **The player has no idea the rest of the game exists.** Phase 18's roadmap defines twelve
  modes and three collection surfaces (eleven modes after the renames in D7). Two are
  playable. None of the roadmap is visible.

The owner's framing: _"I'm lost in the links and I don't know how to access the mode I need,
I want everything to be clear and visible to the user."_

---

## Decisions

Every decision below was taken explicitly. Where one contradicts an earlier assumption or a
standing process, that is called out — the point is that a later reader can tell a choice
from an oversight.

### D1 — Hub first, as its own spec

The hub and TASK-1812 (records + seed-share) share no code. The hub is routing, navigation
and a landing page; 1812 is an IndexedDB store, URL seed encoding and a canvas image export.
They get separate spec → plan → PR cycles. This spec is the hub only.

### D2 — 🧠 Tactical H2H **is** the existing draft loop, renamed

Today's `/game/draft` loop (draft → pre-match → live decisions → summary against
auto-generated "Rivals") becomes the mode called **Tactical H2H** — positioned as the
skill-first mode, opposite Chaos's randomness. **No new engine code.**

The name is chosen to survive Phase 19: when a backend, accounts and matchmaking exist, this
same mode expands to real human-vs-human play and private lounges. The tile does not have to
be renamed then.

### D3 — Locked modes are visible, not hidden

Unbuilt modes render greyed and non-interactive, labelled "In development". The player sees
the whole map of where the game is going and can never click something broken. This sets the
pattern for **every** future mode — Daily, Survival, Collection all arrive the same way.

### D4 — Layout: "Play now" then "Coming soon"

Playable modes get full-size tiles at the top. Everything else drops to compact locked chips
grouped by family below. Rejected: a flat grid of 13 equal tiles (buries the two live modes
in a field of grey) and grouped full-size rows (a long page whose first row is the only
actionable one).

### D5 — Format is a second axis: mode → then One Match or Full Season

After picking any mode the player picks a **format**. This matches the architecture already
locked in `TASKS.md` Phase 18: the season engine is **opponent-agnostic** and the active
mode's rule pack supplies the league (Chaos Season → 19 auto-drafted Chaos XIs; Classic
Season → real clubs plus real "ghost" results).

**On day one `season` is `planned` for every mode** — the 38-week engine is TASK-1810/1811,
still backlog. The format step therefore ships with one live choice and one locked choice.
This is deliberate: it builds the structure Season slots into rather than retrofitting it.

### D6 — The format step expands the tile in place

Clicking a live mode expands it on the gate to reveal the two formats. No new routes, the
other modes stay visible, and going back is one click.

Rejected: a page per mode (`/game/h2h`, `/game/captains`, …) — 13 routes and a page-load
between the player and the game, though it is the natural upgrade once locked modes have
rules worth explaining. Also rejected: a global format toggle above the grid — it inverts
the requested order and, with Season locked, would do nothing on day one.

### D7 — Renames forced by D5

Making format its own axis exposed two badly-named modes. "Classic Season → One Match" is
incoherent if the name already contains the format.

| Was            | Now                                                | Why                                                                                                         |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Classic Season | **Classic** (draft pack)                           | The pack drafts real clubs; the format decides length.                                                      |
| Survival Mode  | **Survival** — an _objective_ on the Season format | It is defined by "start near relegation, hit point targets", which is a season objective, not a draft rule. |

**Survival therefore leaves the mode grid entirely.** It belongs to TASK-1811 as a Season
objective.

### D8 — `/game` goes in the header as a sixth pill, visually distinct

`PRIMARY_NAV_HREFS` gains `/game`, rendered with an accent and sitting last so it reads as a
departure from the encyclopedia rather than another data page. `NAV_ITEMS` gains it too, so
the mobile drawer and footer inherit it for free. `sitemap.ts` gains `/game` with its `ar`
alternate.

Rejected: swapping it in for Compare (demotes a real encyclopedia feature) and folding it
into "More ▾" (one dropdown away from the invisibility we are fixing).

⚠️ Six pills plus "More ▾" is tighter than today's five. **Verify at ~1024px during
implementation.**

### D9 — Pre-match stays a **phase**, not a route

The owner asked for `/game/pre-match` as its own route. It is not being built as one.

The live session — the match generator, the seed, the drafted XI — lives in memory inside
`GamePlay`. Navigating to a different route drops it. Surviving that means lifting session
state into a provider in a shared `game/layout.tsx`, or serialising through IndexedDB and
rehydrating: real work, a client boundary above every game route, and **nothing visible in
return**. Pre-match is already a phase in `play-machine.ts` and the URL already mirrors it as
`?phase=preview`.

The **screen** is still upgraded in full (see Deliverable 4). If the real URL is wanted
later, the lift becomes its own ticket rather than a hidden cost inside this one.

### D10 — Build the base; skip the 30-concept ritual

The owner's standing process for a new surface is 30 concepts → owner picks → implement. It
is **deliberately skipped here.** The instruction was explicit: _"keep in your mind we will
change all of those designs later so we can build the base now."_

The gate ships plain and functional. Its redesign is a separate ticket. This is recorded so
nobody "restores" the ritual later thinking it was forgotten — and it is exactly why the gate
is designed to hold no data and no logic beyond the registry.

### D11 — No `?mode=` / `?format=` URL state

Tempting, since Season will need it, but nothing would read it today: each mode already has
its own route and Season does not exist. It would be a third write-only URL mirror beside
`?phase=`, and dead params are how a codebase starts lying about what it supports. The param
arrives when TASK-1811 gives Season somewhere to go — alongside TASK-1812's seed sharing,
which needs URL state anyway and will define the encoding.

---

## Route map

| Route         | Change                                         | Notes                                                 |
| ------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `/game`       | **Rewritten** — the mode gate                  | In nav + sitemap. Loads no data.                      |
| `/game/demo`  | **New** — today's `/game` body, moved verbatim | Arsenal v Man Utd broadcast. Unchanged behaviour.     |
| `/game/chaos` | Unchanged                                      | 🔥 Chaos Draft.                                       |
| `/game/draft` | **Canonical**                                  | 🧠 Tactical H2H — draft → pre-match → live → summary. |
| `/game/play`  | **Deleted → 308 redirect** to `/game/draft`    | Kills the duplicate without breaking a bookmark.      |

All four surviving routes keep `export const dynamic = "force-static"` and
`revalidate = 86400`.

**The redirect lives in `next.config.ts`, not a `page.tsx`.** A page that calls `redirect()`
is still a route that has to run; a config rule resolves before anything renders. It needs
both `/game/play` and `/:locale/game/play` — `localePrefix` is `"as-needed"`, so English is
bare and Arabic is `/ar/game/play`.

⚠️ **A Next redirect carries matched query params through.** Here that is wanted (`?phase=`
survives), but it is the same behaviour that caused a bug in TASK-M71a, so it is recorded as
intended rather than discovered.

---

## The mode registry

One pure-data table in `src/features/game/domain/modes.ts` drives the entire gate. This
honours Phase 18's locked rule that **modes are rule packs (data), not code paths** — the
gate never hardcodes a tile and never branches on a mode's identity.

```ts
// ModeId is the union of every id in the roster table below.
export type ModeId =
  | "h2h"
  | "chaos"
  | "captains"
  | "budget"
  | "chemistry"
  | "legacy"
  | "classic"
  | "daily"
  | "weekly"
  | "whatIf"
  | "mystery";
export type GameFormat = "single" | "season";
export type ModeStatus = "live" | "planned";
export type ModeGroup = "quickPlay" | "draftPacks" | "challenges";

export interface GameMode {
  id: ModeId;
  group: ModeGroup;
  emoji: string;
  /** i18n key under the `game` namespace — NEVER a literal. */
  nameKey: string;
  descriptionKey: string;
  /**
   * The mode's entry route — one route serves every live format, because the format does
   * not change where you land today (D11: no `?format=` param). `null` while every format
   * is `planned`. If a future mode ever needs a different route per format, this becomes
   * `Partial<Record<GameFormat, string>>` — but nothing needs that yet.
   */
  href: string | null;
  formats: Record<GameFormat, ModeStatus>;
  /** The ticket that makes this mode live. Documentation only. */
  ticket: string;
}
```

### Roster

| Group       | Mode              | Emoji | `single` | `season` | Route         | Ticket  |
| ----------- | ----------------- | ----- | -------- | -------- | ------------- | ------- |
| Quick play  | Tactical H2H      | 🧠    | live     | planned  | `/game/draft` | shipped |
| Quick play  | Chaos Draft       | 🔥    | live     | planned  | `/game/chaos` | shipped |
| Draft packs | Captain's Draft   | 👑    | planned  | planned  | —             | 1810    |
| Draft packs | Budget Cap Draft  | 💰    | planned  | planned  | —             | 1810    |
| Draft packs | Chemistry Draft   | 🔗    | planned  | planned  | —             | 1810    |
| Draft packs | Legacy Club       | 🏛️    | planned  | planned  | —             | 1810    |
| Draft packs | Classic           | 🎩    | planned  | planned  | —             | 1810    |
| Challenges  | Daily Challenge   | 📅    | planned  | planned  | —             | 1817    |
| Challenges  | Weekly Ladder     | 🗓️    | planned  | planned  | —             | 1828    |
| Challenges  | What-If Scenarios | ⏳    | planned  | planned  | —             | 1816    |
| Challenges  | Mystery Market    | 🎲    | planned  | planned  | —             | 1818    |

**Collection surfaces** are not modes and render in their own strip at the foot of the gate,
all `planned`: 📊 Records (1812), 🥇 Hall of Fame (1813), 🖼️ Sticker Album (1819).

**Survival is absent by design** — see D7. It is a Season objective under TASK-1811.

Shipping a mode later flips its format flag to `"live"` and sets `href`; the gate updates
itself with no component change.

---

## Deliverables

### 1. The registry and the gate

New files under `src/features/game/`:

| File                          | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `domain/modes.ts`             | The registry. Pure data, no imports, no entropy. |
| `components/ModeGate.tsx`     | Client. Renders groups; owns which tile is open. |
| `components/ModeTile.tsx`     | One tile — live (interactive) or locked (inert). |
| `components/FormatChoice.tsx` | The two format buttons inside an expanded tile.  |

`src/app/[locale]/game/page.tsx` is rewritten to render `<ModeGate />`. **It loads no data**,
so it never imports `adapter/*` and stays trivially static.

Open-tile state is a single `useState` in `ModeGate` — clicking a live tile opens it,
clicking the open one collapses it, clicking a locked one does nothing because a locked tile
is not a control. This does not warrant the reducer pattern used by `draft-state.ts` /
`room-state.ts` / `play-machine.ts`: there is one piece of state and no illegal transition to
guard against.

### 2. Navigation and discoverability

- `nav-items.ts`: `/game` added to `NAV_ITEMS` **and** `PRIMARY_NAV_HREFS`.
- `sitemap.ts`: `/game` added to `staticRoutes` with its `ar` alternate. Mode sub-routes stay
  out — they are app surfaces, not content.
- `scripts/warm-e2e-routes.sh`: `/game/demo` added, `/game/play` removed.

### 3. Route consolidation

- `/game/demo/page.tsx` created from today's `/game` body, verbatim.
- `/game/play/page.tsx` deleted; redirect added to `next.config.ts`.
- `tests/unit/game-routes-static.test.ts`: route list and comment updated (it currently names
  `/game/play`, which is about to stop existing).

### 4. The pre-match screen

`MatchupPreview` is upgraded in place — still the `preview` phase, no new route (D9):

- **Both XIs on side-by-side mini-pitches**, using the drafted formation for the home side
  and the generated opponent's shape for the away side.
- **Referee strictness profile** and **weather**, each with a plain-language line on what it
  does to your side — these already arrive as the first two events from `runMatch`, so the
  data is present and nothing new needs computing.
- Kick-off and Back behave exactly as they do today.

Plain treatment per D10; the visual design is deferred with the gate's.

---

## i18n

Roughly **40 keys × 2 locales** under the existing `game` namespace: a name and one-line
description per mode, four group labels, two format labels, the "In development" badge, the
gate's title and subtitle, and the pre-match additions.

- The registry stores **keys, never literals** — the CI AST guard rejects hardcoded strings
  in `features/game/`, and a literal here would ship English into the Arabic gate.
- Layout uses logical properties (`ms-`/`me-`, not `ml-`/`mr-`) so RTL mirrors for free.
- Emoji are locale-invariant.

---

## Constraints this design respects

Each of these has bitten this codebase before.

| Constraint                                                                                                                                                       | How the design respects it                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The expansion cannot animate height.** `tests/unit/motion-audit.test.ts` allowlists `transform` / `opacity` / `box-shadow`; animating a layout property fails. | The panel appears with no height transition. The format buttons fade and rise via `opacity` + `translate`, reduce-gated.                                                                  |
| **No `loading.tsx`.** TASK-M72 deleted all six — any `loading.tsx` above a segment commits a 200 before the page runs.                                           | None added. The gate loads no data, so there is nothing to wait for.                                                                                                                      |
| **`force-static` on every `/game/*` route.** Its absence caused the 2026-07 Vercel Active-CPU pause.                                                             | All four routes keep the directive; the guard test is updated, not weakened.                                                                                                              |
| **Never import `adapter/*` from a client component.**                                                                                                            | The gate imports nothing but `domain/modes.ts` and i18n.                                                                                                                                  |
| **Accessibility of inert tiles.**                                                                                                                                | Locked tiles are **not** disabled buttons — that would put eleven dead stops in the tab order. They are plain elements with a visible "In development" label: perceivable, not focusable. |

---

## Testing

**The registry is the thing worth guarding** — it is what will rot as modes unlock.

`tests/unit/game-modes.test.ts`:

- ids are unique;
- every format marked `live` belongs to a mode whose `href` is non-null;
- every `href` matches a route that exists under `src/app/[locale]/game/`;
- every `nameKey` / `descriptionKey` resolves in **both** `en` and `ar`;
- every group in the registry has a label key.

`tests/unit/mode-gate.test.tsx`:

- every group renders, and every mode in the registry appears exactly once;
- live tiles are buttons; **locked tiles are not focusable**;
- clicking a live tile reveals its formats; clicking it again collapses;
- the locked format is not a control.

Updated: `game-routes-static.test.ts` (route list), plus nav and sitemap assertions for
`/game`.

**E2E:** header → Game → Tactical H2H → One Match lands on `/game/draft`; `/game/play`
redirects. Specs import `test`/`expect` from `tests/e2e/_helpers/test.ts` — never from
`@playwright/test` — or the click is swallowed pre-hydration.

**Verification rule:** every new guard is proved by **making it fail first**. A green suite
is not evidence that anything changed — going from 4 to 20 formations changed what every seed
drafts and not one determinism test noticed. `pnpm type-check` is run before any completion
claim; vitest does not type-check.

---

## Out of scope

| Item                                                      | Where it goes                                              |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| The 30-concept design ritual for the gate                 | Its own ticket, after the base lands (D10)                 |
| TASK-1812 — records, seed-share URLs, canvas summary card | The next spec                                              |
| The Season engine and Survival as an objective            | TASK-1810 / TASK-1811                                      |
| Every locked mode's actual rules                          | Their own tickets                                          |
| `/game/pre-match` as a real route                         | Deferred; needs session lifting (D9)                       |
| Per-mode landing pages (`/game/h2h` …)                    | Revisit when locked modes have rules worth explaining (D6) |

---

## Risks

1. **Six nav pills may not fit at ~1024px.** Verify early; the fallback is D8's option B
   (swap Compare into "More ▾").
2. **The gate advertises 11 unbuilt modes.** Mitigated by D3's explicit "In development"
   labelling, but if the roadmap slips, a wall of permanent grey becomes its own problem.
   Worth revisiting if a year passes with nothing unlocked.
3. **`/game/demo` has no inbound link** once it leaves `/game`. Deliberate — it is a
   showcase, not a mode — but it means the broadcast view is now unreachable from the UI. If
   that is unwanted, the cheapest fix is a small link in the gate's footer strip.
