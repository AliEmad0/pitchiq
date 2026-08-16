import { ImageResponse } from "next/og";

import { loadPlayers } from "@/data/loaders";
import { buildBoards, type MetricKey } from "@/features/players/leaderboards-index";
import { eraForSeason } from "@/utils/era";
import { currentDataSeason, formatSeasonLabel, parseSeason } from "@/utils/season";

import { renderLeaderboardsCard, type LeaderboardTile } from "../leaderboards-card";
import { loadEraFonts } from "../ticket";

// Dynamic OG image for the leaderboards index, themed by `?season=` → era
// (TASK-M53): a "stat heat grid" of each category's season leader.
// `contentType` is NOT a valid Route Handler export (ImageResponse sets it).
export const runtime = "nodejs";

// Preferred tile order — most recognizable stats first. Intersected with the
// boards the season actually has (`buildBoards` omits empty ones), so old
// seasons (core stats only) show fewer tiles and modern (2017+) fills all 8.
// ⚠️ `MetricKey`, not `keyof ComparisonMetrics` (TASK-M83): these are BOARD keys, and a
// board key can now address a nested extended field. Type-only — this list and the card
// it renders are unchanged.
const TILE_ORDER: ReadonlyArray<MetricKey> = [
  "goals",
  "assists",
  "cleanSheets",
  "saves",
  "xg",
  "xa",
  "dribblesCompleted",
  "tackles",
  "keyPasses",
  "interceptions",
  "shotsOnTarget",
  "yellowCards",
  "redCards",
  "appearances",
];

function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("season") ?? undefined;
  const season = parseSeason(raw, currentDataSeason());
  const era = eraForSeason(season);
  const fonts = await loadEraFonts(era);

  const players = await loadPlayers(season);
  const boards = players ? buildBoards(players) : [];
  const byKey = new Map(boards.map((b) => [b.cat.key, b]));

  const tiles: LeaderboardTile[] = TILE_ORDER.map((k) => byKey.get(k))
    .filter((b): b is NonNullable<typeof b> => b !== undefined && b.rows.length > 0)
    .slice(0, 8)
    .map((b) => ({
      label: b.cat.valueLabel.toUpperCase(),
      leader: surname(b.rows[0].name),
      value: String(b.rows[0].value),
    }));

  const el = renderLeaderboardsCard({ era, seasonLabel: formatSeasonLabel(season), tiles });
  const size = { width: 1200, height: 630 } as const;
  // Modern era ships no custom fonts — OMIT `fonts` (passing `[]` disables them).
  return new ImageResponse(el, fonts.length > 0 ? { ...size, fonts } : size);
}
