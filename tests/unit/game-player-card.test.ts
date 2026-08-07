import { describe, expect, it } from "vitest";
import type { ComparisonMetrics, Player } from "@/data/schemas";
import { cardBio } from "@/features/game/adapter/card-enrich";
import { dimsFor, eraOf } from "@/features/game/domain/player-card";

const metrics = (over: Partial<ComparisonMetrics> = {}): ComparisonMetrics => ({
  appearances: 37,
  goals: 24,
  assists: 20,
  passAccuracy: 0.84,
  keyPasses: 60,
  tackles: 10,
  interceptions: 8,
  duelsWon: 90,
  dribblesCompleted: 70,
  shotsOnTarget: 50,
  yellowCards: 3,
  redCards: 0,
  cleanSheets: null,
  ...over,
});

const player = (over: Partial<Player> = {}): Player => ({
  id: 3207,
  name: "Thierry Henry",
  teamId: 42,
  teamName: "Arsenal",
  position: "Forward",
  photo: "3207",
  birthYear: 1977,
  nationality: "France",
  nationalityCode: "fr",
  role: "CF",
  metrics: metrics(),
  ...over,
});

describe("cardBio", () => {
  const career = new Map<number, string[]>([[3207, ["Arsenal", "Barcelona"]]]);
  const bio = cardBio(player(), 3207, 2002, career);

  it("computes age from the season and birth year", () => {
    expect(bio.age).toBe(25); // 2002 − 1977
  });
  it("carries photo, nationality and the flag code", () => {
    expect(bio.photo).toBe("3207");
    expect(bio.nationality).toBe("France");
    expect(bio.nationalityCode).toBe("fr");
  });
  it("takes the cross-season career clubs from the index", () => {
    expect(bio.careerClubs).toEqual(["Arsenal", "Barcelona"]);
  });
  it("maps the headline stats", () => {
    expect(bio.stats).toMatchObject({ goals: 24, assists: 20, appearances: 37 });
  });
  it("degrades gracefully when the row is missing", () => {
    const b = cardBio(undefined, 999, 2010, new Map());
    expect(b.age).toBeNull();
    expect(b.photo).toBeNull();
    expect(b.careerClubs).toEqual([]);
    expect(b.stats.goals).toBeNull();
  });
  it("falls back to the current club when the index has no history", () => {
    expect(cardBio(player(), 3207, 2002, new Map()).careerClubs).toEqual(["Arsenal"]);
  });
});

describe("eraOf", () => {
  const prov = (tier: "rich" | "sparse", hasXg: boolean) => ({
    tier,
    season: 2010,
    basis: { hasAdvanced: tier === "rich", hasXg, hasSaves: false },
  });
  it("labels the three provenance regimes", () => {
    expect(eraOf(prov("sparse", false))?.key).toBe("eraSparse");
    expect(eraOf(prov("rich", false))?.key).toBe("eraRich");
    expect(eraOf(prov("rich", true))?.key).toBe("eraXg");
  });
  it("returns null when provenance is absent", () => {
    expect(eraOf(null)).toBeNull();
  });
});

describe("dimsFor", () => {
  it("gives goalkeepers their own labels, reading the gk block", () => {
    const dims = dimsFor("GK");
    expect(dims.map((d) => d.label)).toEqual(["REF", "HAN", "KIC", "POS", "CMD"]);
    expect(dims.map((d) => d.key)).toEqual([
      "reflexes",
      "handling",
      "kicking",
      "positioning",
      "command",
    ]);
  });

  it("gives outfielders the existing labels", () => {
    expect(dimsFor("CB").map((d) => d.label)).toEqual(["ATT", "CRE", "DEF", "PHY", "DIS"]);
  });

  it("falls back to the outfield set for an unenriched null role", () => {
    expect(dimsFor(null).map((d) => d.label)).toEqual(["ATT", "CRE", "DEF", "PHY", "DIS"]);
  });

  it("marks which set reads the gk block so the card knows where to look", () => {
    expect(dimsFor("GK")[0].source).toBe("gk");
    expect(dimsFor("CB")[0].source).toBe("ratings");
  });

  it("never labels a goalkeeper dimension DIS — that means discipline on the outfield card", () => {
    expect(dimsFor("GK").map((d) => d.label)).not.toContain("DIS");
  });
});
