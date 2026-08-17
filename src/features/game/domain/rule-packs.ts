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
      /** The Legacy shape: one club's history, sampled per ERA so an XI spans decades. */
      kind: "clubHistory";
      teams: number[];
      cardsPerEraPerTeam: number;
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
}

export interface RulePack {
  id: ModeId;
  pool: PoolSpec;
  chooser?: ChooserSpec;
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
 * The ten clubs Legacy Club offers, by team id, in the owner's chosen order.
 *
 * ⚠️ THIS LIST IS THE PAYLOAD. One prerendered page holds every selectable club's cards
 * (~10 clubs × 3 eras × 10 cards ≈ 300, the same order as Chaos's 252), so adding clubs
 * grows the static payload of a `force-static` route. All 51 clubs would be ~1,530.
 *
 * Nine are ever-presents; Manchester City (29 seasons) was added by owner decision. Every
 * one has cards in all three provenance eras — measured against the committed standings,
 * not assumed.
 */
export const LEGACY_CLUBS: readonly number[] = [
  33, // Manchester United — 34 seasons
  40, // Liverpool — 34
  47, // Tottenham Hotspur — 34
  42, // Arsenal — 34
  49, // Chelsea — 34
  45, // Everton — 34
  66, // Aston Villa — 31
  34, // Newcastle United — 31
  48, // West Ham United — 30
  50, // Manchester City — 29
];

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
 * The draft is the owner's 2026-08-17 mechanic: **eleven consecutive rounds of three
 * cards**, one round per formation slot, drawn from the chosen club across all its seasons.
 */
const LEGACY_PACK: RulePack = {
  id: "legacy",
  pool: { kind: "clubHistory", teams: [...LEGACY_CLUBS], cardsPerEraPerTeam: 10 },
  chooser: { kind: "club" },
  draft: { handSize: 3, roam: "sequential" },
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
