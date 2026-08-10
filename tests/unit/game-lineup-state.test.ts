import { describe, expect, it } from "vitest";
import type { MatchResult } from "@/features/game/domain/match-types";
import { simulate } from "@/features/game/domain/simulate";
import type { GameTeam } from "@/features/game/domain/team";
import { lineupAt } from "@/features/game/view/lineup-state";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";

/**
 * The pitch and the roster must agree with the match, minute by minute.
 *
 * Before this, both rendered the STARTING ELEVEN for the whole ninety minutes: a player
 * sent off in the 20th kept running around, a substitute never appeared, and a hat-trick
 * looked exactly like being anonymous. The engine knew all of it — the view just never
 * asked.
 */

const mk = (id: number, role: string) => ({
  playerId: id,
  cardId: `${id}@2020`,
  season: 2020,
  name: `P${id}`,
  role,
  altRoles: [],
  ratings: { attack: 70, creation: 70, defense: 70, physical: 70, overall: 70, discipline: 50 },
});

const ROLES = ["GK", "CB", "CB", "LB", "RB", "CDM", "CM", "CM", "LW", "CF", "RW"];

const team = (base: number): GameTeam =>
  ({
    teamId: base,
    name: `T${base}`,
    season: 2020,
    formation: {
      name: "4-3-3",
      season: 2020,
      slots: ROLES.map((r, i) => ({ row: 1 + (i % 4), col: 1 + i, role: r })),
    },
    players: ROLES.map((r, i) => mk(base + i + 1, r)),
    bench: [mk(base + 30, "CM"), mk(base + 31, "CF")],
  }) as unknown as GameTeam;

const home = team(100);
const away = team(200);

const build = (events: MatchResult["events"]) =>
  buildMatchViewModel(home, away, { score: { home: 0, away: 0 }, seed: 1, events });

const HOME_SLOTS = ROLES.length;

describe("dismissals", () => {
  const vm = build([
    { minute: 0, kind: "kickoff" },
    { minute: 20, kind: "card", side: "home", playerId: 103, card: "red", reason: "dogso" },
    { minute: 90, kind: "fulltime" },
  ]);

  it("keeps eleven on the pitch before the red", () => {
    const before = lineupAt(vm.home, vm.events, "home", 19);
    expect(before.slots.filter(Boolean)).toHaveLength(HOME_SLOTS);
  });

  it("removes the dismissed player from the pitch afterwards", () => {
    const after = lineupAt(vm.home, vm.events, "home", 21);
    expect(after.slots.filter(Boolean)).toHaveLength(HOME_SLOTS - 1);
    expect(after.slots.some((s) => s?.playerId === 103)).toBe(false);
  });

  it("still lists him in the roster, marked", () => {
    const after = lineupAt(vm.home, vm.events, "home", 21);
    const row = after.roster.find((r) => r.player.playerId === 103);
    expect(row?.badges.red).toBe(true);
  });

  it("leaves the other side untouched", () => {
    expect(lineupAt(vm.away, vm.events, "away", 21).slots.filter(Boolean)).toHaveLength(HOME_SLOTS);
  });
});

describe("bookings", () => {
  const vm = build([
    { minute: 0, kind: "kickoff" },
    { minute: 30, kind: "card", side: "home", playerId: 105, card: "yellow", reason: "normal" },
    { minute: 90, kind: "fulltime" },
  ]);

  it("marks the booked player without removing him", () => {
    const s = lineupAt(vm.home, vm.events, "home", 31);
    expect(s.slots.filter(Boolean)).toHaveLength(HOME_SLOTS);
    expect(s.badges.get(105)?.yellow).toBe(true);
  });

  it("does not mark him before the booking", () => {
    expect(lineupAt(vm.home, vm.events, "home", 29).badges.get(105)?.yellow).toBeFalsy();
  });
});

describe("substitutions", () => {
  const vm = build([
    { minute: 0, kind: "kickoff" },
    {
      minute: 60,
      kind: "substitution",
      side: "home",
      playerId: 110,
      subOnPlayerId: 130,
      subReason: "tactical",
    },
    {
      minute: 70,
      kind: "substitution",
      side: "home",
      playerId: 109,
      subOnPlayerId: 131,
      subReason: "stamina",
    },
    { minute: 90, kind: "fulltime" },
  ]);

  it("puts the substitute into the departing player's slot", () => {
    const before = lineupAt(vm.home, vm.events, "home", 59);
    const slot = before.slots.findIndex((s) => s?.playerId === 110);
    expect(slot).toBeGreaterThanOrEqual(0);

    const after = lineupAt(vm.home, vm.events, "home", 61);
    expect(after.slots[slot]?.playerId).toBe(130);
    expect(after.slots.filter(Boolean)).toHaveLength(HOME_SLOTS);
  });

  it("numbers the substitutions in order", () => {
    const s = lineupAt(vm.home, vm.events, "home", 71);
    expect(s.badges.get(110)?.subOff).toBe(1);
    expect(s.badges.get(130)?.subOn).toBe(1);
    expect(s.badges.get(109)?.subOff).toBe(2);
    expect(s.badges.get(131)?.subOn).toBe(2);
  });

  it("adds the substitute to the roster once he is on", () => {
    expect(
      lineupAt(vm.home, vm.events, "home", 59).roster.some((r) => r.player.playerId === 130),
    ).toBe(false);
    expect(
      lineupAt(vm.home, vm.events, "home", 61).roster.some((r) => r.player.playerId === 130),
    ).toBe(true);
  });

  it("gives the substitute a shirt number of his own", () => {
    const on = lineupAt(vm.home, vm.events, "home", 61).slots.find((s) => s?.playerId === 130);
    expect(on?.number).toBeGreaterThan(0);
  });
});

describe("goals and assists", () => {
  const vm = build([
    { minute: 0, kind: "kickoff" },
    { minute: 10, kind: "goal", side: "home", playerId: 110, assistPlayerId: 107, source: "open" },
    { minute: 55, kind: "goal", side: "home", playerId: 110, source: "penalty" },
    { minute: 90, kind: "fulltime" },
  ]);

  it("counts a player's goals", () => {
    expect(lineupAt(vm.home, vm.events, "home", 11).badges.get(110)?.goals).toBe(1);
    expect(lineupAt(vm.home, vm.events, "home", 56).badges.get(110)?.goals).toBe(2);
  });

  it("credits the assist to the creator, not the scorer", () => {
    const s = lineupAt(vm.home, vm.events, "home", 11);
    expect(s.badges.get(107)?.assists).toBe(1);
    expect(s.badges.get(110)?.assists ?? 0).toBe(0);
  });

  it("keeps a goal on the tally until VAR takes it away, then removes it", () => {
    // Caught by reading a printed roster: a scorer kept his goal after it was chalked
    // off. The badge must follow the same suspense rule as the scoreboard — it counts
    // while the referee is at the monitor, and only then comes off.
    const reviewed = build([
      { minute: 0, kind: "kickoff" },
      {
        minute: 30,
        kind: "goal",
        side: "home",
        playerId: 110,
        assistPlayerId: 107,
        source: "open",
        disallowedAt: 31,
      },
      { minute: 90, kind: "fulltime" },
    ]);
    expect(lineupAt(reviewed.home, reviewed.events, "home", 30).badges.get(110)?.goals).toBe(1);
    expect(lineupAt(reviewed.home, reviewed.events, "home", 31).badges.get(110)?.goals ?? 0).toBe(
      0,
    );
    // The assist goes with it.
    expect(lineupAt(reviewed.home, reviewed.events, "home", 31).badges.get(107)?.assists ?? 0).toBe(
      0,
    );
  });

  it("does not credit an assist on a penalty", () => {
    const s = lineupAt(vm.home, vm.events, "home", 56);
    expect(s.badges.get(107)?.assists).toBe(1); // still just the one from open play
  });
});

describe("the engine actually produces assists", () => {
  it("credits an assist on a healthy share of open-play goals", () => {
    let open = 0;
    let assisted = 0;
    for (let seed = 1; seed <= 800; seed++) {
      const r = simulate({
        home: team(100),
        away: team(200),
        seed,
        targetGoalsPerMatch: 2.7,
      });
      for (const e of r.events) {
        if (e.kind !== "goal" || e.source !== "open") continue;
        open++;
        if (e.assistPlayerId != null) assisted++;
      }
    }
    expect(open).toBeGreaterThan(500);
    const share = assisted / open;
    // Real football assists roughly three in five open-play goals.
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.85);
  });

  it("never credits the scorer with his own assist", () => {
    for (let seed = 1; seed <= 800; seed++) {
      const r = simulate({ home: team(100), away: team(200), seed, targetGoalsPerMatch: 2.7 });
      for (const e of r.events) {
        if (e.kind === "goal" && e.assistPlayerId != null) {
          expect(e.assistPlayerId).not.toBe(e.playerId);
        }
      }
    }
  });

  it("never assists a penalty or an own goal", () => {
    for (let seed = 1; seed <= 800; seed++) {
      const r = simulate({ home: team(100), away: team(200), seed, targetGoalsPerMatch: 2.7 });
      for (const e of r.events) {
        if (e.kind === "goal" && (e.source === "penalty" || e.source === "own-goal")) {
          expect(e.assistPlayerId).toBeUndefined();
        }
      }
    }
  });
});
