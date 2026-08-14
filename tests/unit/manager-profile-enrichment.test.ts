import { describe, expect, it, vi } from "vitest";

/**
 * TASK-M81 — integration against the REAL committed data.
 *
 * The component tests use fixtures, which proves the rendering but not that the
 * three files are actually wired in. This asserts named facts about named
 * managers, because that is the only check that catches a silent `null` from a
 * mis-typed filename or a drifted schema.
 */
describe("getManagerProfile — career enrichment (real data)", () => {
  const MOURINHO = "134";
  const WENGER = "51";

  it("gives Mourinho his full 26-trophy career, not just the league titles", async () => {
    const { getManagerProfile } = await import("@/features/managers/manager-profile.api");
    const p = await getManagerProfile(MOURINHO);
    expect(p).not.toBeNull();

    // The point of the whole ticket: the derived league honours are a small
    // subset of the real cabinet.
    expect(p!.careerSummary?.trophies).toBe(26);
    expect(p!.honours.length).toBeLessThan(p!.careerSummary!.trophies);

    // Silverware won outside this league is present.
    const titles = p!.careerHonours.map((g) => g.title);
    expect(titles).toContain("UEFA Champions League winner");
    expect(titles.some((t) => /Italian champion|Spanish champion|Portuguese champion/.test(t))).toBe(
      true,
    );

    // Awards are classified apart from trophies.
    const moty = p!.careerHonours.find((g) => /Manager of the Year/i.test(g.title));
    expect(moty?.kind).toBe("award");

    // Clubs he managed outside this league.
    const clubs = p!.careerSpells.map((s) => s.club);
    expect(clubs).toContain("Porto");
    expect(clubs).toContain("Inter");
    expect(p!.careerSummary?.clubsManaged).toBe(10);
  });

  it("gives Wenger his 4-club, 1,791-match career", async () => {
    const { getManagerProfile } = await import("@/features/managers/manager-profile.api");
    const p = await getManagerProfile(WENGER);
    expect(p!.careerSummary?.clubsManaged).toBe(4);
    expect(p!.careerSummary?.careerMatches).toBe(1791);
    expect(p!.careerSummary?.trophies).toBe(21);

    const arsenal = p!.careerSpells.find((s) => s.club === "Arsenal");
    expect(arsenal?.matches).toBe(1231);
    // Non-league clubs are included; assistant//director spells are not.
    expect(p!.careerSpells.map((s) => s.club)).toContain("Monaco");
    expect(p!.careerSpells.every((s) => (s.matches ?? 0) > 0)).toBe(true);
  });

  /**
   * ⛔ This used to hunt the committed data for a manager the enrichment did not cover
   * ("153 of 293"). TASK-M86 closed that gap — all 293 are enriched — so the search
   * returned nothing and the test failed on `expect(unenriched).toBeDefined()`.
   *
   * The gap was never the point; **degrading cleanly** was. Depending on the data being
   * incomplete made this test a hostage to coverage improving, and it would have gone
   * quietly vacuous long before it went red if the id had merely become rarer. It now
   * forces the empty-enrichment path instead of hoping to find one, so it keeps testing
   * the same behaviour at 293/293 and at any future coverage.
   */
  it("degrades cleanly when a manager has no enrichment", async () => {
    vi.resetModules();
    vi.doMock("@/data/loaders", async () => {
      const actual = await vi.importActual<typeof import("@/data/loaders")>("@/data/loaders");
      return {
        ...actual,
        loadManagerEnrichment: async () => ({}),
        loadManagerCareerHistory: async () => ({}),
        loadManagerHonoursHistory: async () => ({}),
      };
    });

    const { getManagerProfile } = await import("@/features/managers/manager-profile.api");
    const p = await getManagerProfile(WENGER); // a real manager, with enrichment withheld

    expect(p, "the profile must still render without enrichment").not.toBeNull();
    expect(p!.careerSummary).toBeNull();
    expect(p!.careerHonours).toEqual([]);
    expect(p!.careerSpells).toEqual([]);
    // The un-enriched fields still come through — degradation, not a blank page.
    expect(p!.name).toBeTruthy();

    vi.doUnmock("@/data/loaders");
    vi.resetModules();
  });
});
