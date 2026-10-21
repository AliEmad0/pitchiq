import { type Badge, CRAFT_COST, duplicates } from "@/features/game/domain/crafting";
import type { TraitId } from "@/features/game/domain/traits";
import { idbGetAll, idbSpendAndPut } from "./idb";
import type { AlbumEntry } from "./trophy-slot";

/**
 * TASK-1829 — mint a badge: spend `CRAFT_COST` duplicates of ONE album sticker and attach the
 * trait to that card, atomically (`idbSpendAndPut`). Refused — and nothing written — when the
 * sticker has too few duplicates or the card already carries a badge.
 *
 * ⚠️ The sticker itself always survives: a craft can only take `count` down to 1, never to 0, so
 * a set the coach completed stays complete.
 */
export async function craftBadge(
  entry: Pick<AlbumEntry, "cardId" | "teamId">,
  trait: TraitId,
  now: string,
): Promise<boolean> {
  try {
    return await idbSpendAndPut<AlbumEntry>(
      {
        store: "album",
        key: `${entry.cardId}#${entry.teamId}`,
        update: (old) =>
          old == null || duplicates(old.count) < CRAFT_COST
            ? null
            : { ...old, count: old.count - CRAFT_COST },
      },
      {
        store: "badges",
        key: entry.cardId,
        value: { cardId: entry.cardId, trait, craftedAt: now } satisfies Badge,
        ifAbsent: true,
      },
    );
  } catch {
    return false;
  }
}

/** Every crafted badge. Best-effort: a blocked store reads as none. */
export async function loadBadges(): Promise<Badge[]> {
  try {
    return await idbGetAll<Badge>("badges");
  } catch {
    return [];
  }
}
