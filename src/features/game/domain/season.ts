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
