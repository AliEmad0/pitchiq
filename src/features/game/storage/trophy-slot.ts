import type { AchievementId } from "@/features/game/domain/achievements";
import { idbAdd, idbGet, idbGetAll, idbUpdateMany } from "./idb";

/**
 * TASK-1819 — one sticker in the album: a card as it played for ONE club.
 *
 * ⚠️ Keyed `${cardId}#${teamId}`, never the card id alone: a mid-season transfer appears in both
 * clubs' squads under one card id, and fielding him for one club must fill only that club's set.
 */
export interface AlbumEntry {
  cardId: string;
  teamId: number;
  name: string;
  role: string;
  season: number;
  ovr: number;
  /** The local day he was first collected, `YYYY-MM-DD`. */
  firstDay: string;
  /** Finished matches he has played in — kept for duplicates (TASK-1829), not spent here. */
  count: number;
}
export type AlbumCard = Omit<AlbumEntry, "count" | "firstDay">;

/** TASK-1813 — an unlocked achievement: once, with the day and what earned it. */
export interface Unlock {
  id: AchievementId;
  day: string;
  context: string;
}

const albumKey = (c: { cardId: string; teamId: number }) => `${c.cardId}#${c.teamId}`;

/**
 * Add the cards of one finished match. ⚠️ Best-effort, like every game store: a full-time
 * screen must never break because the browser refused a write.
 */
export async function addCards(cards: readonly AlbumCard[], day: string): Promise<void> {
  try {
    // ⛔ One transaction for the whole match — see `idbUpdateMany` for the lost-update race.
    await idbUpdateMany<AlbumEntry>(
      "album",
      cards.map((c) => ({
        key: albumKey(c),
        update: (old) => ({ ...c, firstDay: old?.firstDay ?? day, count: (old?.count ?? 0) + 1 }),
      })),
    );
  } catch {
    // Persistence is best-effort by design.
  }
}

export async function loadAlbum(): Promise<AlbumEntry[]> {
  try {
    return await idbGetAll<AlbumEntry>("album");
  } catch {
    return [];
  }
}

/** True the first time an achievement is unlocked, false ever after (or on any failure). */
export async function unlock(u: Unlock): Promise<boolean> {
  try {
    return await idbAdd("trophies", u.id, u);
  } catch {
    return false;
  }
}

export async function loadUnlocks(): Promise<Unlock[]> {
  try {
    return await idbGetAll<Unlock>("trophies");
  } catch {
    return [];
  }
}

/** Has a record key already been claimed? (A read only — the claim itself is `claimLog`.) */
export async function isClaimed(key: string): Promise<boolean> {
  try {
    return (await idbGet<boolean>("trophyLog", key)) != null;
  } catch {
    return false;
  }
}

/**
 * Claim a record key — true only the FIRST time.
 *
 * ⛔ Atomic (`add`, which refuses an existing key) rather than get-then-put: React runs a
 * development effect twice in one tick, and two get-then-puts would both see "missing" and
 * both record the match, doubling every count it touches.
 */
export async function claimLog(key: string): Promise<boolean> {
  try {
    return await idbAdd("trophyLog", key, true);
  } catch {
    return false;
  }
}
