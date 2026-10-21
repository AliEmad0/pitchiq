"use client";

import { useEffect, useState } from "react";
import { craftedMap } from "@/features/game/domain/crafting";
import type { CraftedTraits } from "@/features/game/domain/traits";
import { loadBadges } from "@/features/game/storage/badge-slot";

/**
 * TASK-1829 — the coach's crafted badges, read once after mount (the page is force-static, so the
 * prerender has no IndexedDB). Empty until read, and on any storage failure — a badge that cannot
 * be read simply does not play.
 */
export function useCraftedTraits(): CraftedTraits {
  const [traits, setTraits] = useState<CraftedTraits>(() => new Map());
  useEffect(() => {
    let live = true;
    void loadBadges().then((b) => {
      if (live) setTraits(craftedMap(b));
    });
    return () => {
      live = false;
    };
  }, []);
  return traits;
}
