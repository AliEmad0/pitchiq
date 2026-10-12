import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { queryDefaults } from "@/components/providers/QueryProvider";

/**
 * The build-OOM regression (2026-10-12). A server QueryClient with a finite `gcTime` schedules
 * a timer per query, and a Node timer pins the AsyncLocalStorage context — i.e. the whole
 * finished page — of the render that created it. Two such timers per prerendered page held
 * ~1 GB per build worker and ran the production build past Vercel's 45-minute limit.
 */
describe("QueryProvider defaults", () => {
  it("⛔ never schedules a garbage-collection timer on the server", () => {
    expect(queryDefaults(true).gcTime).toBe(Infinity);
  });

  it("keeps the 5-minute cache in the browser", () => {
    expect(queryDefaults(false).gcTime).toBe(5 * 60 * 1000);
  });

  it("⭐ a server-configured query leaves NO pending timer behind (the actual leak)", async () => {
    const spy = vi.spyOn(globalThis, "setTimeout");
    const server = new QueryClient({ defaultOptions: { queries: queryDefaults(true) } });
    await server.prefetchQuery({ queryKey: ["x"], queryFn: async () => 1 });
    const gcTimers = spy.mock.calls.filter(([, ms]) => (ms ?? 0) >= 60_000);
    expect(gcTimers).toHaveLength(0);

    // Control: the browser defaults DO schedule one — proves the assertion above can fail.
    spy.mockClear();
    const browser = new QueryClient({ defaultOptions: { queries: queryDefaults(false) } });
    await browser.prefetchQuery({ queryKey: ["y"], queryFn: async () => 1 });
    expect(spy.mock.calls.filter(([, ms]) => ms === 5 * 60 * 1000).length).toBeGreaterThan(0);
    spy.mockRestore();
    server.clear();
    browser.clear();
  });
});
