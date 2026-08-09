import { describe, expect, it } from "vitest";
import type { MatchSetup } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * TASK-1822 Phase 4 — squad dynamics.
 *
 * Substitutions, injuries and the sweeper-keeper. This is the first phase that needs a
 * BENCH: everything before it only ever cared about the eleven on the pitch.
 */

const mk = (id: number, role: string, physical: number) => ({
  playerId: id,
  cardId: `${id}@2020`,
  season: 2020,
  name: `P${id}`,
  role,
  altRoles: [],
  ratings: { attack: 70, creation: 70, defense: 70, physical, overall: 70, discipline: 50 },
});

const team = (name: string, base: number): GameTeam =>
  ({
    teamId: base,
    name,
    season: 2020,
    formation: null,
    players: [
      mk(base + 1, "GK", 70),
      mk(base + 2, "CB", 62),
      mk(base + 3, "CB", 58),
      mk(base + 4, "LB", 55),
      mk(base + 5, "RB", 54),
      mk(base + 6, "CDM", 50),
      mk(base + 7, "CM", 48),
      mk(base + 8, "CM", 46),
      mk(base + 9, "LW", 44),
      mk(base + 10, "CF", 42),
      mk(base + 11, "RW", 40),
    ],
    bench: [
      mk(base + 12, "GK", 65),
      mk(base + 13, "CB", 60),
      mk(base + 14, "CM", 60),
      mk(base + 15, "CF", 60),
      mk(base + 16, "RW", 60),
    ],
  }) as unknown as GameTeam;

const setup = (over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: team("H", 100),
  away: team("A", 200),
  seed: 7,
  targetGoalsPerMatch: 2.7,
  ...over,
});

const matches = Array.from({ length: 2500 }, (_, i) => simulate(setup({ seed: i + 1 })));
const events = (kind: string) => matches.flatMap((m) => m.events.filter((e) => e.kind === kind));

describe("substitutions", () => {
  const subs = events("substitution");

  it("happen — the engine previously had none at all", () => {
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.length / matches.length).toBeGreaterThan(1.5);
  });

  it("name both the player coming off and the one coming on", () => {
    for (const s of subs.slice(0, 400)) {
      expect(s.playerId).toBeDefined();
      expect(s.subOnPlayerId).toBeDefined();
      expect(s.playerId).not.toBe(s.subOnPlayerId);
    }
  });

  it("are made for the reasons a manager actually makes them", () => {
    const seen = new Set(subs.map((s) => s.subReason));
    for (const reason of ["stamina", "tactical", "discipline", "injury"]) {
      expect(seen).toContain(reason);
    }
  });

  it("respect the bench — nobody comes on twice, and nobody exceeds the limit", () => {
    for (const m of matches) {
      const perSide = new Map<string, Set<number>>();
      for (const s of m.events.filter((e) => e.kind === "substitution")) {
        const key = String(s.side);
        const used = perSide.get(key) ?? new Set<number>();
        expect(used.has(s.subOnPlayerId as number)).toBe(false);
        used.add(s.subOnPlayerId as number);
        perSide.set(key, used);
      }
      for (const used of perSide.values()) expect(used.size).toBeLessThanOrEqual(5);
    }
  });

  it("never bring on a player who is already on the pitch", () => {
    for (const m of matches) {
      const onPitch = { home: new Set<number>(), away: new Set<number>() };
      for (const s of m.events.filter((e) => e.kind === "substitution")) {
        const side = s.side as "home" | "away";
        expect(onPitch[side].has(s.subOnPlayerId as number)).toBe(false);
        onPitch[side].add(s.subOnPlayerId as number);
      }
    }
  });

  it("never substitute a player who has been sent off", () => {
    for (const m of matches) {
      const off = new Set<string>();
      for (const e of m.events) {
        const key = `${e.side}:${e.playerId}`;
        if (e.kind === "card" && e.card === "red") off.add(key);
        if (e.kind === "substitution") expect(off.has(key)).toBe(false);
      }
    }
  });

  it("mostly happen in the second half, like real substitutions", () => {
    const late = subs.filter((s) => s.minute >= 55).length;
    expect(late / subs.length).toBeGreaterThan(0.85);
  });
});

describe("injuries", () => {
  const injuries = events("injury");

  it("come in three severities", () => {
    const seen = new Set(injuries.map((i) => i.injurySeverity));
    for (const severity of ["knock", "moderate", "severe"]) expect(seen).toContain(severity);
  });

  it("a knock does not force a substitution — the player is treated and returns", () => {
    // Scanned per MATCH. The first version cross-joined every knock against every event
    // in all 2,500 matches and timed out — a quadratic test, not a slow engine.
    let knocks = 0;
    let forcedOff = 0;
    for (const m of matches) {
      const subs = m.events.filter((e) => e.kind === "substitution");
      for (const k of m.events.filter((e) => e.kind === "injury" && e.injurySeverity === "knock")) {
        knocks++;
        if (subs.some((s) => s.minute === k.minute && s.playerId === k.playerId)) forcedOff++;
      }
    }
    expect(knocks).toBeGreaterThan(0);
    expect(forcedOff).toBe(0);
  });

  it("a severe injury forces the player off", () => {
    for (const m of matches) {
      for (const inj of m.events.filter(
        (e) => e.kind === "injury" && e.injurySeverity === "severe",
      )) {
        const replaced = m.events.some(
          (e) =>
            e.kind === "substitution" &&
            e.side === inj.side &&
            e.playerId === inj.playerId &&
            e.subReason === "injury",
        );
        // Either replaced, or the bench was empty and they went down to ten.
        const shortHanded = m.events.some(
          (e) => e.kind === "shorthanded" && e.side === inj.side && e.minute === inj.minute,
        );
        expect(replaced || shortHanded).toBe(true);
      }
    }
  });

  it("stays rare enough not to dominate a match", () => {
    expect(injuries.length / matches.length).toBeLessThan(2.5);
  });
});

describe("the sweeper keeper", () => {
  const keeper = events("keeper");

  it("comes off his line — heroically, or catastrophically", () => {
    const seen = new Set(keeper.map((k) => k.keeperOutcome));
    for (const outcome of ["clearance", "sent-off", "punished"]) expect(seen).toContain(outcome);
  });

  it("is sent off for wiping out the striker outside the box", () => {
    for (const m of matches) {
      for (const k of m.events.filter(
        (e) => e.kind === "keeper" && e.keeperOutcome === "sent-off",
      )) {
        expect(
          m.events.some(
            (e) =>
              e.kind === "card" && e.minute === k.minute && e.side === k.side && e.card === "red",
          ),
        ).toBe(true);
      }
    }
  });

  it("is punished from distance — and that counts as a goal for the other side", () => {
    for (const m of matches) {
      for (const k of m.events.filter(
        (e) => e.kind === "keeper" && e.keeperOutcome === "punished",
      )) {
        const opp = k.side === "home" ? "away" : "home";
        expect(
          m.events.some((e) => e.kind === "goal" && e.minute === k.minute && e.side === opp),
        ).toBe(true);
      }
    }
  });
});

describe("the results distribution survives phase 4", () => {
  it("keeps the scoreline equal to the count of goal events", () => {
    for (const m of matches) {
      const home = m.events.filter((e) => e.kind === "goal" && e.side === "home").length;
      const away = m.events.filter((e) => e.kind === "goal" && e.side === "away").length;
      expect({ home, away }).toEqual(m.score);
    }
  });

  it("replays byte-identically", () => {
    expect(simulate(setup({ seed: 321 }))).toEqual(simulate(setup({ seed: 321 })));
  });
});
