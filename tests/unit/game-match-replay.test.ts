import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import { FORMATIONS, type PoolCard } from "@/features/game/domain/chaos-draft";
import { formationKey } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import { defaultAnswer, type DecisionAnswer } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import type { SavedMatch } from "@/features/game/storage/match-slot";
import { replayMatch } from "@/features/game/view/match-replay";
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
const FORMATION = FORMATIONS[0];
const squad = (): PoolCard[] => FORMATION.slots.map((s) => pool.find((c) => c.role === s.role)!);

/**
 * Play a match for `stopAfter` coach answers and produce the record that would have been
 * saved at that point — i.e. exactly what GamePlay writes.
 */
function playAndSave(seed: number, stopAfter: number) {
  const session = buildSession(pool, squad(), FORMATION, seed, NAMES);
  const events: MatchEvent[] = [];
  const answers: DecisionAnswer[] = [];
  let step = session.stream.advance();
  events.push(...step.events);
  while (step.kind === "decision" && answers.length < stopAfter) {
    const a = defaultAnswer(step.decision);
    answers.push(a);
    step = session.stream.answer(a);
    events.push(...step.events);
  }
  const record: SavedMatch = {
    cardIds: squad().map((c) => c.cardId),
    formationKey: formationKey(FORMATION),
    seed,
    answers,
    fingerprint: hashEvents(events),
    eventCount: events.length,
  };
  return { record, events };
}

describe("replayMatch", () => {
  it("⚠️ reproduces the events exactly", () => {
    // The round trip the whole ticket rests on.
    for (const seed of [1, 42, 777]) {
      const { record, events } = playAndSave(seed, 2);
      const restored = replayMatch(pool, record, NAMES);
      expect(restored).not.toBeNull();
      expect(restored!.events).toEqual(events);
    }
  });

  it("restores a match saved before any decision was answered", () => {
    const { record, events } = playAndSave(42, 0);
    expect(replayMatch(pool, record, NAMES)!.events).toEqual(events);
  });

  it("hands back the outstanding decision so the coach can answer it", () => {
    const restored = replayMatch(pool, playAndSave(42, 2).record, NAMES);
    expect(restored!.pending).not.toBeNull();
    expect(restored!.result).toBeNull();
  });

  it("keeps the stream live, so the restored match plays on to full time", () => {
    const restored = replayMatch(pool, playAndSave(42, 2).record, NAMES)!;
    let step = restored.pending
      ? restored.session.stream.answer(defaultAnswer(restored.pending))
      : null;
    for (let guard = 0; step != null && step.kind === "decision" && guard < 500; guard++) {
      step = restored.session.stream.answer(defaultAnswer(step.decision));
    }
    expect(step?.kind).toBe("done");
  });

  it("⚠️ refuses a record whose events no longer match — the fingerprint gate", () => {
    // Verified to FAIL against an implementation that skips the check: comment out the
    // `hashEvents` comparison in match-replay.ts and this test must go red. A gate that
    // has never been seen to fire is decorative — the degenerate TASK-1821 build passed
    // twelve of thirteen assertions.
    const { record } = playAndSave(42, 2);
    expect(replayMatch(pool, { ...record, fingerprint: record.fingerprint + 1 }, NAMES)).toBeNull();
  });

  it("refuses a record whose event count no longer matches", () => {
    const { record } = playAndSave(42, 2);
    expect(replayMatch(pool, { ...record, eventCount: record.eventCount + 1 }, NAMES)).toBeNull();
  });

  it("⚠️ refuses a record whose squad has drifted", () => {
    // The realistic cause: a data refresh or a rating change moves the pool under a
    // stored match. A different XI simulates differently, which the fingerprint catches.
    const { record } = playAndSave(42, 2);
    const swapped = [...record.cardIds];
    swapped[10] = pool.find((c) => c.role === "CF" && c.cardId !== swapped[10])!.cardId;
    expect(replayMatch(pool, { ...record, cardIds: swapped }, NAMES)).toBeNull();
  });

  it("refuses a record naming a card the pool no longer holds", () => {
    const { record } = playAndSave(42, 2);
    const missing = [...record.cardIds];
    missing[0] = makeCardId(999999, 1999);
    expect(replayMatch(pool, { ...record, cardIds: missing }, NAMES)).toBeNull();
  });

  it("refuses a record naming a formation that no longer exists", () => {
    const { record } = playAndSave(42, 2);
    expect(replayMatch(pool, { ...record, formationKey: "9-9-9/11" }, NAMES)).toBeNull();
  });

  it("⚠️ formation keys are unique, so the lookup is unambiguous", () => {
    // The record stores the KEY rather than an index into FORMATIONS, because an index is
    // positional and reordering that array would resurrect stored matches into the wrong
    // shape. That only works while the keys distinguish the formations.
    const keys = FORMATIONS.map(formationKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
