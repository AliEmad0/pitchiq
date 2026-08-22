/**
 * Photos the data claims but we know are the WRONG PERSON.
 *
 * ⛔ **Absent beats wrong.** This is the same rule the manager portraits already follow
 * (Stuart Gray ships with no photo rather than a watermarked stock preview, see CLAUDE.md).
 * A blocked URL produces no candidates at all, so the surface falls back to whatever it
 * shows for a player with no photo — an initials monogram on `<PlayerImage>`, nothing on a
 * game card. Both are honest; a stranger's face is not.
 *
 * ⚠️ This is a PLASTER, not the cure. The mismatches come from the pipeline's Wikimedia
 * name-matching, and the fix belongs there — this repo only reads committed snapshots. What
 * a blocklist buys is that a known-wrong face stops shipping today without waiting on a
 * data refresh, and it cannot be undone by one: the sync rebuild overwrites `players-*.json`
 * but never touches source.
 *
 * ⚠️ Keyed on the URL rather than the player id deliberately. The same bad file is often
 * claimed by several player-seasons, and the id is not in scope where candidates are built.
 */

/** Wikimedia file paths, as they appear in `photo` — compared case-sensitively and whole. */
export const BLOCKED_PHOTOS: ReadonlySet<string> = new Set([
  /**
   * Richard Gough (1004904) — the Scottish international who played for Spurs, Rangers,
   * Everton and Nottingham Forest in the nineties.
   *
   * The file is "R T Gough Oswestry", and what it renders is a grainy monochrome portrait
   * of an elderly bald man — plainly not a footballer photographed in the 1990s. Oswestry
   * is a Shropshire market town with no connection to him. Owner-reported, 2026-08-21.
   */
  "https://commons.wikimedia.org/wiki/Special:FilePath/R%20T%20Gough%20Oswestry.jpg",
]);

/** Is this exact photo value known to show the wrong person? */
export function isBlockedPhoto(photo: string | null | undefined): boolean {
  return photo != null && BLOCKED_PHOTOS.has(photo);
}
