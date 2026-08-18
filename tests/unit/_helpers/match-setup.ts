import type { PlayerRole } from "@/data/schemas";
import { formationByName } from "@/features/game/domain/formation";
import type { MatchSetup } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import { type GameTeam, makeGameTeam } from "@/features/game/domain/team";

/**
 * A plain, evenly-matched fixture for engine tests that care about the LOOP rather than
 * about ratings. Both sides carry a full bench, because anything exercising
 * substitutions needs one.
 */

const RATINGS: PlayerRatings = {
  attack: 50,
  creation: 50,
  defense: 50,
  physical: 50,
  discipline: 50,
  overall: 50,
};

const XI: PlayerRole[] = ["GK", "RB", "CB", "CB", "LB", "CDM", "CM", "CAM", "RW", "LW", "CF"];
const BENCH: PlayerRole[] = ["GK", "CB", "CM", "CF", "RW"];

function squad(prefix: string, offset: number, roles: PlayerRole[]): GamePlayer[] {
  return roles.map((role, i) => ({
    cardId: `${offset + i}@2020`,
    playerId: offset + i,
    season: 2020,
    name: `${prefix}${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: RATINGS,
  }));
}

const SHAPE = { name: "", season: 2020, slots: [] };

export const matchSetup = (seed: number): MatchSetup => ({
  home: makeGameTeam(1, "H", 2020, SHAPE, squad("H", 100, XI), squad("HB", 200, BENCH)),
  away: makeGameTeam(2, "A", 2020, SHAPE, squad("A", 300, XI), squad("AB", 400, BENCH)),
  seed,
  targetGoalsPerMatch: 2.7,
});

/**
 * A team with REAL formation slots, for anything that groups an XI by position.
 *
 * ⛔ `matchSetup` above CANNOT be used for that. Its `SHAPE` carries an EMPTY `slots`
 * array, so anything bucketing players by their slot's role sees nothing at all and
 * reports zeroes — a test written against it would pass over a function that does nothing.
 *
 * ⚠️ 4-4-2 Flat's slot order is GK, LB, CB, CB, RB, LM, CM, CM, RM, CF, CF: the defence
 * bucket is FIVE (the keeper included), the midfield four, the attack two. Get that wrong
 * and the expected values in a comparison test are quietly nonsense.
 *
 * `ratings[i] === null` means that player is genuinely unrated — a real case in Legacy,
 * where a club's thinner seasons carry cards the rating pipeline could not score.
 */
export function makeTeam(
  opts: {
    name?: string;
    /** One entry per slot. Omit for a flat 75; `null` for an unrated player. */
    ratings?: Array<number | null>;
    /** One entry per slot. Omit for 2020 throughout. */
    seasons?: number[];
  } = {},
): GameTeam {
  // ⚠️ By NAME, never `FORMATIONS[i]` — that array's order is presentation only.
  const shape = formationByName("4-4-2 Flat");
  const club = opts.name ?? "T";
  const players: GamePlayer[] = shape.slots.map((slot, i) => {
    const overall = opts.ratings === undefined ? 75 : (opts.ratings[i] ?? null);
    const season = opts.seasons?.[i] ?? 2020;
    // ⚠️ Deliberately an ENRICHED card, not a bare GamePlayer. `buildSession` hands
    // `makeGameTeam` the drafted `PoolCard[]` straight through, so at runtime a team's
    // players carry the full card — club, photo and bio included — and `PlayerCard`
    // reads those fields unguarded (`clubAbbr(card.club)` throws on undefined). A bare
    // fixture here would fail against a component that is correct.
    return {
      cardId: `${500 + i}@${season}`,
      playerId: 500 + i,
      season,
      name: `${club}${i}`,
      role: slot.role,
      altRoles: [],
      foot: null,
      height: null,
      provenance: null,
      ratings: overall === null ? null : { ...RATINGS, overall },
      club,
      teamId: 1,
      photo: null,
      photoKind: "none",
      photoUrl: null,
      age: null,
      nationality: null,
      nationalityCode: null,
      careerClubs: [club],
      stats: {
        goals: null,
        assists: null,
        appearances: null,
        cleanSheets: null,
        yellowCards: null,
        redCards: null,
      },
    } as GamePlayer;
  });
  return makeGameTeam(1, club, 2020, shape, players, []);
}
