import { describe, expect, it } from "vitest";
import type { TacticalStyle } from "@/features/game/domain/opponent";
import {
  decodeMatch,
  encodeMatch,
  SHARE_VERSION,
  type ShareableMatch,
} from "@/features/game/domain/share-code";
import { STYLES } from "@/features/game/domain/style-scouting";

/**
 * TASK-1825 — a coach's style rides in the code. `v3` = v2's seven fields plus a style token.
 * A `v2` code still decodes (style absent → replayed under the shipped rule), and a code is
 * only ever written as v3 when a style exists, so a resumed pre-change match keeps sharing as v2.
 */
const base = (style?: TacticalStyle): ShareableMatch => ({
  cardIds: Array.from({ length: 11 }, (_, i) => `${1000 + i}@2010` as const),
  formationSlug: "4-4-2-flat",
  seed: 123456,
  tokens: "",
  fingerprint: 987654,
  rival: { teamId: 42, policy: "best" },
  ...(style == null ? {} : { style }),
});

describe("share code v3", () => {
  it("round-trips every style", () => {
    for (const s of STYLES) {
      const code = encodeMatch(base(s));
      expect(code.startsWith("v3.")).toBe(true);
      expect(decodeMatch(code)).toEqual(base(s));
    }
  });

  it("⛔ no style still writes v2 — the shipped format, byte for byte", () => {
    const code = encodeMatch(base());
    expect(SHARE_VERSION).toBe("v2");
    expect(code.startsWith("v2.")).toBe(true);
    expect(code.split(".")).toHaveLength(7);
    const decoded = decodeMatch(code)!;
    expect(decoded.style).toBeUndefined();
    expect(decoded).toEqual(base());
  });

  it("refuses a malformed v3", () => {
    const v3 = encodeMatch(base("counter"));
    const parts = v3.split(".");
    expect(decodeMatch(parts.slice(0, 7).join("."))).toBeNull(); // v3 missing its style
    expect(decodeMatch([...parts.slice(0, 7), "x"].join("."))).toBeNull(); // unknown token
    expect(decodeMatch([...parts.slice(0, 7), "cc"].join("."))).toBeNull(); // two tokens
    expect(decodeMatch(`${v3}.b`)).toBeNull(); // nine parts
  });

  it("refuses a v2 code carrying a style segment", () => {
    const v2 = encodeMatch(base());
    expect(decodeMatch(`${v2}.c`)).toBeNull();
  });
});
