import { DAILY_SHAPES } from "./daily";
import { formationByName, type Formation } from "./formation";
import { hashStr } from "./hash";
import type { MatchConditions } from "./match-types";
import { mulberry32 } from "./rng";
import { seasonFixtures, seasonTable, type Fixture, type SeasonResult } from "./season";

/**
 * TASK-1828 — the Weekly Ladder: one eight-club league tournament per ISO week, identical for
 * every coach, derived from the week alone. The daily is a sprint; this is the marathon (owner,
 * 2026-10-21) — one draft, then a matchday a day for seven days.
 *
 * ⚠️ NO CLOCK LIVES HERE, exactly as in `daily.ts`. Every function takes the week (or a date the
 * VIEW read) as an argument; the engine never learns what week it is.
 *
 * ⚠️ UTC GETTERS ONLY. A coach in UTC+13 and one in UTC−8 play the same week at the same instant.
 */

const MS_PER_DAY = 86_400_000;

/** Clubs in a ladder league: the coach and seven rivals. */
export const LADDER_CLUBS = 8;
/** Matchdays in a week — a single round robin over eight clubs is exactly seven. */
export const LADDER_DAYS = LADDER_CLUBS - 1;

/** UTC midnight of the ISO week's Monday containing `d`. */
function mondayMs(d: Date): number {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return day - dow * MS_PER_DAY;
}

/**
 * The ISO-8601 week, `YYYY-Www`. The ISO year is the year of the week's THURSDAY, which is what
 * keeps 29 Dec 2025 in 2026-W01 and 1 Jan 2027 in 2026-W53.
 */
export function isoWeekKey(d: Date): string {
  const thursday = new Date(mondayMs(d) + 3 * MS_PER_DAY);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday.getTime() - jan1) / MS_PER_DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** 1 = Monday … 7 = Sunday, in UTC. Matchday `n` opens on weekday `n`. */
export function isoWeekday(d: Date): number {
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** A week key → its Monday's UTC midnight. */
function weekStartMs(key: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (m == null) throw new Error(`not an ISO week key: ${key}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  // The Monday of ISO week 1 is the Monday on or before 4 January.
  const w1 = mondayMs(new Date(Date.UTC(year, 0, 4)));
  return w1 + (week - 1) * 7 * MS_PER_DAY;
}

/** Step a week key by whole weeks — used to walk a title streak back. */
export function weekKeyOffset(key: string, weeks: number): string {
  return isoWeekKey(new Date(weekStartMs(key) + weeks * 7 * MS_PER_DAY));
}

/** How long this week has left, in ms (the hub's countdown). */
export function msToNextWeek(d: Date): number {
  return mondayMs(d) + 7 * MS_PER_DAY - d.getTime();
}

/** Week #1. Changing this renumbers every ladder; it is not a tuning knob. */
export const WEEKLY_EPOCH = "2026-W43";

/** The ladder's ordinal, clamped at 1 so a wrong clock never shows week zero. */
export function weekNumber(key: string): number {
  return Math.max(
    1,
    Math.round((weekStartMs(key) - weekStartMs(WEEKLY_EPOCH)) / (7 * MS_PER_DAY)) + 1,
  );
}

/** Independent streams from one week — the `daySeeds` idiom with its own constants. */
export function weekSeeds(key: string): {
  formation: number;
  deal: number;
  league: number;
  rules: number;
} {
  const base = hashStr(`ladder:${key}`);
  return {
    formation: base >>> 0,
    deal: (base ^ 0x9e3779b9) >>> 0,
    league: (base ^ 0x51ed270b) >>> 0,
    rules: (base ^ 0x2545f491) >>> 0,
  };
}

/** The shape every coach drafts into this week — the daily's frozen roster, the week's seed. */
export function weekFormation(key: string): Formation {
  return formationByName(DAILY_SHAPES[weekSeeds(key).formation % DAILY_SHAPES.length]!);
}

export type WeeklyRuleId = "monsoon" | "ironRef" | "var" | "freeze" | "home" | "gale" | "open";

export interface WeeklyRule {
  id: WeeklyRuleId;
  conditions: MatchConditions;
}

/**
 * The week's ruleset, applied to EVERY ladder fixture.
 *
 * ⛔ FROZEN, for the reason `DAILY_SHAPES` is: the pick is `seed % length`, so appending re-maps
 * every past week. A golden test pins the contents.
 */
export const WEEKLY_RULES: readonly WeeklyRule[] = [
  { id: "monsoon", conditions: { weather: "heavy-rain" } },
  { id: "ironRef", conditions: { referee: "strict" } },
  { id: "var", conditions: { varScale: 3 } },
  { id: "freeze", conditions: { weather: "snow" } },
  { id: "home", conditions: { referee: "crowd-influenced" } },
  { id: "gale", conditions: { weather: "wind" } },
  { id: "open", conditions: {} },
];

export function weekRule(key: string): WeeklyRule {
  return WEEKLY_RULES[weekSeeds(key).rules % WEEKLY_RULES.length]!;
}

/**
 * The seven rivals, from a club list.
 *
 * ⚠️ The list is SORTED before the draw, so the order a caller happens to pass cannot change who
 * the week faces. Fisher–Yates over a copy, seeded by the week.
 */
export function ladderRivals(clubIds: readonly number[], key: string): number[] {
  const bag = [...new Set(clubIds)].sort((a, b) => a - b);
  const rng = mulberry32(weekSeeds(key).league);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  return bag.slice(0, LADDER_DAYS);
}

/** The schedule: the FIRST half of the double round robin — everyone meets once. */
export function ladderFixtures(): Fixture[][] {
  return seasonFixtures(LADDER_CLUBS).slice(0, LADDER_DAYS);
}

/** How many matchdays are open on a given weekday of the run's OWN week. */
export function unlockedDays(runWeek: string, nowWeek: string, weekday: number): number {
  if (runWeek === nowWeek) return Math.min(LADDER_DAYS, Math.max(1, weekday));
  return runWeek < nowWeek ? LADDER_DAYS : 0;
}

/** The coach's finishing position (1-based) and points in a ladder league. */
export function ladderStanding(
  coach: number,
  results: readonly SeasonResult[],
): { position: number; points: number } {
  const table = seasonTable(LADDER_CLUBS, results);
  const i = table.findIndex((r) => r.club === coach);
  return { position: i + 1, points: table[i]?.points ?? 0 };
}

/** One finished (or closed) week, as stats read it. */
export interface LadderOutcome {
  week: string;
  /** All seven matchdays recorded — played or no-show. */
  done: boolean;
  position: number;
  points: number;
}

export interface LadderStats {
  weeks: number;
  titles: number;
  bestFinish: number | null;
  bestPoints: number;
  titleStreak: number;
  bestTitleStreak: number;
}

/**
 * Personal bests, DERIVED on every read (never stored — the `daily-stats` rule). A title streak
 * is consecutive ISO WEEKS won; a week not played breaks it, which is why the walk steps through
 * `weekKeyOffset` rather than through the record list.
 */
export function ladderStats(records: readonly LadderOutcome[], nowWeek: string): LadderStats {
  const done = records.filter((r) => r.done);
  const byWeek = new Map(done.map((r) => [r.week, r]));
  const won = (w: string) => byWeek.get(w)?.position === 1;
  const runEndingAt = (from: string) => {
    let n = 0;
    for (let w = from; won(w); w = weekKeyOffset(w, -1)) n++;
    return n;
  };
  const current = byWeek.has(nowWeek)
    ? runEndingAt(nowWeek)
    : runEndingAt(weekKeyOffset(nowWeek, -1));
  let best = current;
  for (const r of done) if (r.position === 1) best = Math.max(best, runEndingAt(r.week));
  return {
    weeks: done.length,
    titles: done.filter((r) => r.position === 1).length,
    bestFinish: done.length === 0 ? null : Math.min(...done.map((r) => r.position)),
    bestPoints: done.reduce((m, r) => Math.max(m, r.points), 0),
    titleStreak: current,
    bestTitleStreak: best,
  };
}
