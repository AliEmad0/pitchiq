/**
 * TASK-1811 — the season spine.
 *
 * ⛔ PURE, and deliberately ignorant of clubs. Everything here works in INDICES into a league's
 * club list, because the season engine is opponent-agnostic (TASK-1832 D5): the rule pack says
 * how many clubs and where they come from, and this module never learns what a club is. That is
 * also what keeps it out of `adapter/` — see the guard in `rule-packs.ts`.
 */

/** One fixture: `[homeIndex, awayIndex]` into the league's club list. */
export type Fixture = [number, number];

/**
 * A double round robin over `n` clubs — the real shape, 2(n-1) weeks.
 *
 * The circle method: club 0 stays put while the rest rotate. The second half is the first with
 * home and away swapped, which is what guarantees every club an equal split.
 */
export function seasonFixtures(n: number): Fixture[][] {
  if (n < 2 || n % 2 !== 0) {
    throw new Error(`seasonFixtures needs an even count of at least 2, got ${n}`);
  }
  const rot = [...Array(n).keys()].slice(1);
  const first: Fixture[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const order = [0, ...rot];
    const week: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i]!;
      const b = order[n - 1 - i]!;
      // ⚠️ Alternated, so club 0 is not at home every week of the first half — without this
      // the fixed club plays 19 straight home games and the table is nonsense.
      week.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    first.push(week);
    rot.unshift(rot.pop()!);
  }
  return [...first, ...first.map((w) => w.map(([h, a]) => [a, h] as Fixture))];
}

/**
 * One finished fixture.
 *
 * ⛔ NO EVENTS. Measured: a match result is 3.1 KB of which 3.0 KB is its events, and nothing
 * reads them back — the whole season would be ~114 KB of data nobody looks at. The `seed` is
 * kept instead, so any single match stays re-watchable by replaying it.
 */
export interface SeasonResult {
  week: number;
  home: number;
  away: number;
  homeGoals: number;
  awayGoals: number;
  /** The seed this fixture was played from. */
  seed: number;
}

export interface TableRow {
  club: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/**
 * The league table, DERIVED from the results and never stored.
 *
 * ⚠️ The last tie-break is the club INDEX. Real football settles a dead heat with a play-off,
 * but a rendered table needs a total order that does not depend on the order results happened
 * to arrive in — otherwise the same run shows two different tables on two loads.
 */
export function seasonTable(clubs: number, results: readonly SeasonResult[]): TableRow[] {
  const rows: TableRow[] = [...Array(clubs).keys()].map((club) => ({
    club,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));

  const add = (i: number, gf: number, ga: number) => {
    const row = rows[i];
    if (row == null) throw new Error(`result names club ${i}, outside a league of ${clubs}`);
    row.played++;
    row.goalsFor += gf;
    row.goalsAgainst += ga;
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    if (gf > ga) {
      row.won++;
      row.points += 3;
    } else if (gf === ga) {
      row.drawn++;
      row.points += 1;
    } else {
      row.lost++;
    }
  };

  for (const res of results) {
    add(res.home, res.homeGoals, res.awayGoals);
    add(res.away, res.awayGoals, res.homeGoals);
  }

  return rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.club - b.club,
  );
}

/**
 * A season in progress.
 *
 * ⛔ SEED + SQUAD + RESULTS, and the results carry no events. Re-deriving the whole season
 * instead would be free — a 38-match season simulates in ~23 ms — so speed is NOT the reason to
 * store. A stored result is **immutable against engine drift**: TASK-1844 recalibrated the match
 * engine, and a re-derived season would have silently rewritten every finished table under the
 * coach who played it.
 */
export interface SeasonRun {
  seed: number;
  clubs: number;
  /** Which index in the league is the coach's own club. */
  coach: number;
  results: SeasonResult[];
}

/**
 * The seed for one fixture, derived from the run's seed.
 *
 * ⚠️ HASHED, never `seed + week`. `view/seed.ts` records that `mulberry32` seeds close together
 * produce visibly similar early draws, so consecutive matchweeks would feel alike — the same
 * trap that made a narrow-band sweep give the wrong answer in TASK-1844.
 */
export function fixtureSeed(seasonSeed: number, week: number, index: number): number {
  let h = (seasonSeed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (week + 0x85ebca6b), 0xcc9e2d51) >>> 0;
  h = Math.imul(h ^ (index + 0x165667b1), 0x1b873593) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h >>> 0;
}

const fixtureKey = (r: SeasonResult) => `${r.week}:${r.home}:${r.away}`;

/** The next unplayed week — i.e. how many whole weeks are behind us. */
export function nextWeek(run: SeasonRun): number {
  return run.results.length === 0 ? 0 : Math.max(...run.results.map((r) => r.week)) + 1;
}

/** Every club has played every other, home and away. */
export function isComplete(run: SeasonRun): boolean {
  return run.results.length >= run.clubs * (run.clubs - 1);
}

/**
 * Append one finished fixture.
 *
 * ⛔ PURE — returns a new run. The duplicate guard is what stops a resumed or re-watched week
 * from being counted twice, which would silently inflate a table that looks perfectly normal.
 */
export function recordResult(run: SeasonRun, result: SeasonResult): SeasonRun {
  for (const club of [result.home, result.away]) {
    if (!Number.isInteger(club) || club < 0 || club >= run.clubs) {
      throw new Error(`result names club ${club}, outside a league of ${run.clubs}`);
    }
  }
  if (run.results.some((r) => fixtureKey(r) === fixtureKey(result))) {
    throw new Error(`fixture ${fixtureKey(result)} already recorded`);
  }
  return { ...run, results: [...run.results, result] };
}
