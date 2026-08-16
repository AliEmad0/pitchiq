# TASK-1812 — share a match as a link, watch it back, take the card

**Date:** 2026-08-16
**Status:** design agreed, ready for planning
**Depends on:** TASK-1830 (the interruptible engine), TASK-1807 B2 (replay-by-tuple + IndexedDB)
**Blocked (deliberately out of scope):** the "persist runs/records" third — see [What stays open](#what-stays-open)

## Scope

TASK-1812 has three deliverables. This design covers **two**:

1. **Share + replay** — a finished match becomes a URL; opening it replays that match.
2. **The Canvas match-summary card** — a downloadable image of the result.

The third, **persisting runs and records**, is not designed here and is not built. A _run_ is
a season or Survival campaign, which TASK-1811 builds on top of TASK-1810 (both Backlog,
XL + L). There is nothing to persist yet, and scaffolding a run model to make the ticket
look closed would be inventing a schema for a feature whose shape is not decided.

The domain layer for (1) and (2) already exists on `feat/1812-share-replay` (`3d31813`,
rebased to `77356f1`): `domain/share-code.ts` and `domain/summary-card.ts`, 23 tests. This
design corrects two defects in it and specifies the wiring.

## 1. What a shared link means

**Owner decision: a link is "watch my match", not "beat my score".**

The receiver sees the exact 90 minutes the sender saw — the sender's decisions included.
The alternative reading (same XI, same seed, _your_ decisions) is the daily-challenge shape
and belongs to TASK-1817.

This has a consequence the branch missed. Since TASK-1830 a match is
`(setup, seed, decisions[])`, and `ShareableMatch` carries no decisions — its docstring
claims it mirrors `SavedMatch`, which carries `answers[]`. **As built, a shared code cannot
reproduce the sender's match the moment the coach makes one decision**, and the carried
fingerprint would mismatch on essentially every real match. The code must carry the
coach's answers.

## 2. Where a link points

`/game/draft?m=<code>` — and `/ar/game/draft?m=<code>`.

`/game/draft` is canonical since TASK-1832; `/game/play` is a permanent redirect to it.
⚠️ That redirect **forwards the incoming query** (Next offers no way to strip it — noted in
`next.config.ts` because it is the TASK-M71a bug's mechanism), which here is exactly what
is wanted: a `/game/play?m=…` link that escapes into the world keeps working.

The route stays `force-static`. `m` is read client-side by nuqs; nothing about sharing
touches the server, so the CDN behaviour the M71 arc bought is untouched.

## 3. Two defects in the shipped domain layer

### 3.1 ⛔ `KEY_RE` rejects every real formation

`share-code.ts` validates the formation with `KEY_RE = /^[a-z0-9-]{2,16}$/` and encodes
`formationKey(formation)` — which is `` `${name}/${slots.length}` ``, e.g.
`"4-3-2-1 Christmas Tree/11"`. Spaces, uppercase, a slash, 24 characters: **all 20 shipped
formations fail that regex.** `encodeMatch` throws on every real match; `decodeMatch`
rejects every real code.

The 23 tests pass because they hand-write `"4-4-2"`, a key no formation produces. A fixture
that cannot occur is what hid this.

**Fix:** the code carries a **slug of the formation NAME**, not `formationKey`:

```
slug("4-3-2-1 Christmas Tree") === "4-3-2-1-christmas-tree"
```

and the decoder resolves it by matching `slug(f.name)` across `FORMATIONS`. That keeps
CLAUDE.md's rule intact — the array's order stays presentation-only, no index is ever
encoded — and it reads legibly in a URL.

⚠️ **A guard test must assert the 20 slugs are unique.** Two names slugging to the same
value would restore a match into the wrong shape, which is precisely the hazard
`formationKey`'s own docstring exists to prevent.

### 3.2 The type name collides

`summary-card.ts` exports a type `MatchSummary`; `components/MatchSummary.tsx` exports a
component of that name. Both legal, both about to appear in the same files. The type
becomes **`SummaryCardData`**.

## 4. The code format

```
v1.<seed36>.<formationSlug>.<cards>.<tokens>.<fingerprint36>
```

Six fields. `v1` is unreleased — no link exists in the wild, so extending the format costs
nothing and needs no `v2`.

`cards` is unchanged: 11 `playerId@season` pairs as `<id36>-<season36>`, joined with `_`.

### Why `tokens`, not `answers[]` verbatim

The coach faces **~31 decisions per match**: `SUB_WINDOW` is 55'–85' and a `sub-offer` is
raised **every minute** of it for the coach's side, plus responses, injuries and
dismissals. Encoding each `DecisionAnswer` in full (minute, side, kind, off, on, reason)
runs the URL past 350 characters, nearly all of it repeated no-ops.

A token encodes only **what was chosen**. `minute`, `side` and `kind` are recoverable from
the replay itself: for a given `(setup, seed)` the engine raises the same decisions in the
same order, and `createStream` surfaces only the coach's, so the nth token answers the nth
coach decision. Nothing else needs storing.

### Grammar

Tokens are joined with `~`. Every character used is URL-unreserved (`A-Z a-z 0-9 - . _ ~`),
so no percent-encoding ever appears in a share link.

| Answer | Token |
| --- | --- |
| `sub-offer`, no change | `-` |
| `sub-offer`, no change ×n (n ≥ 2) | `-<n36>` |
| `sub-offer`, off chosen, engine picks replacement | `s<off36>` |
| `sub-offer`, off + on chosen | `s<off36>-<on36>` |
| `response` overload / stabilize / hold | `o` / `z` / `h` |
| `injury-sub`, engine picks replacement | `i` |
| `injury-sub`, on chosen | `i<on36>` |
| `dismissal`, no change | `d` |
| `dismissal`, off + on chosen | `d<off36>-<on36>` |

A typical match compresses to ~15 characters (`-f~o~-c~h~-8`) against ~210 verbatim.

⚠️ **`on` without `off` is not representable, and `encodeMatch` rejects it.** `SubAnswer`
allows both fields to be optional independently, but "bring a player on and take nobody
off" is not a substitution — `simulate` ignores such an answer. Making it unencodable
means a code can never carry an instruction the engine will silently drop.

### The property that matters more than the size

A token stream is **self-validating**. On decode, each token is applied to the decision the
engine is actually raising at that point, so a token whose kind disagrees with that
decision proves the code is stale, tampered with, or from a drifted build — and we can say
so **before** rendering anything. A verbatim `answers[]` cannot make that check: it would
be fed to the generator and quietly produce a different, plausible match.

### The rules the module already enforces, unchanged

1. ⛔ **A code is untrusted input.** It comes from a URL a stranger can edit. Every field
   validates; anything malformed returns `null` rather than throwing into a render or
   yielding a half-populated setup.
2. ⛔ **The version prefix fails closed.** An unknown version returns `null`. A future
   format silently decoding an old link into a _different but plausible_ match is worse
   than failing.
3. ⚠️ **The fingerprint is carried, never trusted.** The receiver replays independently and
   always renders their own replay. The fingerprint decides only whether to warn.

The 400-character cap stays and is now comfortable: ~11 (prefix, seed, fingerprint) + ~22
(slug) + ~90 (cards) + ~20 (tokens) ≈ 145.

## 5. One replay path, two answer sources

`storage/match-slot.ts` states the intent plainly: resume and share are deliberately **one
code path**, so each is exercised by the other's tests. Today `replayMatch` takes a fixed
`DecisionAnswer[]`, which a token stream is not.

`view/match-replay.ts` is refactored so the answers arrive through a **source**:

- **resume** passes an array-consumer — today's behaviour, byte-identical
- **share** passes a token-consumer, which materialises each answer from `(token, decision)`

`buildSession`, card resolution, formation lookup, event accumulation and fingerprinting
all stay single-sourced. One assembly path, as `match-session.ts` requires.

**The one deliberate difference becomes a parameter — drift handling:**

| | signal | on mismatch |
| --- | --- | --- |
| resume | `eventCount` then `fingerprint` | **discard.** A stale save is not the coach's problem; clear the slot, show a clean hub. |
| share | `fingerprint` only | **keep and warn.** Render our own replay; show a one-line banner. |

⚠️ A share code carries **no `eventCount`**. `SavedMatch` stores it as a cheap reject before
hashing and to separate a genuine collision from a match, but in a URL it is 2–3 characters
spent on a check the fingerprint already makes — and unlike a private IndexedDB record, a
code is adversarial input where a second derivable field is a second thing to disagree with
itself. The share path compares the hash and nothing else.

That asymmetry is the entire reason the fingerprint is "carried, not trusted". It must be
an explicit argument, not a branch on which caller we happen to be.

## 6. Arrival

`GamePlay` reads `m` with nuqs once on mount, in its own effect beside the existing resume
effect — not inside it.

The receiver's replay resolves to a **finished** match in under 100ms, so the wiring is
small: set `match` / `events` / `result` / `squad`, then dispatch the existing `resume`
action (`setup` → `live`). The current render already does the rest — `pending` is null
throughout, so `holdAt` falls to `undefined` and `MatchView` plays the full 90 with
commentary, clock and the 1x/2x/4x control, then the full-time button leads to the summary.

**No new phase, no new screen, no new route.**

Three rules:

- ⚠️ **A share link outranks a saved match.** If the visitor has their own match in
  progress, the resume dialog is suppressed while `?m=` is present, and **the match slot is
  never written**. Watching someone else's match must not overwrite your own.
- ⚠️ **A bad code is not an error screen.** `decodeMatch` returning `null` clears `?m=` and
  shows the ordinary hub. A stranger following a mangled link should land somewhere that
  works, not on a failure.
- ⚠️ **Drift warns, never substitutes.** A fingerprint mismatch shows a banner on the
  summary. The receiver still watches their own replay; the sender's is unreachable and
  must not be guessed at.

`?phase=` stays the write-only mirror B2 made it. `m` is read once and never written by the
phase machine, so the browser still does not become a second driver of phase.

## 7. The summary card

`domain/summary-card.ts` already decides **what** the card says — deliberately split from
the painting, because jsdom has no 2D context and anything computed inside a paint function
is untestable by construction. That split holds.

⛔ **`disallowedAt` is the trap, and it has already caught us once.** A VAR-chalked-off goal
**stays** in the event stream — the scoreboard counts it until the review lands, which is
where the drama lives — so a **final** summary filters on `disallowedAt == null`, exactly as
`match-types.ts` documents. Listing it prints a scorer for a goal that never stood.

New: `components/SummaryCard.tsx` paints `SummaryCardData` into a `<canvas>`, and a download
button does `toBlob` → object URL → `<a download>` with `summaryFilename`.

Two things the branch has not handled:

- ⚠️ **Paint after `document.fonts.ready`.** Canvas does not re-paint when a webfont
  arrives, so a first paint that races the font load bakes a fallback face into the image.
- ⚠️ **The card renders in the visitor's locale**, and Arabic must be verified rather than
  assumed. Canvas shapes Arabic through the platform text layout, but the digit convention
  has to match what the rest of the app uses (Eastern-Arabic numerals). Verify by
  rasterising, not by reading the source.

The share code is printed on the card, so a screenshot alone is replayable.

## 8. The 30-concept gallery

The card is the one artefact that **leaves the app and represents it elsewhere**, so it goes
through the same ritual as `PlayerCard`, the Broadcast Teamsheet and the Draft Room: **one
painter, thirty layouts**, every concept painting the same real finished match so the
comparison is of designs and not of data.

The card is text-only — no player photos — so for once the gallery can ship as a published
**Artifact** and be flipped through on any device without a dev server. (Photos are what
made previous galleries need the app: the artifact CSP blocks remote images.)

The gallery is throwaway and does not merge. The chosen layout is ported into the repo
painter.

## 9. Testing

**Domain (extends the branch's 23):**

- token round-trip for every answer kind; RLE boundaries (n = 1, 2, 35, 36)
- ⛔ a token whose kind disagrees with the raised decision is rejected
- version rejection, field-count rejection, tampered card ids, out-of-range seasons
- **the 20 formation slugs are unique** (§3.1) — the guard against restoring a wrong shape
- a real formation round-trips, using `FORMATIONS`, not a hand-written key. The defect in
  §3.1 existed because no test used a formation that ships.

**View:**

- a shared code replays to the sender's fingerprint
- a drifted pool **warns and keeps** its own replay (share) while the same drift
  **discards** (resume) — the asymmetry asserted directly, in both directions
- `?m=` suppresses the resume offer **and leaves the match slot untouched** — asserted by
  reading the slot after arrival, not by inspecting the dialog

**Component:** the card's download filename; the drift banner; the full-time flow from a
shared arrival.

**Unchanged guards:** `tests/unit/game-routes-static.test.ts` stays green — no route may go
dynamic.

⚠️ Per CLAUDE.md, a green suite is not evidence the code compiles (vitest does not
type-check) and not evidence that nothing changed. `pnpm type-check` and a real link opened
in a browser are both required before this is called done.

## What stays open

**TASK-1812 does not close with this work.** Its third deliverable — persisting runs and
records — remains blocked on TASK-1810 and TASK-1811.

⚠️ **`COLLECTION_SURFACES`' `records` entry stays `status: "planned"`.** It is the mode
gate's records strip and it points at this ticket; flipping it to `live` because "1812
shipped" would advertise a surface that does not exist.

## Risks

| Risk | Handling |
| --- | --- |
| Arabic text in canvas renders unshaped or with Western digits | Verified by rasterising in both locales before merge, not assumed |
| A future engine change silently invalidates every shared link | Intended: the fingerprint detects it and the receiver is warned. Links are not archival, and the design says so rather than pretending otherwise |
| The token stream drifts from `createStream`'s notion of a coach decision | The kind check (§4) turns that from a wrong match into a refused code |
