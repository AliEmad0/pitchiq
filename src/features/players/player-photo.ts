// Pure player-photo helpers — NO "use client". Kept separate from the client
// `<PlayerImage>` so Server Components (e.g. `<PlayerHero>`) can resolve a photo
// URL: a function exported from a "use client" module becomes an uncallable
// client reference when imported into a Server Component. `<PlayerImage>`
// re-exports these for its existing consumers/tests.

// Current PL photo CDN (post-redesign): no `p` prefix, 110x140, `premierleague25`.
const FPL_PHOTO_BASE = "https://resources.premierleague.com/premierleague25/photos/players/110x140";
// Legacy CDN, kept as a fallback for the codes still served only there.
const FPL_PHOTO_BASE_LEGACY =
  "https://resources.premierleague.com/premierleague/photos/players/250x250";

const isAbsoluteUrl = (s: string): boolean => /^https?:\/\//i.test(s);

/** The candidates a `photo` field produces on its own, before any fallback. */
function primaryPhotoCandidates(photo: string | null | undefined): string[] {
  if (!photo) return [];
  if (isAbsoluteUrl(photo)) return [photo];
  if (/^\d+$/.test(photo))
    return [`${FPL_PHOTO_BASE}/${photo}.png`, `${FPL_PHOTO_BASE_LEGACY}/p${photo}.png`];
  return [];
}

/**
 * Ordered list of candidate `<img>` srcs for a `photo` field — the component
 * tries them in turn, falling back to initials when all fail. An absolute URL
 * has one candidate; an FPL code has two (current CDN path, then the legacy
 * one); anything else (`""`, `null`, non-numeric) has none.
 *
 * `fallback` (TASK-M87) is a **last-resort** source appended after everything
 * `photo` produces — the crawled Transfermarkt portrait for managers. The order
 * is the point: a manager whose PL-CDN headshot loads keeps it, so publishing
 * portraits fills genuine holes (Glasner, Iraola) without restyling the 30
 * managers who already render. An owner override reaches us as `photo`, so it
 * still wins outright — which matters, because several were hand-corrected
 * precisely because the automatic source had the wrong person (TASK-M86).
 *
 * Only an absolute URL is accepted as a fallback: a bare id would re-enter the
 * PL-CDN path that just failed and mask a real gap behind a second 404.
 */
export function playerPhotoCandidates(
  photo: string | null | undefined,
  fallback?: string | null,
): string[] {
  const primary = primaryPhotoCandidates(photo);
  if (!fallback || !isAbsoluteUrl(fallback)) return primary;
  // Deduped: a manager whose override IS the crawled portrait must not retry it.
  return [...new Set([...primary, fallback])];
}

/**
 * Map a `photo` field to its primary `<img>` src, or `null` when there's no
 * usable image (caller renders initials).
 */
export function resolvePlayerPhotoSrc(
  photo: string | null | undefined,
  fallback?: string | null,
): string | null {
  return playerPhotoCandidates(photo, fallback)[0] ?? null;
}

/**
 * 1-2 letter monogram: first + last word initial (`"Bukayo Saka"` → `"BS"`),
 * single word → its first letter, empty → `"?"`.
 */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
