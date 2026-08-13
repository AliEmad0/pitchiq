import type { ManagerCareerSpell, ManagerHonourGroup } from "@/data/schemas";

/**
 * TASK-M81 — shaping the enrichment for the manager profile.
 *
 * Pure (no fs, no React) so the ordering and filtering rules are unit-tested
 * rather than eyeballed in the page.
 */

/**
 * Display order for honour groups.
 *
 * Silverware first, biggest hauls first, then individual awards. Everything else
 * — participation, runner-up, promotion, relegation — is deliberately NOT shown
 * on the profile: across the crawled managers those account for the large
 * majority of groups (313 participation entries alone), and listing them beside
 * real trophies makes a cabinet look padded. They stay in the committed file for
 * anything that wants them later.
 */
const KIND_RANK: Record<string, number> = { trophy: 0, award: 1 };

export function orderHonourGroups(groups: ManagerHonourGroup[]): ManagerHonourGroup[] {
  return groups
    .filter((g) => g.kind === "trophy" || g.kind === "award")
    .slice()
    .sort((a, b) => {
      const k = (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
      if (k !== 0) return k;
      if (b.count !== a.count) return b.count - a.count;
      return a.title.localeCompare(b.title);
    });
}

/** Total silverware — group counts, trophies only. Mirrors the published summary. */
export function countTrophies(groups: ManagerHonourGroup[]): number {
  return groups.filter((g) => g.kind === "trophy").reduce((n, g) => n + g.count, 0);
}

/**
 * The spells worth showing: those where a real managerial record exists.
 *
 * ⚠️ Filtering on `matches`, never on `role` — Transfermarkt writes 46 distinct
 * role strings, `Player-Coach` spells carry genuine records (Dalglish: 297
 * matches at Liverpool) and assistants/scouts/directors carry `matches: null`.
 * This is the same rule the pipeline applies when it builds the summary, so the
 * two can never disagree about what counts as a job.
 *
 * Ordered most recent first; a spell with no start date sorts last rather than
 * jumping to the top.
 */
export function managedSpells(spells: ManagerCareerSpell[]): ManagerCareerSpell[] {
  return spells
    .filter((s) => typeof s.matches === "number" && s.matches > 0)
    .slice()
    .sort((a, b) => (b.appointedDate ?? "").localeCompare(a.appointedDate ?? ""));
}

/**
 * A compact year span for a spell — "2018–2024", or "2018–" while ongoing.
 *
 * Years only: Transfermarkt's end cell is free text that can read
 * "expected 30/06/2027", so a verbatim range would leak that into the UI.
 * Returns null when there is no usable start date, and the caller omits the span
 * rather than printing a half-range.
 */
export function spellSpan(spell: ManagerCareerSpell): { from: string; to: string | null } | null {
  const from = spell.appointedDate?.slice(0, 4);
  if (!from || !/^\d{4}$/.test(from)) return null;
  if (spell.ongoing) return { from, to: null };
  const to = spell.untilDate?.slice(0, 4);
  return { from, to: to && /^\d{4}$/.test(to) ? to : null };
}

/** Points per match for one spell, from its own W/D/L. Null when there is no record. */
export function spellPpm(spell: ManagerCareerSpell): number | null {
  const { matches, wins, draws } = spell;
  if (typeof matches !== "number" || matches <= 0) return null;
  if (typeof wins !== "number" || typeof draws !== "number") return null;
  return Math.round(((3 * wins + draws) / matches) * 100) / 100;
}
