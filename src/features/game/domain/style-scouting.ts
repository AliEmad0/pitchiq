import type { TacticalStyle } from "./opponent";
import type { PlayerRatings } from "./ratings";
import { mulberry32 } from "./rng";

/**
 * TASK-1825 — the opponent's style is SCOUTED, not a coin flip (owner, 2026-10-20).
 *
 * The six styles form a 5-cycle with Balanced neutral (`BEATS` in `opponent.ts`), so a pick
 * made blind against a uniform draw has the same odds of +8 as of −8. Instead every XI has a
 * TENDENCY read from its own ratings, the coach is told it, and the opponent plays it
 * `TENDENCY_P` of the time — reading the opponent is the skill, and it is still not certain.
 */

/**
 * The six styles in their SHIPPED order. ⛔ `chaosMatchup`'s legacy draw picks from this list
 * by index, so reordering it re-maps the style of every old save and v2 share link.
 */
export const STYLES: readonly TacticalStyle[] = [
  "balanced",
  "tiki-taka",
  "high-press",
  "low-block",
  "counter",
  "direct",
];

/** How often a side plays its tendency; each other style gets an equal share of the rest. */
export const TENDENCY_P = 0.6;

/** Archive medians of the club-season outfield means (measured over all 686, 2026-10-21). */
const MEDIAN = { attack: 50, creation: 50, defense: 46, physical: 49 } as const;
type Dim = keyof typeof MEDIAN;
const DIMS: readonly Dim[] = ["attack", "creation", "defense", "physical"];

/**
 * Below this spread (in rating points) between a side's most and least pronounced dimension,
 * it has no shape worth naming and plays Balanced. Fitted against the real club-seasons so
 * that every style is some club's tendency and none dominates — `style-scouting.test.ts`.
 */
const BALANCED_SPREAD = 3;

/**
 * A side's usual style, from the SHAPE of its outfield ratings.
 *
 * ⚠️ Shape, not strength: each dimension is measured against the archive median and then
 * against the side's own mean, so an all-star XI and a relegation XI built the same way share
 * a tendency. Reading raw levels would make every strong drafted XI look identical.
 */
export function styleTendency(
  players: readonly { role: string | null; ratings: PlayerRatings }[],
): TacticalStyle {
  const out = players.filter((p) => p.role !== "GK");
  if (out.length === 0) return "balanced";
  const lift = {} as Record<Dim, number>;
  for (const d of DIMS)
    lift[d] = out.reduce((a, p) => a + p.ratings[d], 0) / out.length - MEDIAN[d];
  const mean = DIMS.reduce((a, d) => a + lift[d], 0) / DIMS.length;
  const shape = Object.fromEntries(DIMS.map((d) => [d, lift[d] - mean])) as Record<Dim, number>;
  const ranked = [...DIMS].sort((a, b) => shape[b] - shape[a]);
  if (shape[ranked[0]!] - shape[ranked[3]!] < BALANCED_SPREAD) return "balanced";
  switch (ranked[0]) {
    case "creation":
      return "tiki-taka";
    case "attack":
      return shape.physical > 0 ? "high-press" : "direct";
    case "physical":
      return "direct";
    default:
      return shape.attack >= 0 ? "counter" : "low-block";
  }
}

/**
 * The style a side actually plays in one match: its tendency with probability `TENDENCY_P`,
 * otherwise one of the other five uniformly. Seeded, on its own stream.
 */
export function scoutedStyle(
  players: readonly { role: string | null; ratings: PlayerRatings }[],
  seed: number,
): TacticalStyle {
  const tendency = styleTendency(players);
  const r = mulberry32(seed ^ 0x5c0e7ed1)();
  if (r < TENDENCY_P) return tendency;
  const others = STYLES.filter((s) => s !== tendency);
  const i = Math.min(
    others.length - 1,
    Math.floor(((r - TENDENCY_P) / (1 - TENDENCY_P)) * others.length),
  );
  return others[i]!;
}
