import { describe, expect, it } from "vitest";

import { SECTION_SLUGS, isSectionSlug } from "@/features/seasons/section-slugs";

describe("section slugs", () => {
  it("lists the five season-path section indexes in nav order", () => {
    expect(SECTION_SLUGS).toEqual(["teams", "players", "fixtures", "leaderboards", "managers"]);
  });

  it("type-guards a slug", () => {
    expect(isSectionSlug("teams")).toBe(true);
    expect(isSectionSlug("compare")).toBe(false);
    expect(isSectionSlug("")).toBe(false);
  });
});
