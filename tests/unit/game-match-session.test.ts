import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { buildSession } from "@/features/game/view/match-session";

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

const NAMES = { home: "Your XI", away: "Rivals" };

/** The first eligible pool card for each slot of a formation. */
const squadFor = (formation: (typeof FORMATIONS)[number]): PoolCard[] =>
  formation.slots.map((slot) => pool.find((c) => c.role === slot.role)!);

/** Drive a session to full time with default answers, collecting every event. */
function drain(seed: number): MatchEvent[] {
  const formation = FORMATIONS[0];
  const session = buildSession(pool, squadFor(formation), formation, seed, NAMES);
  const events: MatchEvent[] = [];
  let step = session.stream.advance();
  for (let guard = 0; guard < 500; guard++) {
    events.push(...step.events);
    if (step.kind === "done") return events;
    step = session.stream.answer(defaultAnswer(step.decision));
  }
  throw new Error("session did not finish — it is looping");
}

describe("buildSession", () => {
  it("names both sides from the caller", () => {
    const formation = FORMATIONS[0];
    const session = buildSession(pool, squadFor(formation), formation, 42, NAMES);
    expect(session.home.name).toBe("Your XI");
    expect(session.seed).toBe(42);
  });

  it("puts the drafted squad on the home side, in slot order", () => {
    const formation = FORMATIONS[0];
    const players = squadFor(formation);
    const session = buildSession(pool, players, formation, 42, NAMES);
    expect(session.home.players.map((p) => p.cardId)).toEqual(players.map((p) => p.cardId));
  });

  it("⚠️ the same inputs produce the same match, every time", () => {
    // This is the property the whole ticket rests on: resume re-runs the tuple, so if two
    // builds from identical inputs could differ, no fingerprint would ever match.
    for (const seed of [1, 42, 777]) {
      expect(drain(seed)).toEqual(drain(seed));
    }
  });

  it("different seeds produce different matches", () => {
    expect(drain(1)).not.toEqual(drain(2));
  });
});
