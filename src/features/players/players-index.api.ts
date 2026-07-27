import "server-only";

import { getEntityNames } from "@/features/i18n/entity-names";

import { loadClubLogos, loadMarketValues, loadPlayers, loadTeamColors } from "@/data/loaders";
import { marketValueForSeason } from "@/features/players/market-value";
import { clubLogoFromMap } from "@/utils/club-logo";

export type PlayerPosition = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

/**
 * One row per player for the `/players` index (TASK-M50) — identity + club crest
 * + the headline counting stats, with `contributions` = goals + assists (the
 * "most valuable" measure). Sorted by contributions desc.
 *
 * `teamColor` is the club's accent hex (TASK-1507 redesign) — it paints each
 * showcase card's top edge. `null` when no curated colour exists (the card falls
 * back to the era `--primary`).
 */
export type PlayerIndexRow = {
  id: number;
  name: string;
  photo: string | null;
  position: PlayerPosition;
  nationality: string | null;
  nationalityCode: string | null;
  teamId: number;
  teamName: string;
  teamLogo: string;
  teamColor: string | null;
  appearances: number;
  goals: number;
  assists: number;
  contributions: number;
  /**
   * TASK-M68: the season's last market value in EUR, or `null` when the player
   * has no Transfermarkt match and for every season before ~2004 (TM's history
   * doesn't reach back further). Read from the CLIPPED season map — `/players`
   * is a request-time surface, so the 5 MB history file is off limits here.
   */
  marketValueEur: number | null;
};

/**
 * Pick a card-accent hex from a club's kit colours: the home kit, unless it's
 * near-white (Fulham/Leeds/Spurs) — then the away kit, which is always a usable
 * dark/saturated colour. Returns `null` only when both are missing/near-white so
 * the caller can fall back to the era `--primary`. Exported for unit testing.
 */
export function pickClubAccent(
  home: string | null | undefined,
  away: string | null | undefined,
): string | null {
  const usable = (hex: string | null | undefined): string | null => {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Perceived luminance (0-255); a near-white kit reads as no accent.
    return 0.299 * r + 0.587 * g + 0.114 * b > 220 ? null : hex;
  };
  return usable(home) ?? usable(away);
}

export async function getSeasonPlayers(season: number): Promise<PlayerIndexRow[] | null> {
  const players = await loadPlayers(season);
  if (!players || players.length === 0) return null;

  const [clubLogos, teamColors, names, marketValues] = await Promise.all([
    loadClubLogos(),
    loadTeamColors(),
    getEntityNames(),
    loadMarketValues(),
  ]);

  const rows: PlayerIndexRow[] = players.map((p) => {
    const goals = p.metrics.goals ?? 0;
    const assists = p.metrics.assists ?? 0;
    const kit = teamColors?.[String(p.teamId)];
    return {
      id: p.id,
      name: names.player(p.id, p.name),
      photo: p.photo,
      // `position` stays the English `PlayerPosition` enum — the index filters +
      // Pos-column abbreviations operate on it and are localized in the component
      // (TASK-1603). Only free-string display names are swapped to Arabic here.
      position: p.position,
      nationality: names.nationality(p.nationalityCode ?? null, p.nationality ?? null),
      nationalityCode: p.nationalityCode ?? null,
      teamId: p.teamId,
      teamName: names.team(p.teamId, p.teamName),
      teamLogo: clubLogoFromMap(p.teamId, season, clubLogos),
      teamColor: pickClubAccent(kit?.home, kit?.away),
      appearances: p.metrics.appearances ?? 0,
      goals,
      assists,
      contributions: goals + assists,
      marketValueEur: marketValueForSeason(marketValues, season, p.id),
    };
  });

  rows.sort(
    (a, b) =>
      b.contributions - a.contributions ||
      b.goals - a.goals ||
      a.name.localeCompare(b.name, names.isAr ? "ar" : "en"),
  );
  return rows;
}
