import { describe, expect, it } from "vitest";
import type { Mentality } from "@/features/game/domain/mentality";
import type { TacticalStyle } from "@/features/game/domain/opponent";
import { decodeMatch, encodeMatch, type ShareableMatch } from "@/features/game/domain/share-code";

/** TASK-1814 — a match played with traits writes v5; everything else is written as before. */
const base = (
  o: { style?: TacticalStyle; mentality?: Mentality; personality?: boolean } = {},
): ShareableMatch => ({
  cardIds: Array.from({ length: 11 }, (_, i) => `${1000 + i}@2010` as const),
  formationSlug: "4-4-2-flat",
  seed: 123456,
  tokens: "",
  fingerprint: 987654,
  rival: null,
  ...o,
});

describe("share code v5 (personality)", () => {
  it("round-trips with and without a style and a stance", () => {
    for (const style of [undefined, "counter"] as const)
      for (const mentality of [undefined, "attacking", "defensive"] as const) {
        const m = base({
          ...(style ? { style } : {}),
          ...(mentality ? { mentality } : {}),
          personality: true,
        });
        const code = encodeMatch(m);
        expect(code.startsWith("v5.")).toBe(true);
        expect(code.split(".")).toHaveLength(10);
        expect(decodeMatch(code)).toEqual(m);
      }
  });

  it("⛔ without traits nothing changes — v2, v3 and v4 are written byte for byte as before", () => {
    expect(encodeMatch(base()).startsWith("v2.")).toBe(true);
    expect(encodeMatch(base({ style: "counter" })).startsWith("v3.")).toBe(true);
    expect(encodeMatch(base({ mentality: "attacking" })).startsWith("v4.")).toBe(true);
    expect(encodeMatch(base({ personality: false }))).toBe(encodeMatch(base()));
    expect(decodeMatch(encodeMatch(base({ style: "counter" })))!.personality).toBeUndefined();
  });

  it("refuses a malformed v5", () => {
    const v5 = encodeMatch(base({ personality: true })).split(".");
    expect(decodeMatch(v5.slice(0, 9).join("."))).toBeNull();
    expect(decodeMatch([...v5.slice(0, 9), "q"].join("."))).toBeNull();
    expect(decodeMatch([...v5.slice(0, 8), "z", "p"].join("."))).toBeNull();
    expect(decodeMatch([...v5.slice(0, 7), "q", "_", "p"].join("."))).toBeNull();
  });
});
