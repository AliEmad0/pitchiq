import { describe, expect, it } from "vitest";
import { makeCardId, parseCardId } from "@/features/game/domain/card-id";

describe("card-id", () => {
  it("builds an id@season key", () => {
    expect(makeCardId(1000457, 2003)).toBe("1000457@2003");
  });

  it("round-trips through parse", () => {
    expect(parseCardId(makeCardId(1000457, 2003))).toEqual({
      playerId: 1000457,
      season: 2003,
    });
  });

  it("rejects a malformed key", () => {
    expect(() => parseCardId("nope")).toThrow(/invalid card id/i);
    expect(() => parseCardId("12@34@56")).toThrow(/invalid card id/i);
    expect(() => parseCardId("abc@2003")).toThrow(/invalid card id/i);
  });
});
