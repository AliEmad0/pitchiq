import { type CraftedTraits, type TraitId, TRAITS, traitsOf } from "./traits";
import type { GamePlayer } from "./player";

/**
 * TASK-1829 — card crafting: spend duplicate album stickers to mint a TRAIT BADGE on that card.
 *
 * ⭐ Strictly local and strictly one-way: crafting spends duplicates and creates nothing tradeable
 * (trading is TASK-1906). One badge per card — a card's personality is its data-derived traits
 * plus at most one crafted on top.
 *
 * ⛔ Where a badge PLAYS (Claude's call, 2026-10-21): only in modes that STORE RESULTS rather than
 * replay them — season runs, the weekly ladder and the Mystery Market. A single match, the daily
 * and every share link replay from a code another browser must reproduce, and that browser has
 * none of your badges — so a badge there would make your own link replay a different match.
 */

/** Duplicates a badge costs. A sticker you have fielded four times can carry one badge. */
export const CRAFT_COST = 3;

/** Duplicates in hand: every collection after the first. */
export const duplicates = (count: number): number => Math.max(0, count - 1);

/**
 * What can still be crafted onto a card: any trait it does not already carry from its data.
 * ⚠️ An album sticker keeps no ratings, so `ratings` may be null — then only the role rule
 * applies, and a craft that duplicates a data trait is harmless (`traitsWith` never doubles it).
 */
export function craftable(
  card: Pick<GamePlayer, "role"> & { ratings?: GamePlayer["ratings"] },
): TraitId[] {
  const own = new Set(
    card.ratings == null ? [] : traitsOf({ role: card.role, ratings: card.ratings }),
  );
  // A keeper is never a Talisman, an Engine or a Hot-Head in the data, and a badge must not
  // make him one either — the panel would promise an effect `traitsOf` refuses to read.
  const allowed = card.role === "GK" ? (["rock"] as TraitId[]) : TRAITS;
  return allowed.filter((t) => !own.has(t));
}

/** A crafted badge, stored per CARD (`cardId`) — the identity a match plays. */
export interface Badge {
  cardId: string;
  trait: TraitId;
  craftedAt: string;
}

export type { CraftedTraits };

export const craftedMap = (badges: readonly Badge[]): CraftedTraits =>
  new Map(badges.map((b) => [b.cardId, b.trait]));
