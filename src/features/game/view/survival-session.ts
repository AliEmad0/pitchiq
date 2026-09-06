import type { ClassicData } from "../domain/classic-data";
import type { SavedSurvival } from "../storage/survival-slot";
import { survivalScenario, survivalProgress } from "../domain/survival";
import { seasonTable } from "../domain/season";
import { classicFixtureSeed } from "./classic-run";
import { restoreClassic, nextClassicFixture, rotateClassic } from "./classic-session";

export function survivalCandidates(data: ClassicData) {
  if (data.table.some((r) => r.pointsAdjustment !== 0)) return [];
  const prefix = data.schedule.fixtures.filter(
    (f) => f.date.slice(0, 10) < `${data.season + 1}-01-01`,
  );
  return seasonTable(
    data.clubIds.length,
    prefix.map((f, i) => ({ ...f, week: i, seed: 0 })),
  )
    .slice(-5)
    .map((r) => data.clubIds[r.club]);
}
export function scenarioFor(data: ClassicData, clubId: number) {
  if (!survivalCandidates(data).includes(clubId)) throw new Error("Unsupported Survival takeover");
  // Four clubs went down in 1994/95 when the division contracted to twenty.
  // https://www.premierleague.com/en/history
  const relegated = data.season === 1994 ? 4 : 3;
  const safe = data.table.find((r) => r.rank === data.clubIds.length - relegated);
  if (!safe) throw new Error("Missing Survival benchmark");
  return survivalScenario(
    data.schedule,
    data.clubIds.indexOf(clubId),
    `${data.season + 1}-01-01`,
    safe.points + 1,
    relegated,
  );
}
/** The historical prefix exists only in this adapter, never in the Survival slot. */
export function survivalAsClassic(data: ClassicData, saved: SavedSurvival) {
  const expected = scenarioFor(data, saved.clubId);
  if (
    Object.keys(expected).some(
      (k) => expected[k as keyof typeof expected] !== saved.scenario[k as keyof typeof expected],
    )
  )
    throw new Error("Survival objective changed");
  survivalProgress(data.schedule, expected, saved.results);
  return {
    ...saved,
    results: [
      ...data.schedule.fixtures.slice(0, expected.start).map((f) => ({
        fixtureId: f.id,
        seed: classicFixtureSeed(saved.seed, f.id),
        homeGoals: f.homeGoals,
        awayGoals: f.awayGoals,
      })),
      ...saved.results,
    ],
  };
}
export function restoreSurvival(data: ClassicData, saved: SavedSurvival) {
  const prepared = restoreClassic(data, survivalAsClassic(data, saved));
  return {
    ...prepared,
    run: { ...prepared.run, results: saved.results, scenario: saved.scenario },
  };
}
export function nextSurvivalFixture(data: ClassicData, saved: SavedSurvival) {
  return nextClassicFixture(data, survivalAsClassic(data, saved));
}
export function rotateSurvival(
  data: ClassicData,
  saved: SavedSurvival,
  cards: readonly string[],
): SavedSurvival {
  const rotated = rotateClassic(data, survivalAsClassic(data, saved), cards);
  return { ...saved, cardIds: rotated.cardIds };
}
