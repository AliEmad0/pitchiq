import { describe, expect, it } from "vitest";
import type { MatchResult } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { OVERLAY_KINDS, buildMatchViewModel } from "@/features/game/view/match-view-model";

/**
 * TASK-1822 Phase 6 — surfacing.
 *
 * ⚠️ THE REGRESSION THIS PHASE EXISTS TO FIX. `MatchView` hard-coded the end of a match
 * at minute 90. Phase 1 made matches run to 90 + 2-6 minutes of added time, so from
 * that moment every stoppage-time event — including the stoppage-time winners Phase 1
 * was specifically built to produce — was simulated, commentated, and then never shown.
 * The domain tests all passed. Nobody looked at the view.
 *
 * The view model now carries the match's real last minute, so the clock can never
 * disagree with the engine again.
 */

const player = (id: number, role: string) => ({
  playerId: id,
  cardId: `${id}@2020`,
  season: 2020,
  name: `P${id}`,
  role,
  altRoles: [],
  ratings: { attack: 70, creation: 70, defense: 70, physical: 70, overall: 70, discipline: 50 },
});

const ROLES = ["GK", "CB", "CB", "LB", "RB", "CDM", "CM", "CM", "LW", "CF", "RW"];

const team = (name: string, base: number): GameTeam =>
  ({
    teamId: base,
    name,
    season: 2020,
    formation: {
      name: "4-3-3",
      season: 2020,
      slots: ROLES.map((r, i) => ({ row: 1 + (i % 4), col: 1 + i, role: r })),
    },
    players: ROLES.map((r, i) => player(base + i + 1, r)),
    bench: [player(base + 30, "CM")],
  }) as unknown as GameTeam;

const home = team("Home", 100);
const away = team("Away", 200);

const result = (over: Partial<MatchResult> = {}): MatchResult => ({
  score: { home: 1, away: 0 },
  seed: 1,
  events: [
    { minute: 0, kind: "kickoff" },
    { minute: 0, kind: "weather", weather: "rain" },
    { minute: 30, kind: "chance", side: "home", playerId: 110, outcome: "post" },
    { minute: 45, kind: "halftime" },
    { minute: 90, kind: "stoppage", addedMinutes: 4 },
    { minute: 93, kind: "goal", side: "home", playerId: 110, source: "open", goalStyle: "volley" },
    { minute: 94, kind: "fulltime" },
  ],
  ...over,
});

describe("the view model reaches the end of the match", () => {
  it("reports the real last minute, not ninety", () => {
    const vm = buildMatchViewModel(home, away, result());
    expect(vm.lastMinute).toBe(94);
  });

  it("still ends at ninety when there is no added time", () => {
    const vm = buildMatchViewModel(
      home,
      away,
      result({
        events: [
          { minute: 0, kind: "kickoff" },
          { minute: 90, kind: "fulltime" },
        ],
      }),
    );
    expect(vm.lastMinute).toBe(90);
  });

  it("keeps stoppage-time events in the model", () => {
    const vm = buildMatchViewModel(home, away, result());
    const late = vm.events.filter((e) => e.minute > 90);
    expect(late.length).toBeGreaterThan(0);
    expect(late.some((e) => e.kind === "goal")).toBe(true);
  });
});

describe("the big moments are surfaced", () => {
  it("holds the banner for every high-impact kind, not just goals and reds", () => {
    // Phases 2-5 added penalties, VAR overturns, injuries and substitutions. A match
    // that pauses only for goals under-sells all of them.
    for (const kind of ["goal", "penalty", "var", "injury", "substitution"]) {
      expect(OVERLAY_KINDS).toContain(kind);
    }
  });

  it("carries the fields the overlay needs for a penalty", () => {
    const vm = buildMatchViewModel(
      home,
      away,
      result({
        events: [
          { minute: 0, kind: "kickoff" },
          {
            minute: 20,
            kind: "penalty",
            side: "home",
            playerId: 110,
            penaltyOutcome: "saved-rebound-goal",
          },
          { minute: 90, kind: "fulltime" },
        ],
      }),
    );
    const pen = vm.events.find((e) => e.kind === "penalty");
    expect(pen?.penaltyOutcome).toBe("saved-rebound-goal");
    expect(pen?.side).toBe("home");
  });

  it("carries the substitution pair so the pitch can swap them", () => {
    const vm = buildMatchViewModel(
      home,
      away,
      result({
        events: [
          { minute: 0, kind: "kickoff" },
          {
            minute: 60,
            kind: "substitution",
            side: "home",
            playerId: 102,
            subOnPlayerId: 130,
            subReason: "tactical",
          },
          { minute: 90, kind: "fulltime" },
        ],
      }),
    );
    const sub = vm.events.find((e) => e.kind === "substitution");
    expect(sub?.offSlot).toBe(1);
    expect(sub?.subOnName).toBe("P130");
  });

  it("marks a dismissal so the pitch can drop the player", () => {
    const vm = buildMatchViewModel(
      home,
      away,
      result({
        events: [
          { minute: 0, kind: "kickoff" },
          { minute: 40, kind: "card", side: "away", playerId: 203, card: "red", reason: "dogso" },
          { minute: 90, kind: "fulltime" },
        ],
      }),
    );
    const red = vm.events.find((e) => e.kind === "card");
    expect(red?.card).toBe("red");
    expect(red?.bookedSlot).toBe(2);
  });
});
