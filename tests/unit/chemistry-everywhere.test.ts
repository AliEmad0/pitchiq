import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import { decodeMatch, encodeMatch } from "@/features/game/domain/share-code";
import { buildSession, type RivalSetup } from "@/features/game/view/match-session";

/**
 * TASK-1824 — chemistry in every drafted mode, with role fit.
 *
 * ⛔ The two rules this file pins: role fit actually reaches the engine, and every match made
 * before the flag existed keeps its meaning — links-only for the Chemistry Draft, nothing at all
 * for Legacy, Budget and the rest.
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

const mates: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i, 2004),
    playerId: r * 100 + i,
    season: 2004,
    name: `${role}-${i}`,
    role,
    altRoles: [...ROLES],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 62, creation: 62, defense: 62, physical: 62, discipline: 55, overall: 62 },
    club: "Arsenal",
    teamId: 7,
    nationalityCode: "fr",
  })),
);
const stars: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => ({
    ...mates[0]!,
    cardId: makeCardId(9000 + r * 100 + i, 1994 + ((r + i) % 25)),
    playerId: 9000 + r * 100 + i,
    season: 1994 + ((r + i) % 25),
    name: `${role}-star-${i}`,
    role,
    altRoles: [],
    ratings: { attack: 92, creation: 92, defense: 92, physical: 92, discipline: 55, overall: 92 },
    club: `Club${r * 100 + i}`,
    teamId: 9000 + r * 100 + i,
    nationalityCode: `n${r * 100 + i}`,
  })),
);
const pool = [...mates, ...stars];
const shape = formationByName("4-4-2 Flat")!;
/**
 * One club, one season — a teammate side — but every OUTFIELD man is a centre-mid playing out of
 * position. Links-only chemistry rates it near the top; with fit it collapses, which is the gap
 * the flag must make the engine feel.
 */
const xiOff = shape.slots.map((s, i) =>
  s.role === "GK"
    ? mates.find((c) => c.role === "GK")!
    : mates.filter((c) => c.role === "CM")[i % 6]!,
);
const names = { home: "Home", away: "Away" };
const SEEDS = [4242, 7, 99, 1234, 55555, 8080, 31337, 2024, 606, 12, 777, 90210];

function play(rival: RivalSetup, seed: number): number {
  const s = buildSession(pool, xiOff, shape, seed, names, rival);
  let step = s.stream.advance();
  for (let g = 0; step.kind !== "done" && g < 500; g++) {
    step =
      step.kind === "decision" ? s.stream.answer({ kind: "noop" } as never) : s.stream.advance();
  }
  return hashEvents(step.kind === "done" ? step.result.events : []);
}

describe("chemistry everywhere", () => {
  it("⛔ role fit REACHES the engine — an out-of-position XI plays a different match", () => {
    const differing = SEEDS.filter(
      (s) =>
        play({ policy: "best", chemistry: true, fit: true }, s) !==
        play({ policy: "best", chemistry: true }, s),
    );
    expect(differing.length).toBeGreaterThanOrEqual(3);
  });

  it("⛔ fit without chemistry is inert — the flag only refines a match that plays chemistry", () => {
    for (const s of SEEDS.slice(0, 4)) {
      expect(play({ policy: "best", fit: true }, s)).toBe(play({ policy: "best" }, s));
    }
  });

  it("⛔ an older Chemistry Draft match (links only, no fit field) replays exactly as it did", () => {
    for (const s of SEEDS.slice(0, 4)) {
      expect(play({ policy: "best", chemistry: true, fit: false }, s)).toBe(
        play({ policy: "best", chemistry: true }, s),
      );
    }
  });
});

describe("share code v7", () => {
  const base = {
    cardIds: Array.from({ length: 11 }, (_, i) => `${1000 + i}@2010` as const),
    formationSlug: "4-4-2-flat",
    seed: 9,
    tokens: "",
    fingerprint: 1,
    rival: null,
  };

  it("round-trips links and links + fit, with or without the crisis", () => {
    for (const m of [
      { ...base, chemistry: true },
      { ...base, chemistry: true, fit: true },
      {
        ...base,
        chemistry: true,
        fit: true,
        crisis: true,
        personality: true,
        style: "counter" as const,
      },
    ]) {
      const code = encodeMatch(m);
      expect(code.startsWith("v7.")).toBe(true);
      expect(decodeMatch(code)).toEqual(m);
    }
  });

  it("⛔ a match without chemistry never writes v7, and an older code carries NO chemistry field", () => {
    const v6 = encodeMatch({ ...base, crisis: true });
    expect(v6.startsWith("v6.")).toBe(true);
    // Absent — not false — so the receiving route supplies what it always meant.
    expect(decodeMatch(v6)).not.toHaveProperty("chemistry");
    expect(decodeMatch(v6)).not.toHaveProperty("fit");
  });

  it("refuses a tampered chemistry segment", () => {
    const parts = encodeMatch({ ...base, chemistry: true, fit: true }).split(".");
    expect(decodeMatch([...parts.slice(0, 11), "x"].join("."))).toBeNull();
    expect(decodeMatch([...parts.slice(0, 10), "q", "hf"].join("."))).toBeNull();
    expect(decodeMatch(parts.slice(0, 11).join("."))).toBeNull();
  });
});
