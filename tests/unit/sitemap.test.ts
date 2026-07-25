import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/loaders", () => ({
  loadTeams: vi.fn(async () => [{ id: 42 }, { id: 35 }]),
  loadPlayers: vi.fn(async () => [{ id: 1000457 }]),
  loadFixtures: vi.fn(async () => [{ id: "2025-08-16-MUN-ARS" }]),
}));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sitemap", () => {
  it("includes static + entity routes on the configured base URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pitchiq-pl.vercel.app");
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain("https://pitchiq-pl.vercel.app/");
    expect(urls).toContain("https://pitchiq-pl.vercel.app/teams");
    expect(urls).toContain("https://pitchiq-pl.vercel.app/compare");
    // TASK-M12: the all-fixtures listing for the current season — listed bare,
    // since that is its canonical form (the page defaults to the current season).
    expect(urls).toContain("https://pitchiq-pl.vercel.app/fixtures");
    expect(urls.every((u) => !/\/fixtures\?season=/.test(u))).toBe(true);
    expect(urls).toContain("https://pitchiq-pl.vercel.app/teams/42");
    expect(urls).toContain("https://pitchiq-pl.vercel.app/players/1000457");
    expect(urls).toContain("https://pitchiq-pl.vercel.app/fixtures/2025-08-16-MUN-ARS");
  });
});

describe("robots", () => {
  it("allows /, disallows /api/ + ?season= crawling, and links the sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pitchiq-pl.vercel.app");
    const r = robots();

    // `/*?season=` stops crawlers rendering the uncached historical-season
    // permutations (the Vercel Active-CPU regression, 2026-07-25).
    expect(r.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/*?season="],
    });
    expect(r.sitemap).toBe("https://pitchiq-pl.vercel.app/sitemap.xml");
  });
});
