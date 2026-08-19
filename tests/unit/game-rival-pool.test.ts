import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import { FORMATIONS, chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { STANDOUT_OVR } from "@/features/game/domain/draft-room";
import { canPlay } from "@/features/game/domain/eligibility";
import {
  RIVAL_MIN_PER_ROLE,
  bestSeasonPerPlayer,
  fromRivalCard,
  selectRivalCandidates,
  toRivalCard,
} from "@/features/game/domain/rival-pool";

/**
 * TASK-1810 follow-up — the rival's own squad (owner, 2026-08-19).
 *
 * ⚠️ The fixture is shaped like the real thing rather than convenient: a club's history is
 * mostly SQUAD PLAYERS with a thin layer of stars, several seasons per player, and — the
 * detail that matters — almost no goalkeepers near the top of the rating table.
 */
const ROLES: PlayerRole[] = [
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

function card(playerId: number, season: number, role: PlayerRole, overall: number): PoolCard {
  return {
    cardId: makeCardId(playerId, season),
    playerId,
    season,
    name: `${role}${playerId}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall },
    club: "Rivals FC",
    teamId: 7,
  };
}

/**
 * A club shaped like a real one: 13 roles × 8 players, three seasons each.
 *
 * ⛔ The goalkeepers top out at 79 — BELOW the standout bar — on purpose. Liverpool's best
 * forty players by rating contain exactly one keeper, so a rival pool selected by rating
 * alone has no keeper at all and the draft puts a striker in goal. That is the failure this
 * fixture exists to expose, and a flat fixture would hide it completely.
 */
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 8 }, (_, i) =>
    [2020, 2021, 2022].map((season) => {
      const peak = role === "GK" ? 79 - i * 6 : 92 - i * 5;
      // Two off-peak seasons, so `bestSeasonPerPlayer` has something to choose between.
      const overall = season === 2021 ? peak : peak - 4;
      return card(r * 100 + i, season, role, overall);
    }),
  ).flat(),
);

const ovr = (c: PoolCard) => c.ratings?.overall ?? 0;

describe("bestSeasonPerPlayer", () => {
  it("keeps one card per player — his best-rated season", () => {
    const best = bestSeasonPerPlayer(pool);
    expect(best).toHaveLength(new Set(pool.map((c) => c.playerId)).size);
    for (const c of best) {
      const seasons = pool.filter((x) => x.playerId === c.playerId);
      expect(ovr(c)).toBe(Math.max(...seasons.map(ovr)));
    }
  });

  it("is deterministic and rating-ordered, so a rebuild cannot reshuffle the file", () => {
    const a = bestSeasonPerPlayer(pool).map((c) => c.cardId);
    const b = bestSeasonPerPlayer([...pool].reverse()).map((c) => c.cardId);
    expect(a).toEqual(b);
    const ratings = bestSeasonPerPlayer(pool).map(ovr);
    expect([...ratings].sort((x, y) => y - x)).toEqual(ratings);
  });
});

describe("selectRivalCandidates", () => {
  const chosen = selectRivalCandidates(pool);

  it("takes everyone at the standout bar", () => {
    const eligible = bestSeasonPerPlayer(pool).filter((c) => ovr(c) >= STANDOUT_OVR);
    const ids = new Set(chosen.map((c) => c.playerId));
    for (const c of eligible) expect(ids.has(c.playerId)).toBe(true);
  });

  /**
   * ⛔ The one that matters. Without the per-role top-up this fixture yields a pool with NO
   * goalkeeper — every keeper is under the bar — and the draft's last-resort fallback puts
   * an outfielder between the posts.
   */
  it("covers every role, including the one no club has near the top of its ratings", () => {
    for (const role of ROLES) {
      const cover = chosen.filter((c) => canPlay(c, role));
      expect(cover.length).toBeGreaterThanOrEqual(RIVAL_MIN_PER_ROLE);
    }
    expect(chosen.filter((c) => c.role === "GK").length).toBeGreaterThanOrEqual(RIVAL_MIN_PER_ROLE);
  });

  /**
   * ⚠️ Over MANY SEEDS, not one. The rival's shape is drawn from the seed, so a pool that
   * cannot fill one of the twenty formations fails only on the seeds that happen to pick
   * it — and a single-seed test would pass while a fifth of real matches broke.
   */
  it("fields a legal XI — with a real goalkeeper — whatever shape the seed draws", () => {
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 120; seed++) {
      const team = chaosDraft(chosen, seed, "Rivals", { policy: "strong" });
      shapes.add(team.formation.name);
      expect(team.players).toHaveLength(11);
      // Slot 0 is the goalkeeper line in every formation.
      expect(canPlay(team.players[0]!, "GK")).toBe(true);
      expect(new Set(team.players.map((p) => p.playerId)).size).toBe(11);
    }
    // Guards the guard: if the draw stopped varying, the sweep above proves nothing.
    expect(shapes.size).toBeGreaterThanOrEqual(FORMATIONS.length / 2);
  });

  it("carries no player twice", () => {
    expect(new Set(chosen.map((c) => c.playerId)).size).toBe(chosen.length);
  });
});

describe("the rival card round-trip", () => {
  it("survives narrowing and widening with everything a card face reads", () => {
    const original = selectRivalCandidates(pool)[0]!;
    const back = fromRivalCard(toRivalCard(original));
    // ⛔ `club` and `ratings` are dereferenced UNGUARDED by `PlayerCard` and `powerOf`. A
    // key dropped here throws at paint, three components from the fetch that omitted it.
    for (const key of ["cardId", "playerId", "season", "name", "role", "altRoles", "club"]) {
      expect(back[key as keyof typeof back]).toEqual(original[key as keyof typeof original]);
    }
    expect(back.ratings?.overall).toBe(ovr(original));
  });
});
