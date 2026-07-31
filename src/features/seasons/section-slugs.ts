// TASK-M71b — the sections that live under the season path
// (/seasons/<year>/<slug>, bare /<slug> = current). Single source of truth for
// the nested route, the switcher, the nav and the sitemap. Client-safe (plain
// strings, no server imports) so client components can import it. `/compare`
// is NOT here — it genuinely reads searchParams and stays dynamic.
export const SECTION_SLUGS = ["teams", "players", "fixtures", "leaderboards", "managers"] as const;

export type SectionSlug = (typeof SECTION_SLUGS)[number];

export function isSectionSlug(value: string): value is SectionSlug {
  return (SECTION_SLUGS as readonly string[]).includes(value);
}
