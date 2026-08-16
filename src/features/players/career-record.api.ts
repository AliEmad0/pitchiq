import "server-only";

import { loadPlayerHonours, loadPlayerNational, loadPlayerTransferHistory } from "@/data/loaders";
import type { PlayerHonoursFile } from "@/data/schemas";

/**
 * TASK-M92 — the committed honours / transfers / national record for one player.
 *
 * ⚠️ **PRERENDER ONLY.** The three source files are ~5 MB and ~8 MB, and their loaders
 * carry the same warning `loadMarketValueHistory` does: parsing them on a request-time
 * path is the Fluid Active-CPU shape TASK-M71 had to fix. `/players/[id]` is
 * `force-static`, so a prerender read is fine — but nothing on the `?season=` swap path
 * (`/api/players/[id]/profile`) may call this. That route must keep reading the cheap
 * `enrichment` summary on the player row instead. `readJsonOrNull` caches per process, so
 * a full prerender pass parses each file once however many pages read it.
 */

/** One honour group as committed — derived from the file type so the two cannot drift. */
export type CareerHonourGroup = PlayerHonoursFile[string]["groups"][number];

export type CareerMove = {
  season: string | null;
  date: string | null;
  /** Display string — "€24.00m", "free transfer", "End of loan", "?" — NEVER a number. */
  fee: string | null;
  from: string | null;
  to: string | null;
};

export type CareerNationalSpell = {
  matches: number | null;
  goals: number | null;
  debutDate: string | null;
};

export type PlayerCareerRecord = {
  /** Silverware only (`kind: "trophy"`), summed by group count. */
  trophies: number;
  /** Individual awards, summed by group count. */
  awards: number;
  honourGroups: CareerHonourGroup[];
  moves: CareerMove[];
  /** Pre-formatted display string ("€247.00m") or null. */
  feeSum: string | null;
  caps: number | null;
  internationalGoals: number | null;
  nationalSpells: CareerNationalSpell[];
};

/** Sum the `count` of every group of one kind. */
export function sumKind(groups: CareerHonourGroup[], kind: CareerHonourGroup["kind"]): number {
  return groups.filter((g) => g.kind === kind).reduce((n, g) => n + g.count, 0);
}

/**
 * Order honours the way a reader ranks them: silverware first, then individual awards,
 * then everything else, each block by descending count.
 *
 * ⚠️ Participation and runner-up groups are the MAJORITY of the data (25,886 + 1,597 of
 * 29,761), so leaving them unsorted would push a squad-member medal above a league title.
 */
const KIND_RANK: Record<CareerHonourGroup["kind"], number> = {
  trophy: 0,
  award: 1,
  promotion: 2,
  "runner-up": 3,
  relegation: 4,
  participation: 5,
};

export function rankHonours(groups: CareerHonourGroup[]): CareerHonourGroup[] {
  return [...groups].sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.count - a.count || a.title.localeCompare(b.title),
  );
}

/**
 * Returns null when the player has NO record in any of the three files — the caller then
 * renders nothing at all. Absence means "not enriched", never "has none", so a zero-filled
 * block would be a fabricated fact (13 rows legitimately have no enrichment).
 */
/**
 * Decode a transfer fee into the text it was always meant to be.
 *
 * ⛔ 901 of the 65,437 committed fees carry raw Transfermarkt markup —
 * `Loan fee:<br /><i class="normaler-text">€700k</i>` — and `PlayerCareerRecord` prints
 * fees VERBATIM by design, so they shipped to production as literal tags.
 *
 * ⚠️ Printing verbatim is the correct rule and is NOT what is being changed here: these
 * labels are heterogeneous ("free transfer", "End of loan", "€1.40m") and coercing them
 * would invent a free transfer for every loan. This only DECODES the source — the value
 * still reaches the component untouched in meaning, and the other 64,536 fees are
 * returned byte-identical.
 *
 * Cleaned at this boundary rather than in the component so every consumer gets text, and
 * the component's verbatim rule stays honest.
 */
export function feeText(fee: string | null): string | null {
  if (fee == null) return null;
  const text = fee
    // A line break in the source is a space here, or the label runs into the amount.
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  // Markup with nothing in it is not a fee. Null, not "", so the row shows its own dash
  // rather than an empty cell that reads as a real "no fee".
  return text === "" ? null : text;
}

export async function getPlayerCareerRecord(playerId: number): Promise<PlayerCareerRecord | null> {
  const key = String(playerId);
  const [honours, transfers, national] = await Promise.all([
    loadPlayerHonours(),
    loadPlayerTransferHistory(),
    loadPlayerNational(),
  ]);

  const h = honours?.[key];
  const t = transfers?.[key];
  const n = national?.[key];
  if (!h && !t && !n) return null;

  const groups = h?.groups ?? [];
  const moves = (t?.moves ?? []).map((m) => ({
    season: m.season,
    date: m.date,
    fee: feeText(m.fee),
    from: m.from,
    to: m.to,
  }));

  // A record that exists but is empty across all three is the same as no record —
  // the M77 lesson: a present-but-empty shell reads as "done" and renders a bare heading.
  if (groups.length === 0 && moves.length === 0 && (n?.caps ?? null) === null) return null;

  return {
    trophies: sumKind(groups, "trophy"),
    awards: sumKind(groups, "award"),
    honourGroups: rankHonours(groups),
    moves,
    feeSum: t?.feeSum ?? null,
    caps: n?.caps ?? null,
    internationalGoals: n?.goals ?? null,
    nationalSpells: (n?.spells ?? []).map((s) => ({
      matches: s.matches,
      goals: s.goals,
      debutDate: s.debutDate,
    })),
  };
}
