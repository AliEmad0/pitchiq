import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";

describe("i18n routing", () => {
  it("declares en (default) + ar with as-needed prefixing", () => {
    expect(routing.locales).toEqual(["en", "ar"]);
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("as-needed");
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
