import { renderHook, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/** Like the real recorder: a key unlocks ONCE; a second call with the same key returns nothing. */
const calls = vi.hoisted(() => [] as string[]);
vi.mock("@/features/game/view/trophy-record", async (orig) => ({
  ...(await orig<typeof import("@/features/game/view/trophy-record")>()),
  recordFullTime: async (e: { key: string }) => {
    const first = !calls.includes(e.key);
    calls.push(e.key);
    return first ? ["first-win"] : [];
  },
}));
const { useFullTimeRecord } = await import("@/features/game/view/use-full-time-record");

/**
 * TASK-1813 — the full-time banner must survive an effect that runs twice (StrictMode's mount
 * check, or any dependency change while the summary is up). Recording twice returns nothing the
 * second time, so a hook that trusts only its LATEST call would show nothing at all.
 */
const entry = (key: string) => ({ key, day: "2026-10-21", cards: [], facts: {}, context: "" });
const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe("useFullTimeRecord", () => {
  it("⛔ a second run for the same match (remount, re-run) still shows what it unlocked, and records once", async () => {
    calls.length = 0;
    const first = renderHook(() => useFullTimeRecord(entry("m:x:1")), { wrapper: strict });
    await waitFor(() => expect(first.result.current).toEqual(["first-win"]));
    first.unmount();
    const again = renderHook(() => useFullTimeRecord(entry("m:x:1")), { wrapper: strict });
    await waitFor(() => expect(again.result.current).toEqual(["first-win"]));
    expect(calls).toEqual(["m:x:1"]);
  });

  it("records nothing while there is no entry, and resets for a new key", async () => {
    calls.length = 0;
    const { result, rerender } = renderHook(
      ({ e }: { e: ReturnType<typeof entry> | null }) => useFullTimeRecord(e),
      { initialProps: { e: null as ReturnType<typeof entry> | null } },
    );
    expect(result.current).toEqual([]);
    expect(calls).toEqual([]);
    rerender({ e: entry("m:x:2") });
    await waitFor(() => expect(result.current).toEqual(["first-win"]));
    rerender({ e: null });
    expect(result.current).toEqual([]);
  });
});
