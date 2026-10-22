import { describe, expect, it } from "vitest";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { encodeTokens, readTokens } from "@/features/game/domain/decision-tokens";
import { hashEvents } from "@/features/game/domain/hash";
import {
  type CrisisDecision,
  type DecisionAnswer,
  defaultAnswer,
  type MatchDecision,
} from "@/features/game/domain/match-decisions";
import type { CrisisChoice, MatchEvent } from "@/features/game/domain/match-types";
import { decodeMatch, encodeMatch } from "@/features/game/domain/share-code";
import { CRISIS_FROM, CRISIS_TO, drive, runMatch } from "@/features/game/domain/simulate";
import { buildSession } from "@/features/game/view/match-session";

/** TASK-1814 follow-up — the mid-match crisis prompt, measured on the real pool and engine. */
const NAMES = { home: "Your XI", away: "Rivals" };

function play(
  pool: PoolCard[],
  seed: number,
  rival: { crisis?: boolean; personality?: boolean },
  homeCall?: CrisisChoice,
) {
  const mine = chaosDraft(pool, (seed * 2654435761) >>> 0, "mine", { policy: "strong" });
  const s = buildSession(pool, mine.players as PoolCard[], mine.formation, seed, NAMES, {
    policy: "strong",
    style: "balanced",
    ...rival,
  });
  const events: MatchEvent[] = [];
  const decisions: MatchDecision[] = [];
  const answers: DecisionAnswer[] = [];
  let step = s.stream.advance();
  for (let guard = 0; guard < 500; guard++) {
    events.push(...step.events);
    if (step.kind === "done") return { events, decisions, answers, score: step.result.score };
    decisions.push(step.decision);
    const d = step.decision;
    let a = defaultAnswer(d);
    if (d.kind === "crisis" && homeCall != null)
      a = { kind: "crisis", minute: d.minute, side: d.side, choice: homeCall };
    if (a.kind === "sub-offer") a = { ...a, reason: undefined };
    answers.push(a);
    step = s.stream.answer(a);
  }
  throw new Error("did not finish");
}

describe("the crisis prompt", () => {
  it("⛔ absent is byte-identical — the main stream is never touched", async () => {
    const pool = await loadChaosPool();
    for (let seed = 1; seed <= 12; seed++) {
      expect(hashEvents(play(pool, seed, { crisis: false }).events)).toBe(
        hashEvents(play(pool, seed, {}).events),
      );
    }
  }, 120_000);

  it("is raised at most once for the coach, 70'–78', and ONLY when a change is possible", async () => {
    const pool = await loadChaosPool();
    let raised = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = play(pool, seed, { crisis: true });
      const crises = r.decisions.filter((d): d is CrisisDecision => d.kind === "crisis");
      expect(crises.length).toBeLessThanOrEqual(1);
      for (const c of crises) {
        raised++;
        expect(c.minute).toBeGreaterThanOrEqual(CRISIS_FROM);
        expect(c.minute).toBeLessThanOrEqual(CRISIS_TO);
        expect(c.name.length).toBeGreaterThan(0);
        // ⛔ Never a choice with only one answer: a rest must be possible.
        expect(c.legalOn.length).toBeGreaterThan(0);
      }
      expect(r.events.filter((e) => e.kind === "crisis").length).toBeLessThanOrEqual(2);
    }
    // And it is not a rarity: most matches still reach it with a change in hand.
    expect(raised).toBeGreaterThan(15);
  }, 120_000);

  it("⭐ neither call is a free edge in the match — the price of a push is the breakdown", async () => {
    const pool = await loadChaosPool();
    const N = 400;
    let gfPush = 0;
    let gfRest = 0;
    let breakdowns = 0;
    let pushes = 0;
    for (let seed = 1; seed <= N; seed++) {
      const push = play(pool, seed, { crisis: true }, "push");
      const rest = play(pool, seed, { crisis: true }, "rest");
      gfPush += push.score.home;
      gfRest += rest.score.home;
      const call = push.events.find((e) => e.kind === "crisis" && e.side === "home");
      if (call == null) continue;
      pushes++;
      if (
        push.events.some(
          (e) =>
            e.kind === "injury" &&
            e.side === "home" &&
            e.playerId === call.playerId &&
            e.minute > call.minute,
        )
      ) {
        breakdowns++;
      }
    }
    console.log(
      JSON.stringify({
        gfPush: gfPush / N,
        gfRest: gfRest / N,
        breakdownRate: breakdowns / pushes,
      }),
    );
    // Measured: over 1,500 matches late goals come out level (583 v 581 for, 549 v 545
    // against) — the engine shares a fixed goal total, so both boosts buy a similar edge. What a
    // push really risks is the man: a moderate injury, which a season carries into the next week.
    expect(Math.abs(gfPush - gfRest) / N).toBeLessThan(0.1);
    expect(pushes).toBeGreaterThan(N / 2);
    expect(breakdowns / pushes).toBeGreaterThan(0.25);
    expect(breakdowns / pushes).toBeLessThan(0.55);
  }, 400_000);

  it("rides the token stream and refuses a crisis token for any other decision", async () => {
    const pool = await loadChaosPool();
    const r = play(pool, 7, { crisis: true }, "push");
    const code = encodeTokens(r.answers);
    expect(code).toContain("cp");
    const reader = readTokens(code)!;
    for (const d of r.decisions) expect(reader.next(d).ok).toBe(true);
    expect(reader.done()).toBe(true);
    // A crisis token answering a sub-offer is a mismatch, not a quiet substitution.
    const lone = readTokens("cp")!;
    const sub = r.decisions.find((d) => d.kind === "sub-offer")!;
    expect(lone.next(sub)).toEqual({ ok: false, reason: "mismatch" });
    expect(readTokens("cx")).toBeNull();
    expect(
      encodeTokens([{ kind: "crisis", minute: 72, side: "home", choice: "rest", on: 35 }]),
    ).toBe("crz");
  }, 120_000);

  it("share code v6 round-trips, and only a crisis match writes it", () => {
    const base = {
      cardIds: Array.from({ length: 11 }, (_, i) => `${1000 + i}@2010` as const),
      formationSlug: "4-4-2-flat",
      seed: 9,
      tokens: "",
      fingerprint: 1,
      rival: null,
    };
    const both = { ...base, personality: true, crisis: true, style: "counter" as const };
    expect(encodeMatch(both).startsWith("v6.")).toBe(true);
    expect(decodeMatch(encodeMatch(both))).toEqual(both);
    const crisisOnly = { ...base, crisis: true };
    expect(decodeMatch(encodeMatch(crisisOnly))).toEqual(crisisOnly);
    expect(encodeMatch({ ...base, personality: true }).startsWith("v5.")).toBe(true);
    const parts = encodeMatch(both).split(".");
    expect(decodeMatch([...parts.slice(0, 10), "x"].join("."))).toBeNull();
    expect(decodeMatch([...parts.slice(0, 9), "q", "c"].join("."))).toBeNull();
  });

  it("the engine's own answer rests the man when a change is possible", async () => {
    const pool = await loadChaosPool();
    let rests = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const mine = chaosDraft(pool, seed * 3, "m", { policy: "strong" });
      const away = chaosDraft(pool, seed * 5, "a", { policy: "strong" });
      const r = drive(
        runMatch({ home: mine, away, seed, targetGoalsPerMatch: 2.7, crisis: true }),
        (q) => {
          const a = defaultAnswer(q);
          return a.kind === "sub-offer" ? { ...a, reason: undefined } : a;
        },
      );
      const calls = r.events.filter((x) => x.kind === "crisis");
      expect(calls.length).toBeLessThanOrEqual(2);
      // Raised only when a change is possible, and the engine's own answer is then to rest him —
      // and a "rest" in the feed is always a real substitution.
      for (const c of calls.filter((x) => x.crisisChoice === "rest")) {
        rests++;
        // The feed never claims a change that did not happen: a rest IS a substitution.
        expect(
          r.events.some(
            (e) =>
              e.kind === "substitution" &&
              e.side === c.side &&
              e.playerId === c.playerId &&
              e.subReason === "stamina",
          ),
        ).toBe(true);
      }
    }
    expect(rests).toBeGreaterThan(10);
  }, 60_000);
});
