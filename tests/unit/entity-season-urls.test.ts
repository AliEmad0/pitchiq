import { describe, expect, it } from "vitest";

import { managerProfileUrl } from "@/features/managers/season-url";
import { teamSeasonViewUrl, teamTriviaUrl } from "@/features/teams/season-url";

describe("entity season-swap URLs", () => {
  it("builds the team season-view url with season + locale", () => {
    expect(teamSeasonViewUrl(42, 2003, "ar")).toBe(
      "/api/teams/42/season-view?season=2003&locale=ar",
    );
    expect(teamSeasonViewUrl(42, 2003)).toBe("/api/teams/42/season-view?season=2003");
  });

  it("builds the team trivia url", () => {
    expect(teamTriviaUrl(42, 2003)).toBe("/api/trivia?scope=team&id=42&season=2003");
  });

  it("builds the manager profile url", () => {
    expect(managerProfileUrl("58", 2008, "ar")).toBe(
      "/api/managers/58/profile?season=2008&locale=ar",
    );
    expect(managerProfileUrl("58", 2008)).toBe("/api/managers/58/profile?season=2008");
  });
});
