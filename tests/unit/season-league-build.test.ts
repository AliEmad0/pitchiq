import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import {
  buildLeagueTeams,
  buildSeasonTeams,
  pickOpponents,
} from "@/features/game/view/season-league";

const CLUBS = Array.from({ length: 51 }, (_, i) => i + 1);

const ROLES: PlayerRole[] = [
  "GK",
  "GK",
  "RB",
  "CB",
  "CB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "CF",
  "CF",
  "CF",
];

/** A club's pool: enough real roles that `chaosDraft` can field any shape. */
const poolFor = (clubId: number): PoolCard[] =>
  ROLES.map((role, i) => ({
    cardId: `${clubId * 100 + i}@2020`,
    playerId: clubId * 100 + i,
    season: 2020,
    name: `C${clubId}P${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    club: `Club ${clubId}`,
    teamId: clubId,
    ratings: {
      attack: 50 + (i % 7),
      creation: 50,
      defense: 50 + (i % 5),
      physical: 50,
      discipline: 50,
      overall: 60 + i,
    },
  }));

describe("pickOpponents", () => {
  it("returns clubs-1 opponents and never the coach's own club", () => {
    const out = pickOpponents(CLUBS, 40, 20, 4242);
    expect(out).toHaveLength(19);
    expect(out).not.toContain(40);
    expect(new Set(out).size).toBe(19);
  });

  it("⛔ is DETERMINISTIC — the same seed gives the same league", () => {
    expect(pickOpponents(CLUBS, 40, 20, 4242)).toEqual(pickOpponents(CLUBS, 40, 20, 4242));
  });

  it("a different seed gives a different league", () => {
    expect(pickOpponents(CLUBS, 40, 20, 1)).not.toEqual(pickOpponents(CLUBS, 40, 20, 2));
  });

  it("a different COACH gives a different league from the same seed", () => {
    expect(pickOpponents(CLUBS, 40, 20, 4242)).not.toEqual(pickOpponents(CLUBS, 42, 20, 4242));
  });

  it("⚠️ DEGRADES rather than throwing when the pool cannot fill the league", () => {
    // A 20-club season out of 3 clubs is impossible; returning what exists beats an exception
    // on a page the coach has already committed a draft to.
    expect(pickOpponents([1, 2, 3], 1, 20, 7)).toEqual([2, 3]);
    expect(pickOpponents([1], 1, 20, 7)).toEqual([]);
  });

  it("⚠️ draws WITHOUT replacement even when asked for nearly the whole pool", () => {
    const out = pickOpponents(CLUBS, 1, 51, 99);
    expect(out).toHaveLength(50);
    expect(new Set(out).size).toBe(50);
    expect(out).not.toContain(1);
  });
});

describe("buildLeagueTeams", () => {
  const pools = { 40: poolFor(40), 42: poolFor(42), 47: poolFor(47) };

  it("builds one XI per club, eleven strong", () => {
    const teams = buildLeagueTeams([40, 42, 47], pools, 4242);
    expect(teams).toHaveLength(3);
    for (const t of teams) expect(t.players).toHaveLength(11);
  });

  it("⛔ is DETERMINISTIC — the same seed rebuilds the same league", () => {
    const a = buildLeagueTeams([40, 42], pools, 4242);
    const b = buildLeagueTeams([40, 42], pools, 4242);
    expect(a.map((t) => t.players.map((p) => p.cardId))).toEqual(
      b.map((t) => t.players.map((p) => p.cardId)),
    );
  });

  it("gives different clubs different XIs", () => {
    const [x, y] = buildLeagueTeams([40, 42], pools, 4242);
    expect(x!.players.map((p) => p.cardId)).not.toEqual(y!.players.map((p) => p.cardId));
  });

  it("⚠️ SKIPS a club with no pool rather than fielding a fake one", () => {
    expect(buildLeagueTeams([40, 999], pools, 4242)).toHaveLength(1);
    expect(buildLeagueTeams([40, 999], { ...pools, 999: [] }, 4242)).toHaveLength(1);
  });

  it("names each side, so a table can render without a second lookup", () => {
    const teams = buildLeagueTeams([40], pools, 1, (id) => `Club ${id}`);
    expect(teams[0]!.name).toBe("Club 40");
  });
});

describe("buildSeasonTeams", () => {
  const pools = { 1: poolFor(1), 2: poolFor(2), 3: poolFor(3) };
  const coachTeam = {
    teamId: 1,
    name: "My XI",
    season: 2020,
    formation: { name: "4-4-2 Flat", season: 2020, slots: [] },
    players: poolFor(1).slice(0, 11),
    bench: [],
  } as unknown as Parameters<typeof buildSeasonTeams>[0]["coachTeam"];

  it("⛔ the COACH fields the XI he drafted, never a re-draft", () => {
    const teams = buildSeasonTeams({
      leagueIds: [1, 2, 3],
      pools,
      seed: 4242,
      coachId: 1,
      coachTeam,
    });
    expect(teams[0]).toBe(coachTeam);
    expect(teams[0]!.players.map((p) => p.cardId)).toEqual(
      poolFor(1)
        .slice(0, 11)
        .map((p) => p.cardId),
    );
  });

  it("⛔ and in the SHAPE he locked — chaosDraft would have picked its own", () => {
    const teams = buildSeasonTeams({
      leagueIds: [1, 2, 3],
      pools,
      seed: 4242,
      coachId: 1,
      coachTeam,
    });
    expect(teams[0]!.formation.name).toBe("4-4-2 Flat");
    // The control: an OPPONENT is drafted, so its shape came from the draft, not from here.
    expect(teams[1]!.formation.name).not.toBe("");
  });

  it("substitutes at his INDEX, not always at zero", () => {
    const teams = buildSeasonTeams({
      leagueIds: [2, 1, 3],
      pools,
      seed: 4242,
      coachId: 1,
      coachTeam,
    });
    expect(teams[1]).toBe(coachTeam);
    expect(teams[0]).not.toBe(coachTeam);
  });

  it("⚠️ leaves the league alone when his id is not in it", () => {
    const teams = buildSeasonTeams({
      leagueIds: [2, 3],
      pools,
      seed: 4242,
      coachId: 1,
      coachTeam,
    });
    expect(teams).toHaveLength(2);
    expect(teams).not.toContain(coachTeam);
  });
});
