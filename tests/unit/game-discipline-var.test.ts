import { describe, expect, it } from "vitest";
import type { MatchSetup } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";

/**
 * TASK-1822 Phase 3 — discipline, VAR and the referee.
 *
 * The three things a modern match has that the engine did not: a booking history that
 * can catch up with a player, a video review that can take a goal away, and an official
 * with a personality whose decisions the players react to.
 */

const player = (id: number, role: string, discipline: number) => ({
  playerId: id,
  cardId: `${id}@2020`,
  season: 2020,
  name: `P${id}`,
  role,
  altRoles: [],
  ratings: { attack: 70, creation: 70, defense: 70, physical: 70, discipline, overall: 70 },
});

/** A real XI, so per-player booking history has somewhere to live. */
const team = (name: string, base: number): GameTeam =>
  ({
    teamId: base,
    name,
    season: 2020,
    formation: null,
    players: [
      player(base + 1, "GK", 60),
      player(base + 2, "CB", 40),
      player(base + 3, "CB", 45),
      player(base + 4, "LB", 50),
      player(base + 5, "RB", 50),
      player(base + 6, "CDM", 35),
      player(base + 7, "CM", 55),
      player(base + 8, "CM", 55),
      player(base + 9, "LW", 65),
      player(base + 10, "CF", 65),
      player(base + 11, "RW", 65),
    ],
  }) as unknown as GameTeam;

const setup = (over: Partial<MatchSetup> = {}): MatchSetup => ({
  home: team("H", 100),
  away: team("A", 200),
  seed: 7,
  targetGoalsPerMatch: 2.7,
  ...over,
});

const run = (n: number) => Array.from({ length: n }, (_, i) => simulate(setup({ seed: i + 1 })));
const matches = run(2500);
const events = (kind: string) => matches.flatMap((m) => m.events.filter((e) => e.kind === kind));

describe("second yellow means red", () => {
  it("sends a player off for a second booking", () => {
    const seconds = events("card").filter((c) => c.reason === "second-yellow");
    expect(seconds.length).toBeGreaterThan(0);
    for (const c of seconds) expect(c.card).toBe("red");
  });

  // Keyed by SIDE and player, not player alone: both Chaos teams draft from one pool
  // with independent `used` sets, so the same player id can turn out for both sides in
  // a single match. The engine's booking ledger is keyed the same way for that reason.
  const key = (c: { side?: string; playerId?: number }) => `${c.side}:${c.playerId}`;

  it("only ever books a player twice — never a third time", () => {
    // The whole point of tracking: once a player has two yellows they are off the pitch
    // and cannot be booked again.
    for (const m of matches) {
      const yellows = new Map<string, number>();
      for (const c of m.events.filter((e) => e.kind === "card")) {
        if (c.playerId == null) continue;
        if (c.card === "yellow") yellows.set(key(c), (yellows.get(key(c)) ?? 0) + 1);
      }
      for (const count of yellows.values()) expect(count).toBeLessThanOrEqual(1);
    }
  });

  it("never books a player who has already been sent off", () => {
    for (const m of matches) {
      const off = new Set<string>();
      for (const c of m.events.filter((e) => e.kind === "card")) {
        if (c.playerId == null) continue;
        expect(off.has(key(c))).toBe(false);
        if (c.card === "red") off.add(key(c));
      }
    }
  });

  it("keeps red cards near the real rate", () => {
    // Real football: roughly 0.2 per match across all causes.
    const reds = events("card").filter((c) => c.card === "red").length;
    expect(reds / matches.length).toBeLessThan(0.6);
    expect(reds / matches.length).toBeGreaterThan(0.05);
  });
});

describe("DOGSO — denying an obvious goalscoring opportunity", () => {
  it("sends the last defender off for hauling a striker down", () => {
    const dogso = events("card").filter((c) => c.reason === "dogso");
    expect(dogso.length).toBeGreaterThan(0);
    for (const c of dogso) expect(c.card).toBe("red");
  });

  it("is punished with a set piece as well as the red", () => {
    // A professional foul concedes a free kick or a penalty — the red alone is not the
    // whole punishment.
    const withSetPiece = matches.filter((m) => {
      const d = m.events.find((e) => e.kind === "card" && e.reason === "dogso");
      if (d == null) return false;
      return m.events.some(
        (e) =>
          e.minute === d.minute &&
          e.side !== d.side &&
          (e.kind === "penalty" || e.kind === "freekick"),
      );
    });
    const total = matches.filter((m) =>
      m.events.some((e) => e.kind === "card" && e.reason === "dogso"),
    );
    expect(withSetPiece.length).toBe(total.length);
  });
});

describe("altercations", () => {
  it("happen, and escalate through a plausible range", () => {
    const rows = events("altercation");
    expect(rows.length).toBeGreaterThan(0);
    const seen = new Set(rows.map((r) => r.altercationOutcome));
    for (const outcome of ["words", "both-booked", "red"]) expect(seen).toContain(outcome);
  });

  it("books BOTH sides when it is a mutual booking", () => {
    // Counted by SIDE, not by reason: if the player pulled into the flashpoint was
    // already on a yellow the card is correctly recorded as a `second-yellow`, so
    // filtering on `reason === "altercation"` undercounts and the first version of this
    // test failed on correct behaviour.
    for (const m of matches) {
      for (const a of m.events.filter(
        (e) => e.kind === "altercation" && e.altercationOutcome === "both-booked",
      )) {
        const sides = new Set(
          m.events.filter((e) => e.kind === "card" && e.minute === a.minute).map((c) => c.side),
        );
        expect(sides.has("home")).toBe(true);
        expect(sides.has("away")).toBe(true);
      }
    }
  });
});

describe("VAR", () => {
  it("reaches every review outcome", () => {
    const seen = new Set(events("var").map((v) => v.varOutcome));
    for (const outcome of [
      "goal-disallowed-offside",
      "goal-disallowed-foul",
      "penalty-awarded",
      "red-upgraded",
    ]) {
      expect(seen).toContain(outcome);
    }
  });

  it("a disallowed goal does NOT count", () => {
    // The invariant that makes VAR safe: the scoreline is still exactly the number of
    // `goal` events, so a chalked-off goal must never emit one.
    for (const m of matches) {
      const home = m.events.filter((e) => e.kind === "goal" && e.side === "home").length;
      const away = m.events.filter((e) => e.kind === "goal" && e.side === "away").length;
      expect({ home, away }).toEqual(m.score);
    }
  });

  it("chalks goals off rarely enough to stay a shock", () => {
    const disallowed = events("var").filter((v) => v.varOutcome?.startsWith("goal-disallowed"));
    expect(disallowed.length / matches.length).toBeLessThan(0.25);
    expect(disallowed.length).toBeGreaterThan(0);
  });

  it("turns a retroactive penalty into an actual penalty", () => {
    for (const m of matches) {
      for (const v of m.events.filter(
        (e) => e.kind === "var" && e.varOutcome === "penalty-awarded",
      )) {
        expect(
          m.events.some((e) => e.kind === "penalty" && e.minute === v.minute && e.side === v.side),
        ).toBe(true);
      }
    }
  });

  it("upgrades a booking to a sending-off", () => {
    for (const m of matches) {
      for (const v of m.events.filter((e) => e.kind === "var" && e.varOutcome === "red-upgraded")) {
        expect(
          m.events.some(
            (e) =>
              e.kind === "card" &&
              e.minute === v.minute &&
              e.card === "red" &&
              e.reason === "violent-conduct",
          ),
        ).toBe(true);
      }
    }
  });
});

describe("the referee has a personality", () => {
  it("is announced at kick-off so the bias is visible", () => {
    for (const m of matches.slice(0, 50)) {
      const ref = m.events.find((e) => e.kind === "referee");
      expect(ref).toBeDefined();
      expect(["strict", "lenient", "crowd-influenced"]).toContain(ref?.refStyle);
    }
  });

  it("a strict referee books more than a lenient one", () => {
    const cardsFor = (style: string) => {
      const ms = matches.filter((m) =>
        m.events.some((e) => e.kind === "referee" && e.refStyle === style),
      );
      const cards = ms.flatMap((m) => m.events.filter((e) => e.kind === "card")).length;
      return cards / ms.length;
    };
    expect(cardsFor("strict")).toBeGreaterThan(cardsFor("lenient"));
  });

  it("a crowd-influenced referee favours the home side on penalties", () => {
    const ms = matches.filter((m) =>
      m.events.some((e) => e.kind === "referee" && e.refStyle === "crowd-influenced"),
    );
    const pens = ms.flatMap((m) => m.events.filter((e) => e.kind === "penalty"));
    const home = pens.filter((p) => p.side === "home").length;
    expect(home / pens.length).toBeGreaterThan(0.55);
  });

  it("notes the contentious decision so the player can see the bias", () => {
    expect(events("bias").length).toBeGreaterThan(0);
  });
});

describe("a sending-off actually weakens the team", () => {
  it("leaves the ten-man side creating less", () => {
    // Without this a red card is pure theatre. Compares the sent-off side's chance
    // share before and after the dismissal, across every match with one red.
    let before = 0;
    let beforeTotal = 0;
    let after = 0;
    let afterTotal = 0;
    for (const m of matches) {
      const reds = m.events.filter((e) => e.kind === "card" && e.card === "red");
      if (reds.length !== 1) continue;
      const red = reds[0];
      for (const e of m.events) {
        if (e.kind !== "chance" && e.kind !== "goal") continue;
        if (e.minute < red.minute) {
          beforeTotal++;
          if (e.side === red.side) before++;
        } else if (e.minute > red.minute) {
          afterTotal++;
          if (e.side === red.side) after++;
        }
      }
    }
    expect(beforeTotal).toBeGreaterThan(500);
    expect(afterTotal).toBeGreaterThan(500);
    expect(after / afterTotal).toBeLessThan(before / beforeTotal);
  });
});

describe("determinism survives phase 3", () => {
  it("replays byte-identically", () => {
    expect(simulate(setup({ seed: 555 }))).toEqual(simulate(setup({ seed: 555 })));
  });
});
