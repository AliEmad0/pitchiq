import { describe, expect, it } from "vitest";
import { formationByName, formationKey, formationSlug } from "@/features/game/domain/formation";
import { hashEvents } from "@/features/game/domain/hash";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { decodeMatch } from "@/features/game/domain/share-code";
import { buildSession, type RivalSetup } from "@/features/game/view/match-session";
import { buildShareCode, replayShared, shareUrl } from "@/features/game/view/share-link";
import { poolFixture } from "./_helpers/game-pool";

const NAMES = { home: "Your XI", away: "Rivals" };
const FORMATION = formationByName("4-4-2 Flat");
const pool = poolFixture();
const squad = () => FORMATION.slots.map((s) => pool.find((c) => c.role === s.role)!);

/**
 * What a coach actually produces.
 *
 * ⚠️ NOT `defaultAnswer` — that carries a `reason` whenever the engine suggested the sub,
 * and no coach path sets one (`DecisionPrompt` and `fallbackFor` both omit it). Using it
 * here would test a stream the app cannot generate.
 */
const coachAnswer = (d: MatchDecision): DecisionAnswer => {
  const base = { minute: d.minute, side: d.side };
  if (d.kind === "response") return { kind: "response", ...base, choice: "overload" };
  if (d.kind === "injury-sub") return { kind: "injury-sub", ...base };
  if (d.kind === "dismissal") return { kind: "dismissal", ...base };
  return { kind: "sub-offer", ...base };
};

/** Play a match to full time exactly as `GamePlay` does, and keep what it would keep. */
function senderPlays(seed: number, rival: RivalSetup = {}) {
  const session = buildSession(pool, squad(), FORMATION, seed, NAMES, rival);
  const events: MatchEvent[] = [];
  const answers: DecisionAnswer[] = [];
  let step = session.stream.advance();
  events.push(...step.events);
  while (step.kind === "decision") {
    const a = coachAnswer(step.decision);
    answers.push(a);
    step = session.stream.answer(a);
    events.push(...step.events);
  }
  return { answers, events, score: step.result.score };
}

describe("a shared code replays to the sender's match", () => {
  it("⛔ the coach's stance and style ride in the code: the receiver plays the same match", () => {
    const rival = { style: "counter" as const, mentality: "attacking" as const };
    const sent = senderPlays(778, rival);
    const code = buildShareCode({
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed: 778,
      answers: sent.answers,
      fingerprint: hashEvents(sent.events),
      ...rival,
    });
    expect(code.startsWith("v4.")).toBe(true);
    const received = replayShared(pool, decodeMatch(code)!, NAMES)!;
    expect(hashEvents(received.events)).toBe(hashEvents(sent.events));
    expect(received.drifted).toBe(false);
    // And the stance genuinely changes the match, so the check above is not vacuous.
    expect(hashEvents(senderPlays(778, { style: "counter" }).events)).not.toBe(
      hashEvents(sent.events),
    );
  });

  it("round-trips encode → URL → decode → replay", () => {
    const seed = 777;
    const sent = senderPlays(seed);

    const code = buildShareCode({
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed,
      answers: sent.answers,
      fingerprint: hashEvents(sent.events),
    });

    const decoded = decodeMatch(code);
    expect(decoded).not.toBeNull();
    expect(decoded!.formationSlug).toBe(formationSlug(FORMATION.name));

    const received = replayShared(pool, decoded!, NAMES)!;
    expect(received).not.toBeNull();
    // The whole feature in one assertion: the receiver saw the sender's match.
    expect(hashEvents(received.events)).toBe(hashEvents(sent.events));
    expect(received.drifted).toBe(false);
    expect(received.result!.score).toEqual(sent.score);
    expect(received.answers).toEqual(sent.answers);
  });

  it("carries the coach's decisions, not just the setup", () => {
    // The defect this ticket fixed: a code without decisions reproduces a match nobody
    // coached. Two runs of the same seed differing only in decisions must differ.
    const seed = 777;
    const sent = senderPlays(seed);
    const code = buildShareCode({
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed,
      answers: sent.answers,
      fingerprint: hashEvents(sent.events),
    });
    const withoutDecisions = buildShareCode({
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed,
      answers: [],
      fingerprint: hashEvents(sent.events),
    });
    expect(code).not.toBe(withoutDecisions);

    const a = replayShared(pool, decodeMatch(code)!, NAMES)!;
    const b = replayShared(pool, decodeMatch(withoutDecisions)!, NAMES)!;
    expect(hashEvents(a.events)).not.toBe(hashEvents(b.events));
    // And the one that dropped them is the one that reports drift.
    expect(a.drifted).toBe(false);
    expect(b.drifted).toBe(true);
  });

  it("KEEPS its own replay and flags drift when the fingerprint disagrees", () => {
    const seed = 777;
    const sent = senderPlays(seed);
    const code = buildShareCode({
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed,
      answers: sent.answers,
      fingerprint: 0xbadbad,
    });
    const received = replayShared(pool, decodeMatch(code)!, NAMES)!;
    // ⚠️ Not null. The sender's version is unreachable; ours is the only honest thing to
    // show, and the flag is what earns the warning banner.
    expect(received).not.toBeNull();
    expect(received.drifted).toBe(true);
    expect(hashEvents(received.events)).toBe(hashEvents(sent.events));
  });

  it("refuses a code naming a formation that does not exist", () => {
    const seed = 777;
    const sent = senderPlays(seed);
    const code = buildShareCode({
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed,
      answers: sent.answers,
      fingerprint: hashEvents(sent.events),
    });
    const parts = code.split(".");
    parts[2] = "9-9-9-nonsense";
    expect(replayShared(pool, decodeMatch(parts.join("."))!, NAMES)).toBeNull();
  });
});

describe("shareUrl", () => {
  it("points at the canonical draft route, per locale", () => {
    expect(shareUrl("v1.abc", "en")).toBe("/game/draft?m=v1.abc");
    expect(shareUrl("v1.abc", "ar")).toBe("/ar/game/draft?m=v1.abc");
  });
});

describe("TASK-1825 — the coach's style survives the link", () => {
  /** Like `senderPlays`, with a picked style. */
  function senderPlaysStyled(seed: number) {
    const session = buildSession(pool, squad(), FORMATION, seed, NAMES, { style: "direct" });
    const events: MatchEvent[] = [];
    const answers: DecisionAnswer[] = [];
    let step = session.stream.advance();
    events.push(...step.events);
    while (step.kind === "decision") {
      const a = coachAnswer(step.decision);
      answers.push(a);
      step = session.stream.answer(a);
      events.push(...step.events);
    }
    return { answers, events };
  }

  it("a styled match replays to the sender's fingerprint", () => {
    const seed = 4242;
    const sent = senderPlaysStyled(seed);
    const code = buildShareCode({
      cardIds: squad().map((c) => c.cardId),
      formationKey: formationKey(FORMATION),
      seed,
      answers: sent.answers,
      fingerprint: hashEvents(sent.events),
      style: "direct",
    });
    expect(code.startsWith("v3.")).toBe(true);
    const replayed = replayShared(pool, decodeMatch(code)!, NAMES)!;
    expect(replayed.drifted).toBe(false);
    expect(hashEvents(replayed.events)).toBe(hashEvents(sent.events));
    expect(replayed.session.styles.home).toBe("direct");
  });

  it("the same code with another style is flagged as drifted", () => {
    const seeds = [4242, 4243, 4244, 4245, 4246];
    const drifted = seeds.some((seed) => {
      const sent = senderPlaysStyled(seed);
      const code = buildShareCode({
        cardIds: squad().map((c) => c.cardId),
        formationKey: formationKey(FORMATION),
        seed,
        answers: sent.answers,
        fingerprint: hashEvents(sent.events),
        style: "direct",
      });
      const swapped = decodeMatch(code.replace(/\.d$/, ".t"))!;
      const replayed = replayShared(pool, swapped, NAMES);
      return replayed == null || replayed.drifted;
    });
    expect(drifted).toBe(true);
  });
});
