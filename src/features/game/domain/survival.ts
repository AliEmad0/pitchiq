import type { HistoricalSchedule, PlayedHistoricalFixture } from "./classic-season";
import { seasonTable } from "./season";

export interface SurvivalScenario {
  coach: number;
  /** Historical calendar prefix ends here; campaign results start at this index. */
  start: number;
  targetPoints: number;
  relegated: number;
}

export function survivalScenario(
  schedule: HistoricalSchedule,
  coach: number,
  cutoff: string,
  targetPoints: number,
  relegated = 3,
): SurvivalScenario {
  if (!Number.isInteger(coach) || coach < 0 || coach >= schedule.clubs)
    throw new Error("Invalid Survival club");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(cutoff) ||
    !Number.isFinite(Date.parse(cutoff)) ||
    new Date(cutoff).toISOString().slice(0, 10) !== cutoff
  )
    throw new Error("Invalid Survival takeover date");
  if (
    !Number.isSafeInteger(targetPoints) ||
    targetPoints < 1 ||
    !Number.isInteger(relegated) ||
    relegated < 1 ||
    relegated >= schedule.clubs
  )
    throw new Error("Invalid Survival objective");
  const start = schedule.fixtures.filter((f) => Date.parse(f.date) < Date.parse(cutoff)).length;
  const own = (f: HistoricalSchedule["fixtures"][number]) => f.home === coach || f.away === coach;
  if (!schedule.fixtures.slice(0, start).some(own) || !schedule.fixtures.slice(start).some(own))
    throw new Error("Survival needs a mid-season takeover");
  return { coach, start, targetPoints, relegated };
}

/** Historical baseline is read from the archive, never relabeled as simulated results. */
export function survivalProgress(
  schedule: HistoricalSchedule,
  scenario: SurvivalScenario,
  results: readonly PlayedHistoricalFixture[],
) {
  const { start, coach, targetPoints, relegated } = scenario;
  if (
    !Number.isInteger(start) ||
    start < 1 ||
    start >= schedule.fixtures.length ||
    !Number.isInteger(coach) ||
    coach < 0 ||
    coach >= schedule.clubs ||
    !Number.isSafeInteger(targetPoints) ||
    targetPoints < 1 ||
    !Number.isInteger(relegated) ||
    relegated < 1 ||
    relegated >= schedule.clubs
  )
    throw new Error("Invalid Survival scenario");
  if (
    results.length > schedule.fixtures.length - start ||
    results.some(
      (r, i) =>
        r.fixtureId !== schedule.fixtures[start + i].id ||
        !Number.isSafeInteger(r.homeGoals) ||
        r.homeGoals < 0 ||
        !Number.isSafeInteger(r.awayGoals) ||
        r.awayGoals < 0,
    )
  )
    throw new Error("Invalid Survival campaign prefix");
  const completed = [
    ...schedule.fixtures.slice(0, start),
    ...results.map((r, i) => ({ ...schedule.fixtures[start + i], ...r })),
  ];
  const table = seasonTable(
    schedule.clubs,
    completed.map((f) => ({ ...f, week: 0, seed: 0 })),
  );
  const own = table.find((r) => r.club === coach)!;
  const position = table.indexOf(own) + 1;
  const safePlaces = schedule.clubs - relegated;
  const complete = start + results.length === schedule.fixtures.length;
  const safe = table[safePlaces - 1],
    danger = table[safePlaces];
  const tied =
    safe.points === danger.points &&
    safe.goalDifference === danger.goalDifference &&
    safe.goalsFor === danger.goalsFor &&
    own.points === safe.points &&
    own.goalDifference === safe.goalDifference &&
    own.goalsFor === safe.goalsFor;
  const remaining = schedule.fixtures
    .slice(start + results.length)
    .filter((f) => f.home === coach || f.away === coach);
  return {
    table,
    own,
    position,
    safePlaces,
    complete,
    remaining,
    pointsNeeded: Math.max(0, targetPoints - own.points),
    targetMet: own.points >= targetPoints,
    status: !complete
      ? "in-progress"
      : tied
        ? "tiebreak"
        : position <= safePlaces
          ? "survived"
          : "relegated",
  } as const;
}
