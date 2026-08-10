"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type SimState,
  buildUp,
  frameFromSim,
  goalKick,
  initSim,
  restSim,
  stepSim,
} from "@/features/game/domain/pitch-sim";
import { mulberry32 } from "@/features/game/domain/rng";
import { winProbability } from "@/features/game/domain/win-probability";
import { OVERLAY_KINDS } from "@/features/game/view/match-view-model";
import type { MatchViewModel } from "@/features/game/view/match-view-model";
import { localizeDigits } from "@/utils/format";
import { prefersReducedMotion } from "@/utils/motion";
import { CommentaryCaption } from "./CommentaryCaption";
import { CommentaryFeed } from "./CommentaryFeed";
import { EventOverlay, type OverlayEvent } from "./EventOverlay";
import { MatchPitch } from "./MatchPitch";
import { RosterPanel } from "./RosterPanel";
import { Scoreboard } from "./Scoreboard";
import { WinProbBar } from "./WinProbBar";

/**
 * ⚠️ NOT a constant any more. Phase 1 gave matches 2-6 minutes of added time, and this
 * file kept `lastMinute = 90` — so every stoppage-time event was simulated, commentated
 * and then never shown, including the stoppage-time winners that phase existed to
 * produce. The end of the match now comes from the model.
 */
const TICK_MS = 280;
const DWELL_MS = 2500; // high-importance events hold before advancing (#5)
const DWELL_FLOOR = 1500;
const SPEEDS = [1, 2, 4] as const;

export function MatchView({ model, locale }: { model: MatchViewModel; locale: string }) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();
  const [minute, setMinute] = useState(reduced ? model.lastMinute : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [sim, setSim] = useState<SimState>(() => (reduced ? restSim() : initSim()));

  const lastMinute = model.lastMinute;
  const rngRef = useRef<() => number>(mulberry32(model.seed));
  const lastSimMinute = useRef(0);

  // Minute clock — advances, holding longer on goals/cards so the drama lands.
  useEffect(() => {
    if (!playing || reduced) return;
    if (minute >= lastMinute) {
      setPlaying(false);
      return;
    }
    const importantNow =
      minute > 0 &&
      model.events.some(
        (e) =>
          e.minute === minute &&
          (e.kind === "card" || (OVERLAY_KINDS as readonly string[]).includes(e.kind)),
      );
    const delay = importantNow ? Math.max(DWELL_FLOOR, DWELL_MS / speed) : TICK_MS / speed;
    const id = setTimeout(() => setMinute((m) => Math.min(lastMinute, m + 1)), delay);
    return () => clearTimeout(id);
  }, [playing, reduced, minute, speed, model.events, lastMinute]);

  // Ambient possession — one beat per minute. A real goal injects a celebration,
  // and the beat BEFORE it builds up with the scoring side already attacking so
  // the goal reads as earned rather than teleported.
  useEffect(() => {
    if (reduced || minute === lastSimMinute.current) return;
    lastSimMinute.current = minute;
    if (minute === 0) return;
    const ctx = { home: model.home.players, away: model.away.players };
    const goalNow = model.events.find((e) => e.minute === minute && e.kind === "goal" && e.side);
    const goalNext = model.events.find(
      (e) => e.minute === minute + 1 && e.kind === "goal" && e.side,
    );
    setSim((s) => {
      if (goalNow?.side) return goalKick(goalNow.side, goalNow.scorerSlot ?? 10);
      if (minute >= lastMinute) return restSim(); // full-time → reset to formation
      if (goalNext?.side) return buildUp(goalNext.side, goalNext.scorerSlot ?? 10);
      return stepSim(s, ctx, rngRef.current);
    });
  }, [minute, reduced, model.events, model.home.players, model.away.players, lastMinute]);

  // autoplay once on mount when motion is allowed
  const started = useRef(false);
  useEffect(() => {
    if (!reduced && !started.current) {
      started.current = true;
      setPlaying(true);
    }
  }, [reduced]);

  const shown = useMemo(
    () => model.events.filter((e) => e.minute <= minute),
    [model.events, minute],
  );
  const current = shown[shown.length - 1] ?? model.events[0];
  const feedLines = shown.slice(0, -1);
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

  const frame = useMemo(
    () => frameFromSim(model.home.players, model.away.players, sim),
    [model.home.players, model.away.players, sim],
  );
  const homeNumbers = model.home.players.map((p) => p.number);
  const awayNumbers = model.away.players.map((p) => p.number);

  // A goal or red card that just landed → a full-pitch banner while the clock holds.
  const overlayEvent: OverlayEvent | undefined = (() => {
    if (reduced || !current || minute !== current.minute || current.minute === 0 || !current.side)
      return undefined;
    const team = current.side === "home" ? model.home : model.away;
    if (current.kind === "goal" && current.scorerSlot != null) {
      const pl = team.players[current.scorerSlot];
      if (pl)
        return { kind: "goal", name: pl.name, number: pl.number, commentary: current.commentary };
    }
    if (current.kind === "card" && current.card === "red" && current.bookedSlot != null) {
      const pl = team.players[current.bookedSlot];
      if (pl)
        return {
          kind: "card",
          card: "red",
          name: pl.name,
          number: pl.number,
          commentary: current.commentary,
        };
    }
    // Phases 2-5: a penalty, a VAR overturn, an injury or a substitution all deserve
    // the pitch to stop for them.
    if (current.kind === "penalty" || current.kind === "var" || current.kind === "injury") {
      const pl = current.scorerSlot != null ? team.players[current.scorerSlot] : undefined;
      return {
        kind: current.kind,
        name: pl?.name ?? team.name,
        number: pl?.number ?? 0,
        commentary: current.commentary,
      };
    }
    if (current.kind === "substitution" && current.offSlot != null) {
      const pl = team.players[current.offSlot];
      return {
        kind: "substitution",
        name: current.subOnName ?? pl?.name ?? team.name,
        number: pl?.number ?? 0,
        commentary: current.commentary,
      };
    }
    return undefined;
  })();

  const atEnd = minute >= lastMinute;
  const toggle = () => {
    if (atEnd) {
      rngRef.current = mulberry32(model.seed);
      lastSimMinute.current = 0;
      setSim(initSim());
      setMinute(0);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Top strip — scoreboard + win-probability, above the pitch (#4). */}
      <div className="flex items-center justify-between gap-2">
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
      <div className="mt-2">
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

      <div className="relative mt-3 aspect-[14/9] overflow-hidden rounded-xl bg-[#083f26] shadow-2xl">
        <MatchPitch
          frame={frame}
          homeNumbers={homeNumbers}
          awayNumbers={awayNumbers}
          animate={!reduced}
          label={t("pitchAria")}
          locale={locale}
        />
        {overlayEvent && <EventOverlay event={overlayEvent} locale={locale} />}
      </div>

      <div className="mt-3">
        {current && (
          <CommentaryCaption
            commentary={current.commentary}
            minute={current.minute}
            ariaLabel={t("commentaryAria")}
          />
        )}
      </div>
      {feedLines.length > 0 && (
        <div className="mt-2">
          <CommentaryFeed lines={feedLines} ariaLabel={t("commentaryFeedAria")} />
        </div>
      )}

      {!reduced && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-pressed={playing}
            className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-semibold"
          >
            {atEnd ? t("restart") : playing ? t("pause") : t("play")}
          </button>
          <div
            role="group"
            aria-label={t("speedAria")}
            className="ms-auto inline-flex overflow-hidden rounded-md border border-border text-sm font-semibold"
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`px-3 py-1.5 tabular-nums ${
                  speed === s
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {localizeDigits(s, locale)}
                {"×"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <RosterPanel
          home={model.home}
          away={model.away}
          title={t("lineups")}
          ariaLabel={t("rosterAria")}
          locale={locale}
        />
      </div>
    </div>
  );
}
