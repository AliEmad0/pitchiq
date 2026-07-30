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
});
