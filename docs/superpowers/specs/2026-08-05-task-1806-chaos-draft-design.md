# TASK-1806 — Chaos Draft (design)

The first end-to-end playable vertical slice of Phase 18: a fully-randomised
squad is drafted, revealed, and played out through the existing live match view.
Proves the draft → engine → pitch seams. First rule pack.

## Experience (owner-approved)

- A **reveal draft**: your XI is dealt in card-by-card. Entrance motion = **poker
  deal** (cards flick in from the deck, staggered, with rotation); exit motion =
  **conveyor belt** (cards ride off on Re-roll / Play).
- Each card is a real **player-season** (Henry ’03 ≠ Henry ’06) showing photo
  monogram · name · club + season · position · squad number · overall rating · an
  **era badge** (SPARSE ’92–’02 / RICH ’03–’16 / xG ’17+, from the 1802 provenance).
- Controls: **↻ Re-roll** (new seeded squad) and **Play Match ▶** (→ the match).
- The opponent is **auto-drafted** (a second random XI) so both XIs are real on
  the pitch.

## Architecture

100% client-side / static, seeded, no backend — consistent with the Phase-18
locked decisions.

- **Route** `src/app/[locale]/game/chaos/page.tsx` — `force-static` +
  `revalidate = 86400`, like `/game`. At build time it assembles the card pool
  and passes it as serializable props. No request-time reads.
- **Card pool (build-time, server)** `adapter/chaos-pool.ts` `loadChaosPool()` —
  for a curated set of seasons spanning all three eras, load each season's top
  teams via standings, `loadRatedSquad` them, and flatten to a bounded (~250)
  array of `PoolCard = GamePlayer & { club }`. A modest static payload; gives
  effectively-infinite re-rolls.
- **Draft (pure, client-safe, seeded)** `domain/chaos-draft.ts` —
  `chaosDraft(pool, seed) → { team: GameTeam, formationName }`: pick one of a few
  hard-coded real-role `FORMATIONS`, fill each slot with a random **eligible**
  card (`canPlay`, fallback any unused), all from `mulberry32(seed)`. Reproducible
  from the seed. `chaosMatchup(pool, seed)` drafts home + a distinct opponent and
  wraps the opponent as a 1805 `{kind:"squad"}` with a seeded `tacticalStyle`.
- **Play** — build the `MatchSetup` with `opponentSetup` (1805), `simulate`, and
  `buildMatchViewModel`, then hand off to the existing **`MatchView`**. Goal rate
  uses a neutral default (~2.7) since the squad spans seasons.
- **Components** — `DraftCard.tsx` (one card), `DraftScreen.tsx` (the dealt XI +
  Re-roll/Play, poker-deal-in + conveyor-out), `ChaosDraft.tsx` (client flow:
  `drafting → exiting → playing`, holds the seed).
- **Motion** — `@keyframes chaos-deal-in` / `chaos-deal-out` in `globals.css`
  (transform + opacity only → motion-audit clean), reduce-gated; cards appear
  instantly under reduced motion.

## Seed / determinism

Initial seed is a fixed constant so the prerender is deterministic. **Re-roll**
changes the seed in client state. URL `?seed=` share is a deliberate fast-follow,
not in this slice.

## Reuse (not reinvent)

`canPlay`, `assignNumbers` (numbers), `simulate` + `opponentSetup` (1805),
`MatchView` / `buildMatchViewModel`, `localizeDigits`, provenance (1802). All
strings via `t()` (en + ar); the no-hardcoded-strings + motion-audit + i18n
guards apply.

## Out of scope (later tickets)

URL/seed sharing (1812), the other six modes (1810), hard-ban validation UI
(1807), persistence/records (1812).
