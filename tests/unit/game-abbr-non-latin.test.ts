import { describe, expect, it } from "vitest";
import { abbrOf } from "@/features/game/view/match-view-model";

/**
 * The live scoreboard read "TBD" for BOTH sides on every Arabic match.
 *
 * `abbrOf` kept only `[A-Za-z]`, so an Arabic team name produced an empty string and fell
 * through to the placeholder. Owner's call: non-Latin names render IN FULL, because Arabic
 * does not abbreviate this way and three characters would be a meaningless fragment.
 */
describe("abbrOf", () => {
  it("⛔ returns an Arabic name whole rather than TBD", () => {
    expect(abbrOf("تشكيلتك")).toBe("تشكيلتك");
    expect(abbrOf("الخصوم")).toBe("الخصوم");
  });

  it("still abbreviates Latin names to three letters", () => {
    expect(abbrOf("Your XI")).toBe("YOU");
    expect(abbrOf("Rivals")).toBe("RIV");
  });

  it("still prefers the curated club abbreviation", () => {
    // ⚠️ Must come FIRST — "Brighton & Hove Albion" would otherwise be "BRI".
    expect(abbrOf("Brighton & Hove Albion")).toBe("BHA");
    expect(abbrOf("Queens Park Rangers")).toBe("QPR");
  });

  it("keeps TBD for a genuinely empty name", () => {
    expect(abbrOf("")).toBe("TBD");
    expect(abbrOf("   ")).toBe("TBD");
  });

  it("handles a mixed-script name by its Latin part", () => {
    // Predictable rather than clever: any Latin at all means the Latin rule applies.
    expect(abbrOf("Zamalek زمالك")).toBe("ZAM");
  });
});
