import type { MetadataRoute } from "next";

import { getAvailableSeasons, loadFixtures, loadPlayers, loadTeams } from "@/data/loaders";
import { SECTION_SLUGS } from "@/features/seasons/section-slugs";
import { currentDataSeason } from "@/utils/season";
import { getSiteUrl } from "@/utils/site-url";

// Next 15 file-convention sitemap. Enumerates the current data season in full
// (~20 teams + ~518 players + ~380 fixtures + static routes ≈ ~920 URLs, well
// under the 10k threshold). Historical ENTITY routes are excluded to keep the
// sitemap from ballooning to ~30k URLs; the current season is the indexing
// priority. Historical season DASHBOARDS (/seasons/<year>, TASK-M71a) are
// listed — 33 URLs, each a real prerendered page.
//
// TASK-1601: each entry advertises its Arabic alternate via hreflang. The
// canonical `url` stays the un-prefixed English URL (localePrefix "as-needed");
// Arabic lives under /ar. Row count is unchanged — each row just gains the
// `alternates.languages` field.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl().toString().replace(/\/$/, "");
  const season = currentDataSeason();

  // `path` is the un-prefixed pathname (with optional query), e.g. "/teams/42".
  const langs = (path: string) => ({
    languages: { en: `${base}${path}`, ar: `${base}/ar${path}` },
  });

  const [teams, players, fixtures] = await Promise.all([
    loadTeams(season),
    loadPlayers(season),
    loadFixtures(season),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, alternates: langs("/"), changeFrequency: "daily", priority: 1 },
    { url: `${base}/teams`, alternates: langs("/teams"), changeFrequency: "weekly", priority: 0.8 },
    // TASK-M12: the all-fixtures listing for the current season (kept lean —
    // just the current season, not one per committed season). Listed bare: the
    // page defaults to `currentDataSeason()`, so `/fixtures` and
    // `/fixtures?season=<current>` are the same page and the bare form is the
    // canonical one (a sitemap must list canonical URLs).
    {
      url: `${base}/fixtures`,
      alternates: langs("/fixtures"),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${base}/compare`,
      alternates: langs("/compare"),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    { url: `${base}/map`, alternates: langs("/map"), changeFrequency: "monthly", priority: 0.6 },
    // TASK-1832 — the game hub. Only the gate is listed: the mode sub-routes
    // (/game/draft, /game/chaos, /game/demo) are app surfaces with no indexable
    // content, so they stay out.
    { url: `${base}/game`, alternates: langs("/game"), changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${base}/seasons`,
      alternates: langs("/seasons"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // TASK-M71a — every historical season is now a real indexable page. The
  // current season is excluded: it lives at `/` and `/seasons/<current>`
  // 308-redirects there.
  const seasonRoutes: MetadataRoute.Sitemap = (await getAvailableSeasons())
    .filter((s) => s !== season)
    .map((s) => ({
      url: `${base}/seasons/${s}`,
      alternates: langs(`/seasons/${s}`),
      changeFrequency: "yearly" as const,
      priority: 0.5,
    }));

  // TASK-M71b — each historical season's five section indexes. Current season
  // excluded (it lives at the bare /<section>, and /seasons/<current>/<section>
  // redirects). ~33 × 5 = 165 URLs, each with its /ar alternate.
  const seasonSectionRoutes: MetadataRoute.Sitemap = (await getAvailableSeasons())
    .filter((s) => s !== season)
    .flatMap((s) =>
      SECTION_SLUGS.map((sec) => ({
        url: `${base}/seasons/${s}/${sec}`,
        alternates: langs(`/seasons/${s}/${sec}`),
        changeFrequency: "yearly" as const,
        priority: 0.4,
      })),
    );

  const teamRoutes: MetadataRoute.Sitemap = (teams ?? []).map((t) => ({
    url: `${base}/teams/${t.id}`,
    alternates: langs(`/teams/${t.id}`),
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const playerRoutes: MetadataRoute.Sitemap = (players ?? []).map((p) => ({
    url: `${base}/players/${p.id}`,
    alternates: langs(`/players/${p.id}`),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const fixtureRoutes: MetadataRoute.Sitemap = (fixtures ?? []).map((f) => ({
    url: `${base}/fixtures/${f.id}`,
    alternates: langs(`/fixtures/${f.id}`),
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [
    ...staticRoutes,
    ...seasonRoutes,
    ...seasonSectionRoutes,
    ...teamRoutes,
    ...playerRoutes,
    ...fixtureRoutes,
  ];
}
