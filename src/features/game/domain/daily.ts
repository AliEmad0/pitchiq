import { formationByName, type Formation } from "./formation";
import { hashStr } from "./hash";

/**
 * TASK-1817 — everything derivable about one daily challenge, from its date alone.
 *
 * ⚠️ NO CLOCK LIVES HERE. `domain/` may not read entropy or time (TASK-1803), so every
 * function takes the day as an argument. `view/` reads `new Date()` once and passes the
 * key down — the ticket's "a setup input, never read inside the engine".
 */

const MS_PER_DAY = 86_400_000;

/**
 * The UTC calendar day, `YYYY-MM-DD`.
 *
 * ⚠️ UTC GETTERS ONLY. A player in UTC+13 and one in UTC−8 must be given the same
 * challenge at the same instant — that is the entire premise of a daily. Local getters,
 * or `toISOString()` on a locally-adjusted date, break it for everyone outside UTC and
 * break it invisibly, because the developer's own machine usually agrees.
 */
export function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A key → its UTC midnight, in ms. `Date.UTC` so no DST rule can ever apply. */
function utcMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Step a key by whole days. Used to walk a streak backwards. */
export function dayKeyOffset(key: string, days: number): string {
  return dayKey(new Date(utcMs(key) + days * MS_PER_DAY));
}

/** Day #1. Changing this renumbers every challenge; it is not a tuning knob. */
export const DAILY_EPOCH_UTC = "2026-08-17";

/**
 * The challenge's ordinal, as shown in the share text.
 *
 * Clamped at 1: a device with a wrong clock should see day one, never a negative one.
 */
export function dayNumber(key: string): number {
  const n = Math.round((utcMs(key) - utcMs(DAILY_EPOCH_UTC)) / MS_PER_DAY) + 1;
  return Math.max(1, n);
}

/**
 * Three independent streams from one day.
 *
 * XOR-split with distinct golden constants — the idiom `chaosMatchup` already uses, so a
 * reader who knows one knows both. One hash, one source of truth.
 */
export function daySeeds(key: string): { formation: number; deal: number; match: number } {
  const base = hashStr(key);
  return {
    formation: base >>> 0,
    deal: (base ^ 0x9e3779b9) >>> 0,
    match: (base ^ 0x51ed270b) >>> 0,
  };
}

/**
 * The shapes a daily challenge can deal, by NAME.
 *
 * ⛔ FROZEN. Not "append-only": the pick below is `seed % length`, so adding a name
 * re-maps every day exactly as reordering would, and there is no scheme that keeps a
 * uniform pick stable over a growing set. A golden test pins these contents so any edit
 * fails loudly and has to be accepted deliberately — at which point stored history is
 * invalidated, and the fingerprint check discards it rather than mis-replaying it.
 *
 * ⚠️ Names, never positions into `FORMATIONS` — that array's order is presentation only.
 */
export const DAILY_SHAPES: readonly string[] = [
  "4-3-3 Holding",
  "4-3-3 Flat",
  "4-3-3 False 9",
  "4-2-3-1",
  "4-4-2 Flat",
  "4-4-2 Diamond",
  "4-1-4-1",
  "4-3-2-1 Christmas Tree",
  "4-5-1",
  "4-2-2-2 Magic Rectangle",
  "3-5-2",
  "3-4-3 Flat",
  "3-4-2-1",
  "3-1-4-2",
  "5-3-2",
  "5-4-1",
  "4-2-4",
  "3-2-2-3 W-M",
  "2-3-5 Pyramid",
  "4-6-0 Strikerless",
];

/** The shape every coach drafts into today. Resolved by name, so order cannot matter. */
export function dayFormation(key: string): Formation {
  return formationByName(DAILY_SHAPES[daySeeds(key).formation % DAILY_SHAPES.length]!);
}
