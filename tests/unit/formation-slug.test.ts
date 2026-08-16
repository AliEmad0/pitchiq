import { describe, expect, it } from "vitest";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import {
  formationBySlug,
  formationKey,
  formationNameFromKey,
  formationSlug,
} from "@/features/game/domain/formation";

describe("formationSlug", () => {
  it("survives spaces, capitals and digits", () => {
    expect(formationSlug("4-3-2-1 Christmas Tree")).toBe("4-3-2-1-christmas-tree");
    expect(formationSlug("2-3-5 Pyramid")).toBe("2-3-5-pyramid");
  });

  // ⚠️ THE guard. Two names slugging to the same value would restore a shared match into
  // the WRONG shape — exactly the hazard `formationKey`'s docstring exists to prevent.
  it("is unique across every shipped formation", () => {
    const slugs = FORMATIONS.map((f) => formationSlug(f.name));
    expect(new Set(slugs).size).toBe(FORMATIONS.length);
  });

  it("round-trips every shipped formation", () => {
    for (const f of FORMATIONS) {
      expect(formationBySlug(formationSlug(f.name))).toBe(f);
    }
  });

  it("returns null for an unknown slug rather than throwing", () => {
    // ⚠️ "4-4-2" is deliberate: it is what the old share-code fixture used, and NO shipped
    // formation produces it — every 4-4-2 here carries a qualifier ("Flat", "Diamond").
    expect(formationBySlug("4-4-2")).toBeNull();
    expect(formationBySlug("../../etc/passwd")).toBeNull();
    expect(formationBySlug("")).toBeNull();
  });

  it("recovers the name from a formation key", () => {
    for (const f of FORMATIONS) {
      expect(formationNameFromKey(formationKey(f))).toBe(f.name);
    }
  });
});
