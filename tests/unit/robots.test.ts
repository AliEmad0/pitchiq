import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("robots.ts", () => {
  it("disallows the API surface and ?season= query URLs", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const disallow = rules.flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
    );
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/*?season=");
  });

  it("still advertises the sitemap", () => {
    const result = robots();
    expect(String(result.sitemap)).toMatch(/\/sitemap\.xml$/);
  });
});
