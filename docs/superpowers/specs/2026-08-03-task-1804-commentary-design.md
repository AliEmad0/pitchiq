# TASK-1804 — Commentary System — Design

**Status:** Approved 2026-08-03 (owner). Variety = **pooled** (owner-decided). Headless ticket (no UI — the pitch render is TASK-1808).

## Goal

Turn the match engine's `MatchEvent[]` into localized commentary without breaking determinism or the i18n guards. Each event gains a `CommentaryRef { key, values }` (an ICU message key + interpolation data) resolvable to en/ar text at render, with Eastern-Arabic numerals on `ar`. The engine (TASK-1803, just shipped) stays untouched.

## Decisions locked

- **Pooled variety** (owner): a small pool of phrasings per event kind, deterministically selected by an event-data hash. ~13 catalog keys.
- **Separate pure pass** — commentary is a `domain/commentary.ts` module, not a change to `simulate`. Keeps the just-shipped engine stable and commentary independently testable.
- **Determinism preserved** — `commentate` is pure: no `Date`, no locale, no fresh randomness. Variant selection is a hash of event data. Localization happens at render.
- **No ICU plurals** — the lines interpolate a single minute/score number, never pluralize a counted noun, so `ar.json` needs plain interpolation (no zero/one/two/few/many/other categories). Minute renders as `45'` to avoid locale-specific ordinals.

## Constraints (from exploration)

- **next-intl v4**, catalogs `src/i18n/messages/{en,ar}.json`, no `game` namespace yet. `tests/unit/i18n-catalog-parity.test.ts` requires every `en` key to exist in `ar`.
- **Eastern-Arabic digits are NOT produced by ICU** (locale stays plain `"ar"`). Convention: display via a separate pre-localized `{…Fmt}` arg built with `localizeDigits(value, locale)` from `src/utils/format.ts`, at the render boundary.
- **Hardcoded-string AST guard** (`tests/unit/no-hardcoded-strings.test.ts`) scans `.tsx` only. 1804 adds **no `.tsx`**, so it isn't triggered; message-key strings in `.ts` domain files are fine.
- **`MatchEvent`** = `{ minute, kind, side?, playerId?, card? }`. The scorer/booked **name** is available at emit but only `playerId` is on the event → `commentate` maps `playerId → name` via the team rosters. Arabic name resolution (`entity-names.ts`) is a render concern, deferred to 1808.

## Architecture

### Types + the pass — `src/features/game/domain/commentary.ts` (pure, locale-free)

```ts
export interface CommentaryRef {
  key: string; // catalog key, e.g. "commentary.goal.2"
  values: CommentaryValues; // locale-independent interpolation data
}
export interface CommentaryValues {
  player?: string; // base name (Arabic resolution deferred to render)
  minute?: number;
  homeScore?: number;
  awayScore?: number;
}
export interface CommentedEvent extends MatchEvent {
  commentary: CommentaryRef;
}

export function commentate(result: MatchResult, home: GameTeam, away: GameTeam): CommentedEvent[];
```

`commentate` folds through `result.events` tracking a running `{home, away}` score. Per kind:

| Kind | Key | values |
|---|---|---|
| kickoff | `commentary.kickoff` | `{ }` (or team names if a variant uses them) |
| goal (named) | `commentary.goal.{0..3}` | `{ player, minute, homeScore, awayScore }` (score **after** the goal) |
| goal (no name) | `commentary.goalAnon` | `{ minute, homeScore, awayScore }` |
| card yellow | `commentary.cardYellow.{0..2}` | `{ player, minute }` |
| card red | `commentary.cardRed.{0..1}` | `{ player, minute }` |
| card (no name) | `commentary.cardAnon` | `{ minute }` |
| halftime | `commentary.halftime` | `{ homeScore, awayScore }` (score at 45) |
| fulltime | `commentary.fulltime` | `{ homeScore, awayScore }` (final) |

- **Variant:** `variantOf(event, pool) = hash(minute, playerId ?? 0, kind) % pool`, a small deterministic string hash. Pure.
- **Name lookup:** `playerId → name` from `home.players`/`away.players` by `side`. Missing/absent → the `*Anon` key.

### Render bridge — `src/features/game/view/commentary-view.ts` (pure, locale-aware)

```ts
export function commentaryArgs(ref: CommentaryRef, locale: string): Record<string, string | number>;
```

Spreads `ref.values` and adds display-localized digit strings: `minuteFmt`, `homeScoreFmt`, `awayScoreFmt` via `localizeDigits(n, locale)`. The future pitch UI (1808) renders each line as `t(ref.key, commentaryArgs(ref, locale))`. `domain/` stays locale-free; this `view/` module is the render seam.

### Catalog — `commentary.*` in `en.json` + `ar.json`

~13 keys, interpolation-only. Messages reference `{player}`, `{minuteFmt}`, `{homeScoreFmt}`, `{awayScoreFmt}` (the `…Fmt` args are the display-localized digits from `commentaryArgs`; en's `localizeDigits` is a no-op so English shows Western digits). Example:
- en `commentary.goal.0`: `"⚽ {player} scores! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')"`
- ar `commentary.goal.0`: `"⚽ {player} يسجّل! {homeScoreFmt}–{awayScoreFmt} ({minuteFmt}')"`

## Testing

- **`commentate` mapping** — each event kind → expected key shape + values; running score folded correctly (goal updates it; halftime/fulltime carry it); named vs anon selection; determinism (same result → same refs).
- **Key coverage + parity** — enumerate every key `commentate` can emit (all variants) and assert each exists in `en.json` **and** `ar.json` (typo guard on top of the existing parity test).
- **ICU render validity** — render every `commentary.*` message with `commentaryArgs(sampleRef, locale)` for both locales using next-intl's formatter; assert no missing-arg / parse errors, and that `ar` output contains Eastern-Arabic digits (٠–٩) for a numeric sample.
- Pure-domain vitest, `tests/unit/game-*.test.ts`; `server-only` stub unaffected (no server imports here).

## Out of scope (explicit)

The pitch UI that renders the stream (1808); Arabic **player-name** resolution via `entity-names` (1808's render can override `player`); context-aware phrasing — "equaliser", "late winner", red-card drama (1814 momentum / 1815 headlines). Commentary constants (the phrasing pools) are v1.
