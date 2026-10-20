/**
 * TASK-1813 — the Hall of Fame. Pure predicates over what the end of a match or a run already
 * provides; nothing here reads storage, the clock or entropy.
 *
 * ⛔ The id list is FROZEN in this order: unlocks are stored by id, and the cabinet renders in
 * this order, four cups to a shelf.
 */
export const ACHIEVEMENT_IDS = [
  "first-win",
  "clean-sheet",
  "thrashing",
  "hat-trick",
  "sparse-hat-trick",
  "comeback",
  "late-winner",
  "ten-men",
  "champions",
  "invincibles",
  "great-escape",
  "daily-7",
  "rewrite",
  "rewrite-all",
  "collector-100",
  "set-complete",
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];
