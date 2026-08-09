# TASK-M68 — Player market value: design

**Date:** 2026-07-27
**Ticket:** `TASK-M68` (public board: schema + loader + UI · pipeline board: the builder)
**Status:** design approved by the owner, ready for an implementation plan

---

## 1. Owner sign-off (the ticket's gate)

Both boards gated M68 on an **explicit owner sign-off**, because Transfermarkt market values are TM's
proprietary editorial product — more clearly "theirs" than the TM photos (TASK-M28d) or the M56 role
labels. **Sign-off given 2026-07-27: build and ship publicly**, on the same third-party stance already
accepted for photos and roles. This section is the record; no further gate remains.

## 2. Source, verified

A Transfermarkt JSON endpoint, keyed by the tmId M56 already resolved. **The host and path live in
the private `pitchiq-pipeline` repo only** — endpoints and fetching methods are not published here;
this repo carries the committed data and its schemas. See that repo's TASK-M68 spec.

Verified live on 2026-07-27: **HTTP 200, no auth, no cookie** (the `Access-Control-Allow-Origin` lock
is browser-only; a server fetch succeeds). Each entry gave a `seasonId`, a club, an age, and a
market value with its `determined` date — the four fields the design below relies on.

> **⚠️ Superseded 2026-08-09 (pipeline TASK-M74).** That endpoint's host no longer resolves at all,
> and Transfermarkt's own market-value chart is broken by the same rot. The builder has been repointed
> at a live replacement, which also means **`seasonId` is no longer supplied** and the season is now
> reconciled against the committed history. None of that changes the shape of the data below, and the
> committed artifacts are unaffected. Detail is private-side.

Findings that shape the design:

- **`seasonId` maps directly onto our season start-year.** An entry dated `2018-05-28` carries
  `seasonId: 2017`, i.e. the 2017-18 season. No date-to-season inference needed.
- **`currency` is always `EUR`** and `determined` is never missing across the players sampled. No FX work.
- **Multiple valuations per season** — 1–4 typically, and they move hard within a season (Salah 2017-18:
  €40m Oct → €80m Jan → €150m May). This is why we store all points, not one per season.
- **`seasonId: 0` with `value: 0` is a retirement marker.** Anthony Stokes' final entry is
  `{seasonId:0, value:0, determined:"2020-10-15"}`. **Must be filtered** or retired players get a
  bogus €0 point at the end of their chart.
- **Coverage starts ~2004.** Henry's history begins at `seasonId 2004` — his 1999–2003 Arsenal years have
  no value at all. Our 1992-93 → 2003-04 seasons therefore get nothing.
- **Volume (as built):** 5,437 players in `player-tm-ids.json` → **4,354 with values, 84,299 points**
  (~19.4 each). The 1,080 with none are genuine — TM's history starts ~2004, so most pre-2004 careers
  are empty. Minified, the full history is 5.0 MB.

## 3. Data file layout — two files, split by access pattern

The size of the history file drives this. `/players/[id]` is ISR (`revalidate = 86400` +
`generateStaticParams`), but the season swap goes through the **dynamic** `/api/players/[id]/profile` route,
and `/players` + `/compare` are also request-time. Handing a multi-MB parse to those paths is how the Fluid
Active-CPU regressions in PR #35 and PR #40 happened. So:

| File                             | Shape                                                            | Size       | Read by                                                                                   |
| -------------------------------- | ---------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| `data/market-values.json`        | `season → ourId → { valueEur, determined }` (**last-of-season**) | **624 KB** | profile headline, `/players` column + sort, `/compare` row, the dynamic season-swap route |
| `data/market-value-history.json` | `ourId → [ { season, valueEur, determined } ]` (**all points**)  | **5.0 MB** | **only** the ISR'd `/players/[id]` render, for the strip                                  |

Sizes are the **as-built** figures (4,354 players / 84,299 points), not estimates.

### 3.1 The season map is CLIPPED to app player-seasons — and must be

TM stores a player's **whole career**, so building the season map from the raw crawl yields **39,699**
entries — of which only **11,128 (28%)** correspond to a season the app actually holds a player row for. The
other **72% are non-PL seasons** (Salah at Basel, Henry at Monaco). Every consumer of this file reads it
season-scoped against seasons we cover, so those entries are unusable — and they take the file from 624 KB to
**2.2 MB, on every request-time path**. That is precisely the shape behind the #35/#40 CPU regressions, so
the clip is a correctness requirement, not a size optimisation.

The clip runs **at apply time in the public repo** (`apply-market-values.ts`, given a checkout path), not in
the builder: the clip needs `players-*.json`, and the pipeline should not depend on a public-repo file.
This mirrors `applyPlayerRoles`, which likewise runs where public data exists. It also means a data refresh
reproduces the clip instead of silently re-inflating the file.

The **full career is preserved** in `market-value-history.json` — that is what the chart reads, so nothing
is lost by clipping the season map.

Accepted cost: the 11,128 last-of-season points are duplicated across the two files. Rejected alternatives:

- **One history file, derive the season index at load** — no duplication, but every request-time surface
  parses 84k objects to read one number.
- **Season-sharded files** (`market-values-<season>.json`) — matches the `players-<year>.json` convention,
  but the career strip would need all 23 shards on the profile page, which is exactly the bug PR #40 fixed.

Both files are **writer-owned** and written **minified** via `writeJsonStableMin` (the `lineups-*.json`
policy) — pretty-printing cost 3.2 MB / 7.8 MB for no review benefit. They **must be added to
`.prettierignore`** (`data/market-value*.json` — note the glob must not be `market-values*.json`, which
misses the history file), alongside `data/player-history-stats.json` and `data/search-index.json`. Without
that, prettier re-inflates them ~1.5× and every re-apply produces a prettier-vs-writer diff.

## 4. Pipeline — `build-market-values.ts`

- New script, exposed as `pnpm sync:data:market-values`. Builds on M56's existing
  `pipeline-data/player-tm-ids.json` (`name|birthYear → tmId`); **no new id resolution**.
- For each mapped tmId: fetch the history, filter (`seasonId >= 1990 && marketValue.value > 0`), sort by
  `determined`, and write **the history file only** — the clipped season map is derived later by
  `apply-market-values.ts` (§3.1).
- **Throttled (~900 ms), cached, resumable, idempotent** — the same discipline as `tm-roles-scrape.ts`.
  The fetch **retries 3× with backoff**, like `fetchTmHtml`: the endpoint emits sporadic `502`s under a
  sustained crawl (~2% of requests), and without retries the builder cannot distinguish "TM has no history
  for this player" from "TM briefly fell over" — in the first crawl that silently filed **102 players** as
  having no data. A `404` returns immediately without burning retries.
- **One-off, NOT the daily cron.** Values move slowly; refresh periodically like the roles and photo maps.
- **Full career is stored** — including non-PL clubs and seasons. This is deliberate: Salah's rise from
  €25k at Mokawloon to €150m at Liverpool is the whole point of the chart, and clipping to our own seasons
  would start him at €30m in 2017.
- **PL emphasis is derived at render time**, not baked into each point, by intersecting the history with the
  player's existing season list (`findPlayerSeasons`, already memoized as of PR #40). Keeps the file lean and
  avoids a second source of truth for "which seasons do we hold".

## 5. App surfaces

In scope: **profile block + `/players` + `/compare`**. The "Most valuable" leaderboard from the ticket is
explicitly **out** — it's marked optional there and largely overlaps the `/players` sort we're adding.

- `src/data/schemas.ts` — `MarketValueFileSchema`, `MarketValueHistoryFileSchema`.
- `src/data/loaders.ts` — `loadMarketValues()` and `loadMarketValueHistory()`, both through the existing
  memoized `_dataFileCache` path.
- `/players/[id]` — the market-value block (section 6), Server Component + one small client island.
- `/players` — an MV column and a "most valuable by market value" sort, superseding the M50 goals+assists
  proxy wherever a value exists.
- `/compare` — an MV `<StatRow>`.
- **Null-graceful throughout.** Pre-2004 seasons and unmatched players have no value: the profile block
  **omits itself entirely** (no empty strip, no "—"), matching how the M70 role block behaves when
  `role === null`. Table surfaces render "—".
- **i18n en/ar**, RTL-safe. Currency formatting is locale-aware.

## 6. The block — design

Chosen from a 30-concept gallery (concept 22, the heat strip), then refined through four interaction
variants (option A, readout above the strip) plus ten further variants, landing on **E + K + L**:

- **Structure** — uppercase `Market value` label; the value as a large number with a **▲▼ change chip**
  against the previous season (**E**); a meta line reading `2025-26 · as of 3 Jun 2026 · 3 revaluations,
€22m–€45m`; the strip; a value printed under **every** cell (**K**); season endpoints as an axis; and a
  footer legend `underline = Premier League season`.
- **The strip** — one cell per season, contiguous, 2 px gaps, 3 px radius. A 2 px underline beneath PL seasons.
  A small resting dot above the current season so it's clear which cell the headline refers to.
- **Hover (L)** — every cell up to the cursor stays lit and everything ahead dims to `0.3`; the focused cell
  brightens (`brightness(1.22) saturate(1.1)`), lifts 4 px and takes a 2 px ring. The readout and the labels
  update in lockstep. On exit it returns to the latest season.
- **No pointer required** — because of **K**, every season's value is legible without hovering, which covers
  mobile, print and crawlers. This was the deciding factor for including K.
- **Source is not displayed.** Owner decision — no "source: Transfermarkt" line in the UI.
- **Currency symbol on every number** — `€25k`, `€1.5m`, `€150m`. Owner decision; supersedes an earlier
  approach that declared the unit once in the heading and printed bare numbers.

### 6.1 Colour — fixed absolute bands

Colour encodes value through **seven fixed absolute bands**, not a per-player normalisation:

`<€1m` · `€1–5m` · `€5–15m` · `€15–30m` · `€30–60m` · `€60–100m` · `€100m+`

This is a correctness requirement, not a preference. An earlier iteration normalised to each player's own
maximum, which made a €500k journeyman's best season render exactly as dark as Salah's €150m peak — the
colour meant something different on every page. **Accepted trade-off:** a wholly low-value career now sits
in one band with no internal colour variation (McCarron's four seasons are all `<€1m`); the per-cell numbers
carry his trend instead.

### 6.2 The ramp

Single-hue magenta, stepped from the existing `--chart-1` (`#c91dbb`) so the strip matches
`ComparisonRadar`. **Both modes are selected, not flipped** — each is stepped against its own card surface
(`#ffffff` / `#1a1726`):

|       | 1         | 2         | 3         | 4         | 5         | 6         | 7         |
| ----- | --------- | --------- | --------- | --------- | --------- | --------- | --------- |
| light | `#dc9ed2` | `#ce82c2` | `#be65b3` | `#af47a3` | `#9e2193` | `#86017c` | `#690161` |
| dark  | `#713b6a` | `#8e4785` | `#ab53a0` | `#ca60bd` | `#e96dda` | `#ff87f0` | `#ffb4f3` |

Both ramps **pass all validator checks**: single hue (spread ≤ 1°), monotone lightness, every adjacent
gap ≥ 0.06, and the step nearest the surface clears 2:1 (light 2.13:1, dark 2.12:1). That last check matters
here specifically: these are contiguous cells, so a step that recedes into the surface would read as a hole
in the strip.

**Value must be encoded in the fill colour, never in `opacity`.** The first prototype used opacity for both
value intensity and the hover trail; the trail won, and every cell behind the cursor flattened to one shade,
destroying the encoding. Dimming and hover ride separate channels.

**Note on the era themes:** `--chart-*` are deliberately theme-invariant, so the M25 Time-Machine era themes
must not repaint the strip. Do not derive the ramp from `--accent` — on this codebase that token is a
near-neutral surface tint (`#f5f4f7` / `#252134`) and is reassigned per era.

## 7. Animation

Chosen from a 30-concept gallery: **#1 cascade left→right + #11 count up to today + #27 PL underline draws last.**

| Beat          | Timing          | Behaviour                                                                                                                                                                      |
| ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1 cascade    | `0 → 836 ms`    | each cell fades in and rises 7 px over 420 ms, staggered 26 ms, so the career lays itself down chronologically. Each value label fades in with its own cell (90 ms behind it). |
| #11 count-up  | `0 → 900 ms`    | the headline counts to the current value on a cubic ease-out, landing just after the last cell.                                                                                |
| #27 underline | `880 → 1480 ms` | the PL underline draws left→right beneath PL seasons only, 300 ms each, staggered 30 ms — the emphasis is the closing beat.                                                    |

- `transform` / `opacity` / `clip-path` only, and fully gated on `prefers-reduced-motion: reduce`, where
  everything is present immediately and the headline shows its final value.
- **The server-rendered HTML must contain the real value, never `€0`.** The page is ISR'd, so the static
  markup is what crawlers and no-JS visitors receive. The counter reads the final value from the DOM and
  animates _from_ zero after hydration. Rendering `€0` server-side would have Google index every player as
  worthless.
- Accepted cost of #11: the hero displays an untrue number for ~900 ms. Acceptable because the strip lands
  at the same moment.

## 8. Constraints carried from earlier work

- **Active-CPU discipline** — both loaders go through the memoized `_dataFileCache`; the 3.5 MB history file
  is never read from a request-time path (see section 3).
- **Cron safety** — `data/market-values.json` and `data/market-value-history.json` are standalone committed
  side-maps, not player rows, so the daily sync does not regenerate them. Nothing here writes into
  `players-<year>.json`. (Note for the `.prettierignore` entries in section 3: both filenames must be listed
  explicitly or matched by a glob that actually covers both — `market-value*.json` does, `market-values*.json`
  does not.)
- **Coverage honesty** — no value before ~2004, and none for the 5 players M56 could never resolve. The UI
  omits rather than implying zero.

## 9. Out of scope

"Most valuable" leaderboard route · exposing `citizenships` / `placeOfBirth` · TM-club → our-club id mapping
(the club-coloured and club-grouped strip variants needed it and were not chosen) · any change to the daily cron.
