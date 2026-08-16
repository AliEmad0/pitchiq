import { describe, expect, it } from "vitest";

import type { PlayerSeasonId } from "../../src/features/game/domain/card-id";
import { FORMATIONS } from "../../src/features/game/domain/chaos-draft";
import { formationSlug } from "../../src/features/game/domain/formation";
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
  // ⛔ A REAL formation. The previous fixture said "4-4-2", which NO shipped formation
  // produces — every 4-4-2 here carries a qualifier ("Flat", "Diamond") and `formationKey`
  // appends "/11". That impossible fixture is why the old KEY_RE, which rejected all 20
  // real shapes, passed its tests.
  formationSlug: formationSlug(FORMATIONS[4]!.name),
  seed: 123456789,
  tokens: "-2~h~-",
  fingerprint: 0xdeadbeef,
  ...over,
});

/** The cards field of a code, as an array. */
const cardsOf = (code: string) => code.split(".")[3]!.split("_");
const withCards = (code: string, cards: string[]) => {
  const parts = code.split(".");
  parts[3] = cards.join("_");
  return parts.join(".");
};

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

  it("stays short enough to paste into a chat, at its WORST case", () => {
    // A link that gets truncated is a link that decodes to null for the recipient. The
    // budget grew when the coach's decisions joined the payload, so measure the worst
    // case that can actually occur rather than the fixture: the longest formation name,
    // and a token stream from a match where the coach intervened repeatedly.
    const longest = FORMATIONS.reduce((a, b) =>
      formationSlug(a.name).length >= formationSlug(b.name).length ? a : b,
    );
    const worst = encodeMatch(
      match({
        formationSlug: formationSlug(longest.name),
        tokens: "-8~s1a-2b~o~-6~z~s3c-4d~h~-9~d5e-6f~-4",
      }),
    );
    expect(worst.length).toBeLessThan(200);
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
      "v1.zz.4-4-2-flat.a-b.-.ff", // wrong squad size
      `${SHARE_VERSION}.!!.4-4-2-flat.${"1-1_".repeat(11).slice(0, -1)}.-.ff`, // non-base36 seed
      `${SHARE_VERSION}.1.<script>.${"1-1_".repeat(11).slice(0, -1)}.-.ff`, // injected slug
      `${SHARE_VERSION}.1.4-4-2-flat.${"1-1_".repeat(11).slice(0, -1)}.-.ff.extra`, // 7 fields
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
    const code = encodeMatch(match());
    const cards = cardsOf(code);
    cards[10] = "1-1"; // playerId 1, season 1
    expect(decodeMatch(withCards(code, cards))).toBeNull();
  });

  it("rejects a zero player id", () => {
    const code = encodeMatch(match());
    const cards = cardsOf(code);
    cards[0] = `0-${(2024).toString(36)}`;
    expect(decodeMatch(withCards(code, cards))).toBeNull();
  });

  it("refuses to encode a squad that is not 11 cards", () => {
    expect(() => encodeMatch(match({ cardIds: squad().slice(0, 10) }))).toThrow(/11 cards/);
  });

  it("refuses to encode a formation slug that would not survive a URL", () => {
    expect(() => encodeMatch(match({ formationSlug: "4.4.2" }))).toThrow(/formation slug/);
    // ⛔ What `formationKey` actually returns. Encoding this was the shipped bug.
    expect(() => encodeMatch(match({ formationSlug: "4-4-2 Flat/11" }))).toThrow(/formation slug/);
  });
});

describe("every shipped formation survives a round trip", () => {
  // ⛔ The test that would have caught the KEY_RE defect: it uses the formations that
  // actually ship, not a hand-written key no formation produces.
  it("encodes and decodes all of them", () => {
    for (const f of FORMATIONS) {
      const m = match({ formationSlug: formationSlug(f.name) });
      expect(decodeMatch(encodeMatch(m)), f.name).toEqual(m);
    }
  });
});

describe("the token field is validated, not trusted", () => {
  it("rejects an ungrammatical token stream", () => {
    const parts = encodeMatch(match()).split(".");
    parts[4] = "q~q";
    expect(decodeMatch(parts.join("."))).toBeNull();
  });

  it("accepts an empty token stream — a match where the coach decided nothing", () => {
    expect(decodeMatch(encodeMatch(match({ tokens: "" })))?.tokens).toBe("");
  });

  it("round-trips a realistic stream", () => {
    const tokens = "-8~s1a-2b~o~-6~z~h~-9";
    expect(decodeMatch(encodeMatch(match({ tokens })))?.tokens).toBe(tokens);
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
