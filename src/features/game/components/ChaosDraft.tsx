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
import { DraftScreen } from "./DraftScreen";
import { MatchView } from "./MatchView";

// The route is `force-static`: the prerendered HTML is built once and served from
// the CDN to everyone, so the SERVER render must be a fixed seed. Drawing a random
// one during render would also break hydration. Entropy therefore arrives in a
// mount effect (below) — the cards deal in from opacity 0, so the swap lands
// before anything is visible.
const INITIAL_SEED = 20260805; // fixed → deterministic prerender
const EXIT_MS = 700; // conveyor-out before the match mounts
const DEFAULT_RATE = 2.7; // squad spans seasons → neutral goal rate

type Phase = "draft" | "exiting" | "play";

export function ChaosDraft({ pool, locale }: { pool: EnrichedCard[]; locale: string }) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [seed, setSeed] = useState(INITIAL_SEED);
  const [phase, setPhase] = useState<Phase>("draft");

  // Post-hydration: give this visitor their own draft. Without it every visitor
  // shares INITIAL_SEED and sees the identical XI on first load.
  useEffect(() => {
    setSeed(randomSeed());
  }, []);

  const names = useMemo(() => ({ home: t("yourXi"), away: t("rivals") }), [t]);
  const matchup = useMemo(() => chaosMatchup(pool, seed, names), [pool, seed, names]);
  const opponentTeam = matchup.opponent.kind === "squad" ? matchup.opponent.team : matchup.home;
  const opponentAvg = useMemo(() => {
    const rs = opponentTeam.players.map((p) => p.ratings?.overall ?? 0);
    return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : 0;
  }, [opponentTeam]);

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
        <MatchView model={model} locale={locale} />
      </div>
    );
  }

  return (
    <DraftScreen
      key={seed}
      home={matchup.home}
      opponentName={matchup.opponent.kind === "squad" ? matchup.opponent.team.name : names.away}
      opponentAvg={opponentAvg}
      exiting={phase === "exiting"}
      reduced={reduced}
      onReroll={reroll}
      onPlay={play}
      locale={locale}
    />
  );
}
