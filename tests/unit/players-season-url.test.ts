import { describe, expect, it } from "vitest";

import { playerProfileUrl, playerTriviaUrl } from "@/features/players/season-url";

describe("player season URLs", () => {
  it("builds the profile URL with season + locale", () => {
    expect(playerProfileUrl(42, 2016, "ar")).toBe(
      "/api/players/42/profile?season=2016&locale=ar",
    );
  });

  it("omits locale when not given", () => {
    expect(playerProfileUrl(42, 2016)).toBe("/api/players/42/profile?season=2016");
  });

  it("builds the trivia URL for the player scope", () => {
    expect(playerTriviaUrl(42, 2016)).toBe("/api/trivia?scope=player&id=42&season=2016");
  });
});
