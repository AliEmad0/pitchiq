import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTINENTS, continentOf, ringOf } from "@/features/game/domain/continents";

/**
 * TASK-1842 — the nation → continent map behind the Nationality Draft's widening ring.
 *
 * Geographic continents, not FIFA confederations, because the owner's words are "African
 * players" and "from Europe" — so Australia is Oceania and Turkey/Russia/Israel are Europe.
 */
describe("continents", () => {
  it("maps the home nations to Europe — they are flag-icons subdivisions, not ISO codes", () => {
    for (const code of ["gb-eng", "gb-sct", "gb-wls", "gb-nir"]) {
      expect(continentOf(code), code).toBe("eu");
    }
  });

  it("separates nation from continent — Egypt and Senegal share a ring only at ring 2", () => {
    expect(continentOf("eg")).toBe("af");
    expect(continentOf("sn")).toBe("af");
    expect(continentOf("fr")).toBe("eu");
    expect(continentOf("br")).toBe("sa");
    // ⚠️ The deliberate geographic calls: Australia plays its football in Asia these days,
    // but "Oceania" is what a fan reads off the map; Suriname is CONCACAF but South America.
    expect(continentOf("au")).toBe("oc");
    expect(continentOf("sr")).toBe("sa");
    expect(continentOf("xk")).toBe("eu");
  });

  it("returns null for an unknown or missing code rather than guessing", () => {
    expect(continentOf("zz")).toBeNull();
    expect(continentOf(null)).toBeNull();
  });

  it("ringOf widens nation → continent → world, and an unknown code is WORLD, never nation", () => {
    expect(ringOf({ nationalityCode: "eg" }, "eg")).toBe("nation");
    expect(ringOf({ nationalityCode: "sn" }, "eg")).toBe("continent");
    expect(ringOf({ nationalityCode: "fr" }, "eg")).toBe("world");
    // ⛔ A card with no code must never pass as a countryman — that would smuggle an
    // unidentified player into the nation ring of every draft.
    expect(ringOf({ nationalityCode: null }, "eg")).toBe("world");
    expect(ringOf({}, "eg")).toBe("world");
  });

  it("⛔ ROT GUARD — every nationalityCode in the committed data resolves to a continent", () => {
    /**
     * The ticket's own requirement: the map "must not rot when a new nation appears in the
     * data". A data refresh that introduces a code this map lacks fails here, instead of
     * that nation silently drafting as "world" in every ring.
     */
    const dir = path.join(process.cwd(), "data");
    const files = readdirSync(dir).filter((f) => /^players-\d{4}\.json$/.test(f));
    expect(files.length).toBeGreaterThan(30); // the 34 seasons — a vacuous read would pass

    const seen = new Set<string>();
    for (const f of files) {
      const rows = JSON.parse(readFileSync(path.join(dir, f), "utf-8")) as Array<{
        nationalityCode?: string | null;
      }>;
      for (const row of rows) if (row.nationalityCode) seen.add(row.nationalityCode);
    }
    expect(seen.size).toBeGreaterThan(100); // measured: 128 distinct codes

    const unmapped = [...seen].filter((code) => continentOf(code) == null);
    expect(unmapped).toEqual([]);
  });

  it("holds exactly six continents, and every entry uses one of them", () => {
    const values = new Set(Object.values(CONTINENTS));
    expect([...values].sort()).toEqual(["af", "as", "eu", "na", "oc", "sa"]);
  });
});
