import type { EnrichedCard } from "./player-card";

// Resolves which visual treatment a card wears, from the card's own data. Pure
// + deterministic so a card looks the same every render (and in tests).
//
//   under 90 overall → "Vault": A2 Onyx for photo-with-background players,
//                       A1 Classic Gold for transparent cutouts / no image.
//   PREMIUM_MIN+     → a seeded pick from the premium pool (Cinematic / Dossier
//                       / Index), so elite cards feel varied but stable per card.
//   back             → a seeded pick from a four-way pool for face-down decks.

export type ImageKind = "cutout" | "photo" | "none";
export type FrontDesign = "A1" | "A2" | "B1" | "B2" | "B3" | "C1" | "D1" | "D2";
export type BackDesign = "K01" | "K02" | "K07" | "K09";

/**
 * The premium-family cutoff — a VISUAL rarity threshold, not a quality judgement.
 *
 * Raised from 90 after TASK-1820's per-position normalisation gave every position
 * headroom: at 90 roughly a third of the Chaos board turned premium, so the B/C/D
 * families became the norm and Gold/Onyx the exception — inverting the intent. At
 * 92 the premium look is reserved for the genuinely transcendent (Van Dijk 96,
 * Vidić 94, Ronaldo and Henry 93) while elite performers like Salah 90 and
 * Ferdinand 86 anchor the Gold/Onyx tier.
 *
 * Changing this alters ONLY which artwork a card wears; the ratings are untouched.
 */
export const PREMIUM_MIN = 92;
const PREMIUM: readonly FrontDesign[] = ["B1", "B2", "B3", "C1", "D1", "D2"];
const BACKS: readonly BackDesign[] = ["K01", "K02", "K07", "K09"];

/** FNV-1a hash → a stable non-negative int from a string key. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T>(list: readonly T[], key: string): T => list[hash(key) % list.length]!;

/**
 * How a card's photo should be treated: a bare FPL numeric code is a transparent
 * cutout; an absolute URL is an old photo-with-background; anything else / empty
 * has no usable image.
 */
export function imageKind(photo: string | null | undefined): ImageKind {
  if (!photo) return "none";
  if (/^\d+$/.test(photo)) return "cutout";
  if (/^https?:\/\//i.test(photo)) return "photo";
  return "none";
}

export function pickFront(
  card: EnrichedCard,
  kind: ImageKind = imageKind(card.photo),
): FrontDesign {
  const overall = card.ratings?.overall ?? 0;
  if (overall >= PREMIUM_MIN) return pick(PREMIUM, String(card.cardId));
  return kind === "photo" ? "A2" : "A1";
}

export function pickBack(card: EnrichedCard): BackDesign {
  return pick(BACKS, `${String(card.cardId)}|back`);
}
