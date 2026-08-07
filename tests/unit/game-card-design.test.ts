import { describe, expect, it } from "vitest";
import {
  imageKind,
  PREMIUM_MIN,
  pickBack,
  pickFront,
  type FrontDesign,
} from "@/features/game/domain/card-design";
import type { EnrichedCard } from "@/features/game/domain/player-card";

const card = (over: Partial<EnrichedCard>): EnrichedCard =>
  ({
    cardId: "1@2023",
    playerId: 1,
    season: 2023,
    photo: null,
    ratings: { attack: 0, creation: 0, defense: 0, physical: 0, discipline: 0, overall: 70 },
    ...over,
  }) as EnrichedCard;

describe("imageKind", () => {
  it("classifies by photo string shape", () => {
    expect(imageKind("118748")).toBe("cutout");
    expect(imageKind("https://example.com/p.png")).toBe("photo");
    expect(imageKind(null)).toBe("none");
    expect(imageKind("")).toBe("none");
    expect(imageKind("not-a-code")).toBe("none");
  });
});

describe("pickFront", () => {
  it("under 90 → Onyx for photos, Gold for cutouts / no image", () => {
    expect(pickFront(card({ ratings: r(88), photo: "https://x/p.jpg" }))).toBe("A2");
    expect(pickFront(card({ ratings: r(88), photo: "118748" }))).toBe("A1");
    expect(pickFront(card({ ratings: r(60), photo: null }))).toBe("A1");
  });

  it("90+ → a premium design (never A1/A2)", () => {
    for (let id = 1; id <= 7; id++) {
      const front = pickFront(card({ cardId: `${id}@2023`, ratings: r(94) }));
      expect(["B1", "B2", "B3", "C1", "D1", "D2"]).toContain(front);
    }
  });

  it("is deterministic per card and respects the 90 threshold exactly", () => {
    const c = card({ cardId: "8@2023", ratings: r(91) });
    expect(pickFront(c)).toBe(pickFront(c));
    expect(pickFront(card({ ratings: r(PREMIUM_MIN - 1), photo: "1" }))).toBe("A1");
    const at90 = pickFront(card({ ratings: r(PREMIUM_MIN) }));
    expect(["B1", "B2", "B3", "C1", "D1", "D2"] as FrontDesign[]).toContain(at90);
  });

  it("spreads the premium pool across many cards", () => {
    const seen = new Set<FrontDesign>();
    for (let i = 0; i < 60; i++) seen.add(pickFront(card({ cardId: `${i}@2023`, ratings: r(95) })));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe("pickBack", () => {
  it("returns a back from the four-way pool, deterministically", () => {
    const c = card({ cardId: "9@2023" });
    expect(["K01", "K02", "K07", "K09"]).toContain(pickBack(c));
    expect(pickBack(c)).toBe(pickBack(c));
  });
});

function r(overall: number) {
  return { attack: 0, creation: 0, defense: 0, physical: 0, discipline: 0, overall };
}
