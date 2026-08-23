"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { chaosMatchup } from "@/features/game/domain/chaos-draft";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import { opponentSetup } from "@/features/game/domain/opponent";
import { simulate } from "@/features/game/domain/simulate";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { randomSeed } from "@/features/game/view/seed";
import { prefersReducedMotion } from "@/utils/motion";
import { ChaosGenerating } from "./ChaosGenerating";
import { DraftScreen } from "./DraftScreen";
import { MatchView } from "./MatchView";

// The route is `force-static`: the prerendered HTML is built once and served from the
// CDN to everyone, so the SERVER render cannot contain a per-visitor squad, and drawing
// entropy during render would break hydration.
//
// So the server renders the GENERATING state instead of a squad. Entropy arrives in a
// mount effect and the first XI the visitor ever sees is already their own — an earlier
// attempt kept a placeholder XI on screen and the swap was plainly visible.
const INITIAL_SEED = 20260805; // only ever used for the pre-hydration render
const GENERATE_MS = 1200; // how long the generating bar runs before the reveal
const EXIT_MS = 700; // conveyor-out before the match mounts
const DEFAULT_RATE = 2.7; // squad spans seasons → neutral goal rate

type Phase = "generating" | "draft" | "exiting" | "play";

export function ChaosDraft({ pool }: { pool: EnrichedCard[] }) {
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

  const names = useMemo(() => ({ home: t("yourXi"), away: t("rivals") }), [t]);
  const matchup = useMemo(() => chaosMatchup(pool, seed, names), [pool, seed, names]);
  const opponentTeam = matchup.opponent.kind === "squad" ? matchup.opponent.team : matchup.home;

  const model = useMemo(() => {
    const result = simulate(
      opponentSetup({
        home: matchup.home,
        homeStyle: matchup.homeStyle,
        opponent: matchup.opponent,
        season: 0,
        seed,
        targetGoalsPerMatch: DEFAULT_RATE,
      }),
    );
    return buildMatchViewModel(matchup.home, opponentTeam, result);
  }, [matchup, opponentTeam, seed]);

  // Fresh entropy per re-roll. A fixed step would make every visitor's 2nd, 3rd,
  // … draft identical too, not just their first.
  const reroll = () => {
    setSeed(randomSeed());
    setPhase("draft");
  };
  const play = () => {
    setPhase("exiting");
    window.setTimeout(() => setPhase("play"), reduced ? 0 : EXIT_MS);
  };

  if (phase === "generating") {
    return <ChaosGenerating reduced={reduced} />;
  }

  if (phase === "play") {
    return (
      <div>
        <button
          type="button"
          onClick={reroll}
          className="text-muted-foreground hover:text-foreground mb-3 text-sm font-semibold"
        >
          {t("newDraft")}
        </button>
        <MatchView model={model} />
      </div>
    );
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
