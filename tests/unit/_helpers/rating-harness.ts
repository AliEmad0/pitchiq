import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Player, Standing } from "@/data/schemas";
import { rate } from "@/features/game/domain/rate";
import { anchorOf } from "@/features/game/domain/rating-anchor";
import { makeRatingContext } from "@/features/game/domain/ratings";
import { minutesOf } from "@/features/game/domain/stat-pool";

/**
 * The rating validation harness.
 *
 * Exists because TASK-1820's per-position normalisation shipped green: it was
 * validated against ~10 named players and two aggregate statistics, while the real
 * defect (a per-role amplifier ranging 1.0x-5.0x) only showed up as implausible
 * NAMES scattered across roles and eras — Barry '11 at 96, Campbell '04 at 67.
 *
 * So this sweeps EVERY role in EVERY season and reports distributions, rather than
 * checking a handful of favourites. Any change to the rating model must pass it.
 */

const DATA = path.join(process.cwd(), "data");

/** Roles thinner than this are ignored — too few players to say anything about. */
export const MIN_COHORT = 8;

/** Below this a player is a bit-part and their rating is not a meaningful signal. */
export const QUALIFYING_MINUTES = 900;

export interface RatedRow {
  id: number;
  season: number;
  name: string;
  role: string;
  minutes: number;
  /** The TASK-1821 heritage anchor for this player-season, or null if un-anchored. */
  anchor: number | null;
  attack: number;
  creation: number;
  defense: number;
  physical: number;
  overall: number;
}

export interface RoleStat {
  season: number;
  role: string;
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
}

const read = async <T>(file: string): Promise<T> =>
  JSON.parse(await readFile(path.join(DATA, file), "utf8")) as T;

export async function allSeasons(): Promise<number[]> {
  const files = await readdir(DATA);
  return files
    .map((f) => /^players-(\d{4})\.json$/.exec(f)?.[1])
    .filter((s): s is string => s != null)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Rate every qualifying player in one season. */
export async function rateSeason(season: number): Promise<RatedRow[]> {
  const [cohort, standings] = await Promise.all([
    read<Player[]>(`players-${season}.json`),
    read<Standing[]>(`standings-${season}.json`).catch(() => [] as Standing[]),
  ]);
  const ctx = makeRatingContext(season, cohort, standings);
  const rows: RatedRow[] = [];
  for (const p of cohort) {
    if (p.role == null) continue;
    const minutes = minutesOf(p);
    if (minutes < QUALIFYING_MINUTES) continue;
    const r = rate(p, ctx).ratings;
    rows.push({
      id: p.id,
      season,
      name: p.name,
      role: p.role,
      minutes,
      anchor: anchorOf(p.id, season),
      attack: r.attack,
      creation: r.creation,
      defense: r.defense,
      physical: r.physical,
      overall: r.overall,
    });
  }
  return rows;
}

/** Rate every qualifying player in every committed season. */
export async function rateAllSeasons(): Promise<RatedRow[]> {
  const seasons = await allSeasons();
  const out: RatedRow[] = [];
  for (const season of seasons) out.push(...(await rateSeason(season)));
  return out;
}

const quantile = (sortedAsc: number[], p: number): number => {
  if (sortedAsc.length === 0) return 0;
  const i = Math.max(0, Math.min(sortedAsc.length - 1, Math.round(p * (sortedAsc.length - 1))));
  return sortedAsc[i];
};

/** Per season x role overall distribution, for cohorts big enough to judge. */
export function roleStats(rows: RatedRow[]): RoleStat[] {
  const groups = new Map<string, RatedRow[]>();
  for (const r of rows) {
    const key = `${r.season}|${r.role}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const out: RoleStat[] = [];
  for (const [key, list] of groups) {
    if (list.length < MIN_COHORT) continue;
    const [season, role] = key.split("|");
    const overalls = list.map((r) => r.overall).sort((a, b) => a - b);
    out.push({
      season: Number(season),
      role,
      count: list.length,
      min: overalls[0],
      median: quantile(overalls, 0.5),
      p95: quantile(overalls, 0.95),
      max: overalls[overalls.length - 1],
    });
  }
  return out.sort((a, b) => a.season - b.season || a.role.localeCompare(b.role));
}

/** Find one player-season. Exact name wins over a substring, so "Alex" != "Alexandre". */
export function findRow(rows: RatedRow[], season: number, name: string): RatedRow | undefined {
  const inSeason = rows.filter((r) => r.season === season);
  return inSeason.find((r) => r.name === name) ?? inSeason.find((r) => r.name.includes(name));
}
