import { routing } from "@/i18n/routing";

/**
 * Is Arabic actually shipping?
 *
 * ⭐ DERIVED from `routing.locales`, never hard-coded (TASK-1843). Arabic is parked out of that
 * array for the build budget — two locales made the prerender 38,121 pages and blew Vercel's
 * 45-minute build limit — and the whole point of parking rather than deleting is that putting
 * `"ar"` back is ONE edit. Reading the real array means these suites re-arm themselves on that
 * edit instead of waiting for someone to remember they exist.
 *
 * ⚠️ Guard the Arabic cases with this rather than deleting them: they encode what "Arabic
 * works" means (RTL direction, the localized 404, Arabic month names, the seeded entity
 * names), and that knowledge is expensive to rebuild and impossible to notice missing.
 */
export const ARABIC_ENABLED = (routing.locales as readonly string[]).includes("ar");

/** The locale path prefixes that currently exist — `["/"]`, or `["/", "/ar"]` when Arabic ships. */
export const LOCALE_PATHS: readonly string[] = ARABIC_ENABLED ? ["/", "/ar"] : ["/"];

/** Reason string shown in Playwright's skip output, so a skipped run explains itself. */
export const ARABIC_PARKED = "Arabic is parked out of routing.locales (TASK-1843)";
