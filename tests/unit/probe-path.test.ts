import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isProbePath } from "@/utils/probe-path";

/**
 * Hosting-cost guard. Every unknown URL used to run a Node function to produce a 404 —
 * measured on production, `x-vercel-cache: MISS` on every request — so `middleware.ts`
 * answers scanner shapes at the edge instead.
 *
 * ⛔ The dangerous direction is the FALSE POSITIVE: a rule that catches a real path takes a
 * page (or robots/sitemap/PWA metadata, or ACME renewal) off the site with no other test
 * noticing. Every assertion below that matters is a NEGATIVE one.
 */
describe("probe paths", () => {
  it("⛔ answers the shapes scanners actually use", () => {
    // These were each verified on production to cost a Node render before this existed.
    for (const p of [
      "/wp-login.php",
      "/xmlrpc.php",
      "/admin.php",
      "/wp-admin",
      "/wp-content/uploads/x.php",
      "/.env",
      "/.env.local",
      "/.git/config",
      "/.aws/credentials",
      "/phpmyadmin/index.php",
      "/cgi-bin/test.cgi",
      "/vendor/phpunit/phpunit/eval-stdin.php",
      "/autodiscover/autodiscover.xml",
      "/config.bak",
      "/database.sql",
      "/ar/wp-login.php",
    ]) {
      expect(isProbePath(p), p).toBe(true);
    }
  });

  it("⛔ NEVER catches the site's own metadata files", () => {
    /**
     * The expensive mistake this test exists for. `robots.txt` and `sitemap.xml` are generated
     * routes, and the icon/manifest/OG files are Next metadata conventions. 404ing any of them
     * would cost search visibility and the PWA install, and nothing else here would fail.
     */
    for (const p of [
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/icon.svg",
      "/favicon.ico",
      "/opengraph-image.png",
      "/apple-icon.png",
      "/ar/opengraph-image.png",
    ]) {
      expect(isProbePath(p), p).toBe(false);
    }
  });

  it("⛔ NEVER catches .well-known — certificate renewal and universal links live there", () => {
    for (const p of [
      "/.well-known/acme-challenge/tokenvalue",
      "/.well-known/apple-app-site-association",
      "/.well-known/security.txt",
    ]) {
      expect(isProbePath(p), p).toBe(false);
    }
  });

  it("⚠️ a mistyped real URL still reaches the branded 404, not a bare edge one", () => {
    // The reason this is a denylist of junk rather than an allowlist of real segments.
    for (const p of ["/playerz", "/team/40", "/seasons/1066", "/ar/fixtres", "/compair"]) {
      expect(isProbePath(p), p).toBe(false);
    }
  });

  it("⛔ DRIFT GUARD — no real route segment looks like a probe", () => {
    /**
     * Read off the route tree rather than restated, so a section added later cannot be
     * silently 404ed at the edge by a rule written before it existed.
     */
    const dir = path.join(process.cwd(), "src/app/[locale]");
    const segments = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
      .map((d) => d.name);

    // A vacuous version of this test would pass against an empty directory read.
    expect(segments.length).toBeGreaterThan(5);

    for (const s of segments) {
      for (const p of [`/${s}`, `/${s}/1`, `/ar/${s}`, `/ar/${s}/1`]) {
        expect(isProbePath(p), p).toBe(false);
      }
    }
  });

  it("⚠️ the site root and both locale roots are never probes", () => {
    for (const p of ["/", "/ar", "/ar/", "/en", "/en/"]) {
      expect(isProbePath(p), p).toBe(false);
    }
  });
});
