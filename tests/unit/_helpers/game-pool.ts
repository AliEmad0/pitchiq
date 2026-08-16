import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";

/**
 * A synthetic draft pool: five cards for each of twelve roles.
 *
 * ⚠️ Deliberately a COPY of the fixture inside `game-match-replay.test.ts` rather than an
 * extraction of it. That suite is the proof that the TASK-1812 replay refactor did not
 * change resume, and it only proves that while it stays untouched.
 */
const ROLES: PlayerRole[] = [
  "GK",
  "LB",
  "CB",
  "RB",
  "LM",
  "CM",
  "RM",
  "CDM",
  "CAM",
  "LW",
  "RW",
  "CF",
];

export function poolFixture(): PoolCard[] {
  return ROLES.flatMap((role, r) =>
    [0, 1, 2, 3, 4].map((i) => ({
      cardId: makeCardId(1000 + r * 10 + i, 2020),
      playerId: 1000 + r * 10 + i,
      season: 2020,
      name: `${role}-${i}`,
      role,
      altRoles: [],
      foot: null,
      height: null,
      provenance: null,
      ratings: {
        attack: 50,
        creation: 50,
        defense: 50,
        physical: 50,
        discipline: 50,
        overall: 50,
      },
      club: "Club",
    })),
  );
}
