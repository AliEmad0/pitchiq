"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DecisionAnswer } from "@/features/game/domain/match-decisions";
import type { MatchResult } from "@/features/game/domain/match-types";
import { buildFixtureSession, type SeasonFixture } from "@/features/game/view/season-match";
import { useMatchDriver } from "@/features/game/view/use-match-driver";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { playReducer } from "@/features/game/view/play-machine";
import { MatchProgramme } from "./MatchProgramme";
import { MatchLive } from "./MatchLive";
import { MatchSummary } from "./MatchSummary";

/** Reuse the match screens and driver, without touching the independent single-match slot. */
export function SeasonFixturePlay({
  fixture,
  crests,
  captaincies,
  referees,
  onReturn,
}: {
  fixture: SeasonFixture;
  crests: { home: number; away: number };
  captaincies: Record<number, number>;
  referees: readonly string[];
  onReturn: (result: MatchResult | null) => void;
}) {
  const t = useTranslations("game");
  const locale = useLocale();
  const driver = useMatchDriver();
  const { startSession } = driver;
  const [{ phase }, dispatch] = useReducer(playReducer, {
    phase: "preview",
    seed: fixture.setup.seed,
  });
  const [moves, setMoves] = useState<DecisionAnswer[]>([]);
  useEffect(() => {
    startSession(buildFixtureSession(fixture));
  }, [fixture, startSession]);
  const { home, away, seed } = fixture.setup;
  const model = useMemo(
    () =>
      buildMatchViewModel(home, away, { events: driver.events, score: { home: 0, away: 0 }, seed }),
    [home, away, seed, driver.events],
  );
  if (phase === "preview")
    return (
      <>
        <p role="status">{t("seasonRestartHint")}</p>
        {fixture.setup.substitutions && (
          <p className="mx-auto max-w-5xl px-4 py-2">
            {t("seasonSubLimit", { count: fixture.setup.substitutions.maxSubs })}{" "}
            {fixture.setup.substitutions.keeperOnlyExtra
              ? t("seasonSubKeeperExtra")
              : fixture.setup.substitutions.maxWindows != null
                ? t("seasonSubWindows", { count: fixture.setup.substitutions.maxWindows })
                : null}
          </p>
        )}
        <MatchProgramme
          coachSide={fixture.coachSide}
          home={home}
          away={away}
          crests={crests}
          referee={driver.events.find((e) => e.kind === "referee")?.refStyle ?? null}
          weather={driver.events.find((e) => e.kind === "weather")?.weather ?? null}
          backLabel={t("seasonReturn")}
          onBack={() => onReturn(null)}
          onKickOff={() => dispatch({ type: "kickOff" })}
        />
      </>
    );
  if (phase === "summary" && driver.result != null) {
    const coach = fixture.setup[fixture.coachSide];
    return (
      <MatchSummary
        homeName={home.name}
        awayName={away.name}
        score={driver.result.score}
        decisions={driver.answers}
        coachMoves={moves}
        roster={[...coach.players, ...(coach.bench ?? [])]}
        seed={seed}
        shareCode={null}
        cardData={null}
        locale={locale}
        crests={crests}
        newMatchLabel={t("seasonReturn")}
        onNewMatch={() => onReturn(driver.result)}
      />
    );
  }
  return (
    <MatchLive
      coachSide={fixture.coachSide}
      model={model}
      teams={{ home, away }}
      pending={driver.pending}
      holdAt={driver.pending?.minute}
      captaincies={captaincies}
      referees={referees}
      crests={crests}
      onAnswer={driver.answer}
      onCoachMove={(a) => setMoves((prior) => [...prior, a])}
      onFullTime={() => {
        if (driver.result != null) dispatch({ type: "fullTime" });
      }}
    />
  );
}
