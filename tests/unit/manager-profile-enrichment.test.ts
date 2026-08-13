import { describe, expect, it } from "vitest";

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

  it("degrades cleanly for a manager with no enrichment", async () => {
    const { getManagerProfile } = await import("@/features/managers/manager-profile.api");
    const { loadManagerEnrichment } = await import("@/data/loaders");
    const map = await loadManagerEnrichment();
    const { loadManagers } = await import("@/data/loaders");
    const managers = await loadManagers();

    // Find a real manager id that the enrichment does NOT cover (153 of 293).
    const ids = new Set<string>();
    for (const byTeam of Object.values(managers ?? {}))
      for (const rows of Object.values(byTeam)) for (const r of rows) ids.add(r.id);
    const unenriched = [...ids].find((id) => !map?.[id]);
    expect(unenriched, "expected at least one manager without enrichment").toBeDefined();

    const p = await getManagerProfile(unenriched!);
    expect(p).not.toBeNull();
    expect(p!.careerSummary).toBeNull();
    expect(p!.careerHonours).toEqual([]);
    expect(p!.careerSpells).toEqual([]);
  });
});
