import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { FORMATIONS, PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { buildSession, type RivalSetup } from "@/features/game/view/match-session";

/**
 * TASK-1825 — a pool whose ratings VARY, so drafted XIs have different shapes and the style
 * modifier actually moves matches. (A pool of identical 50s makes every style edge invisible.)
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

export const STYLE_POOL: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3, 4, 5].map((i) => {
    const k = (r * 7 + i * 13) % 31;
    return {
      cardId: makeCardId(2000 + r * 10 + i, 2015),
      playerId: 2000 + r * 10 + i,
      season: 2015,
      name: `${role}-${i}`,
      role,
      altRoles: [],
      foot: null,
      height: null,
      provenance: null,
      ratings: {
        attack: 40 + k,
        creation: 70 - k,
        defense: 45 + ((k * 3) % 30),
        physical: 50 + ((k * 5) % 25) - 10,
        discipline: 50,
        overall: 60 + (k % 20),
      },
      club: "Club",
    };
  }),
);

export const STYLE_NAMES = { home: "Your XI", away: "Rivals" };

export const squadFor = (formation: (typeof FORMATIONS)[number]): PoolCard[] =>
  formation.slots.map((slot) => STYLE_POOL.find((c) => c.role === slot.role)!);

/** Every event of a session driven to full time with default answers. */
export function drainSession(seed: number, rival: RivalSetup = {}): MatchEvent[] {
  const formation = formationByName("4-4-2 Flat");
  const session = buildSession(
    STYLE_POOL,
    squadFor(formation),
    formation,
    seed,
    STYLE_NAMES,
    rival,
  );
  const events: MatchEvent[] = [];
  let step = session.stream.advance();
  for (let guard = 0; guard < 500; guard++) {
    events.push(...step.events);
    if (step.kind === "done") return events;
    step = session.stream.answer(defaultAnswer(step.decision));
  }
  throw new Error("session did not finish");
}

/** The three rival shapes the legacy golden pins. */
export const GOLDEN_RIVALS: [string, RivalSetup][] = [
  ["none", {}],
  ["best", { policy: "best" }],
  ["chemistry", { chemistry: true }],
];
