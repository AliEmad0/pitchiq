/** Ordinary substitutions only: concussion replacements are not simulated. */
export interface SubstitutionRules {
  maxSubs: number;
  maxWindows?: number;
  /** 1994/95: two unrestricted changes plus one goalkeeper replacement. */
  keeperOnlyExtra?: boolean;
}
export interface SubstitutionUsage {
  used: number;
  keeperChanges: number;
  windows: ReadonlySet<number>;
}
/** Fixture dates matter: the 2019/20 restart temporarily used five substitutes. */
export function premierLeagueSubstitutions(season: number, date: string): SubstitutionRules {
  if (
    !Number.isInteger(season) ||
    season < 1992 ||
    !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(date) ||
    !Number.isFinite(Date.parse(date))
  )
    throw new Error("Invalid historical substitution identity");
  if (season < 1994) return { maxSubs: 2 };
  if (season === 1994) return { maxSubs: 3, keeperOnlyExtra: true };
  if (season >= 2022 || (season === 2019 && date.slice(0, 10) >= "2020-06-17"))
    return { maxSubs: 5, maxWindows: 3 };
  return { maxSubs: 3 };
}
/** Multiple changes in one engine minute share a stoppage; half-time is exempt. */
export function substitutionAllowed(
  rules: SubstitutionRules,
  usage: SubstitutionUsage,
  minute: number,
  keeperChange = false,
): boolean {
  if (usage.used >= rules.maxSubs) return false;
  if (
    rules.maxWindows != null &&
    minute !== 45 &&
    !usage.windows.has(minute) &&
    usage.windows.size >= rules.maxWindows
  )
    return false;
  if (rules.keeperOnlyExtra && usage.used - Math.min(usage.keeperChanges, 1) >= 2)
    return keeperChange && usage.keeperChanges === 0;
  return true;
}
