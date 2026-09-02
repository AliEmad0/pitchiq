import type { DraftPolicy } from "./chaos-draft";
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
    }
  | {
      /**
       * The Captain's Draft shape (owner, 2026-08-25): **nationality synergy OR era
       * synergy** around a chosen icon — his countrymen from any season, UNION everyone
       * who actually played in one of his own seasons.
       *
       * ⛔ THE UNION MUST BE BOUNDED, and that is not a tuning preference — measured
       * before building: the average icon's union is **2,619 distinct players / 10,839
       * player-seasons ≈ 1.28 MB** even at one card each, against Legacy's ~900-card
       * ceiling. John Terry's is **3,889 players — 76% of the entire dataset**, so
       * unbounded, "build around him" would mean "draft from nearly everyone" and the
       * synergy would evaporate at exactly the captains it should mean most.
       *
       * ⚠️ So: one card per DISTINCT player (his best season), ranked by rating, capped.
       * The FILTER is untouched — only the breadth is.
       */
      kind: "captainSynergy";
      /** Cards on the page after ranking. ~0.5 KB each, so this is a payload decision. */
      cap: number;
      /**
       * Cards reserved for the nationality half before the cap is filled from the rest.
       *
       * ⛔ Without it the synergy is invisible for a big footballing nation: England has
       * **1,767** players and a long-serving English captain's era has ~3,000, so a purely
       * rating-ranked cap would be almost entirely era-peers and the nationality half —
       * half the owner's mechanic — would never show up on the page.
       */
      nationalityReserve: number;
    }
  | {
      /**
       * The Budget Cap shape (TASK-1810): every priced player-season in the indexed window,
       * one card per distinct player at his best-rated season, rating-ranked and capped.
       *
       * ⛔ The cap is 600 because deeper pools were measured and REJECTED. At 900 the
       * achievable XI is identical at every budget worth playing, since the extra cards are
       * rated 64–70 and never enter an optimal team; going to 1,800 (rating floor 53) moved
       * the best XI at the cap by barely two points while tripling the payload.
       *
       * ⚠️ A rating-ranked cap was expected to destroy the price spread and measurably does
       * not — rating and price correlate at only r ≈ 0.52, which is the same weak correlation
       * that makes bargains exist. **No stratified price reserve is needed** — this is the one
       * place `captainSynergy`'s `nationalityReserve` lesson does NOT transfer.
       *
       * ⚠️ Stopping at 600 also puts the pool's floor at rating 70, so every card in the mode
       * is a genuine contributor rather than filler the coach will never want.
       */
      kind: "pricedMarket";
      /** Cards on the page after ranking. ~0.5 KB each, so this is a payload decision. */
      cap: number;
      /** The money year every price is expressed in. Frozen — see `domain/market-index.ts`. */
      baseSeason: number;
    }
  | {
      /**
       * One nation's players, with per-role fallbacks from its continent and the world
       * (Nationality Draft, TASK-1842). The route's segment supplies the nation code — the
       * same split as `clubHistory` + `only`.
       *
       * ⭐ The scarcity IS the mode, so the recipe is honest about it: the nation ring is
       * "the available players" verbatim for 48 of the 57 routed nations (measured
       * 2026-08-27 — only nine ever reach `perRoleCap`), and the fallback rings exist so a
       * hand can never be empty, not to hide the thinness. The deal widens per SLOT at deal
       * time — see `DealOptions.rings` for why per-role precomputation would be wrong.
       */
      kind: "nationRings";
      /**
       * Nation cards kept per role, best-rated first. ⛔ England is why this exists: 1,767
       * players, 471 of them CM-eligible — uncapped, its pool is ~900 KB baked into a
       * `force-static` page. 30 clears the worst same-role demand (3 slots × handSize 5)
       * with margin, and 48 of 57 nations never reach it.
       */
      perRoleCap: number;
      /**
       * The eligible-card floor every role is filled up to — continent first, then the
       * world. ⚠️ Sized against the worst shape (3 CBs or 3 CMs = 15 same-role cards per
       * draft) plus altRoles theft, and VERIFIED by the no-empty-hand control in
       * `nation-pool.test.ts` rather than trusted: the number here is that test's input,
       * not its proof.
       */
      roleFloor: number;
      /**
       * Nations offered at all. ⚠️ Egypt — the owner's own example — has 14, so this must
       * stay ≤ 14. Below 11 a nation cannot even nominally field an XI of countrymen, and
       * its draft is a continent draft wearing a flag.
       */
      minPlayers: number;
    }
  | {
      /**
       * The Chemistry Draft shape (TASK-1810 PR 5): the archive's best players across ALL
       * 34 seasons, one card per distinct man at his best-rated season, rating-ranked and
       * capped.
       *
       * WIDE BY MEASUREMENT, not by preference (spec 0.2). A cross-era pool gives the coach
       * x4.33 depth against x2.81 for a narrow elite one - in a dense pool everything links
       * anyway, so his choices stop mattering. Breadth IS the mechanic here.
       *
       * NOT `pricedMarket`, and that is the load-bearing part: its 2004-2025 value window
       * excludes the nineties, which throws away Manchester United '99 and the Arsenal
       * Invincibles - the most recognisable teammate links in the archive and precisely the
       * pairs this mode exists to reward. NOT `topTeams` either: built from each season's
       * top three clubs it is full of real teammates by construction, so the coach starts at
       * chemistry 40 instead of 13 and the draft has nowhere to climb.
       */
      kind: "crossEra";
      /** Cards on the page after ranking. ~0.5 KB each, so this is a payload decision. */
      cap: number;
    };

/**
 * A rule the draft enforces beyond its pool.
 *
 * ⭐ This type was `never` on purpose, with a note naming the two modes that would make it
 * real. Captain's Draft is the first, and it arrives WITH its caller — which is what that
 * note was holding the line for.
 */
export type Constraint =
  | {
      /**
       * A player is already in the XI before the coach picks anything (Captain's Draft).
       *
       * ⚠️ The player is NOT named here. The pack is static data and the icon is a route
       * param, so the constraint declares the RULE and the route supplies the man — the same
       * split as `clubHistory` + the `only` argument.
       */
      kind: "captainFirst";
    }
  | {
      /**
       * Every pick costs, and the XI must come in under `amount` (Budget Cap, TASK-1810).
       *
       * ⚠️ Unlike `captainFirst`, this constraint DOES carry its value. The captain is a route
       * param, so that pack could only declare the rule; the budget is identical for every
       * player of this mode, so it belongs here in the pack.
       *
       * ⛔ A DRAFT-time rule ONLY. `replayWith` must never re-validate it — re-checking a
       * constraint on resolution is how a legal match becomes unresumable after a data change,
       * and it would present as a corrupt save rather than as a rule.
       */
      kind: "budgetCap";
      /** Tenths of a million, matching `PoolCard.price`. `1000` = £100.0m. */
      amount: number;
    }
  | {
      /**
       * The XI is scored on how well it LINKS, and a well-linked side plays better
       * (Chemistry Draft, TASK-1810 PR 5).
       *
       * Carries no value: unlike `budgetCap` there is nothing to parameterise - the tiers
       * and the adjacency band are frozen measured constants in `domain/chemistry.ts` and
       * `domain/pitch-adjacency.ts`, because changing either changes every score ever shared.
       * This constraint declares that the rule APPLIES, which is what routes the score to the
       * draft surface and the engine modifier.
       */
      kind: "chemistry";
    };

/** Single-match modes all share one objective. It earns its keep in TASK-1811's seasons. */
export type Objective = "win";

/** A choice the pack needs before drafting. Labels come from DATA, never from source. */
export interface ChooserSpec {
  /**
   * `club` — Legacy Club picks a club, and its history is the pool.
   * `captain` — Captain's Draft picks an ICON, and his nationality + era is the pool.
   * `nation` — the Nationality Draft picks a COUNTRY, and its widening rings are the pool.
   *
   * ⚠️ All three put their choice in the URL for the same reason: the pool is baked into a
   * `force-static` page, so one page per choice is what keeps each payload affordable.
   */
  kind: "club" | "captain" | "nation";
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
  /**
   * Recompute every hand from the CURRENT picks, so an unpicked candidate returns to later
   * rounds (TASK-1842, owner report 2026-08-27). Egypt holds three CM-eligible players; with
   * precomputed hands the first CM round consumed all three and the second widened to Africa
   * while two countrymen sat unpicked. See `redealHands` for the trade this makes.
   *
   * ⚠️ Only meaningful with `lockPicks: true` today: reconsiderable picks + redeal would need
   * the reserve arithmetic Budget Cap runs, and no pack asks for both.
   */
  redeal?: boolean;
  /**
   * The coach also drafts a BENCH, and pays for it (Budget Cap, TASK-1810).
   *
   * ⚠️ The roles come from `BENCH_SHAPE`, whose first slot is a goalkeeper — so "one of them
   * must be a keeper" is true by construction rather than by a rule enforced somewhere else.
   *
   * ⛔ When a pack drafts a bench under a `budgetCap`, the RIVAL must pay for its bench too.
   * The cap otherwise buys the coach sixteen players and the rival eleven, which is the
   * 2026-08-19 balance defect wearing a different hat — and nothing on screen would show it.
   */
  bench?: boolean;
  /**
   * The XI is handed up only when the coach SAYS so (owner, 2026-08-26).
   *
   * ⚠️ Absent means the shipped behaviour: the room hands off the moment the last slot fills.
   * That is right for a pack whose picks are final, and wrong for a budget, where the whole
   * activity is trying combinations until the money works. A pack that sets this must also
   * leave `lockPicks` off, or there is nothing to reconsider.
   */
  confirm?: boolean;
  /** Guarantee one card at `STANDOUT_OVR`+, or the best available, in every hand. */
  standout?: boolean;
  /**
   * Guarantee the cheapest eligible card in every hand (Budget Cap, TASK-1810).
   *
   * ⚠️ The budget reserve reads the dealt HANDS, so this sets the floor an XI can cost. It
   * drops the worst case from £65.0m to £44.3m against a £100.0m cap — about £21m more to
   * spend up with, and every hand keeps an economising option. See `DealOptions.cheapest` for
   * why it was originally a feasibility fix and what changed.
   */
  cheapest?: boolean;
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

/**
 * How a pack assembles the coach's XI before a ball is kicked (TASK-1838).
 *
 * `"reveal"` is the auto-drafted one: a whole XI is drawn for him and REVEALED — the
 * "Match Night" board of TASK-1835 — and his only input is to re-roll it or play it.
 * Absent means he builds his own, either in the free-roam hub or in the pack's draft room.
 *
 * ⚠️ A pack FIELD, for the same reason `screens` is one: "modes are rule packs (data), not
 * code paths". `GamePlay` must not learn that a mode called chaos exists.
 *
 * ⛔ A reveal setup hands its SEED up with the XI. The rival it showed is redrawn from
 * that seed at kick-off, so a pack that dropped it would field a different opponent than
 * the one the coach was just introduced to.
 */
export type SetupSpec = "reveal";

export interface RulePack {
  id: ModeId;
  pool: PoolSpec;
  chooser?: ChooserSpec;
  /** Absent means the shipped match screens. See `ScreensSpec`. */
  screens?: ScreensSpec;
  /** Absent means the coach builds his own XI. See `SetupSpec`. */
  setup?: SetupSpec;
  /**
   * How the auto-drafted opponent picks his XI. Absent = the shipped random draw.
   *
   * ⭐ Owner report, 2026-08-19: a pack whose HANDS guarantee an 80+ standout every round
   * cannot face an opponent drawn uniformly from the same pool. The coach's XI is
   * top-decile by construction and the opponent's is average, so the match is settled by
   * the draft rules rather than by anything that happens on the pitch — no re-seeding
   * fixes that, because the distribution itself is the problem.
   *
   * ⚠️ Declaring this ALSO withholds the coach's own XI from both auto-drafts. Both sides
   * draw from one club pool, so a best-available opponent otherwise fields the very men
   * the coach just picked. See `view/match-session.ts`.
   */
  opponent?: DraftPolicy;
  /**
   * ⚠️ Absent means "the room's shipped defaults", never a spelled-out `{ 5, "free" }`.
   * Restating them would make this a second source of truth that could drift from
   * `HAND_SIZE`.
   */
  draft?: DraftSpec;
  /**
   * The league this mode plays over a SEASON. Absent means the mode has no season format —
   * which is every pack but Legacy today, so they all render and play byte-identically.
   *
   * ⚠️ Opponent-agnostic (TASK-1832 D5): the pack says how many clubs and where they come
   * from, and `domain/season.ts` never learns what a club is.
   */
  season?: SeasonSpec;
  constraints: Constraint[];
  objective: Objective;
}

/**
 * A mode's season league (TASK-1811).
 *
 * ⭐ 20 clubs is the real 38-week shape: 19 opponents home and away. Measured, so it can be
 * relied on: a full 20-club league season is ~230 ms to simulate honestly through the real
 * engine, so the other clubs' fixtures are never faked.
 */
export interface SeasonSpec {
  /** Including the coach's own club. */
  clubs: number;
  /** Where the other clubs come from. `"clubs"` = the prerendered `/api/game/rivals` routes. */
  league: "clubs";
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
  opponent: "best",
  draft: {
    handSize: 5,
    roam: "free",
    timer: null,
    lockPicks: true,
    standout: true,
    onePerPlayer: true,
  },
  // TASK-1811 PR 1 — the season SPINE only. The domain can build and play a 38-week league;
  // the hub that would render it is deliberately absent until the owner's 30-concept ritual.
  season: { clubs: 20, league: "clubs" },
  constraints: [],
  objective: "win",
};

/**
 * Captain's Draft.
 *
 * The shipped promise is "Pick an icon first, then build around them", and the rules keep
 * it literally: the icon is placed in the XI before the coach picks anything, and the pool
 * he then drafts from is the icon's own countrymen and contemporaries.
 *
 * ⚠️ The icon roster is DATA, resolved by the adapter — men who really captained a
 * Premier League side for three seasons or more, plus a curated legend list. See
 * `adapter/pool.ts#iconChoices`.
 *
 * ⚠️ `screens: "legacy"` and `opponent: "best"` mirror Legacy for the same reasons: the
 * match screens are designed and shared, and a pack whose hands guarantee a standout
 * cannot face an opponent drawn uniformly from the same pool.
 */
export const CAPTAINS_PACK: RulePack = {
  id: "captains",
  /** Measured bounds — see the `captainSynergy` doc for why they are not preferences. */
  pool: { kind: "captainSynergy", cap: 600, nationalityReserve: 200 },
  chooser: { kind: "captain" },
  screens: "legacy",
  opponent: "best",
  draft: {
    handSize: 5,
    roam: "free",
    timer: null,
    lockPicks: true,
    standout: true,
    onePerPlayer: true,
  },
  constraints: [{ kind: "captainFirst" }],
  objective: "win",
};

/**
 * Budget Cap Draft.
 *
 * The promise is "€100M, the whole priced archive, find the bargains" — and the rules keep it
 * literally: every card carries a real Premier League market value expressed in 2025 money,
 * and the coach's XI must come in under the cap.
 *
 * ⚠️ NO CHOOSER, and that is a design fact rather than an omission. The pool is one cross-era
 * set, so there is nothing to choose and nothing to put in a route segment — which is why this
 * pack is served by a bespoke `/game/budget` page exactly as Chaos is, and why `routedPacks()`
 * must never return it.
 *
 * ⚠️ No `standout`. A guaranteed 80+ in every hand fights a budget rather than complementing
 * it — the card would either be unaffordable (dead) or eat the cap. What a budget hand needs
 * is a card the coach can still BUY, and `domain/budget.ts` gets that from the reserve rule
 * without any change to `roomDeals`.
 */
export const BUDGET_PACK: RulePack = {
  id: "budget",
  /** Measured bounds — see the `pricedMarket` doc for why 900 was rejected. */
  pool: { kind: "pricedMarket", cap: 600, baseSeason: 2025 },
  screens: "legacy",
  opponent: "budget",
  draft: {
    handSize: 5,
    roam: "free",
    // ⭐ Picks are NOT final here (owner, 2026-08-26). The activity is trying combinations
    // until the money works, so a locked pick would end the game on the first mistake.
    lockPicks: false,
    timer: null,
    // ⛔ Not `standout`. A guaranteed 80+ fights a budget; a guaranteed CHEAPEST is what
    // keeps the floor low — see `DraftSpec.cheapest` for the measured numbers.
    cheapest: true,
    bench: true,
    confirm: true,
    onePerPlayer: true,
  },
  /**
   * £120.0m, in tenths — and it buys SIXTEEN players, not eleven (owner, 2026-08-26).
   *
   * ⛔ Measured over 60 dealt rooms, not chosen for the round number. A sixteen-man squad
   * costs £64m at the floor, £114m at median picks and £211m taking the dearest card every
   * round — so £120m binds in **100%** of rooms, is never infeasible, and leaves about **£6m**
   * against a median squad. That is deliberately tighter than the £19m the XI-only £100m gave;
   * £130m would reproduce the old feel if this proves too punishing.
   */
  constraints: [{ kind: "budgetCap", amount: 1200 }],
  objective: "win",
};

/**
 * Nationality Draft (TASK-1842).
 *
 * The promise is the owner's brief, kept literally: "select Egypt, show me the available
 * players for every position … if no players for this position give me African players."
 * A hand is drawn from the narrowest ring that still has anyone — the nation, then its
 * continent, then the world — and the widening is VISIBLE (the ring line and chips on
 * `PitchDraft`'s round).
 *
 * ⚠️ No `standout`, deliberately: a thin nation at a thin position may hold no 80+ card,
 * and the pack degrades honestly — short hands, no promise — rather than widening a ring
 * just to keep one. The per-pack round copy (#202) keys the "rated 80 or better" sentence
 * on this exact field, so the veil claims nothing this pack cannot deliver.
 *
 * ⚠️ `lockPicks: true` — a hand of one is a forced pick, which is the scarcity being FELT.
 */
export const NATION_PACK: RulePack = {
  id: "nation",
  /** Measured bounds — see the spec (2026-08-27) for every number's derivation. */
  pool: { kind: "nationRings", perRoleCap: 30, roleFloor: 20, minPlayers: 11 },
  chooser: { kind: "nation" },
  screens: "legacy",
  opponent: "best",
  draft: {
    handSize: 5,
    roam: "free",
    timer: null,
    lockPicks: true,
    onePerPlayer: true,
    redeal: true,
  },
  constraints: [],
  objective: "win",
};

/**
 * Chemistry Draft (TASK-1810 PR 5) - the last of the five rule-pack modes.
 *
 * The promise: draft an XI where WHO STANDS NEXT TO WHOM matters. Countrymen, club legends
 * and real teammates link between adjacent slots, and a well-linked side genuinely plays
 * better than the sum of its cards.
 *
 * Measured before it was built (spec 0.3): chasing chemistry costs ~6.8 rating points per
 * player. That trade-off IS the game - the linked countryman or the better stranger - and it
 * is the exchange rate `chemistryModifier` has to pay back at chemistry 100. Below it the
 * mode is a trap; far above it every coach drafts identically.
 *
 * No `standout`. A guaranteed 80+ per hand fights link-hunting exactly as it fights a budget:
 * the strong card is rarely the linked one, so the guarantee would quietly pull every coach
 * back toward the rating-greedy XI the mode is trying to give him a reason to leave.
 *
 * NO CHOOSER, so `routedPacks()` must keep excluding it. The pool is one cross-era set with
 * nothing to choose, which is why this ships a bespoke `/game/chemistry` page as Chaos and
 * Budget Cap do - registering a chooser-less pack into the chooser-aware route is what broke
 * the Vercel build once.
 */
export const CHEMISTRY_PACK: RulePack = {
  id: "chemistry",
  /** Measured bounds - see the spec for why wide beats narrow here. */
  pool: { kind: "crossEra", cap: 600 },
  screens: "legacy",
  opponent: "best",
  draft: {
    handSize: 5,
    roam: "free",
    timer: null,
    // Budget Cap's rule: the activity is trying combinations until the links work, so ending
    // the draft on the last pick would stop the game at the moment it gets interesting.
    // Inherits #201's "reconsiderable has two halves" - re-opening a filled slot must offer
    // a way out, which is verified for this pack rather than assumed.
    lockPicks: false,
    confirm: true,
    onePerPlayer: true,
  },
  constraints: [{ kind: "chemistry" }],
  objective: "win",
};

/**
 * Every pack the ROUTES serve. Chaos is included so the seam has two real callers, not one.
 *
 * ⛔ A pack lands here ONLY once its routes exist. `routedPacks()` filters on
 * `chooser != null` and reads THIS list, never `domain/modes.ts`, so registering a pack
 * routes it immediately whatever its mode status says. Registering Captain's Draft before
 * `[mode]/[club]` understood a captain chooser broke the Vercel build: the route fanned
 * out `captains × 51 clubs`, handed each CLUB id to `captainSynergy` as a captain id, and
 * the empty pool killed the prerender on `shape.slots`.
 */
export const RULE_PACKS: readonly RulePack[] = [
  CHAOS_PACK,
  LEGACY_PACK,
  CAPTAINS_PACK,
  BUDGET_PACK,
  NATION_PACK,
  CHEMISTRY_PACK,
];

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
