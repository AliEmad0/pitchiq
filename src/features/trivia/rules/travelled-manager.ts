import type { RuleResult, TriviaRule } from "../types";

/** Winning a national title in this many countries is genuinely rare — 26 managers. */
const MIN_COUNTRIES = 3;

/**
 * Words that mean a title is NOT a national top flight. Derived by reading every
 * `champion` string in the committed map, not guessed:
 *
 *   "Dutch second tier champion" · "English 2nd tier champion" · "Austrian Second League
 *   Champion" · "German Regionalliga Bavaria Champion" · "Champion Westfalenliga 1" ·
 *   "Dutch amateur champion" · "European Under-19 champion" · "UEFA Champions League
 *   winner" · "Under-17 World Cup champion"
 *
 * ⚠️ "European champion" is the dangerous one — it parses as a nationality but is a
 * continent, so counting it inflates a manager's country tally by one.
 */
const NOT_NATIONAL = [
  "2nd",
  "3rd",
  "4th",
  "second",
  "third",
  "fourth",
  "tier",
  "league",
  "amateur",
  "regionalliga",
  "westfalenliga",
  "under",
  "u17",
  "u19",
  "u21",
  "cup",
  "european",
  "world",
  "intercontinental",
  "afc",
  "ofc",
  "uefa",
];

/**
 * The country a title names, or null when it is not a national top-flight title.
 *
 * ⚠️ **Derived from the TITLE, never the `competitionId`.** England appears under BOTH
 * `GB1` and `EFD1` (the pre-Premier-League First Division), so counting distinct
 * competition ids would score England twice and hand a manager a phantom country. Both
 * carry the same title text — "English Champion" — so the title dedupes for free.
 */
export function nationalTitleCountry(title: string): string | null {
  const t = title.trim().toLowerCase();
  if (!t.endsWith(" champion") && !t.endsWith(" champions")) return null;
  const prefix = t.replace(/ champions?$/, "").trim();
  if (!prefix || !/^[a-z ]+$/.test(prefix)) return null;
  if (NOT_NATIONAL.some((w) => prefix.split(" ").includes(w))) return null;
  return prefix;
}

/**
 * R32 (TASK-M82) — the travelled manager: national titles in three or more countries.
 *
 * Reads `manager-honours-history.json` (~290 KB) — cheap enough for the request-time
 * trivia route, unlike the 5-8 MB player detail maps the facade deliberately excludes.
 *
 * Verified against records that exist outside our data: Ancelotti 5 (England, France,
 * Germany, Italy, Spain), Mourinho 4, Guardiola 3.
 */
export const travelledManagerRule: TriviaRule = {
  id: "R32",
  title: "The travelled manager",
  scopes: ["league", "team"],
  async run(data, ctx): Promise<RuleResult | null> {
    const [honours, managers] = await Promise.all([data.managerHonours(), data.managers()]);
    if (!honours || !managers) return null;

    // Which managers are in scope: the whole league, or one club's managers.
    const inScope = new Set<string>();
    for (const [, byTeam] of Object.entries(managers)) {
      for (const [teamId, list] of Object.entries(byTeam)) {
        if (ctx.scope === "team" && Number(teamId) !== ctx.id) continue;
        for (const m of list) inScope.add(String(m.id));
      }
    }
    if (inScope.size === 0) return null;

    const countriesFor = (id: string): Set<string> => {
      const out = new Set<string>();
      for (const g of honours[id]?.titles ?? []) {
        if (g.kind !== "trophy") continue;
        const c = nationalTitleCountry(g.title);
        if (c) out.add(c);
      }
      return out;
    };

    let best: { id: string; name: string; countries: string[] } | null = null;
    for (const id of inScope) {
      const cs = [...countriesFor(id)].sort();
      if (cs.length < MIN_COUNTRIES) continue;
      if (!best || cs.length > best.countries.length) {
        const name = Object.values(managers)
          .flatMap((byTeam) => Object.values(byTeam).flat())
          .find((m) => String(m.id) === id)?.name;
        if (name) best = { id, name, countries: cs };
      }
    }
    if (!best) return null;

    const list = best.countries.map((c) => c.replace(/^./, (ch) => ch.toUpperCase()));
    const human = `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

    return {
      text: `${best.name} has won a national league title in ${list.length} different countries — ${human}.`,
      sources: [{ kind: "players", season: data.season }],
      async verify(dd) {
        const h = await dd.managerHonours();
        if (!h) return false;
        const again = new Set<string>();
        for (const g of h[best!.id]?.titles ?? []) {
          if (g.kind !== "trophy") continue;
          const c = nationalTitleCountry(g.title);
          if (c) again.add(c);
        }
        return again.size === best!.countries.length && again.size >= MIN_COUNTRIES;
      },
    };
  },
};
