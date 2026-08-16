import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { favouriteSupplierRule } from "../../src/features/trivia/rules/favourite-supplier";
import { lateDecidersRule } from "../../src/features/trivia/rules/late-deciders";
import { spotKicksAndOwnGoalsRule } from "../../src/features/trivia/rules/spot-kicks-and-own-goals";
import { travelledManagerRule } from "../../src/features/trivia/rules/travelled-manager";

import { triviaStub } from "./_helpers/trivia";

/**
 * TASK-M82 — do the new rules actually FIRE on the committed data?
 *
 * The synthetic tests prove the logic; these prove the wiring. A rule can pass every
 * synthetic case and still return null in production because a threshold is set above
 * what the real data supports, or because a field name differs — and nothing else would
 * catch that.
 *
 * The numbers below are the ones TASK-M82 quoted from the audit, so a drift in the data
 * fails here loudly rather than silently emptying the trivia deck.
 */
const DATA = join(process.cwd(), "data");
const read = async (f: string) => JSON.parse(await readFile(join(DATA, f), "utf8"));

const SEASON = 2024;

describe("M82 rules against the committed data", () => {
  it("R27 fires, and the archive still has the 97 late goals the ticket measured", async () => {
    const events = await read(`events-${SEASON}.json`);
    const data = triviaStub({ season: SEASON, events: async () => events });

    const r = await lateDecidersRule.run(data, { scope: "league" });
    expect(r).not.toBeNull();
    expect(r!.text).toMatch(/\d+ of the \d+ goals/);
    expect(await r!.verify(data)).toBe(true);

    const all = Object.values(events as Record<string, Array<Record<string, unknown>>>).flat();
    const lateAny = all.filter((e) => e.type === "Goal" && (e.minute as number) >= 90);
    const lateScored = lateAny.filter((e) => e.detail !== "Own");

    // ⚠️ The ticket quotes **97**, and that figure INCLUDES own goals. The rule counts
    // goals a team *scored*, so it excludes them and reports **96** — the difference is
    // exactly one late own goal. Both are asserted so the next reader does not "fix" the
    // rule to match the ticket and quietly credit an own goal to the team that conceded.
    expect(lateAny.length).toBe(97);
    expect(lateScored.length).toBe(96);
  });

  it("R28 fires — 72% of goals name an assister, and nothing aggregated it before", async () => {
    const events = await read(`events-${SEASON}.json`);
    const standings = await read(`standings-${SEASON}.json`);
    const data = triviaStub({
      season: SEASON,
      events: async () => events,
      standings: async () => standings,
    });

    const r = await favouriteSupplierRule.run(data, { scope: "league" });
    expect(r).not.toBeNull();
    expect(r!.text).toMatch(/set up .+ \d+ times/);
    expect(await r!.verify(data)).toBe(true);
  });

  it("R29 fires and reports real penalty + own-goal counts", async () => {
    const events = await read(`events-${SEASON}.json`);
    const data = triviaStub({ season: SEASON, events: async () => events });

    const r = await spotKicksAndOwnGoalsRule.run(data, { scope: "league" });
    expect(r).not.toBeNull();
    expect(r!.text).toContain("penalty spot");
    expect(await r!.verify(data)).toBe(true);
  });

  it("R32 finds a real multi-country title winner", async () => {
    const [managers, honours] = await Promise.all([
      read("managers.json"),
      read("manager-honours-history.json"),
    ]);
    const data = triviaStub({
      season: SEASON,
      managers: async () => managers,
      managerHonours: async () => honours,
    });

    const r = await travelledManagerRule.run(data, { scope: "league" });
    expect(r).not.toBeNull();
    // Ancelotti (5 countries) is the record holder in the committed map.
    expect(r!.text).toMatch(/won a national league title in \d+ different countries/);
    expect(await r!.verify(data)).toBe(true);
  });
});
