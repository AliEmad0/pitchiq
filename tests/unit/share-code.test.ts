import { describe, expect, it } from "vitest";

import type { PlayerSeasonId } from "../../src/features/game/domain/card-id";
import {
  decodeMatch,
  encodeMatch,
  fingerprintMatches,
  SHARE_VERSION,
  type ShareableMatch,
} from "../../src/features/game/domain/share-code";

const squad = (): PlayerSeasonId[] =>
  [
    "1000457@2003",
    "1000001@1999",
    "1000002@2010",
    "1000003@2024",
    "1000004@1992",
    "1000005@2005",
    "1000006@2018",
    "1000007@2021",
    "1000008@1996",
    "1000009@2013",
    "1000010@2007",
  ] as PlayerSeasonId[];

const match = (over: Partial<ShareableMatch> = {}): ShareableMatch => ({
  cardIds: squad(),
  formationKey: "4-4-2",
  seed: 123456789,
  fingerprint: 0xdeadbeef,
  ...over,
});

describe("share code round-trip", () => {
  it("decodes to exactly what was encoded", () => {
    const m = match();
    const back = decodeMatch(encodeMatch(m));
    expect(back).toEqual(m);
  });

  it("survives every season in the archive range", () => {
    for (const season of [1992, 2000, 2024, 2025]) {
      const m = match({ cardIds: squad().map(() => `1000457@${season}`) as PlayerSeasonId[] });
      expect(decodeMatch(encodeMatch(m))).toEqual(m);
    }
  });

  it("stays short enough to paste into a chat", () => {
    // A link that gets truncated is a link that decodes to null for the recipient.
    expect(encodeMatch(match()).length).toBeLessThan(160);
  });

  it("preserves a fingerprint with the high bit set", () => {
    // `hashEvents` is a 32-bit hash, so a signed/unsigned slip corrupts half of them.
    const m = match({ fingerprint: 0xffffffff });
    expect(decodeMatch(encodeMatch(m))!.fingerprint).toBe(0xffffffff);
  });
});

describe("a code is untrusted input", () => {
  it("returns null rather than throwing, for every malformed shape", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "garbage",
      "v1.only.three.parts",
      "v1.zz.4-4-2.a-b.ff", // wrong squad size
      `${SHARE_VERSION}.!!.4-4-2.${"1-1_".repeat(11).slice(0, -1)}.ff`, // non-base36 seed
      `${SHARE_VERSION}.1.<script>.${"1-1_".repeat(11).slice(0, -1)}.ff`, // injected key
      "x".repeat(500),
    ]) {
      expect(decodeMatch(bad as string), String(bad)).toBeNull();
    }
  });

  it("rejects an unknown version instead of guessing", () => {
    // The dangerous failure: a future format decoding into a DIFFERENT but plausible
    // match. Failing closed is the only safe behaviour.
    const code = encodeMatch(match()).replace(/^v1/, "v2");
    expect(decodeMatch(code)).toBeNull();
  });

  it("rejects a season outside the archive", () => {
    // Edit the CARDS field specifically — the code ends with the fingerprint, so a
    // regex anchored at the end never touches a card.
    const parts = encodeMatch(match()).split(".");
    const cards = parts[3].split("_");
    cards[10] = "1-1"; // playerId 1, season 1
    parts[3] = cards.join("_");
    expect(decodeMatch(parts.join("."))).toBeNull();
  });

  it("rejects a zero player id", () => {
    const parts = encodeMatch(match()).split(".");
    const cards = parts[3].split("_");
    cards[0] = `0-${(2024).toString(36)}`;
    parts[3] = cards.join("_");
    expect(decodeMatch(parts.join("."))).toBeNull();
  });

  it("refuses to encode a squad that is not 11 cards", () => {
    expect(() => encodeMatch(match({ cardIds: squad().slice(0, 10) }))).toThrow(/11 cards/);
  });

  it("refuses to encode a formation key that would not survive a URL", () => {
    expect(() => encodeMatch(match({ formationKey: "4.4.2" }))).toThrow(/formation key/);
  });
});

describe("fingerprint is carried, not trusted", () => {
  it("matches when both sides replayed the same match", () => {
    expect(fingerprintMatches(match({ fingerprint: 42 }), 42)).toBe(true);
  });

  it("flags drift when the receiver's replay differs", () => {
    // Means the card pool or engine moved between the two builds. The receiver still
    // shows THEIR replay — the fingerprint only decides whether to warn.
    expect(fingerprintMatches(match({ fingerprint: 42 }), 43)).toBe(false);
  });

  it("compares unsigned, so a negative hash still matches itself", () => {
    expect(fingerprintMatches(match({ fingerprint: -1 }), 0xffffffff)).toBe(true);
  });
});
