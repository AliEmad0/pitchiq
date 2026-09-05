/** Historical fixtures use league indices, just like the season spine. No I/O or entropy. */
export interface HistoricalFixture {
  id: string;
  date: string;
  home: number;
  away: number;
  homeGoals: number;
  awayGoals: number;
}

export interface HistoricalSchedule {
  clubs: number;
  /** Actual chronological order, NOT invented equal-sized matchweeks. */
  fixtures: readonly HistoricalFixture[];
}

export interface PlayedHistoricalFixture {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
}

const goalsValid = (n: number) => Number.isSafeInteger(n) && n >= 0;
const points = (gf: number, ga: number) => (gf > ga ? 3 : gf === ga ? 1 : 0);

/** Reject incomplete archives rather than quietly offering a shortened historical season. */
export function historicalSchedule(
  clubs: number,
  fixtures: readonly HistoricalFixture[],
): HistoricalSchedule {
  if (!Number.isSafeInteger(clubs) || clubs < 2 || clubs % 2 !== 0) {
    throw new Error("Historical league needs an even club count of at least two");
  }
  if (fixtures.length !== clubs * (clubs - 1)) {
    throw new Error("Historical league is incomplete");
  }
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const f of fixtures) {
    if (!f.id || ids.has(f.id)) throw new Error("Duplicate or empty historical fixture id");
    if (
      !Number.isInteger(f.home) ||
      !Number.isInteger(f.away) ||
      f.home < 0 ||
      f.away < 0 ||
      f.home >= clubs ||
      f.away >= clubs ||
      f.home === f.away
    )
      throw new Error("Historical fixture names an invalid club");
    if (!goalsValid(f.homeGoals) || !goalsValid(f.awayGoals)) {
      throw new Error("Historical fixture needs completed nonnegative scores");
    }
    // Only canonical UTC timestamps or calendar dates: a local-time string would sort
    // differently on different clients. Round-trip also rejects rolled-over dates.
    const date = Date.parse(f.date);
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(f.date);
    if (
      !Number.isFinite(date) ||
      (dateOnly
        ? new Date(date).toISOString().slice(0, 10) !== f.date
        : new Date(date).toISOString().replace(".000Z", "Z") !== f.date)
    ) {
      throw new Error("Invalid historical fixture date");
    }
    const key = `${f.home}:${f.away}`;
    if (pairs.has(key)) throw new Error("Duplicate historical home-away pair");
    ids.add(f.id);
    pairs.add(key);
  }
  return {
    clubs,
    fixtures: fixtures
      .map((f) => ({ ...f }))
      .sort(
        (a, b) =>
          Date.parse(a.date) - Date.parse(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      ),
  };
}

/** Compare the coach's completed prefix against exactly the same historical fixtures.
 * Home/away orientation is preserved. Never compare against a synthetic matchweek or
 * against the historical club's final points while the coach has only played a few games.
 */
export function compareHistoricalRun(
  schedule: HistoricalSchedule,
  coach: number,
  played: readonly PlayedHistoricalFixture[],
) {
  if (!Number.isInteger(coach) || coach < 0 || coach >= schedule.clubs) {
    throw new Error("Invalid historical coach index");
  }
  const fixtures = schedule.fixtures.filter((f) => f.home === coach || f.away === coach);
  const byId = new Map<string, PlayedHistoricalFixture>();
  for (const result of played) {
    if (byId.has(result.fixtureId)) throw new Error("Duplicate played historical fixture");
    if (!goalsValid(result.homeGoals) || !goalsValid(result.awayGoals)) {
      throw new Error("Invalid played historical score");
    }
    byId.set(result.fixtureId, result);
  }
  const prefix = fixtures.slice(0, played.length);
  if (prefix.length !== played.length || prefix.some((f) => !byId.has(f.id))) {
    throw new Error("Played fixtures must be the coach's chronological prefix");
  }
  let actualPoints = 0;
  let historicalPoints = 0;
  const comparisons = prefix.map((f) => {
    const result = byId.get(f.id)!;
    const home = f.home === coach;
    const goalsFor = home ? result.homeGoals : result.awayGoals;
    const goalsAgainst = home ? result.awayGoals : result.homeGoals;
    const historicalGoalsFor = home ? f.homeGoals : f.awayGoals;
    const historicalGoalsAgainst = home ? f.awayGoals : f.homeGoals;
    const earned = points(goalsFor, goalsAgainst);
    const historicalEarned = points(historicalGoalsFor, historicalGoalsAgainst);
    actualPoints += earned;
    historicalPoints += historicalEarned;
    return {
      fixtureId: f.id,
      goalsFor,
      goalsAgainst,
      historicalGoalsFor,
      historicalGoalsAgainst,
      points: earned,
      historicalPoints: historicalEarned,
      pointsDelta: earned - historicalEarned,
    };
  });
  return {
    played: played.length,
    total: fixtures.length,
    comparisons,
    points: actualPoints,
    historicalPoints,
    pointsDelta: actualPoints - historicalPoints,
    complete: played.length === fixtures.length,
  };
}
