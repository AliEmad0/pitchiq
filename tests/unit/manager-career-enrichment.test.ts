import { describe, expect, it } from "vitest";

import {
  countTrophies,
  managedSpells,
  orderHonourGroups,
  spellPpm,
  spellSpan,
} from "@/features/managers/career-enrichment";
import type { ManagerCareerSpell, ManagerHonourGroup } from "@/data/schemas";

const group = (over: Partial<ManagerHonourGroup> = {}): ManagerHonourGroup => ({
  title: "English Champion",
  count: 1,
  kind: "trophy",
  entries: [],
  ...over,
});

const spell = (over: Partial<ManagerCareerSpell> = {}): ManagerCareerSpell => ({
  club: "Arsenal",
  clubId: "11",
  role: "Manager",
  appointedSeason: null,
  appointedDate: "1996-10-01",
  until: null,
  untilDate: "2018-05-13",
  ongoing: false,
  matches: 1231,
  wins: 707,
  draws: 280,
  losses: 244,
  daysInCharge: null,
  playersUsed: null,
  goalsPerMatch: null,
  ppm: 1.95,
  assistantTo: null,
  ...over,
});

describe("orderHonourGroups", () => {
  it("puts silverware first, then individual awards", () => {
    const out = orderHonourGroups([
      group({ title: "Manager of the Year", kind: "award", count: 3 }),
      group({ title: "English Champion", kind: "trophy", count: 3 }),
    ]);
    expect(out.map((g) => g.kind)).toEqual(["trophy", "award"]);
  });

  it("ranks the biggest hauls first within a kind", () => {
    const out = orderHonourGroups([
      group({ title: "FA Cup", count: 2 }),
      group({ title: "League Cup", count: 5 }),
      group({ title: "Super Cup", count: 3 }),
    ]);
    expect(out.map((g) => g.count)).toEqual([5, 3, 2]);
  });

  it("drops participation and relegation — they pad a cabinet without earning it", () => {
    const out = orderHonourGroups([
      group({ title: "Champions League participant", kind: "participation", count: 21 }),
      group({ title: "Relegation", kind: "relegation", count: 1 }),
      group({ title: "Promotion", kind: "promotion", count: 2 }),
      group({ title: "FA Cup runner-up", kind: "runner-up", count: 1 }),
      group({ title: "English Champion", kind: "trophy", count: 3 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("English Champion");
  });

  it("does not mutate the input", () => {
    const input = [group({ count: 1 }), group({ title: "B", count: 9 })];
    const copy = JSON.parse(JSON.stringify(input));
    orderHonourGroups(input);
    expect(input).toEqual(copy);
  });
});

describe("countTrophies", () => {
  it("counts silverware only, by group count", () => {
    expect(
      countTrophies([
        group({ count: 3 }),
        group({ title: "FA Cup", count: 2 }),
        group({ title: "Manager of the Year", kind: "award", count: 4 }),
        group({ title: "CL participant", kind: "participation", count: 21 }),
      ]),
    ).toBe(5);
  });
});

describe("managedSpells", () => {
  it("keeps any spell with a real record, whatever the role says", () => {
    // Role is not the signal — Player-Coach spells carry genuine records.
    const out = managedSpells([
      spell({ club: "Liverpool", role: "Player-Coach", matches: 297 }),
      spell({ club: "Arsenal", role: "Manager" }),
    ]);
    expect(out.map((s) => s.club)).toContain("Liverpool");
    expect(out).toHaveLength(2);
  });

  it("drops assistants, scouts and directors — they carry no record", () => {
    const out = managedSpells([
      spell({ club: "Barcelona", role: "Assistant Manager", matches: null, ppm: 0 }),
      spell({ club: "FIFA", role: "Director of Development", matches: null, ppm: 0 }),
      spell({ club: "Real Madrid", role: "Manager", matches: null, ppm: 0 }), // announced, not started
      spell({ club: "Arsenal" }),
    ]);
    expect(out.map((s) => s.club)).toEqual(["Arsenal"]);
  });

  it("orders most recent first, with undated spells last", () => {
    const out = managedSpells([
      spell({ club: "Old", appointedDate: "1990-01-01" }),
      spell({ club: "Undated", appointedDate: null }),
      spell({ club: "New", appointedDate: "2020-01-01" }),
    ]);
    expect(out.map((s) => s.club)).toEqual(["New", "Old", "Undated"]);
  });
});

describe("spellSpan", () => {
  it("returns the year range", () => {
    expect(spellSpan(spell())).toEqual({ from: "1996", to: "2018" });
  });

  it("leaves the end open while ongoing", () => {
    expect(spellSpan(spell({ ongoing: true, untilDate: null }))).toEqual({ from: "1996", to: null });
  });

  it("never leaks Transfermarkt's free-text end cell", () => {
    // `until` can read "expected 30/06/2027" — only untilDate is used.
    const s = spell({ until: "expected 30/06/2027", untilDate: null, ongoing: false });
    expect(spellSpan(s)).toEqual({ from: "1996", to: null });
  });

  it("returns null without a usable start, so the caller omits the span", () => {
    expect(spellSpan(spell({ appointedDate: null }))).toBeNull();
    expect(spellSpan(spell({ appointedDate: "not-a-date" }))).toBeNull();
  });
});

describe("spellPpm", () => {
  it("derives points per match from the spell's own W/D/L", () => {
    expect(spellPpm(spell({ matches: 100, wins: 60, draws: 20, losses: 20 }))).toBe(2);
  });

  it("is null when there is no record — never 0", () => {
    // A record-less spell carries ppm: 0, which means "no record".
    expect(spellPpm(spell({ matches: null, wins: null, draws: null, ppm: 0 }))).toBeNull();
    expect(spellPpm(spell({ matches: 0, wins: 0, draws: 0 }))).toBeNull();
  });
});
