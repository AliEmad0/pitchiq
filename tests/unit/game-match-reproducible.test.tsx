import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import { formationByName, formationKey } from "@/features/game/domain/formation";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import { hashEvents } from "@/features/game/domain/hash";
import { answerFor } from "@/features/game/view/bench-state";
import { arraySource, replayWith } from "@/features/game/view/match-replay";
import { useMatchDriver, type MatchDriver } from "@/features/game/view/use-match-driver";

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

const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3, 4, 5].map((i) => ({
    cardId: makeCardId(r * 10 + i, 2020 - i),
    playerId: r * 10 + i,
    season: 2020 - i,
    name: `${role}Player${i}`,
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
      overall: 50 + i * 8,
    },
    club: "Liverpool",
    teamId: 40,
  })),
);

const FORMATION = formationByName("4-4-2 Flat");
const NAMES = { home: "Your XI", away: "Rivals" };
const SEED = 20260820;
const RIVAL = { policy: "best" } as const;

const squad = (): PoolCard[] => {
  const used = new Set<number>();
  return FORMATION.slots.map((slot) => {
    const card = pool.find(
      (c) => !used.has(c.playerId) && (c.role === slot.role || c.altRoles.includes(slot.role)),
    )!;
    used.add(card.playerId);
    return card;
  });
};

/** Expose the driver so a test can drive it exactly as a screen would. */
function Harness({ onReady }: { onReady: (d: MatchDriver) => void }) {
  const driver = useMatchDriver();
  useEffect(() => {
    onReady(driver);
  });
  return null;
}

function mountDriver(): () => MatchDriver {
  let latest: MatchDriver | null = null;
  render(<Harness onReady={(d) => (latest = d)} />);
  return () => latest!;
}

/**
 * ⛔ Owner-reported as "the copied link does not work", and it was never the codec.
 *
 * ⭐ Found by probing the LIVE page, after two test harnesses failed to reproduce it and one
 * of them passed with the fix removed. The probe recorded, in order:
 *
 *   answer(response@30)   while the engine awaited response@30    ← the real one
 *   answer(response@30)   while the engine awaited sub-offer@55   ← a duplicate, applied
 *                                                                   to the NEXT decision
 *
 * React double-invokes effects on mount in development and the live screen answers from an
 * effect, so the first decision was answered twice: the duplicate went into `answers` AND
 * advanced the stream, answering the substitution offer with a reply meant for the goal.
 * The share code carried that, and the replay — which cannot duplicate anything — refused it.
 *
 * ⚠️ Every existing determinism test drives the stream directly, so the driver was never in
 * the round trip. That is how this survived 2,300 green tests.
 */
describe("the driver answers each decision exactly once", () => {
  it("⛔ ignores a stale answer, even though something else is pending by then", () => {
    const get = mountDriver();
    act(() => get().start(pool, squad(), FORMATION, SEED, NAMES, RIVAL));

    const first = get().pending!;
    expect(first).not.toBeNull();
    act(() => get().answer(answerFor(first, "auto")));
    const after = get().answers.length;
    const moved = get().pending;
    // The stream really did advance, so "nothing is pending" cannot be the guard.
    expect(moved).not.toBe(first);

    // The duplicate a double-invoked effect sends: built from the decision it already answered.
    act(() => get().answer(answerFor(first, "auto")));
    expect(get().answers.length, "the duplicate was recorded").toBe(after);
    expect(get().pending, "the duplicate advanced the stream").toBe(moved);
  });

  it("still accepts the answer to the decision that IS waiting", () => {
    const get = mountDriver();
    act(() => get().start(pool, squad(), FORMATION, SEED, NAMES, RIVAL));
    act(() => get().answer(answerFor(get().pending!, "auto")));
    act(() => get().answer(answerFor(get().pending!, "auto")));
    // ⚠️ The half that matters most: an over-tight guard would HANG the generator, and a
    // match that never finishes is worse than one that cannot be shared.
    expect(get().answers).toHaveLength(2);
  });

  it("plays a whole match through, and it reproduces from the answers it recorded", () => {
    const get = mountDriver();
    act(() => get().start(pool, squad(), FORMATION, SEED, NAMES, RIVAL));
    // Answer every decision the way the live screen's auto path does, twice each — the
    // second is exactly the duplicate a double-invoked effect sends.
    for (let i = 0; i < 400 && get().result == null; i++) {
      const pending = get().pending;
      if (pending == null) break;
      const answer = answerFor(pending, "auto");
      act(() => get().answer(answer));
      act(() => get().answer(answer));
    }
    expect(get().result, "the match never finished").not.toBeNull();

    const answers: DecisionAnswer[] = get().answers;
    const replayed = replayWith(
      pool,
      { cardIds: squad().map((c) => c.cardId), formationKey: formationKey(FORMATION), seed: SEED },
      arraySource(answers),
      NAMES,
      { onDrift: "keep", expectedFingerprint: hashEvents(get().events) },
      RIVAL,
    );
    // ⛔ Both halves matter. `null` is the duplicate signature — more answers than the engine
    // raises decisions. `drifted` means they fit but produce a different match.
    expect(replayed, "the replay refused the recorded answers").not.toBeNull();
    expect(replayed!.drifted, "the replay produced a different match").toBe(false);
  });
});
