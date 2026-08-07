import type { Provenance } from "./ratings";
import type { PoolCard } from "./chaos-draft";

// The display-time enrichment of a draft card (bio the game domain drops +
// cross-season career history + a few headline stats). Pure types + helpers so
// both the server adapter (which fills them) and client card can share them.

export interface CardStats {
  goals: number | null;
  assists: number | null;
  appearances: number | null;
  cleanSheets: number | null;
  yellowCards: number | null;
  redCards: number | null;
}

export interface CardBio {
  photo: string | null;
  // Resolved at build time (see adapter/photo-kind): "cutout" = transparent PNG,
  // "photo" = photo-with-background, "none" = no usable image. photoUrl is the
  // exact image to render.
  photoKind: "cutout" | "photo" | "none";
  photoUrl: string | null;
  age: number | null; // during that season
  nationality: string | null;
  nationalityCode: string | null; // flag-icons key
  careerClubs: string[]; // distinct PL clubs across all seasons, chronological
  stats: CardStats;
}

/** A pool card enriched for the FUT-style `PlayerCard`. */
export type EnrichedCard = PoolCard & CardBio;

export type EraKey = "eraSparse" | "eraRich" | "eraXg";

/** Which era badge a card wears, from its 1802 provenance. */
export function eraOf(p: Provenance | null): { key: EraKey; color: string } | null {
  if (!p) return null;
  if (p.tier === "sparse") return { key: "eraSparse", color: "#e0a63a" };
  return p.basis.hasXg ? { key: "eraXg", color: "#2ec5b6" } : { key: "eraRich", color: "#a35bd6" };
}

/** Where a card dimension's number comes from. */
export type DimSource = "ratings" | "gk";

export interface CardDim {
  key: string;
  label: string;
  source: DimSource;
}

/** The five FUT-style face dimensions, in display order (OVR is the headline). */
export const CARD_DIMS: readonly CardDim[] = [
  { key: "attack", label: "ATT", source: "ratings" },
  { key: "creation", label: "CRE", source: "ratings" },
  { key: "defense", label: "DEF", source: "ratings" },
  { key: "physical", label: "PHY", source: "ratings" },
  { key: "discipline", label: "DIS", source: "ratings" },
];

/**
 * Goalkeeper face dimensions, read from `ratings.gk` (TASK-1820).
 *
 * KIC, not DIS: the outfield card already uses DIS for discipline, and one label
 * meaning two different things is a bug waiting to happen.
 */
export const GK_CARD_DIMS: readonly CardDim[] = [
  { key: "reflexes", label: "REF", source: "gk" },
  { key: "handling", label: "HAN", source: "gk" },
  { key: "kicking", label: "KIC", source: "gk" },
  { key: "positioning", label: "POS", source: "gk" },
  { key: "command", label: "CMD", source: "gk" },
];

/** Which five numbers a card shows, by role. */
export function dimsFor(role: string | null): readonly CardDim[] {
  return role === "GK" ? GK_CARD_DIMS : CARD_DIMS;
}
