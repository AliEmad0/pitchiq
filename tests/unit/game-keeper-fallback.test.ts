import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { GamePlayer } from "@/features/game/domain/player";
import { pickPlayerOn } from "@/features/game/domain/squad";

/**
 * A side must never end up with two goalkeepers on the pitch.
 *
 * `chaosDraft` builds the bench in `BENCH_SHAPE` order, which puts the spare keeper
 * FIRST — so the old `free[0]` fallback handed the goalkeeper to any substitution whose
 * like-for-like replacement was already used. That is not a rare corner: it fires
 * whenever the matching role is taken.
 *
 * It was worse than cosmetic. `powerOf` folds the substitute's ratings into an outfield
 * role, so the side was quietly weaker than its own teamsheet, and the pitch map drew
 * two keepers.
 */

const mk = (playerId: number, role: PlayerRole): GamePlayer => ({
  cardId: `${playerId}@2020`,
  playerId,
  season: 2020,
  name: `${role}-${playerId}`,
  role,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
});

const keeper = mk(1, "GK");
const centreBack = mk(2, "CB");
const midfielder = mk(3, "CM");
/** Bench in BENCH_SHAPE order — the keeper first, exactly as chaosDraft drafts it. */
const bench = [keeper, centreBack, midfielder];
const allFree = new Set(bench.map((p) => p.playerId));

describe("pickPlayerOn", () => {
  it("takes a like-for-like replacement when one is available", () => {
    expect(pickPlayerOn(bench, allFree, "CB")).toBe(centreBack);
  });

  it("⚠️ never falls back to the spare keeper for an outfield change", () => {
    // The exact defect: no LW on the bench, and the keeper sits at index 0.
    const chosen = pickPlayerOn(bench, allFree, "LW");
    expect(chosen).not.toBeNull();
    expect(chosen!.role).not.toBe("GK");
  });

  it("still brings the keeper on when a KEEPER is the one going off", () => {
    // The sweeper-keeper path depends on this: a dismissed goalkeeper must be replaced
    // by the backup, so the exclusion cannot be unconditional.
    expect(pickPlayerOn(bench, allFree, "GK")).toBe(keeper);
  });

  it("uses the keeper as a last resort when he is the only one left", () => {
    // A side with nobody else available is better off with an outfielder-keeper than
    // with a refused substitution and a man short.
    const onlyKeeper = new Set([keeper.playerId]);
    expect(pickPlayerOn(bench, onlyKeeper, "CM")).toBe(keeper);
  });

  it("returns null when the bench is empty", () => {
    expect(pickPlayerOn(bench, new Set(), "CB")).toBeNull();
  });
});
