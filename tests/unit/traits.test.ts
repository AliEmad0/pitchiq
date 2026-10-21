import { describe, expect, it } from "vitest";
import { loadChaosPool } from "@/features/game/adapter/chaos-pool";
import { chaosDraft, type PoolCard } from "@/features/game/domain/chaos-draft";
import { hashEvents } from "@/features/game/domain/hash";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchState } from "@/features/game/domain/match-types";
import { makeGameTeam } from "@/features/game/domain/team";
import {
  LATE_SWING,
  personalityModifier,
  type TraitId,
  TRAITS,
  traitsOf,
} from "@/features/game/domain/traits";
import { buildSession } from "@/features/game/view/match-session";

/** TASK-1814 — data-derived traits and the late-goal swing, measured on the real pool. */
const NAMES = { home: "Your XI", away: "Rivals" };

function play(pool: PoolCard[], seed: number, personality?: boolean) {
  const mine = chaosDraft(pool, (seed * 2654435761) >>> 0, "mine", {
    policy: seed % 2 === 0 ? "strong" : "random",
  });
  const s = buildSession(pool, mine.players as PoolCard[], mine.formation, seed, NAMES, {
    policy: seed % 2 === 0 ? "random" : "strong",
    style: "balanced",
    ...(personality == null ? {} : { personality }),
  });
  const events: MatchEvent[] = [];
  let step = s.stream.advance();
  for (let guard = 0; guard < 500; guard++) {
    events.push(...step.events);
    if (step.kind === "done") return { events, score: step.result.score };
    const a = defaultAnswer(step.decision);
    step = s.stream.answer(a.kind === "sub-offer" ? { ...a, reason: undefined } : a);
  }
  throw new Error("did not finish");
}

describe("traits are read from the data", () => {
  it("each trait is rare enough to mean something, and none is missing", async () => {
    const pool = await loadChaosPool();
    const share = Object.fromEntries(
      TRAITS.map((t) => [t, pool.filter((c) => traitsOf(c).includes(t)).length / pool.length]),
    ) as Record<TraitId, number>;
    console.log(JSON.stringify(share));
    for (const t of TRAITS) {
      expect(share[t]).toBeGreaterThan(0.01);
      expect(share[t]).toBeLessThan(0.2);
    }
  }, 60_000);

  it("a card without ratings has no traits; a keeper is never a talisman", () => {
    expect(traitsOf({ role: "CF", ratings: null })).toEqual([]);
    const gk = { attack: 10, creation: 10, defense: 90, physical: 90, discipline: 20, overall: 95 };
    expect(traitsOf({ role: "GK", ratings: gk })).toEqual(["rock"]);
  });
});

describe("the late-goal swing", () => {
  const card = (id: number, role: string) =>
    ({ playerId: id, cardId: `${id}@2020`, role, ratings: null }) as never;
  const team = (base: number) =>
    makeGameTeam(base, "T", 0, { name: "x", season: 0, slots: [] }, [card(base, "CF")]);
  const state = (minute: number, events: MatchEvent[]): MatchState =>
    ({
      minute,
      events,
      home: { score: 1, unavailable: new Set(), broughtOn: new Set() },
      away: { score: 1, unavailable: new Set(), broughtOn: new Set() },
    }) as unknown as MatchState;
  const mod = personalityModifier(team(1), team(2));
  const goal = (minute: number, extra: Partial<MatchEvent> = {}): MatchEvent => ({
    minute,
    kind: "goal",
    side: "home",
    ...extra,
  });

  it("lifts the scorer and panics the conceder for five minutes after a late goal", () => {
    const s = state(80, [goal(78)]);
    expect(mod({ state: s, side: "home" })).toEqual({ attack: LATE_SWING.surge.attack });
    expect(mod({ state: s, side: "away" })).toEqual({
      foul: LATE_SWING.panic.foul,
      card: LATE_SWING.panic.card,
      defense: LATE_SWING.panic.defense,
    });
    expect(mod({ state: state(83, [goal(78)]), side: "away" })).toEqual({});
  });

  it("an early goal swings nothing; a VAR-disallowed goal stops at its verdict", () => {
    expect(mod({ state: state(60, [goal(58)]), side: "away" })).toEqual({});
    expect(mod({ state: state(80, [goal(79, { disallowedAt: 80 })]), side: "away" })).toEqual({});
  });
});

describe("personality on the real engine", () => {
  it("⛔ absent or false is byte-identical to the match that shipped", async () => {
    const pool = await loadChaosPool();
    for (let seed = 1; seed <= 15; seed++) {
      const plain = hashEvents(play(pool, seed).events);
      expect(hashEvents(play(pool, seed, false).events)).toBe(plain);
    }
  }, 120_000);

  it("colours matches without distorting them: goal rate holds, late panic costs cards", async () => {
    const pool = await loadChaosPool();
    const N = 800;
    let gOff = 0;
    let gOn = 0;
    let lateCardsOff = 0;
    let lateCardsOn = 0;
    let changed = 0;
    for (let seed = 1; seed <= N; seed++) {
      const off = play(pool, seed);
      const on = play(pool, seed, true);
      gOff += off.score.home + off.score.away;
      gOn += on.score.home + on.score.away;
      const late = (ev: MatchEvent[]) =>
        ev.filter((e) => e.kind === "card" && e.minute >= 75).length;
      lateCardsOff += late(off.events);
      lateCardsOn += late(on.events);
      if (hashEvents(on.events) !== hashEvents(off.events)) changed++;
    }
    console.log(
      JSON.stringify({ gOff: gOff / N, gOn: gOn / N, lateCardsOff, lateCardsOn, changed }),
    );
    expect(Math.abs(gOn / gOff - 1)).toBeLessThan(0.06);
    expect(lateCardsOn).toBeGreaterThan(lateCardsOff);
    expect(changed).toBeGreaterThan(N * 0.5);
  }, 400_000);
});
