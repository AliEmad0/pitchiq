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
  /**
   * ⛔ THE BUILD'S BINDING CONSTRAINT IS MEMORY, NOT TIME (TASK-1843, measured 2026-08-30).
   *
   * Read the failure precisely before changing anything here. The 19,125-page build logged
   *
   *     ✓ Generating static pages (19125/19125)
   *     ✗ Next.js build worker exited with code: null and signal: SIGKILL
   *
   * — every page rendered, and the worker was killed **91 seconds after generation finished**.
   * `SIGKILL` with no "JavaScript heap out of memory" is the container's OOM killer, not V8 and
   * not the 45-minute limit: the phase that dies is the one AFTER generation (finalize, build
   * traces, assembling a prerender manifest with 19k entries).
   *
   * ⚠️ So raising `--max-old-space-size` is the WRONG move - it lets one worker claim more of
   * the RAM the container is already out of. The lever is fewer workers held at once, which
   * trades build TIME (we have spare: 19,125 pages generated well inside the limit) for peak
   * MEMORY (we do not).
   *
   * ⚠️ And the page count is the other lever. If this is still not enough, cut pages - see
   * tests/unit/entity-routes-bounded.test.ts for the one way you may NOT cut them.
   */
  experimental: {
    // Cap the parallel build workers. Hobby build containers are small, and the default scales
    // with the CPU count rather than with available memory.
    cpus: 2,
    // Size the worker pool from free memory instead of core count.
    memoryBasedWorkersCount: true,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    // TASK-M71b — the section indexes join the season-path model. Kept in sync
    // with src/features/seasons/section-slugs.ts by
    // tests/unit/next-config-redirects.test.ts (next.config can't import `@/`).
    const SECTIONS = ["teams", "players", "fixtures", "leaderboards", "managers"];
    const sectionRedirects = SECTIONS.flatMap((s) => [
      // Current season's nested form → the bare section URL (both locales).
      {
        source: `/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`,
        destination: `/${s}`,
        permanent: true,
      },
      {
        source: `/ar/seasons/:year(${CURRENT_SEASON_FOR_REDIRECT})/${s}`,
        destination: `/ar/${s}`,
        permanent: true,
      },
      // Legacy `?season=` → the path form (both locales). Next forwards the
      // query onto the destination; harmless (the page self-canonicalises).
      {
        source: `/${s}`,
        has: [{ type: "query", key: "season", value: "(?<season>\\d{4})" }],
        destination: `/seasons/:season/${s}`,
        permanent: true,
      },
      {
        source: `/ar/${s}`,
        has: [{ type: "query", key: "season", value: "(?<season>\\d{4})" }],
        destination: `/ar/seasons/:season/${s}`,
        permanent: true,
      },
    ]);

    return [
      // ⭐ FIRST, so it wins over every `/ar/*` rule below (TASK-1843). Arabic is parked -
      // `routing.locales` is `["en"]` - so `/ar/*` no longer resolves to a segment. Without
      // these two, an indexed Arabic URL would fall through to `[locale]/[...rest]` and buy a
      // Node render to produce a 404: exactly the cost this ticket exists to remove. A
      // redirect is answered at the edge, for free.
      //
      // ⚠️ These must be REMOVED if `"ar"` ever goes back into `routing.locales`, or Arabic
      // will 301 itself to English forever. See src/i18n/routing.ts.
      { source: "/ar", destination: "/", permanent: true },
      { source: "/ar/:path*", destination: "/:path*", permanent: true },
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
      // TASK-1832 — /game/play was byte-identical to /game/draft (same component, same
      // props). The draft route is canonical; this keeps any shared or bookmarked link
      // working rather than 404ing it.
      //
      // ⚠️ Next forwards the incoming query onto the destination and offers no way to
      // strip it. Wanted here — `?phase=` survives the hop — but it is the same behaviour
      // that caused the TASK-M71a bug, so it is noted rather than left to be rediscovered.
      { source: "/game/play", destination: "/game/draft", permanent: true },
      { source: "/ar/game/play", destination: "/ar/game/draft", permanent: true },
      ...sectionRedirects,
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
