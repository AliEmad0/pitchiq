"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { chaosMatchup, type PoolCard } from "@/features/game/domain/chaos-draft";
import type { Formation } from "@/features/game/domain/formation";
import { randomSeed } from "@/features/game/view/seed";
import { prefersReducedMotion } from "@/utils/motion";
import { ChaosGenerating } from "./ChaosGenerating";
import { DraftScreen } from "./DraftScreen";

// The route is `force-static`: the prerendered HTML is built once and served from the
// CDN to everyone, so the SERVER render cannot contain a per-visitor squad, and drawing
// entropy during render would break hydration.
//
// So the server renders the GENERATING state instead of a squad. Entropy arrives in a
// mount effect and the first XI the visitor ever sees is already their own — an earlier
// attempt kept a placeholder XI on screen and the swap was plainly visible.
const INITIAL_SEED = 20260805; // only ever used for the pre-hydration render
const GENERATE_MS = 1200; // how long the generating bar runs before the reveal
const EXIT_MS = 700; // conveyor-out before the match is handed up

type Phase = "generating" | "draft" | "exiting";

/**
 * Chaos's SETUP phase: the generating bar, then "Match Night" (TASK-1835).
 *
 * ⚠️ It drafts, and hands the finished XI UP. It does not play the match (TASK-1838).
 * Chaos used to batch-`simulate()` a whole match here and render `MatchView` over the
 * finished result, which is why it had no preview and no summary and why nothing that
 * happened on the pitch was coachable. Everything after "Play match" now belongs to
 * `GamePlay`, exactly as it does for every other mode.
 *
 * ⛔ THE SEED IS HANDED UP WITH THE XI, and that is what keeps the promise Match Night
 * makes. `buildSession` re-runs `chaosMatchup` from the seed to draft the coach's bench
 * AND the rival, so a fresh seed at kick-off would field a different opponent than the
 * versus board just spent a screen introducing.
 */
export function ChaosDraft({
  pool,
  onConfirm,
}: {
  pool: PoolCard[];
  onConfirm: (
    players: PoolCard[],
    formation: Formation,
    /** Chaos has no club to choose. The slot exists so this matches `GamePlay`'s confirm. */
    rival: undefined,
    seed: number,
  ) => void;
}) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [phase, setPhase] = useState<Phase>("generating");

  // Post-hydration: draw this visitor's own seed, then reveal. Without it every
  // visitor shares INITIAL_SEED and sees the identical XI on first load.
  useEffect(() => {
    setSeed(randomSeed());
    if (reduced) {
      setPhase("draft");
      return;
    }
    const id = window.setTimeout(() => setPhase("draft"), GENERATE_MS);
    return () => window.clearTimeout(id);
  }, [reduced]);

  const byCardId = useMemo(() => new Map(pool.map((c) => [c.cardId, c])), [pool]);
  const names = useMemo(() => ({ home: t("yourXi"), away: t("rivals") }), [t]);
  const matchup = useMemo(() => chaosMatchup(pool, seed, names), [pool, seed, names]);
  const opponentTeam = matchup.opponent.kind === "squad" ? matchup.opponent.team : matchup.home;

  // Fresh entropy per re-roll. A fixed step would make every visitor's 2nd, 3rd,
  // … draft identical too, not just their first.
  const reroll = () => {
    setSeed(randomSeed());
    setPhase("draft");
  };

  const play = () => {
    setPhase("exiting");
    // The conveyor-out plays first, then the squad goes up and the programme takes over.
    // ⚠️ Resolved back to POOL cards, in slot order. `GameTeam` holds the narrower
    // `GamePlayer`, and what goes up has to be the same shape every other setup screen
    // hands over — `buildSession` re-drafts the bench and the rival, but the XI is taken
    // verbatim from here.
    const players = matchup.home.players
      .map((p) => byCardId.get(p.cardId))
      .filter((c): c is PoolCard => c != null);
    window.setTimeout(
      () => onConfirm(players, matchup.home.formation, undefined, seed),
      reduced ? 0 : EXIT_MS,
    );
  };

  if (phase === "generating") {
    return <ChaosGenerating reduced={reduced} />;
  }

  return (
    <DraftScreen
      key={seed}
      home={matchup.home}
      opponent={opponentTeam}
      exiting={phase === "exiting"}
      reduced={reduced}
      onReroll={reroll}
      onPlay={play}
    />
  );
}
