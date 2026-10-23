import {
  chemistryBreakdown,
  fitChemistry,
  linkTier,
  offPosition,
  offPositionSlots,
  type Fittable,
  type LinkTier,
} from "@/features/game/domain/chemistry";
import type { Formation } from "@/features/game/domain/formation";
import { adjacentPairs } from "@/features/game/domain/pitch-adjacency";

/**
 * TASK-1824 — chemistry as a VIEW, for the draft surfaces that are not `PitchDraft`: the H2H
 * hub (`/game/draft`), the Chaos board and the daily (owner, 2026-10-23: "close all the tasks").
 *
 * Pure and derived from the XI on every render, exactly as `PitchDraft` derives its own: a
 * score kept in state is one more thing that could disagree with the board.
 *
 * ⚠️ It reads `fitChemistry`, the same figure `buildSession` plays when the match declares
 * `fit` — a meter showing the bare link score would be a number the engine ignores.
 */
export interface ChemLink {
  i: number;
  j: number;
  tier: LinkTier;
}

export interface ChemView {
  score: number;
  counts: Record<LinkTier, number>;
  offSlots: number[];
  links: ChemLink[];
}

export function chemistryView(
  xi: readonly (Fittable | null | undefined)[],
  formation: Formation,
): ChemView {
  return {
    score: fitChemistry(xi, formation),
    counts: chemistryBreakdown(xi, formation),
    offSlots: offPositionSlots(xi, formation),
    links: adjacentPairs(formation).map(([i, j]) => {
      const a = xi[i];
      const b = xi[j];
      return { i, j, tier: a != null && b != null ? linkTier(a, b) : "none" };
    }),
  };
}

/**
 * The last placement — the owner's glow pick (#15 Halo Rings + #18 Shockwave Warning) needs to
 * know WHICH slot just filled, whether that man is out of position, and whether the score fell.
 * `n` re-keys every animated element so the moment can replay on the next placement.
 */
export interface ChemFlash {
  slot: number;
  n: number;
  off: boolean;
  down: boolean;
}

/**
 * The first XI slot whose occupant changed to a card, or -1.
 *
 * ⚠️ Diffed rather than hooked into a handler, because each surface reaches its picks from
 * several paths (tap, swap, auto-fill, the draft room) and the glow must answer to what LANDED
 * on the pitch, not to which button was pressed.
 */
export function changedSlot(
  before: readonly (string | null | undefined)[],
  after: readonly (string | null | undefined)[],
  size: number,
): number {
  for (let k = 0; k < size; k++) {
    if (after[k] != null && after[k] !== before[k]) return k;
  }
  return -1;
}

/** The flash for a placement, or `prev` unchanged when nothing new landed. */
export function nextFlash(
  prev: ChemFlash | null,
  before: readonly (string | null | undefined)[],
  after: readonly (string | null | undefined)[],
  xi: readonly (Fittable | null | undefined)[],
  formation: Formation,
  scoreBefore: number,
  scoreAfter: number,
): ChemFlash | null {
  const slot = changedSlot(before, after, formation.slots.length);
  if (slot < 0) return prev;
  const placed = xi[slot];
  return {
    slot,
    n: (prev?.n ?? 0) + 1,
    off: placed != null && offPosition(placed, formation.slots[slot]!.role),
    down: scoreAfter < scoreBefore,
  };
}

/** Is `link` one the last placement just made? */
export function isLit(flash: ChemFlash | null, link: ChemLink): boolean {
  return flash != null && (link.i === flash.slot || link.j === flash.slot);
}

/** The tier linking slot `i` to the slot that was just placed, if any. */
export function ringTier(
  flash: ChemFlash | null,
  links: readonly ChemLink[],
  i: number,
): LinkTier | null {
  if (flash == null || i === flash.slot) return null;
  const link = links.find(
    (l) =>
      l.tier !== "none" && ((l.i === flash.slot && l.j === i) || (l.j === flash.slot && l.i === i)),
  );
  return link?.tier ?? null;
}
