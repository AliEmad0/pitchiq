import { describe, expect, it } from "vitest";
import type { Mentality } from "@/features/game/domain/mentality";
import type { TacticalStyle } from "@/features/game/domain/opponent";
import { decodeMatch, encodeMatch, type ShareableMatch } from "@/features/game/domain/share-code";

/**
 * Mentality — the coach's stance rides in the code as `v4` = v3 + one stance token. Written only
 * for Attacking/Defensive, so Balanced and absent keep writing v3/v2 exactly as before.
 */
const base = (style?: TacticalStyle, mentality?: Mentality): ShareableMatch => ({
  cardIds: Array.from({ length: 11 }, (_, i) => `${1000 + i}@2010` as const),
  formationSlug: "4-4-2-flat",
  seed: 123456,
  tokens: "",
  fingerprint: 987654,
  rival: { teamId: 42, policy: "best" },
  ...(style == null ? {} : { style }),
  ...(mentality == null ? {} : { mentality }),
});

describe("share code v4 (stance)", () => {
  it("round-trips attacking and defensive, with and without a style", () => {
    for (const m of ["attacking", "defensive"] as const) {
      for (const s of [undefined, "counter"] as const) {
        const code = encodeMatch(base(s, m));
        expect(code.startsWith("v4.")).toBe(true);
        expect(code.split(".")).toHaveLength(9);
        expect(decodeMatch(code)).toEqual(base(s, m));
      }
    }
  });

  it("⛔ balanced writes no stance — v3 with a style, v2 without, byte for byte", () => {
    expect(encodeMatch(base("counter", "balanced"))).toBe(encodeMatch(base("counter")));
    expect(encodeMatch(base(undefined, "balanced"))).toBe(encodeMatch(base()));
    expect(encodeMatch(base("counter")).startsWith("v3.")).toBe(true);
  });

  it("refuses a malformed v4", () => {
    const v4 = encodeMatch(base("counter", "attacking")).split(".");
    expect(decodeMatch(v4.slice(0, 8).join("."))).toBeNull(); // missing its stance
    expect(decodeMatch([...v4.slice(0, 8), "x"].join("."))).toBeNull(); // unknown stance
    expect(decodeMatch([...v4.slice(0, 8), "b"].join("."))).toBeNull(); // balanced is never written
    expect(decodeMatch([...v4.slice(0, 7), "q", "a"].join("."))).toBeNull(); // bad style
    expect(decodeMatch(`${v4.join(".")}.a`)).toBeNull(); // ten parts
  });
});
