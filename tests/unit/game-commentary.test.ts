import { describe, expect, it } from "vitest";
import { commentate } from "@/features/game/domain/commentary";
import type { MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";

function player(playerId: number, name: string): GamePlayer {
  return {
    cardId: `${playerId}@2020`, playerId, season: 2020, name, role: "CF", altRoles: [],
    foot: null, height: null, provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  };
}
const home = makeGameTeam(1, "Home", 2020, { name: "", season: 2020, slots: [] }, [player(10, "Scorer H"), player(11, "Booked H")]);
const away = makeGameTeam(2, "Away", 2020, { name: "", season: 2020, slots: [] }, [player(20, "Scorer A")]);

const result: MatchResult = {
  seed: 1,
  score: { home: 2, away: 1 },
  events: [
    { minute: 0, kind: "kickoff" },
    { minute: 12, kind: "goal", side: "home", playerId: 10 },
    { minute: 30, kind: "card", side: "home", playerId: 11, card: "yellow" },
    { minute: 44, kind: "goal", side: "away", playerId: 20 },
    { minute: 45, kind: "halftime" },
    { minute: 70, kind: "goal", side: "home", playerId: 10 },
    { minute: 82, kind: "card", side: "away", playerId: 999, card: "red" }, // 999 not on roster → anon
    { minute: 90, kind: "fulltime" },
  ],
};

describe("commentate", () => {
  const commented = commentate(result, home, away);

  it("attaches a commentary ref to every event, preserving the event fields", () => {
    expect(commented).toHaveLength(result.events.length);
    expect(commented[0]).toMatchObject({ minute: 0, kind: "kickoff" });
    for (const e of commented) expect(typeof e.commentary.key).toBe("string");
  });

  it("maps kinds to the right key families", () => {
    expect(commented[0].commentary.key).toBe("commentary.kickoff");
    expect(commented[1].commentary.key).toMatch(/^commentary\.goal\.\d$/);
    expect(commented[2].commentary.key).toMatch(/^commentary\.cardYellow\.\d$/);
    expect(commented[4].commentary.key).toBe("commentary.halftime");
    expect(commented[7].commentary.key).toBe("commentary.fulltime");
  });

  it("resolves the scorer name and folds the running score", () => {
    expect(commented[1].commentary.values).toMatchObject({ player: "Scorer H", minute: 12, homeScore: 1, awayScore: 0 });
    expect(commented[3].commentary.values).toMatchObject({ player: "Scorer A", homeScore: 1, awayScore: 1 });
    expect(commented[4].commentary.values).toMatchObject({ homeScore: 1, awayScore: 1 }); // halftime score
    expect(commented[5].commentary.values).toMatchObject({ player: "Scorer H", homeScore: 2, awayScore: 1 });
    expect(commented[7].commentary.values).toMatchObject({ homeScore: 2, awayScore: 1 }); // final
  });

  it("uses an anon key when the player is not on the roster", () => {
    expect(commented[6].commentary.key).toBe("commentary.cardAnon");
    expect(commented[6].commentary.values).toEqual({ minute: 82 });
  });

  it("is deterministic (same result → same refs)", () => {
    expect(commentate(result, home, away)).toEqual(commented);
  });
});
