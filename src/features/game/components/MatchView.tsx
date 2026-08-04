"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { winProbability } from "@/features/game/domain/win-probability";
import type { MatchViewModel } from "@/features/game/view/match-view-model";
import { prefersReducedMotion } from "@/utils/motion";
import { CommentaryCaption } from "./CommentaryCaption";
import { MatchPitch } from "./MatchPitch";
import { Scoreboard } from "./Scoreboard";
import { WinProbBar } from "./WinProbBar";

const FULL_TIME = 90;
const TICK_MS = 280;

export function MatchView({ model, locale }: { model: MatchViewModel; locale: string }) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [minute, setMinute] = useState(reduced ? FULL_TIME : 0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = setInterval(() => {
      setMinute((m) => {
        if (m >= FULL_TIME) {
          setPlaying(false);
          return m;
        }
        return m + 1;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, reduced]);

  // autoplay once on mount when motion is allowed
  const started = useRef(false);
  useEffect(() => {
    if (!reduced && !started.current) {
      started.current = true;
      setPlaying(true);
    }
  }, [reduced]);

  const shown = useMemo(() => model.events.filter((e) => e.minute <= minute), [model.events, minute]);
  const current = shown[shown.length - 1] ?? model.events[0];
  const homeScore = shown.filter((e) => e.kind === "goal" && e.side === "home").length;
  const awayScore = shown.filter((e) => e.kind === "goal" && e.side === "away").length;
  const prob = winProbability({
    homePower: model.homePower,
    awayPower: model.awayPower,
    homeScore,
    awayScore,
    minute,
  });
  const pulseKey = shown.length; // changes as each event is reached → replays Glow Pulse
  const highlight =
    current?.kind === "goal" && current.side && current.scorerSlot != null
      ? { side: current.side, slot: current.scorerSlot }
      : undefined;

  const atEnd = minute >= FULL_TIME;
  const toggle = () => {
    if (atEnd) {
      setMinute(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-[#083f26] shadow-2xl">
        <div className="absolute inset-0">
          <MatchPitch home={model.home.slots} away={model.away.slots} highlight={highlight} label={t("pitchAria")} />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(4,12,8,.8),transparent_32%),linear-gradient(0deg,rgba(3,10,7,.9),transparent_40%)]" />
        <div className="absolute left-3 right-3 top-3">
          <Scoreboard
            homeAbbr={model.home.abbr}
            awayAbbr={model.away.abbr}
            home={homeScore}
            away={awayScore}
            minute={minute}
            liveLabel={t("live")}
            ariaLabel={t("scoreboardAria")}
            locale={locale}
            pulseKey={pulseKey}
          />
        </div>
        <div className="absolute bottom-16 left-3 right-3">
          <WinProbBar
            prob={prob}
            title={t("winProbability")}
            homeAbbr={model.home.abbr}
            awayAbbr={model.away.abbr}
            drawLabel={t("drawShort")}
            ariaLabel={t("winProbAria", {
              home: Math.round(prob.home * 100),
              draw: Math.round(prob.draw * 100),
              away: Math.round(prob.away * 100),
              homeName: model.home.name,
              awayName: model.away.name,
            })}
            locale={locale}
            pulseKey={pulseKey}
          />
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          {current && (
            <CommentaryCaption commentary={current.commentary} minute={current.minute} ariaLabel={t("commentaryAria")} />
          )}
        </div>
      </div>
      {!reduced && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-semibold"
          >
            {atEnd ? t("restart") : playing ? t("pause") : t("play")}
          </button>
        </div>
      )}
    </div>
  );
}
