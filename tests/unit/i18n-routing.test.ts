import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

describe("i18n routing", () => {
  // ⛔ EVERY ENTRY HERE MULTIPLIES THE WHOLE PRERENDERED SITE (TASK-1843, measured 2026-08-30).
  // `[locale]/layout.tsx#generateStaticParams` returns this array, so two locales meant 38,121
  // pages and a build that FAILED on Vercel's 45-minute limit. One locale is 19,163 pages,
  // about 23 minutes. Adding a locale is therefore a build-budget decision, not a copy one:
  // measure the page count first, and cut it before adding, never after.
  it("⛔ ships exactly ONE locale - each one doubles the build", () => {
    expect(routing.locales).toEqual(["en"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("as-needed");
  });

  // ⭐ Arabic is PARKED, not deleted. The catalog is the expensive, perishable asset - it is
  // 74 KB of translation that stays in step with the code only while it is present. Deleting
  // it would turn "put 'ar' back in routing.locales" into a re-translation project, so this
  // test exists to make the deletion fail loudly. Tag `ar-locale-live` marks the last commit
  // that shipped Arabic; next.config.ts 301s `/ar/*` to English while it is parked.
  it("⭐ keeps the Arabic catalog on disk so the locale can be restored by one line", () => {
    const p = join(process.cwd(), "src/i18n/messages/ar.json");
    expect(existsSync(p), "src/i18n/messages/ar.json was deleted - see TASK-1843").toBe(true);
    const ar = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    const en = JSON.parse(
      readFileSync(join(process.cwd(), "src/i18n/messages/en.json"), "utf8"),
    ) as Record<string, unknown>;
    // Not a stub: it must still cover the same top-level namespaces English does.
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  // Hosting-cost guard. next-intl's middleware writes `Set-Cookie: NEXT_LOCALE`
  // unless this is off, and a response with Set-Cookie is uncacheable by a
  // shared CDN — which made Vercel serve `x-vercel-cache: MISS` on every single
  // page request, bypassing ~1,700 prerendered pages and running a Fluid
  // function per page view. That is what blew the Active-CPU cap in 2026-07.
  //
  // If someone re-enables the cookie (or drops the option while upgrading
  // next-intl), this test fails before it can reach production.
  it("keeps the NEXT_LOCALE cookie DISABLED so pages stay CDN-cacheable", () => {
    expect(routing.localeCookie).toBe(false);
  });

  // The cookie is only safe to disable because nothing depends on it for
  // detection — the locale is carried by the URL. Pinned so the two settings
  // can't drift apart.
  it("does not rely on cookie/header locale detection", () => {
    expect(routing.localeDetection).toBe(false);
  });
});
