import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/utils/site-url";

/**
 * AI/scraper crawlers blocked outright.
 *
 * These walk a link-rich site like this one extremely aggressively — PitchIQ
 * exposes ~35,000 crawlable entity URLs across 34 seasons and 2 locales — while
 * sending essentially no traffic back. Every request of theirs that misses the
 * CDN costs Fluid Active CPU against the Hobby cap, so they are refused here.
 *
 * Deliberately NOT listed, and therefore still allowed by the `*` group below:
 *   - Googlebot / Bingbot / DuckDuckBot — real search traffic.
 *   - facebookexternalhit / Twitterbot / LinkedInBot / Slackbot / Discordbot /
 *     WhatsApp — link-preview unfurlers. Blocking those would break the OG
 *     cards, and they fetch one URL per share rather than crawling the graph.
 */
const BLOCKED_AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "FacebookBot",
  "Applebot-Extended",
  "Google-Extended",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  "Scrapy",
];

// Next 15 file-convention robots.txt.
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl().toString().replace(/\/$/, "");
  return {
    rules: [
      // Specific groups first — a crawler obeys the single most specific group
      // matching its token, so these take precedence over the wildcard below.
      { userAgent: BLOCKED_AI_CRAWLERS, disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        // `/api/` is machine surface. `/*?season=` is blocked because the same
        // entity page is reachable under 34 season values — crawling those
        // multiplies one page into 34 distinct URLs for no indexing benefit.
        disallow: ["/api/", "/*?season="],
        // Paces the long tail of minor bots through the uncached history.
        // Google ignores crawl-delay, so search indexing is unaffected; Bing
        // and most smaller crawlers honour it.
        crawlDelay: 10,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
