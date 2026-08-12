import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId, type PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { fillGaps } from "@/features/game/domain/fill-gaps";
import { mulberry32 } from "@/features/game/domain/rng";

const card = (playerId: number, role: PlayerRole, altRoles: PlayerRole[] = []): PoolCard => ({
  cardId: makeCardId(playerId, 2020),
  playerId,
  season: 2020,
  name: `P${playerId}`,
  role,
  altRoles,
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Club",
});

/** Four of every role, so every slot in every FORMATION can be filled legally. */
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
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3].map((i) => card(1000 + r * 10 + i, role)),
);
const shape = formationByName("4-4-2 Flat");
// Annotated on purpose: inferred, this is `null[]` and assigning a cardId into it fails
// under the project-wide tsc even though per-file vitest is happy.
const empty = (): (PlayerSeasonId | null)[] => shape.slots.map(() => null);

describe("fillGaps", () => {
  it("fills every slot with an eligible card", () => {
    const out = fillGaps(pool, shape, empty(), mulberry32(1));
    expect(out).toHaveLength(shape.slots.length);
    out.forEach((id, i) => {
      expect(id).not.toBeNull();
      const c = pool.find((p) => p.cardId === id)!;
      expect(c.role === shape.slots[i].role || c.altRoles.includes(shape.slots[i].role)).toBe(true);
    });
  });

  it("is deterministic from its rng", () => {
    expect(fillGaps(pool, shape, empty(), mulberry32(7))).toEqual(
      fillGaps(pool, shape, empty(), mulberry32(7)),
    );
  });

  it("leaves already-placed cards exactly where they are", () => {
    const placed = empty();
    placed[5] = pool.find((c) => c.role === "LM")!.cardId;
    const out = fillGaps(pool, shape, placed, mulberry32(3));
    expect(out[5]).toBe(placed[5]);
  });

  it("never duplicates a player the coach placed himself", () => {
    const mine = pool.find((c) => c.role === "CM")!;
    const placed = empty();
    placed[6] = mine.cardId;
    const out = fillGaps(pool, shape, placed, mulberry32(3));
    expect(out.filter((id) => id === mine.cardId)).toHaveLength(1);
  });

  it("never plays the same player twice", () => {
    const out = fillGaps(pool, shape, empty(), mulberry32(11));
    const ids = out.filter((id): id is NonNullable<typeof id> => id != null);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("stops filling when the pool runs dry, leaving the rest null", () => {
    const tiny = pool.slice(0, 3);
    const out = fillGaps(tiny, shape, empty(), mulberry32(5));
    expect(out.filter((id) => id != null)).toHaveLength(3);
    expect(out[out.length - 1]).toBeNull();
  });
});
