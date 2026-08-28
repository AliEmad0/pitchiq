"use client";
import { useCallback, useEffect, useState } from "react";
import type { DraftPolicy, PoolCard } from "@/features/game/domain/chaos-draft";
import { fromRivalCard, type RivalPool } from "@/features/game/domain/rival-pool";

/**
 * TASK-1810 follow-up — fetching the club the coach chose to face (owner, 2026-08-19).
 *
 * ⚠️ A FETCH, not a prop. The rival's cards are ~24 KB and there are 51 clubs; shipping all
 * of them with every page would add ~1.2 MB to a payload that is already ~700 KB. The route
 * behind this is prerendered and CDN-served, so one club costs one static file and nothing
 * runs on a request.
 */

/** How the rival XI is drafted. The setup screen calls these Balanced and Best XI. */
export type Difficulty = "balanced" | "best";

/** `Difficulty` as the draft policy it means. */
/**
 * ⚠️ The return type is NARROWER than `DraftPolicy` on purpose (TASK-1810). This value rides
 * in `SavedMatch` and in the share code, whose unions are `"random" | "best" | "strong"` — so
 * widening it to the full policy set would let `"budget"` reach a codec that cannot encode it,
 * which is the failure class that crashed every Legacy full-time screen once already.
 */
export function policyOf(d: Difficulty): Extract<DraftPolicy, "best" | "strong"> {
  return d === "best" ? "best" : "strong";
}

export interface ChosenRival {
  /** A club's numeric id, or a NATION's flag-icons code (TASK-1842). */
  teamId: number | string;
  name: string;
  cards: PoolCard[];
}

export type RivalState =
  | { status: "loading" }
  | { status: "ready"; rival: ChosenRival }
  /**
   * ⚠️ A failed fetch is NOT an error screen.
   *
   * The coach is mid-setup and the match can still be played — against his own club's pool,
   * which is exactly what the mode did before this existed. Blocking the whole draft on a
   * flaky network would be a worse outcome than a different opponent.
   */
  | { status: "unavailable" };

export const rivalUrl = (teamId: number | string) => `/api/game/rivals/${teamId}`;

/** Fetch one club's squad. Returns null for any failure — the caller degrades. */
export async function loadRival(
  teamId: number | string,
  signal?: AbortSignal,
): Promise<ChosenRival | null> {
  try {
    const res = await fetch(rivalUrl(teamId), { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as RivalPool;
    if (!Array.isArray(body?.cards) || body.cards.length === 0) return null;
    return { teamId: body.teamId, name: body.name, cards: body.cards.map(fromRivalCard) };
  } catch {
    return null;
  }
}

/**
 * The chosen rival, kept in sync with the id.
 *
 * ⛔ Aborts the previous request on every change. Without it a coach flicking through the
 * club list can have four requests in flight and the SLOWEST one wins — so the squad he
 * ends up facing is whichever server response happened to land last, not the club he
 * picked.
 */
export function useRival(teamId: number | string | null): RivalState {
  const [state, setState] = useState<RivalState>({ status: "loading" });

  const load = useCallback((id: number | string, signal: AbortSignal) => {
    setState({ status: "loading" });
    void loadRival(id, signal).then((rival) => {
      if (signal.aborted) return;
      setState(rival == null ? { status: "unavailable" } : { status: "ready", rival });
    });
  }, []);

  useEffect(() => {
    if (teamId == null) {
      setState({ status: "unavailable" });
      return;
    }
    const controller = new AbortController();
    load(teamId, controller.signal);
    return () => controller.abort();
  }, [teamId, load]);

  return state;
}
