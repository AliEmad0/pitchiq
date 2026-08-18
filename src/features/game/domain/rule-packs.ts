import type { ModeId } from "./modes";

/**
 * TASK-1810 — a mode's rules, as DATA.
 *
 * ⚠️ The pool is a declarative RECIPE, never a builder function. A `buildPool` slot here
 * would be a signature only server code can satisfy, which makes it trivial to pull
 * `adapter/*` into a client component — the one boundary the game's layering forbids
 * outright. A recipe keeps "modes are rule packs (data), not code paths" literally true,
 * and lets the whole registry be unit-tested with no I/O.
 */

/**
 * How a pool is gathered.
 *
 * A discriminated union rather than one shape with optional fields, so each mode's recipe
 * is exactly the shape it needs and `buildPool` can never be handed a half-specified spec.
 */
export type PoolSpec =
  | {
      /** The Chaos shape: a spread of seasons, the best of each season's top teams. */
      kind: "topTeams";
      seasons: number[];
      topTeamsPerSeason: number;
      cardsPerTeamSeason: number;
    }
  | {
      /**
       * The Legacy shape: a club's COMPLETE history — every rated player-season it ever
       * fielded, one card each.
       *
       * ⚠️ No sampling and no per-player dedupe (owner decision, 2026-08-17). A player who
       * spent ten seasons at a club has ten cards, and two of them may be dealt into the
       * same round; "which season was peak Salah" is a choice the mode WANTS to offer.
       *
       * ⚠️ This is only affordable because the club is part of the URL. One page per club
       * carries ~900 cards; a single page carrying every club's would be ~6.7 MB.
       */
      kind: "clubHistory";
      /** `"all"` = every club that ever played in the PL, resolved from the standings. */
      teams: number[] | "all";
    };

/**
 * ⛔ Deliberately `never`, so `constraints` can only ever be `[]` today.
 *
 * No mode in this PR needs a constraint — Legacy's entire rule is a pool filter. Typing
 * this as `never` means the machinery cannot be quietly half-built: the first real
 * constraint (Budget Cap's spend cap, Captain's Draft's slot-1 rule) has to change this
 * type deliberately, with a caller in hand.
 */
export type Constraint = never;

/** Single-match modes all share one objective. It earns its keep in TASK-1811's seasons. */
export type Objective = "win";

/** A choice the pack needs before drafting. Labels come from DATA, never from source. */
export interface ChooserSpec {
  kind: "club";
}

/**
 * How a pack drafts its XI.
 *
 * ⚠️ These are a mode's RULES, which is why they live here rather than inside a
 * Legacy-specific component: round size and whether the board is free-roam are exactly the
 * knobs Captain's Draft and Budget Cap will want, and putting them on the pack keeps ONE
 * draft machine instead of one per mode.
 */
export interface DraftSpec {
  /** Cards offered per round. The Draft Room's shipped default is `HAND_SIZE` (5). */
  handSize: number;
  /**
   * `free` — every slot is clickable at any time (the shipped `/game/draft` room).
   * `sequential` — consecutive rounds, one per slot; the room advances itself.
   *
   * ⭐ This governs the UI ONLY. `roomReducer` already moves `open` to the next unfilled
   * slot on every pick, so sequential progression is the reducer's existing behaviour —
   * free roam is nothing more than the UI also permitting the `open` action.
   */
  roam: "free" | "sequential";
  /**
   * Seconds before the room answers for you, or `null` for no clock at all.
   *
   * ⚠️ `null` is a real choice, not an oversight: with picks final there is nothing to
   * revise, so a countdown would be forcing an irreversible decision rather than keeping
   * a reversible one moving.
   */
  timer?: number | null;
  /** A filled slot cannot be reopened — the pick is final. */
  lockPicks?: boolean;
  /** Guarantee one card at `STANDOUT_OVR`+, or the best available, in every hand. */
  standout?: boolean;
  /** A player may be offered in at most one hand, so no XI can field him twice. */
  onePerPlayer?: boolean;
}

/**
 * Which match screens a pack uses (TASK-1810).
 *
 * `"legacy"` is the owner-designed pair: the matchday PROGRAMME at `?phase=preview` and
 * the SPLIT FEED at `?phase=live`. Absent means the shipped `MatchupPreview`/`MatchView`.
 *
 * ⚠️ A pack FIELD rather than a component swap, for exactly the reason `draft` is one:
 * "modes are rule packs (data), not code paths" is the locked architecture, and a
 * `mode === "legacy"` branch inside `GamePlay` is the precise shape that rule forbids.
 *
 * ⚠️ Keeping it optional is what leaves `/game/draft`, `/game/chaos` and `/game/daily`
 * — and their tests, which are the control proving this change did not reach them —
 * completely untouched.
 */
export type ScreensSpec = "legacy";

export interface RulePack {
  id: ModeId;
  pool: PoolSpec;
  chooser?: ChooserSpec;
  /** Absent means the shipped match screens. See `ScreensSpec`. */
  screens?: ScreensSpec;
  /**
   * ⚠️ Absent means "the room's shipped defaults", never a spelled-out `{ 5, "free" }`.
   * Restating them would make this a second source of truth that could drift from
   * `HAND_SIZE`.
   */
  draft?: DraftSpec;
  constraints: Constraint[];
  objective: Objective;
}

/**
 * The clubs Legacy Club offers.
 *
 * ⭐ EVERY club that ever played in the Premier League (owner decision, 2026-08-17),
 * resolved from the committed standings rather than listed here — a hardcoded list would
 * silently rot the first time the data grew a season.
 *
 * ⚠️ This was a curated ten while one prerendered page had to hold every selectable club's
 * cards. Moving the club into the URL removed that constraint: each club now has its own
 * page carrying only its own cards, so breadth costs pages rather than payload.
 */
export const LEGACY_CLUBS = "all" as const;

/**
 * The Chaos pool, re-expressed as a recipe.
 *
 * ⚠️ These four numbers are the constants `adapter/chaos-pool.ts` shipped with. They are
 * reproduced exactly so the rebuilt pool is comparable against the live one — that diff is
 * the control proving the seam changed no behaviour.
 */
export const CHAOS_PACK: RulePack = {
  id: "chaos",
  pool: {
    kind: "topTeams",
    seasons: [1996, 2004, 2008, 2012, 2019, 2023],
    topTeamsPerSeason: 3,
    cardsPerTeamSeason: 14,
  },
  constraints: [],
  objective: "win",
};

/**
 * Legacy Club.
 *
 * The draft (owner, 2026-08-18): **click any position, get five cards, and the pick is
 * final.** No clock, no player twice, and one card in every hand is a standout — 80+ where
 * the club has one, otherwise the best it can offer for that position.
 */
const LEGACY_PACK: RulePack = {
  id: "legacy",
  pool: { kind: "clubHistory", teams: LEGACY_CLUBS },
  chooser: { kind: "club" },
  screens: "legacy",
  draft: {
    handSize: 5,
    roam: "free",
    timer: null,
    lockPicks: true,
    standout: true,
    onePerPlayer: true,
  },
  constraints: [],
  objective: "win",
};

/** Every pack. Chaos is included so the seam has two real callers, not one. */
export const RULE_PACKS: readonly RulePack[] = [CHAOS_PACK, LEGACY_PACK];

/**
 * Resolve a mode id that came from a URL segment.
 *
 * ⚠️ Returns null rather than throwing — this reads a value a stranger controls, so an
 * unknown mode is bad input, not a programming error. The route turns null into a 404.
 */
export function packFor(id: string): RulePack | null {
  return RULE_PACKS.find((p) => p.id === id) ?? null;
}

/**
 * The packs the parameterised `/game/[mode]` route prerenders.
 *
 * ⚠️ Keyed on `chooser`, not on the registry's status: Chaos has its own bespoke route and
 * must NOT also be served by the dynamic one, or the same mode would exist at two URLs.
 */
export const routedPacks = (): RulePack[] => RULE_PACKS.filter((p) => p.chooser != null);
