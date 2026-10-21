import { LIVES, type MarketRun } from "@/features/game/domain/market";
import { idbDel, idbGet, idbPut } from "./idb";

/**
 * TASK-1818 — the Mystery Market's run (IndexedDB v8 `market`): one run in progress, plus the
 * best run ever. Results are STORED, never replayed.
 */
export interface MarketBest {
  wins: number;
  rounds: number;
  endedAt: string;
}

const CURRENT = "current";
const BEST = "best";

function validRun(r: unknown): r is MarketRun {
  if (r == null || typeof r !== "object") return false;
  const m = r as MarketRun;
  return (
    Number.isInteger(m.seed) &&
    Number.isInteger(m.round) &&
    Number.isInteger(m.wins) &&
    Number.isInteger(m.lives) &&
    m.lives >= 0 &&
    m.lives <= LIVES &&
    Array.isArray(m.xi) &&
    m.xi.length === 11 &&
    Array.isArray(m.buffs) &&
    Array.isArray(m.results) &&
    typeof m.forced === "object" &&
    typeof m.pendingPack === "boolean"
  );
}

/** Strict, like the season's: a run that cannot be saved must show retry, not play on. */
export async function saveMarketRun(run: MarketRun): Promise<void> {
  if (typeof indexedDB === "undefined") throw new Error("Storage unavailable");
  await idbPut("market", CURRENT, run);
}

export async function loadMarketRun(): Promise<MarketRun | null> {
  try {
    const r = await idbGet<unknown>("market", CURRENT);
    return validRun(r) ? r : null;
  } catch {
    return null;
  }
}

export async function clearMarketRun(): Promise<void> {
  try {
    await idbDel("market", CURRENT);
  } catch {
    // Nothing to clear is indistinguishable from cleared.
  }
}

export async function loadMarketBest(): Promise<MarketBest | null> {
  try {
    return await idbGet<MarketBest>("market", BEST);
  } catch {
    return null;
  }
}

/** Keep the best run: more wins, then fewer rounds to get them. */
export async function offerMarketBest(next: MarketBest): Promise<boolean> {
  const old = await loadMarketBest();
  if (
    old != null &&
    (old.wins > next.wins || (old.wins === next.wins && old.rounds <= next.rounds))
  ) {
    return false;
  }
  try {
    await idbPut("market", BEST, next);
    return true;
  } catch {
    return false;
  }
}
