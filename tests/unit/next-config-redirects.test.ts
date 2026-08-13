import { describe, expect, it } from "vitest";

import { currentDataSeason } from "@/utils/season";

import nextConfig, { CURRENT_SEASON_FOR_REDIRECT } from "../../next.config";

// next.config.ts runs outside the bundler's `@` alias, so it cannot import
// currentDataSeason() and the value is inlined there. This pins the copy in
// sync — the mirror pattern already used for sentry-enabled.
describe("next.config redirects", () => {
  it("pins the inlined current season to currentDataSeason()", () => {
    expect(CURRENT_SEASON_FOR_REDIRECT).toBe(currentDataSeason());
  });

  // Next needs the season as a literal inside the `source` pattern; the config
  // builds those strings from CURRENT_SEASON_FOR_REDIRECT so rollover is a
  // one-line change. These assertions fail if a hardcoded year sneaks back in.
  it("redirects the current season's path form to /", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const sources = redirects.map((r) => r.source);
    expect(sources).toContain(`/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})`);
    expect(sources).toContain(`/ar/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})`);
  });

  it("redirects legacy ?season= links to the path form", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    expect(redirects).toContainEqual(
      expect.objectContaining({ source: "/", destination: "/seasons/:season" }),
    );
    expect(redirects).toContainEqual(
      expect.objectContaining({ source: "/ar", destination: "/ar/seasons/:season" }),
    );
  });

  // TASK-M71b — the section indexes join the season-path model. Same rollover
  // guarantee: the current-season literal derives from CURRENT_SEASON_FOR_REDIRECT.
  const SECTIONS = ["teams", "players", "fixtures", "leaderboards", "managers"];

  it("redirects each section's current-season path form to the bare URL", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const sources = redirects.map((r) => r.source);
    for (const s of SECTIONS) {
      expect(sources).toContain(`/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`);
      expect(sources).toContain(`/ar/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`);
    }
  });

  it("redirects each section's legacy ?season= links to the path form", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    for (const s of SECTIONS) {
      expect(redirects).toContainEqual(
        expect.objectContaining({ source: `/${s}`, destination: `/seasons/:season/${s}` }),
      );
      expect(redirects).toContainEqual(
        expect.objectContaining({ source: `/ar/${s}`, destination: `/ar/seasons/:season/${s}` }),
      );
    }
  });

  // TASK-1832 — /game/play was byte-identical to /game/draft. The draft route is
  // canonical; this keeps any shared or bookmarked link working.
  it("redirects the retired /game/play to /game/draft in both locales", async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const en = redirects.find((r) => r.source === "/game/play");
    const ar = redirects.find((r) => r.source === "/ar/game/play");

    expect(en, "English /game/play redirect missing").toBeDefined();
    expect(en!.destination).toBe("/game/draft");
    expect(en!.permanent).toBe(true);

    expect(ar, "Arabic /game/play redirect missing").toBeDefined();
    expect(ar!.destination).toBe("/ar/game/draft");
    expect(ar!.permanent).toBe(true);
  });
});
