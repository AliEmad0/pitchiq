"use client";

import { usePathname } from "@/i18n/navigation";

import { SeasonSwitcher } from "./SeasonSwitcher";

// Entity detail routes — `/players/<id>`, `/teams/<id>`, `/managers/<id>` — own
// a page-local season control scoped to that entity's seasons (TASK-M10/M49).
// Match the single `[id]` segment only; the index pages keep the global switcher.
const ENTITY_DETAIL_ROUTE = /^\/(players|teams|managers)\/[^/]+$/;

// Client wrapper around the global <SeasonSwitcher> (all committed seasons).
// It renders everywhere EXCEPT entity detail pages, where it would otherwise
// offer seasons the entity has no data for (e.g. Henry → 2025-26 → empty
// state). On those routes the page renders its own <EntitySeasonSwitcher>
// scoped to the entity's seasons instead.
export function HeaderSeasonSwitcher({ seasons }: { seasons: number[] }) {
  const pathname = usePathname();
  // /map owns its own season control (the timeline slider) — TASK-M27.
  if (pathname === "/map") return null;
  // /compare has its own per-slot season pickers; the global season isn't
  // meaningful there, and since TASK-M71b the switcher only navigates the
  // season path (it no longer writes a `?season=` /compare ignored).
  if (pathname === "/compare") return null;
  if (pathname && ENTITY_DETAIL_ROUTE.test(pathname)) return null;
  return <SeasonSwitcher seasons={seasons} />;
}
