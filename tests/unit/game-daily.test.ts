import { afterEach, describe, expect, it } from "vitest";
import { FORMATIONS } from "@/features/game/domain/chaos-draft";
import {
  DAILY_EPOCH_UTC,
  DAILY_SHAPES,
  dayFormation,
  dayKey,
  dayKeyOffset,
  dayNumber,
  daySeeds,
} from "@/features/game/domain/daily";

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

describe("dayNumber", () => {
  it("counts 1-based from the epoch", () => {
    expect(dayNumber(DAILY_EPOCH_UTC)).toBe(1);
    expect(dayNumber("2026-08-18")).toBe(2);
    expect(dayNumber("2026-09-16")).toBe(31);
  });

  it("⚠️ clamps below the epoch rather than going negative", () => {
    // A device with a badly wrong clock must still see a sane challenge number,
    // not "Daily #-4".
    expect(dayNumber("2026-08-10")).toBe(1);
  });

  it("crosses a year boundary without drifting", () => {
    expect(dayNumber("2027-08-17")).toBe(366);
  });
});

describe("daySeeds", () => {
  it("is deterministic and gives three DIFFERENT streams", () => {
    const a = daySeeds("2026-08-17");
    const b = daySeeds("2026-08-17");
    expect(a).toEqual(b);
    expect(new Set([a.formation, a.deal, a.match]).size).toBe(3);
  });

  it("differs between adjacent days", () => {
    expect(daySeeds("2026-08-17").deal).not.toBe(daySeeds("2026-08-18").deal);
  });

  it("stays inside uint32", () => {
    for (const key of ["2026-08-17", "2026-12-31", "2030-01-01"]) {
      for (const s of Object.values(daySeeds(key))) {
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(0xff_ff_ff_ff);
      }
    }
  });
});

describe("DAILY_SHAPES", () => {
  it("⚠️ golden roster — editing this re-maps every past day", () => {
    // The pick is hash(day) % length, so APPENDING is as breaking as reordering.
    // This test exists to make that change loud rather than silent. If you are
    // here because it failed: you have invalidated stored history, and the
    // fingerprint check will discard those records rather than mis-replay them.
    expect(DAILY_SHAPES).toEqual([
      "4-3-3 Holding",
      "4-3-3 Flat",
      "4-3-3 False 9",
      "4-2-3-1",
      "4-4-2 Flat",
      "4-4-2 Diamond",
      "4-1-4-1",
      "4-3-2-1 Christmas Tree",
      "4-5-1",
      "4-2-2-2 Magic Rectangle",
      "3-5-2",
      "3-4-3 Flat",
      "3-4-2-1",
      "3-1-4-2",
      "5-3-2",
      "5-4-1",
      "4-2-4",
      "3-2-2-3 W-M",
      "2-3-5 Pyramid",
      "4-6-0 Strikerless",
    ]);
  });

  it("every name resolves to a real shipped formation", () => {
    const shipped = new Set(FORMATIONS.map((f) => f.name));
    for (const name of DAILY_SHAPES) expect(shipped.has(name)).toBe(true);
  });
});

describe("dayFormation", () => {
  it("is stable for a given day", () => {
    expect(dayFormation("2026-08-17").name).toBe(dayFormation("2026-08-17").name);
  });

  it("returns eleven slots, whatever the day", () => {
    for (let i = 0; i < 40; i++) {
      expect(dayFormation(dayKeyOffset("2026-08-17", i)).slots).toHaveLength(11);
    }
  });

  it("varies across a month rather than sticking on one shape", () => {
    const names = new Set(
      Array.from({ length: 30 }, (_, i) => dayFormation(dayKeyOffset("2026-08-17", i)).name),
    );
    expect(names.size).toBeGreaterThan(5);
  });
});
