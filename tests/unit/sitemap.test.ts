import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/data/loaders", () => ({
  loadTeams: vi.fn(async () => [{ id: 42 }, { id: 35 }]),
  loadPlayers: vi.fn(async () => [{ id: 1000457 }]),
  loadFixtures: vi.fn(async () => [{ id: "2025-08-16-MUN-ARS" }]),
  getAvailableSeasons: vi.fn(async () => [2025, 2010, 2003]),
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

  // TASK-M71a — every historical season is a real indexable page now.
  it("lists the seasons hub and every committed season", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pitchiq-pl.vercel.app");
    const urls = (await sitemap()).map((e) => e.url);

    expect(urls).toContain("https://pitchiq-pl.vercel.app/seasons");
    expect(urls).toContain("https://pitchiq-pl.vercel.app/seasons/2003");
    expect(urls).toContain("https://pitchiq-pl.vercel.app/seasons/2010");
    // The current season lives at `/` and its path form redirects there, so it
    // must NOT be listed — a sitemap lists canonical URLs only.
    expect(urls).not.toContain("https://pitchiq-pl.vercel.app/seasons/2025");
  });
});

describe("robots", () => {
  const wildcard = (r: ReturnType<typeof robots>) =>
    (Array.isArray(r.rules) ? r.rules : [r.rules]).find((g) => g.userAgent === "*");
  const blocked = (r: ReturnType<typeof robots>) =>
    (Array.isArray(r.rules) ? r.rules : [r.rules]).find((g) => Array.isArray(g.userAgent));

  it("allows /, disallows /api/ + ?season= crawling, and links the sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pitchiq-pl.vercel.app");
    const r = robots();

    // `/*?season=` stops crawlers rendering the uncached historical-season
    // permutations (the Vercel Active-CPU regression, 2026-07-25).
    expect(wildcard(r)).toMatchObject({
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/*?season="],
    });
    expect(r.sitemap).toBe("https://pitchiq-pl.vercel.app/sitemap.xml");
  });

  // Hosting-cost guard: these agents crawl the ~35,000-URL entity graph hard
  // and send no traffic back, and each uncached hit costs Fluid Active CPU
  // against the Hobby cap. See docs/hosting-cost.md.
  it("blocks the aggressive AI/scraper crawlers outright", () => {
    const group = blocked(robots());
    expect(group?.disallow).toBe("/");
    for (const agent of ["GPTBot", "ClaudeBot", "CCBot", "PerplexityBot", "Bytespider"]) {
      expect(group?.userAgent).toContain(agent);
    }
  });

  // Blocking these would break OG link previews, and they fetch one URL per
  // share rather than crawling — they must stay on the permissive `*` group.
  it("does NOT block search engines or social preview unfurlers", () => {
    const agents = String(blocked(robots())?.userAgent);
    for (const allowed of [
      "Googlebot",
      "Bingbot",
      "DuckDuckBot",
      "facebookexternalhit",
      "Twitterbot",
      "LinkedInBot",
      "Slackbot",
      "Discordbot",
    ]) {
      expect(agents).not.toContain(allowed);
    }
  });
});
