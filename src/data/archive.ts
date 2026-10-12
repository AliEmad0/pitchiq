import { currentDataSeason } from "@/utils/season";

/**
 * Which seasons are served from the STATIC-DATA ARCHIVE rather than as prerendered pages
 * (TASK-M96, owner-approved 2026-10-12).
 *
 * ⭐ ONE predicate decides both halves of the split, so they cannot drift apart:
 * `/[locale]/fixtures/[id]` prerenders the seasons for which this is `false`, and
 * `/api/archive/fixtures/[id]` prerenders a JSON file for every match for which it is `true`.
 * Every match is therefore covered exactly once — the TASK-1843 rule ("no reachable path may
 * be left unbuilt") still holds, it is simply met by a data file plus one shared shell page
 * instead of ~200 KB of HTML and RSC per match.
 *
 * ⛔ Why: one production build was ~4.9 GB, of which the ~12,800 historical match pages were
 * 2.5 GB, and Vercel Hobby keeps at least three builds against a 10 GB Deployment Storage
 * limit. The archive's JSON is a few KB per match. See docs/deployment-storage.md and
 * docs/superpowers/specs/2026-10-13-task-m96-static-archive-design.md.
 *
 * Pure and edge-safe: no I/O, so it is importable from routes, tests and scripts alike.
 */
export const isArchivedSeason = (season: number): boolean => season < currentDataSeason();
