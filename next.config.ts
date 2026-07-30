import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl (TASK-1601). The plugin defaults to ./src/i18n/request.ts, which is
// where our per-request message loader lives — no path arg needed.
const withNextIntl = createNextIntlPlugin();

/**
 * TASK-M71a — the current season lives at `/`, so `/seasons/<current>`
 * redirects there. next.config runs outside the `@` alias and cannot import
 * `currentDataSeason()`, so the value is inlined and pinned by
 * tests/unit/next-config-redirects.test.ts — the mirror pattern already used
 * for sentry-enabled. The `source` patterns below are built from this
 * constant, so rollover is this one line.
 */
export const CURRENT_SEASON_FOR_REDIRECT = 2025;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return [
      // The current season is `/`; its path form must not be a second URL.
      {
        source: `/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})`,
        destination: "/",
        permanent: true,
      },
      {
        source: `/ar/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})`,
        destination: "/ar",
        permanent: true,
      },
      // Back-compat: `?season=` links already shared, bookmarked or indexed.
      // Next forwards the incoming query onto the destination (`/seasons/2010
      // ?season=2010`) and offers no way to strip it here; that's fine — the
      // season page ignores the param and self-canonicalises to the bare path.
      {
        source: "/",
        has: [{ type: "query", key: "season", value: "(?<season>\\d{4})" }],
        destination: "/seasons/:season",
        permanent: true,
      },
      {
        source: "/ar",
        has: [{ type: "query", key: "season", value: "(?<season>\\d{4})" }],
        destination: "/ar/seasons/:season",
        permanent: true,
      },
    ];
  },
};

// Whether to apply Sentry's bundler plugin. Skipped in development: under
// Turbopack (< Next 15.4.1) the plugin sets `serverExternalPackages` for
// `import-in-the-middle`/`require-in-the-middle`, which floods `pnpm dev` with
// "can't be external" warnings and destabilizes the dev server (intermittent
// 500s + "missing required error components"). Production builds use webpack
// and keep Sentry fully wired. Mirror of src/utils/sentry-enabled.ts, inlined
// because next.config runs outside the bundler's `@` alias — keep in sync.
const sentryEnabled =
  process.env.NODE_ENV === "production" || process.env.SENTRY_FORWARD_DEV === "1";

// The wrapper is inert (no source-map upload) when `SENTRY_AUTH_TOKEN` is
// absent — local production builds still work; Vercel picks up the token from
// the project env vars. `silent: !process.env.CI` keeps build logs clean
// locally; CI sees the upload diagnostics so failures are visible.
const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Delete the on-disk source maps after upload so they don't ship in the
  // deployed bundle — only Sentry sees them, end users get minified code.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Tunnel client-side requests through a same-origin route to dodge
  // ad-blockers that block `*.sentry.io` requests.
  tunnelRoute: "/monitoring",
  // Disable Sentry's automatic Vercel CRON instrumentation — we don't
  // schedule any crons and the autoinstrumenter logs warnings without it.
  // (Sentry SDK 10 moved this nested under `webpack`.)
  webpack: {
    automaticVercelMonitors: false,
  },
};

const withI18n = withNextIntl(nextConfig);

export default sentryEnabled ? withSentryConfig(withI18n, sentryOptions) : withI18n;
