import { describe, expect, it } from "vitest";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { hashEvents } from "@/features/game/domain/hash";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import type { MatchEvent } from "@/features/game/domain/match-types";
import { type Mentality, MENTALITIES, mentalityTarget } from "@/features/game/domain/mentality";
import { buildSession } from "@/features/game/view/match-session";

/**
 * Mentality — measured on the REAL engine and the REAL pool. A stance sets the TEMPO: more goals
 * at both ends, or fewer. ⭐ And it must be a real decision: an open game should favour the
 * stronger side … was the hypothesis; measured, the engine shows no such split, so the claim is
 * about tempo and draws only.
 */
const NAMES = { home: "Your XI", away: "Rivals" };
const SEEDS = 1500;

type Pool = PoolCard[];
const mean = (ps: readonly { ratings: { overall: number } | null }[]) =>
  ps.reduce((a, p) => a + (p.ratings?.overall ?? 0), 0) / ps.length;

function play(pool: Pool, seed: number, mentality?: Mentality) {
  // Alternate the coach between a strong and a random XI so both favourites and underdogs occur.
  const policy = seed % 2 === 0 ? "strong" : "random";
  const mine = chaosDraft(pool, (seed * 2654435761) >>> 0, "mine", { policy });
  const s = buildSession(pool, mine.players as PoolCard[], mine.formation, seed, NAMES, {
    policy: seed % 2 === 0 ? "random" : "strong",
    style: "balanced",
    ...(mentality == null ? {} : { mentality }),
  });
  const events: MatchEvent[] = [];
  let step = s.stream.advance();
  for (let guard = 0; guard < 500; guard++) {
    events.push(...step.events);
    if (step.kind === "done") {
      return { events, score: step.result.score, gap: mean(s.home.players) - mean(s.away.players) };
    }
    step = s.stream.answer(defaultAnswer(step.decision));
  }
  throw new Error("did not finish");
}

describe("mentality on the real engine", () => {
  it("balanced/absent keeps the goal target exactly; the others scale it", () => {
    expect(mentalityTarget(2.7, undefined)).toBe(2.7);
    expect(mentalityTarget(2.7, "balanced")).toBe(2.7);
    expect(mentalityTarget(2.7, "attacking")).toBeGreaterThan(2.7);
    expect(mentalityTarget(2.7, "defensive")).toBeLessThan(2.7);
  });

  it("⭐ attacking opens the game, defensive shuts it", async () => {
    const pool = await loadChaosPool();
    type Agg = { n: number; gf: number; ga: number; pts: number; d: number };
    const blank = (): Agg => ({ n: 0, gf: 0, ga: 0, pts: 0, d: 0 });
    const all = Object.fromEntries(MENTALITIES.map((m) => [m, blank()])) as Record<Mentality, Agg>;
    const fav = Object.fromEntries(MENTALITIES.map((m) => [m, blank()])) as Record<Mentality, Agg>;
    const dog = Object.fromEntries(MENTALITIES.map((m) => [m, blank()])) as Record<Mentality, Agg>;
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (const m of MENTALITIES) {
        const { score, gap } = play(pool, seed, m);
        const pts = score.home > score.away ? 3 : score.home === score.away ? 1 : 0;
        for (const a of [all[m], gap >= 3 ? fav[m] : gap <= -3 ? dog[m] : null]) {
          if (a == null) continue;
          a.n++;
          a.gf += score.home;
          a.ga += score.away;
          a.pts += pts;
          if (pts === 1) a.d++;
        }
      }
    }
    const per = (a: Agg) => ({
      n: a.n,
      gf: a.gf / a.n,
      ga: a.ga / a.n,
      ppg: a.pts / a.n,
      draw: a.d / a.n,
    });
    const report = Object.fromEntries(
      MENTALITIES.map((m) => [m, { all: per(all[m]), fav: per(fav[m]), dog: per(dog[m]) }]),
    ) as Record<Mentality, Record<"all" | "fav" | "dog", ReturnType<typeof per>>>;
    console.log(JSON.stringify(report));
    const { attacking: att, balanced: bal, defensive: def } = report;
    // The tempo: both ends move together.
    expect(att.all.gf).toBeGreaterThan(bal.all.gf * 1.15);
    expect(att.all.ga).toBeGreaterThan(bal.all.ga * 1.15);
    expect(def.all.gf).toBeLessThan(bal.all.gf * 0.85);
    expect(def.all.ga).toBeLessThan(bal.all.ga * 0.85);
    expect(def.all.draw).toBeGreaterThan(bal.all.draw);
    // The risk: an open game is decided more often, a tight one is drawn more often.
    expect(att.all.draw).toBeLessThan(def.all.draw);
    // ⛔ Not a free win on average — the counter-attack edge is what pays for the extra goals.
    expect(Math.abs(att.all.ppg - bal.all.ppg)).toBeLessThan(0.08);
    expect(Math.abs(def.all.ppg - bal.all.ppg)).toBeLessThan(0.08);
  }, 400_000);

  it("⛔ balanced is byte-identical to no stance at all (old saves and v3 links)", async () => {
    const pool = await loadChaosPool();
    for (let seed = 1; seed <= 20; seed++) {
      expect(hashEvents(play(pool, seed, "balanced").events)).toBe(
        hashEvents(play(pool, seed).events),
      );
    }
  }, 120_000);

  it("a stance changes no squad", async () => {
    const pool = await loadChaosPool();
    const mine = chaosDraft(pool, 7, "mine", { policy: "strong" });
    const xi = mine.players as PoolCard[];
    const a = buildSession(pool, xi, mine.formation, 7, NAMES, { style: "counter" });
    const b = buildSession(pool, xi, mine.formation, 7, NAMES, {
      style: "counter",
      mentality: "attacking",
    });
    expect(b.away.players.map((p) => p.cardId)).toEqual(a.away.players.map((p) => p.cardId));
    expect(b.home.players.map((p) => p.cardId)).toEqual(a.home.players.map((p) => p.cardId));
  }, 60_000);
});
