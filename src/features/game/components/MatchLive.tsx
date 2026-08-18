"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { armbandAt, rankCaptains } from "@/features/game/domain/captaincy";
import { decadeSpan } from "@/features/game/domain/matchup";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { answerFor, benchLabel, subOfferOf, type SubMode } from "@/features/game/view/bench-state";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import { lineupAt } from "@/features/game/view/lineup-state";
import type { MatchViewModel, ViewEvent } from "@/features/game/view/match-view-model";
import { OVERLAY_KINDS } from "@/features/game/view/match-view-model";
import { scoreAt } from "@/features/game/view/score";
import { prefersReducedMotion } from "@/utils/motion";
import { BenchDialog } from "./BenchDialog";
import { LivePitch, type Pip } from "./LivePitch";
import { TeamSheets, type SheetRow } from "./TeamSheets";

/**
 * ⚠️ Lifted VERBATIM from `MatchView`, not re-derived. This clock is what protects the
 * VAR drama: a decision's event snapshot can legitimately run a minute AHEAD of itself,
 * so the cursor is the only thing standing between that and a goal being chalked off
 * before the crowd has finished celebrating it.
 */
const TICK_MS = 280;
const DWELL_MS = 2500;
const DWELL_FLOOR = 1500;
const SPEEDS = [1, 2, 4] as const;

/** Seconds an amber "change available" window stays open before it resolves itself. */
const DECISION_LIMIT = 20;

interface Props {
  model: MatchViewModel;
  /** The source teams — the only place the formation and the seasons survive. */
  teams: { home: GameTeam; away: GameTeam };
  /** Minute the clock must not advance past, because a decision is waiting there. */
  holdAt?: number;
  pending: MatchDecision | null;
  /** playerId → real captaincies, narrowed to this club at build time. */
  captaincies: Record<number, number>;
  referee: RefereeStyle | null;
  weather: Weather | null;
  onAnswer: (a: DecisionAnswer) => void;
}

const REFEREE_KEY: Record<RefereeStyle, string> = {
  strict: "refereeStrict",
  lenient: "refereeLenient",
  "crowd-influenced": "refereeCrowdInfluenced",
};
const WEATHER_KEY: Record<Weather, string> = {
  clear: "weatherClear",
  rain: "weatherRain",
  "heavy-rain": "weatherHeavyRain",
  wind: "weatherWind",
  snow: "weatherSnow",
};

/** How loudly a line is printed. A goal shouts; a half-chance recedes. */
function weightOf(kind: ViewEvent["kind"]): "loud" | "mid" | "quiet" {
  if (kind === "goal") return "loud";
  if (kind === "card" || kind === "penalty" || kind === "var" || kind === "substitution")
    return "mid";
  return "quiet";
}

/**
 * The catalog's lines end with a trailing `(NN')`.
 *
 * ⚠️ The feed prints the minute in its OWN column, so the suffix would render it twice.
 * Stripped once, here, rather than forking every catalog entry.
 */
const stripMinuteSuffix = (s: string) => s.replace(/\s*\(\d+'\)\s*$/, "");

/**
 * TASK-1810 — `?phase=live`, the split feed (owner's pick: concept 02).
 *
 * Scoreboard across the top; pitch left and commentary right, stretched to the same row
 * height; team sheets beneath; and the Bench as an ordinary control that turns amber when
 * a change is available.
 *
 * ⛔ Nothing appears on screen uninvited. The shipped `DecisionPrompt` is not rendered on
 * this screen at all.
 */
export function MatchLive({
  model,
  teams,
  holdAt,
  pending,
  captaincies,
  referee,
  weather,
  onAnswer,
}: Props) {
  const t = useTranslations("game");
  const tRoot = useTranslations();
  const reduced = prefersReducedMotion();

  const ceiling = holdAt != null ? Math.min(holdAt, model.lastMinute) : model.lastMinute;
  const [minute, setMinute] = useState(reduced ? ceiling : 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [mode, setMode] = useState<SubMode>("auto");
  const [benchOpen, setBenchOpen] = useState(false);

  const lastMinute = ceiling;
  /** Stopped by a hold rather than by the viewer, so the clock may restart itself. */
  const held = useRef(false);

  // ---- the clock, lifted from MatchView ----
  useEffect(() => {
    if (!playing || reduced) return;
    if (minute >= lastMinute) {
      if (holdAt != null) held.current = true;
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
  }, [playing, reduced, minute, speed, model.events, lastMinute, holdAt]);

  useEffect(() => {
    if (reduced || !held.current || minute >= lastMinute) return;
    held.current = false;
    setPlaying(true);
  }, [reduced, minute, lastMinute]);

  const started = useRef(false);
  useEffect(() => {
    if (!reduced && !started.current) {
      started.current = true;
      setPlaying(true);
    }
  }, [reduced]);

  // ---- decisions ----
  const offer = subOfferOf(pending);
  const amber = benchLabel(offer) === "available";

  /**
   * Resolve a decision nobody answered.
   *
   * ⛔ EVERY decision must be answered or the generator hangs. An offer with nothing
   * available is answered AT ONCE, so the clock never holds for it — a sub-offer is
   * raised every single minute of the window, and a 20-second wait on each would stall
   * the match for minutes of real time.
   *
   * ⚠️ Only a genuine "change available" opens the amber window, and its expiry answer is
   * the one thing the two modes disagree about.
   */
  useEffect(() => {
    if (pending == null || benchOpen) return;
    if (!amber) {
      onAnswer(answerFor(pending, mode));
      return;
    }
    const id = window.setTimeout(() => onAnswer(answerFor(pending, mode)), DECISION_LIMIT * 1000);
    return () => window.clearTimeout(id);
  }, [pending, benchOpen, amber, mode, onAnswer]);

  // ---- what is on screen at this minute ----
  const shown = useMemo(
    () => model.events.filter((e) => e.minute <= minute),
    [model.events, minute],
  );
  const { home: homeScore, away: awayScore } = scoreAt(model.events, minute);

  const homeLineup = useMemo(
    () => lineupAt(model.home, model.events, "home", minute),
    [model.home, model.events, minute],
  );
  const awayLineup = useMemo(
    () => lineupAt(model.away, model.events, "away", minute),
    [model.away, model.events, minute],
  );

  // ---- captains ----
  const counts = useMemo(
    () => new Map(Object.entries(captaincies).map(([k, v]) => [Number(k), v])),
    [captaincies],
  );
  const captaincy = useMemo(
    () =>
      rankCaptains(
        model.home.players.map((p) => ({ playerId: p.playerId, rating: p.rating ?? 0 })),
        counts,
      ),
    [model.home.players, counts],
  );
  const offPitch = useMemo(
    () =>
      new Set(homeLineup.roster.filter((r) => !r.onPitch).map((r) => r.player.playerId)),
    [homeLineup],
  );
  const armband = armbandAt(captaincy, offPitch);

  /**
   * The handover line (spec §3.5).
   *
   * ⛔ Emitted by the VIEW, never pushed into `MatchEvent[]`. The engine must not learn
   * that a human is coaching — that is the determinism rule the whole interruptible-engine
   * arc rests on.
   */
  const handover = useMemo(() => {
    if (captaincy.captain == null || !offPitch.has(captaincy.captain) || armband == null) {
      return null;
    }
    const left = shown.find(
      (e) =>
        e.side === "home" &&
        e.playerId === captaincy.captain &&
        (e.kind === "substitution" || (e.kind === "card" && e.card === "red")),
    );
    const name = model.home.players.find((p) => p.playerId === armband)?.name;
    if (left == null || name == null) return null;
    return { minute: left.minute, name };
  }, [captaincy.captain, offPitch, armband, shown, model.home.players]);

  // ---- the feed, newest first ----
  type Line = { minute: number; text: string; weight: "loud" | "mid" | "quiet"; id: string };
  const lines: Line[] = useMemo(() => {
    const out: Line[] = shown.map((e, i) => ({
      minute: e.minute,
      // ⛔ commentaryArgs, NEVER ref.values. The catalog interpolates {homeScoreFmt} and
      // {minuteFmt}, which that bridge derives; substituting the raw values leaves every
      // scoreline a bare dash — "…buries it. –".
      text: stripMinuteSuffix(tRoot(e.commentary.key, commentaryArgs(e.commentary as CommentaryRef))),
      weight: weightOf(e.kind),
      id: `e${i}`,
    }));
    if (handover != null) {
      out.push({
        minute: handover.minute,
        text: tRoot("commentary.armbandHandover", { name: handover.name }),
        weight: "mid",
        id: "armband",
      });
    }
    return out.sort((a, b) => b.minute - a.minute || b.id.localeCompare(a.id));
  }, [shown, tRoot, handover]);

  // ---- pitch + sheets ----
  const pipsOf = (lineup: ReturnType<typeof lineupAt>, band: number | null): (Pip | null)[] =>
    lineup.slots.map((sl) =>
      sl == null
        ? null
        : {
            player: sl,
            booked: lineup.badges.get(sl.playerId)?.yellow === true,
            captain: band != null && sl.playerId === band,
          },
    );

  const sheetOf = (lineup: ReturnType<typeof lineupAt>, side: "home" | "away", band: number | null): SheetRow[] =>
    lineup.roster.map((r) => ({
      player: r.player,
      captain: band != null && r.player.playerId === band,
      onPitch: r.onPitch,
      own: shown.filter((e) => e.side === side && e.playerId === r.player.playerId),
    }));

  /**
   * The sheet's caption: shape, the decade the XI is drawn from, and the captain.
   *
   * ⚠️ Built from the real `GameTeam`, not the view model. `ViewSideTeam` carries neither
   * the formation nor a season — `PitchPlayer` drops both — so the caption is the one
   * thing on this screen that genuinely needs the source team.
   */
  const captionOf = (side: "home" | "away", band: number | null) => {
    const team = side === "home" ? teams.home : teams.away;
    const span = decadeSpan(team);
    const name = band != null ? team.players.find((p) => p.playerId === band)?.name : undefined;
    return t("liveSheetCaption", {
      shape: team.formation.name,
      first: span.first,
      last: span.last,
      captain: name != null ? t("liveCaptainIs", { name }) : t("liveNoCaptain"),
    });
  };

  const atEnd = minute >= lastMinute;

  return (
    <div className="lg-root lg-live">
      {/* ---- scoreboard ---- */}
      <header className="lg-board">
        <div className="lg-board-main">
          <span className="lg-board-team lg-home">{model.home.name}</span>
          <span className="lg-board-score">
            <span className="lg-home">{homeScore}</span>
            <span className="lg-board-dash">–</span>
            <span className="lg-away">{awayScore}</span>
          </span>
          <span className="lg-board-team lg-away">{model.away.name}</span>
        </div>
        <div className="lg-board-meta">
          <span className="lg-clock">
            {minute}
            {"'"}
          </span>
          {referee != null ? <span className="lg-chip">{t(REFEREE_KEY[referee])}</span> : null}
          {weather != null ? <span className="lg-chip">{t(WEATHER_KEY[weather])}</span> : null}
        </div>
      </header>

      {/* ---- the split: pitch left, comments right ---- */}
      {/* ⚠️ `align-items: stretch` does NOT equalise these — the feed's own content grows
          the row. The feed is taken OUT of flow inside a relative pane, so the pitch's
          aspect-ratio alone sets the height. */}
      <div className="lg-split">
        <div className="lg-split-pitch">
          <LivePitch
            home={pipsOf(homeLineup, armband)}
            away={pipsOf(awayLineup, null)}
            label={t("livePitchAria")}
          />
        </div>
        <div className="lg-split-feed">
          <div className="lg-feed-pane">
            <p className="lg-feed-title">{t("liveFeed")}</p>
            <ul className="lg-feed" role="log" aria-label={t("commentaryFeedAria")} aria-live="off">
              {lines.map((l) => (
                <li key={l.id} className={`lg-line lg-line-${l.weight}`}>
                  <span className="lg-line-min">
                    {l.minute}
                    {"'"}
                  </span>
                  <span className="lg-line-text">{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ---- controls ---- */}
      <div className="lg-controls">
        {!reduced ? (
          <>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={playing}
              className="lg-ghost"
              disabled={atEnd}
            >
              {playing ? t("pause") : t("play")}
            </button>
            <div role="group" aria-label={t("speedAria")} className="lg-speeds">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={`lg-speed${speed === s ? " lg-speed-on" : ""}`}
                >
                  {s}
                  {"×"}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {/* ⛔ ALWAYS present, and the SAME button turns amber. No new panel appears. */}
        <button
          type="button"
          onClick={() => setBenchOpen(true)}
          className={`lg-benchbtn${amber ? " lg-benchbtn-on" : ""}`}
        >
          {amber ? t("benchAvailable") : t("benchOpen")}
        </button>

        <label className="lg-manual">
          <input
            type="checkbox"
            checked={mode === "manual"}
            onChange={(e) => setMode(e.target.checked ? "manual" : "auto")}
          />
          <span>{t("benchManualOnly")}</span>
          <span className="lg-manual-hint">{t("benchManualHint")}</span>
        </label>
      </div>

      <TeamSheets
        home={sheetOf(homeLineup, "home", armband)}
        away={sheetOf(awayLineup, "away", null)}
        homeCaption={captionOf("home", armband)}
        awayCaption={captionOf("away", null)}
        title={t("lineups")}
      />

      {benchOpen ? (
        <BenchDialog
          legalOff={offer?.legalOff ?? []}
          legalOn={offer?.legalOn ?? []}
          suggestedOff={offer?.suggestedOff}
          captainId={armband}
          onClose={() => setBenchOpen(false)}
          onConfirm={(off, on) => {
            setBenchOpen(false);
            if (pending != null) {
              onAnswer({ kind: "sub-offer", minute: pending.minute, side: pending.side, off, on });
            }
          }}
        />
      ) : null}
    </div>
  );
}
