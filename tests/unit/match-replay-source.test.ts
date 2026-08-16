import { describe, expect, it } from "vitest";
import { formationByName, formationKey } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import { defaultAnswer, type DecisionAnswer } from "@/features/game/domain/match-decisions";
import { arraySource, replayWith } from "@/features/game/view/match-replay";
import { poolFixture } from "./_helpers/game-pool";

const NAMES = { home: "Your XI", away: "Rivals" };
const FORMATION = formationByName("4-4-2 Flat");

const pool = poolFixture();
const squad = () => FORMATION.slots.map((s) => pool.find((c) => c.role === s.role)!);
const setup = (seed: number) => ({
  cardIds: squad().map((c) => c.cardId),
  formationKey: formationKey(FORMATION),
  seed,
});

/** Play to full time with the engine's own answers, collecting them. */
function playFully(seed: number) {
  const first = replayWith(pool, setup(seed), arraySource([]), NAMES, { onDrift: "keep" })!;
  const answers: DecisionAnswer[] = [];
  let step = first.pending == null ? null : { decision: first.pending };
  const stream = first.session.stream;
  let guard = 0;
  while (step != null && guard++ < 500) {
    const a = defaultAnswer(step.decision);
    answers.push(a);
    const next = stream.answer(a);
    step = next.kind === "decision" ? { decision: next.decision } : null;
  }
  return answers;
}

describe("replayWith", () => {
  it("is deterministic — the same tuple reproduces the same events", () => {
    const a = replayWith(pool, setup(4242), arraySource([]), NAMES, { onDrift: "keep" })!;
    const b = replayWith(pool, setup(4242), arraySource([]), NAMES, { onDrift: "keep" })!;
    expect(hashEvents(b.events)).toBe(hashEvents(a.events));
  });

  it("runs a full set of answers through to full time", () => {
    const answers = playFully(4242);
    const done = replayWith(pool, setup(4242), arraySource(answers), NAMES, { onDrift: "keep" })!;
    expect(done.result).not.toBeNull();
    expect(done.pending).toBeNull();
    expect(done.answers).toEqual(answers);
  });

  // ⚠️ The asymmetry the fingerprint exists for, asserted in BOTH directions against the
  // same drifted input — the two policies must differ only here.
  it("DISCARDS on drift when told to, and KEEPS when told to", () => {
    const wrong = 0x1234;

    expect(
      replayWith(pool, setup(4242), arraySource([]), NAMES, {
        onDrift: "discard",
        expectedFingerprint: wrong,
      }),
    ).toBeNull();

    const kept = replayWith(pool, setup(4242), arraySource([]), NAMES, {
      onDrift: "keep",
      expectedFingerprint: wrong,
    })!;
    expect(kept).not.toBeNull();
    expect(kept.drifted).toBe(true);
  });

  it("reports drifted:false when the fingerprint agrees", () => {
    const first = replayWith(pool, setup(4242), arraySource([]), NAMES, { onDrift: "keep" })!;
    const again = replayWith(pool, setup(4242), arraySource([]), NAMES, {
      onDrift: "keep",
      expectedFingerprint: hashEvents(first.events),
    })!;
    expect(again.drifted).toBe(false);
  });

  // ⛔ The behaviour the original `replayMatch` had inline and which the refactor must not
  // lose: more stored answers than the engine raises decisions is a changed match.
  it("refuses a source holding more answers than the engine asks for", () => {
    const answers = playFully(4242);
    const tooMany = [...answers, ...answers.slice(0, 3)];
    expect(
      replayWith(pool, setup(4242), arraySource(tooMany), NAMES, { onDrift: "keep" }),
    ).toBeNull();
  });

  it("refuses a setup naming a card the pool no longer holds", () => {
    const broken = { ...setup(4242), cardIds: ["999999@1999" as const, ...setup(4242).cardIds.slice(1)] };
    expect(replayWith(pool, broken, arraySource([]), NAMES, { onDrift: "keep" })).toBeNull();
  });

  it("refuses a setup naming a formation that no longer exists", () => {
    const broken = { ...setup(4242), formationKey: "9-9-9/11" };
    expect(replayWith(pool, broken, arraySource([]), NAMES, { onDrift: "keep" })).toBeNull();
  });
});
