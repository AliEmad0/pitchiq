import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/utils/site-url";

// Next 15 file-convention robots.txt. Allow everything except the API surface;
// point crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl().toString().replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/*?season="] },
    sitemap: `${base}/sitemap.xml`,
  };
}
