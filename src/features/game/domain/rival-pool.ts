import type { PlayerRole } from "@/data/schemas";
import type { PoolCard } from "./chaos-draft";
import { STANDOUT_OVR } from "./draft-room";
import { ringOf } from "./continents";
import { canPlay } from "./eligibility";

/**
 * TASK-1810 follow-up — the pool a RIVAL club drafts from (owner, 2026-08-19).
 *
 * "My team is Liverpool and I want to face Arsenal. Keep in mind: **not the other team's
 * players**." So the opponent needs a squad of its own, and that squad has to reach the
 * browser without putting a second club's history on every page.
 *
 * ⭐ **Measured, not guessed.** A club's complete history is ~900 cards / ~640 KB — the
 * reason the club is a route segment at all. But one card per DISTINCT player (his
 * best-rated season) carrying only what the card face and the engine read is **24 KB for
 * Liverpool's 52 players rated 80+**. That is the owner's ~20 KB budget, and it is
 * precisely the band a rival should be drafted from — so the file and the draw pool are
 * the same thing rather than a file that has to be filtered again.
 *
 * ⛔ This module is PURE and lives in `domain/` so the rule can be unit-tested against a
 * real pool. The adapter only reads JSON and calls it.
 */

/** Every role a formation slot can ask for. */
const ROLES: readonly PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];

/**
 * Eligible candidates a rival pool guarantees for every role.
 *
 * ⛔ NOT a nicety. A club's best-rated players are overwhelmingly outfield — Liverpool's
 * top 40 by rating contains **one** goalkeeper — so a pool selected by rating alone leaves
 * the draft with no keeper and `canPlay`'s last-resort fallback puts a striker in goal.
 * Four is enough that two GK slots (an XI plus a bench keeper) still have a choice.
 */
export const RIVAL_MIN_PER_ROLE = 4;

/**
 * The fields a rival card must carry.
 *
 * ⚠️ Derived from what actually READS a card, measured rather than copied: `PlayerCard`
 * touches `age, altRoles, club, foot, name, nationality, nationalityCode, photo, photoKind,
 * photoUrl, ratings, role, season, teamId`, and the engine needs `cardId, playerId, role,
 * altRoles, ratings`. `height`, `provenance`, `careerClubs` and `stats` are on the full
 * card and are read by nothing on this path — dropping them is most of the saving.
 */
export type RivalCard = Pick<
  PoolCard,
  "cardId" | "playerId" | "season" | "name" | "role" | "altRoles" | "foot" | "ratings"
> & {
  club: string;
  teamId: number;
  photo: string | null;
  photoKind: "cutout" | "photo" | "none";
  photoUrl: string | null;
  age: number | null;
  nationality: string | null;
  nationalityCode: string | null;
};

/** What one rival file holds — a club's, keyed by team id, or a NATION's, keyed by its
 * flag-icons code (TASK-1842). One field because the two are the same wire shape; the
 * consumer tells them apart by type, exactly as the share code does. */
export interface RivalPool {
  teamId: number | string;
  name: string;
  cards: RivalCard[];
}

const ovr = (c: PoolCard) => c.ratings?.overall ?? 0;

/**
 * Collapse a club's complete history to one card per player — his best-rated season.
 *
 * ⚠️ The Legacy pool deliberately carries every season a player spent at the club, because
 * choosing between Salah 2018 and Salah 2019 is a choice the mode wants to offer the COACH.
 * The rival is drafted for him, so that choice is only payload here.
 */
export function bestSeasonPerPlayer(pool: readonly PoolCard[]): PoolCard[] {
  const best = new Map<number, PoolCard>();
  for (const card of pool) {
    const prior = best.get(card.playerId);
    // Ties break on cardId so the selection is total and a rebuild cannot reorder it.
    if (
      prior == null ||
      ovr(card) > ovr(prior) ||
      (ovr(card) === ovr(prior) && card.cardId < prior.cardId)
    ) {
      best.set(card.playerId, card);
    }
  }
  return [...best.values()].sort((a, b) => ovr(b) - ovr(a) || a.cardId.localeCompare(b.cardId));
}

/**
 * Choose the players a rival club draws from.
 *
 * Everyone at the standout bar, plus enough cover that every role can be filled.
 *
 * ⚠️ `STANDOUT_OVR` is reused deliberately. It is already the bar the pack guarantees in
 * the coach's own hands ("one card at 80+, or failing that the best the club can offer"),
 * so the rival is drafted to the standard the coach is promised — which is the fairness
 * the owner asked for, expressed as a number that already exists rather than a new one.
 *
 * ⚠️ A club with nobody at the bar is the COMMON case, not an edge case: 12 of the 51 clubs
 * have never had a player reach 80. They fall through to the per-role cover, which is what
 * keeps their squad fieldable.
 */
export function selectRivalCandidates(pool: readonly PoolCard[]): PoolCard[] {
  const ranked = bestSeasonPerPlayer(pool);
  const chosen = new Map<number, PoolCard>();
  for (const card of ranked) {
    if (ovr(card) >= STANDOUT_OVR) chosen.set(card.playerId, card);
  }

  for (const role of ROLES) {
    const have = [...chosen.values()].filter((c) => canPlay(c, role)).length;
    if (have >= RIVAL_MIN_PER_ROLE) continue;
    let want = RIVAL_MIN_PER_ROLE - have;
    // `ranked` is already rating-desc, so this takes the best cover available.
    for (const card of ranked) {
      if (want === 0) break;
      if (chosen.has(card.playerId) || !canPlay(card, role)) continue;
      chosen.set(card.playerId, card);
      want--;
    }
  }

  return [...chosen.values()].sort((a, b) => ovr(b) - ovr(a) || a.cardId.localeCompare(b.cardId));
}

/**
 * Choose the players a NATION rival draws from (TASK-1842, owner report 2026-08-27).
 *
 * ⛔ RING-AWARE, per role — never rating alone. The nation's rings pool bakes world fills
 * (Africa holds five goalkeepers, so Egypt's pool tops GK up with the world's best), and a
 * rating-only selection would hand an "Egypt" rival Peter Schmeichel in goal — which is the
 * exact card the owner held up and asked "what is this". Per role, countrymen come first,
 * then the continent, then the world, each best-rated, until `RIVAL_MIN_PER_ROLE` — so a
 * client-side `best` draft over this squad fields the strongest side the NATION's own
 * widening rule allows, without the draft policy learning about rings at all.
 *
 * ⭐ Plus every nation-ring standout, the same fairness bar the club selection uses: a deep
 * nation's rival is its real best XI, and a thin nation's is its countrymen backed by its
 * continent — the mirror of what the coach himself is drafting under.
 */
export function selectNationRivalCandidates(pool: readonly PoolCard[], nation: string): PoolCard[] {
  const ranked = bestSeasonPerPlayer(pool);
  const ring = (c: PoolCard) => ringOf(c, nation);
  const chosen = new Map<number, PoolCard>();
  for (const card of ranked) {
    if (ring(card) === "nation" && ovr(card) >= STANDOUT_OVR) chosen.set(card.playerId, card);
  }

  for (const role of ROLES) {
    for (const wanted of ["nation", "continent", "world"] as const) {
      const have = [...chosen.values()].filter((c) => canPlay(c, role)).length;
      if (have >= RIVAL_MIN_PER_ROLE) break;
      let want = RIVAL_MIN_PER_ROLE - have;
      for (const card of ranked) {
        if (want === 0) break;
        if (chosen.has(card.playerId) || ring(card) !== wanted || !canPlay(card, role)) continue;
        chosen.set(card.playerId, card);
        want--;
      }
    }
  }

  return [...chosen.values()].sort((a, b) => ovr(b) - ovr(a) || a.cardId.localeCompare(b.cardId));
}

/** Narrow a full card to what a rival file carries. */
export function toRivalCard(card: PoolCard & Partial<RivalCard>): RivalCard {
  return {
    cardId: card.cardId,
    playerId: card.playerId,
    season: card.season,
    name: card.name,
    role: card.role,
    altRoles: card.altRoles,
    foot: card.foot,
    ratings: card.ratings,
    club: card.club,
    teamId: card.teamId ?? -1,
    photo: card.photo ?? null,
    photoKind: card.photoKind ?? "none",
    photoUrl: card.photoUrl ?? null,
    age: card.age ?? null,
    nationality: card.nationality ?? null,
    nationalityCode: card.nationalityCode ?? null,
  };
}

/**
 * A rival card, widened back to a `PoolCard` the draft and the engine accept.
 *
 * ⚠️ The dropped fields come back as nulls rather than being left off. `PlayerCard` reads
 * `card.club` unguarded, and the engine's `powerOf` reads `ratings` — a card missing a key
 * the renderer dereferences throws at paint, three components from the fetch that omitted
 * it.
 */
export function fromRivalCard(card: RivalCard): PoolCard {
  return {
    ...card,
    height: null,
    provenance: null,
    careerClubs: [],
    stats: {
      goals: null,
      assists: null,
      appearances: null,
      cleanSheets: null,
      yellowCards: null,
      redCards: null,
    },
  } as unknown as PoolCard;
}
