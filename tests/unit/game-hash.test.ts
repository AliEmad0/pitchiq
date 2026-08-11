import { describe, expect, it } from "vitest";
import { hashEvents, hashStr } from "@/features/game/domain/hash";
import type { MatchEvent } from "@/features/game/domain/match-types";

const ev = (minute: number, kind: MatchEvent["kind"], playerId?: number): MatchEvent =>
  ({ minute, kind, side: "home", playerId }) as MatchEvent;

describe("hashStr", () => {
  it("is deterministic", () => {
    expect(hashStr("arsenal")).toBe(hashStr("arsenal"));
  });

  it("separates different inputs", () => {
    expect(hashStr("arsenal")).not.toBe(hashStr("arsenaI"));
  });

  it("is a non-negative 32-bit integer", () => {
    for (const s of ["", "a", "goal:45:1000457"]) {
      const h = hashStr(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("hashEvents", () => {
  it("is deterministic over the same list", () => {
    const events = [ev(1, "kickoff"), ev(23, "goal", 500)];
    expect(hashEvents(events)).toBe(hashEvents([...events]));
  });

  it("changes when an event is appended", () => {
    const events = [ev(1, "kickoff"), ev(23, "goal", 500)];
    expect(hashEvents(events)).not.toBe(hashEvents([...events, ev(70, "card", 501)]));
  });

  it("⚠️ is order-sensitive", () => {
    // A replay that produced the same events in a different order is NOT the same match;
    // the whole point of the fingerprint is to catch a silently different simulation.
    const a = [ev(23, "goal", 500), ev(70, "card", 501)];
    const b = [ev(70, "card", 501), ev(23, "goal", 500)];
    expect(hashEvents(a)).not.toBe(hashEvents(b));
  });

  it("distinguishes the same event kind by player", () => {
    expect(hashEvents([ev(23, "goal", 500)])).not.toBe(hashEvents([ev(23, "goal", 501)]));
  });

  it("hashes an empty list without throwing", () => {
    expect(Number.isInteger(hashEvents([]))).toBe(true);
  });
});
