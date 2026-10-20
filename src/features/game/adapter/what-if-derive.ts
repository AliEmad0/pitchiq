import "server-only";
import { loadEvents, loadFixture, loadLineup } from "@/data/loaders";
import type { Side } from "../domain/match-types";
import type { Scenario } from "../domain/what-if";

type RawEvent = NonNullable<Awaited<ReturnType<typeof loadEvents>>>[number];

const RED_CARDS = new Set(["Red Card", "SecondYellow Card", "StraightRed Card"]);
const isGoal = (type: string, detail: string | null | undefined) =>
  type === "Goal" && !/missed/i.test(detail ?? "");

/**
 * TASK-1816 — re-derive a What-If scenario from the committed archive.
 *
 * The coach takes the side that was furthest behind at any goal; play starts the minute
 * after the goal that created that deficit (the FIRST time it was reached). Real red cards
 * and substitutions at or before that minute travel with it, so a scenario never starts
 * from a state that did not happen. Returns null when the fixture's goal events do not
 * add up to its final score — a deficit we cannot prove is one we do not offer.
 *
 * This is the guard behind the frozen `SCENARIOS` list: the test re-derives every entry.
 */
export async function deriveScenario(
  fixtureId: string,
  season: number,
): Promise<Omit<Scenario, "id"> | null> {
  const [fixture, events, lineup] = await Promise.all([
    loadFixture(fixtureId, season),
    loadEvents(fixtureId, season),
    loadLineup(fixtureId, season),
  ]);
  if (fixture == null || events == null || lineup == null) return null;
  const { homeTeamId, homeScore, awayScore } = fixture;
  if (homeScore == null || awayScore == null) return null;

  const goals = events.filter((e) => isGoal(e.type, e.detail)).sort((a, b) => a.minute - b.minute);
  const sideOf = (teamId: number): Side => (teamId === homeTeamId ? "home" : "away");
  const homeGoals = goals.filter((g) => sideOf(g.teamId) === "home").length;
  if (homeGoals !== homeScore || goals.length - homeGoals !== awayScore) return null;

  let home = 0;
  let away = 0;
  let best: { deficit: number; side: Side; minute: number; home: number; away: number } | null =
    null;
  for (const g of goals) {
    if (sideOf(g.teamId) === "home") home++;
    else away++;
    for (const side of ["home", "away"] as const) {
      const deficit = side === "home" ? away - home : home - away;
      if (deficit > (best?.deficit ?? 1)) best = { deficit, side, minute: g.minute, home, away };
    }
  }
  if (best == null) return null;
  const startMinute = best.minute;

  const before = events.filter((e) => e.minute <= startMinute);
  const count = (pred: (e: RawEvent) => boolean) => ({
    home: before.filter((e) => pred(e) && sideOf(e.teamId) === "home").length,
    away: before.filter((e) => pred(e) && sideOf(e.teamId) === "away").length,
  });
  const reds = (e: RawEvent) => e.type === "Card" && RED_CARDS.has(e.detail ?? "");
  const names = (side: Side) =>
    before.filter((e) => reds(e) && sideOf(e.teamId) === side).map((e) => e.player ?? "");

  return {
    fixtureId,
    season,
    date: fixture.date.slice(0, 10),
    side: best.side,
    startMinute,
    startScore: { home: best.home, away: best.away },
    history: { home: homeScore, away: awayScore },
    sentOffBefore: count(reds),
    dismissedBefore: { home: names("home"), away: names("away") },
    subsBefore: count((e) => e.type === "subst"),
    realXi: {
      home: lineup.home.startXI.map((p) => p.name),
      away: lineup.away.startXI.map((p) => p.name),
    },
  };
}
