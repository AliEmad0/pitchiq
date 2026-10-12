import type { PlayerProfile } from "@/features/players/api";
import type { PlayerCareerRecord } from "@/features/players/career-record.api";
import type { MarketValueSeason } from "@/features/players/market-value";
import type { TriviaFact } from "@/features/trivia/types";

/**
 * One archived player, as served by `/api/archive/players/[id]` (TASK-M96 PR B).
 *
 * ⭐ EVERY season the player has, pre-computed at build time — profile AND trivia — so the
 * archive shell's season switcher answers from this object and never calls the request-time
 * `/api/players/[id]/profile` or `/api/trivia` routes the prerendered page's switcher uses.
 * Archived players therefore cost LESS Fluid Active CPU than before, not more.
 *
 * Type-only imports: this module is safe on the client.
 */
export interface PlayerArchive {
  id: number;
  /** English display name (Arabic is parked; see the archive route). */
  name: string;
  /** Seasons he played, newest first — the switcher's options. */
  seasons: number[];
  /** The season the page opens on: his latest. */
  initialSeason: number;
  /** Keyed by season (as a string, because JSON). */
  bySeason: Record<string, { profile: PlayerProfile | null; facts: TriviaFact[] }>;
  career: PlayerCareerRecord | null;
  /** The career market-value strip, or null when there are no valuations. */
  marketValue: MarketValueSeason[] | null;
}
