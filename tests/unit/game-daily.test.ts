import { afterEach, describe, expect, it } from "vitest";
import { dayKey, dayKeyOffset } from "@/features/game/domain/daily";

describe("dayKey", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it("⚠️ reads UTC fields, so every timezone gets the same challenge", () => {
    // 2026-08-17T23:30Z is ALREADY 2026-08-18 in UTC+13 and still 2026-08-17
    // in UTC-8. A local-getter implementation returns three different answers
    // here; that is the bug this pins.
    const instant = new Date("2026-08-17T23:30:00.000Z");
    expect(dayKey(instant)).toBe("2026-08-17");
  });

  it("pads month and day to two digits", () => {
    expect(dayKey(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
  });

  it("rolls at midnight UTC exactly", () => {
    expect(dayKey(new Date("2026-08-17T23:59:59.999Z"))).toBe("2026-08-17");
    expect(dayKey(new Date("2026-08-18T00:00:00.000Z"))).toBe("2026-08-18");
  });

  it("steps by whole UTC days in both directions", () => {
    expect(dayKeyOffset("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayKeyOffset("2026-12-31", 1)).toBe("2027-01-01");
  });
});
