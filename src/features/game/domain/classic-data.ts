import type { HistoricalSchedule } from "./classic-season";
import type { EnrichedCard } from "./player-card";
import type { TableRow } from "./season";
export interface ClassicClub {
  teamId: number;
  name: string;
  season: number;
  pool: EnrichedCard[];
  formations: string[];
}
export interface ClassicData {
  season: number;
  archiveKey: string;
  clubIds: number[];
  schedule: HistoricalSchedule;
  table: (TableRow & { rank: number; pointsAdjustment: number })[];
  squads: ClassicClub[];
}
