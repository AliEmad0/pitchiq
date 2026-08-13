import { describe, expect, it } from "vitest";

import { NAV_ITEMS, PRIMARY_NAV_HREFS } from "@/components/layout/nav-items";

describe("NAV_ITEMS", () => {
  it("includes a Fixtures link (TASK-M35)", () => {
    expect(NAV_ITEMS.some((i) => i.href === "/fixtures" && i.label === "Fixtures")).toBe(true);
  });

  it("keeps the core entry points", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toEqual(expect.arrayContaining(["/", "/teams", "/fixtures", "/compare"]));
  });

  it("includes the Managers link after Teams (TASK-M49)", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    expect(labels).toContain("Managers");
    expect(labels.indexOf("Managers")).toBe(labels.indexOf("Teams") + 1);
    expect(NAV_ITEMS.find((i) => i.label === "Managers")?.href).toBe("/managers");
  });

  it("includes the Players link after Managers (TASK-M50)", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    expect(labels).toContain("Players");
    expect(labels.indexOf("Players")).toBe(labels.indexOf("Managers") + 1);
    expect(NAV_ITEMS.find((i) => i.label === "Players")?.href).toBe("/players");
  });

  it("includes the Leaderboards link after Players (TASK-M18)", () => {
    const labels = NAV_ITEMS.map((i) => i.label);
    expect(labels).toContain("Leaderboards");
    expect(labels.indexOf("Leaderboards")).toBe(labels.indexOf("Players") + 1);
    expect(NAV_ITEMS.find((i) => i.label === "Leaderboards")?.href).toBe("/leaderboards");
  });

  it("includes the Map link (TASK-M27)", () => {
    expect(NAV_ITEMS.some((i) => i.href === "/map" && i.label === "Map")).toBe(true);
  });

  it("puts /game in the nav and inline in the primary pills (TASK-1832)", () => {
    const game = NAV_ITEMS.find((i) => i.href === "/game");
    expect(game, "/game missing from NAV_ITEMS").toBeDefined();
    expect(game!.key).toBe("game");
    // D8 — a sixth inline pill, not folded into "More ▾". The game was unreachable
    // precisely because nothing linked to it; the dropdown would barely change that.
    expect(PRIMARY_NAV_HREFS).toContain("/game");
  });

  it("keeps /game out of the season-path model (TASK-1832)", async () => {
    // `navHrefForSeason` rewrites a nav href into /seasons/<year>/<slug> when the slug is
    // a SECTION_SLUG. "game" must never be one, or viewing 2003 would link the pill to
    // /seasons/2003/game, which does not exist.
    const { SECTION_SLUGS } = await import("@/features/seasons/section-slugs");
    expect(SECTION_SLUGS as readonly string[]).not.toContain("game");
  });
});
