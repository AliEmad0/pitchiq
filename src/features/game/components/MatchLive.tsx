"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { armbandAt, rankCaptains } from "@/features/game/domain/captaincy";
import { mulberry32 } from "@/features/game/domain/rng";
import { decadeSpan } from "@/features/game/domain/matchup";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import type { GameTeam } from "@/features/game/domain/team";
import {
  answerFor,
  benchLabel,
  emergencyKeeperOf,
  subOfferOf,
  type SubMode,
} from "@/features/game/view/bench-state";
import {
  createCoachState,
  requestLapsed,
  requestSubstitution,
  shouldOpenPrompt,
  spendRequest,
} from "@/features/game/view/coach-policy";
import { SUB_WINDOW_END, SUB_WINDOW_START } from "@/features/game/domain/squad";
import { commentaryArgs } from "@/features/game/view/commentary-view";
import { lineupAt } from "@/features/game/view/lineup-state";
import type {
  MatchViewModel,
  ViewEvent,
  ViewSideTeam,
} from "@/features/game/view/match-view-model";
import { OVERLAY_KINDS } from "@/features/game/view/match-view-model";
import { overlayFor } from "@/features/game/view/overlay-event";
import { scoreAt } from "@/features/game/view/score";
import { prefersReducedMotion } from "@/utils/motion";
import {
  type SimState,
  buildUp,
  frameFromSim,
  goalKick,
  initSim,
  restSim,
  stepSim,
} from "@/features/game/domain/pitch-sim";
import { BenchDialog } from "./BenchDialog";
import { ClubCrest } from "./ClubCrest";
import { EventOverlay } from "./EventOverlay";
import { MatchPitch } from "./MatchPitch";
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
  /**
   * The man who wears the armband whatever the counts say (Captain's Draft, TASK-1810).
   *
   * ⚠️ HOME only. The icon is the coach's, so the opponent's sheet still ranks on real
   * captaincies — passing it to both would put his armband on a side he is not playing for.
   */
  forcedCaptainId?: number;
  /**
   * Real Premier League referees, from the committed fixtures.
   *
   * ⚠️ The NAME is cosmetic and picked from the match seed; the engine's `RefereeStyle` is
   * what actually governs bookings. Naming the official reads far better than labelling
   * him "STRICT", which is what the scoreboard used to show.
   */
  referees: readonly string[];
  /**
   * The two clubs' ids, for their crests (owner, 2026-08-20).
   *
   * ⚠️ NOT derivable from the model. `model.home.name` is the LABEL "Your XI", and the XI
   * itself spans thirty years of one club — the identity lives in the route's club param
   * and in the rival the coach picked, so it has to be handed down.
   */
  crests?: { home: number | null; away: number | null };
  onAnswer: (a: DecisionAnswer) => void;
  /**
   * The coach made this change himself, through the bench.
   *
   * ⚠️ Distinct from `onAnswer`, which fires for EVERY decision including the ones the
   * engine answers for him. Only what he chose belongs on the full-time screen.
   */
  onCoachMove?: (a: DecisionAnswer) => void;
  /** Leave the match. Rendered only once the whistle has actually gone. */
  onFullTime?: () => void;
}

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
  forcedCaptainId,
  referees,
  crests,
  onAnswer,
  onCoachMove,
  onFullTime,
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
  /**
   * Whether the coach has ASKED for a change (`view/coach-policy.ts`).
   *
   * ⚠️ A request is not a substitution. Play does not stop because a manager wants it to,
   * so the request waits for the next stoppage — or `REQUEST_GRACE` minutes, because the
   * engine emits no ball-out-of-play event and without a bound the button looks broken.
   */
  const [coach, setCoach] = useState(createCoachState());

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

  /**
   * ⚠️ Reduced motion must FOLLOW the ceiling, not merely start at it.
   *
   * `minute` is seeded from `ceiling` once, and the clock effect above returns early when
   * `reduced` — so without this the screen sticks at whatever minute the FIRST decision
   * happened to land on and never shows the rest of the match. A viewer who has asked for
   * no animation wants the whole match as it arrives, not a frozen early frame.
   *
   * Found by measurement: the live test intermittently had no half-time line in the feed,
   * because the first decision can be raised before minute 45.
   */
  useEffect(() => {
    if (!reduced) return;
    setMinute(lastMinute);
  }, [reduced, lastMinute]);

  const started = useRef(false);
  useEffect(() => {
    if (!reduced && !started.current) {
      started.current = true;
      setPlaying(true);
    }
  }, [reduced]);

  /**
   * The pitch movement — ⭐ the SAME simulation `/game/daily` runs.
   *
   * Owner's instruction after two rejected bespoke attempts: make it move like the shipped
   * broadcast pitch. So this drives `domain/pitch-sim.ts` exactly as `MatchView` does
   * rather than keeping a second, differently-behaving model alongside it. One beat per
   * minute; a real goal injects a celebration, and the beat BEFORE it builds up with the
   * scoring side already attacking so the goal reads as earned rather than teleported.
   */
  const [sim, setSim] = useState<SimState>(() => (reduced ? restSim() : initSim()));
  const rngRef = useRef<() => number>(mulberry32(model.seed));
  const lastSimMinute = useRef(0);

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
      // ⚠️ Only at REAL full time. Resetting at a segment boundary would freeze the pitch
      // mid-match every time a decision came up.
      if (holdAt == null && minute >= lastMinute) return restSim();
      if (goalNext?.side) return buildUp(goalNext.side, goalNext.scorerSlot ?? 10);
      return stepSim(s, ctx, rngRef.current);
    });
  }, [minute, reduced, model.events, model.home.players, model.away.players, lastMinute, holdAt]);

  const atEnd = minute >= lastMinute;

  /**
   * The whistle has actually gone.
   *
   * ⚠️ Distinct from `atEnd`, which is only "as far as the engine has been driven". A hold
   * for a pending decision also reaches the ceiling, and the match is very much still on.
   */
  const finished = holdAt == null && atEnd;

  // ---- decisions ----
  const offer = subOfferOf(pending);
  /**
   * The keeper is off and nobody can come on — somebody has to go in goal.
   *
   * ⚠️ Treated as amber so it is NOT answered away instantly. This is the one decision the
   * coach cannot be allowed to miss silently: declining it leaves the goal unguarded for
   * the rest of the match.
   */
  const emergency = emergencyKeeperOf(pending);
  const amber = benchLabel(offer) === "available" || emergency != null;
  /** The coach asked, and this offer is the first chance to honour it. */
  const wantsOpen = offer != null && shouldOpenPrompt(coach, offer);
  /** He has asked and is still waiting for a break in play. */
  const awaiting = coach.requestedAt != null && !benchOpen;
  /**
   * Substitutions are open at all (`domain/squad.ts`).
   *
   * ⚠️ Read from the engine's OWN window constants, never re-stated. The button used to
   * say "waiting for a break in play" outside it, which is not what was happening: nothing
   * was coming, because the engine raises no offer at all before 55' or after 85'.
   */
  const windowOpen = minute >= SUB_WINDOW_START && minute <= SUB_WINDOW_END;

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
  /**
   * Honour a standing request at the next stoppage.
   *
   * ⚠️ This panel is INVITED — he pressed Bench and is waiting for it — so it does not
   * break the "nothing on screen uninvited" rule the redesign exists for.
   *
   * ⛔ Declared BEFORE the auto-answer effect below, and that effect skips while
   * `wantsOpen`. Effects run in order, so the offer would otherwise be answered away in
   * the same commit and the dialog would open onto nothing.
   */
  useEffect(() => {
    if (!wantsOpen || benchOpen) return;
    setBenchOpen(true);
    // Opening spends the opportunity: the prompt cannot be re-opened over and over
    // within one window to shop around.
    setCoach(spendRequest());
  }, [wantsOpen, benchOpen]);

  /**
   * Drop a request nothing can honour (owner-reported, 2026-08-20).
   *
   * ⛔ Without this the Bench button is disabled for the rest of the match. See
   * `view/coach-policy.ts#requestLapsed` for why a late request can never be answered.
   */
  useEffect(() => {
    if (!requestLapsed(coach, minute, { finished, hasOffer: offer != null })) return;
    setCoach(createCoachState());
  }, [coach, minute, finished, offer]);

  useEffect(() => {
    if (pending == null || benchOpen || wantsOpen) return;
    if (!amber) {
      onAnswer(answerFor(pending, mode));
      return;
    }
    const id = window.setTimeout(() => onAnswer(answerFor(pending, mode)), DECISION_LIMIT * 1000);
    return () => window.clearTimeout(id);
  }, [pending, benchOpen, wantsOpen, amber, mode, onAnswer]);

  // ---- what is on screen at this minute ----
  const shown = useMemo(
    () => model.events.filter((e) => e.minute <= minute),
    [model.events, minute],
  );
  const { home: homeScore, away: awayScore } = scoreAt(model.events, minute);

  /**
   * The big-moment banner over the pitch (owner, 2026-08-20) — the SAME one `/game/draft`
   * shows, from the same derivation in `view/overlay-event.ts`.
   *
   * ⚠️ Built from the last event the CLOCK has reached, never from `model.events.at(-1)`.
   * The model runs ahead of the clock during a live match — a decision's snapshot can carry
   * the VAR verdict for a goal the crowd is still celebrating — so reading the raw list
   * would announce a goal before it is scored and chalk it off in the same breath.
   */
  const overlay = reduced
    ? undefined
    : overlayFor(shown[shown.length - 1], minute, { home: model.home, away: model.away });

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
        forcedCaptainId,
      ),
    [model.home.players, counts, forcedCaptainId],
  );
  const offPitch = useMemo(
    () => new Set(homeLineup.roster.filter((r) => !r.onPitch).map((r) => r.player.playerId)),
    [homeLineup],
  );
  const armband = armbandAt(captaincy, offPitch);

  /**
   * The opponent's captain — the SAME rule, applied to the other sheet.
   *
   * ⛔ Owner-reported, 2026-08-19: the away caption read "no recorded captain" in every
   * single match, because `null` was passed for that side rather than because the rule had
   * found nothing. `rankCaptains` falls back to rating and only ever returns null for an
   * EMPTY XI, so "no recorded captain" was unreachable in practice and read as a bug.
   *
   * ⚠️ The away side is drafted from the same club pool, so the build-time `captaincies`
   * map covers it too — real armbands rank ahead of ratings on both sheets.
   */
  const awayCaptaincy = useMemo(
    () =>
      rankCaptains(
        model.away.players.map((p) => ({ playerId: p.playerId, rating: p.rating ?? 0 })),
        counts,
      ),
    [model.away.players, counts],
  );
  const awayOffPitch = useMemo(
    () => new Set(awayLineup.roster.filter((r) => !r.onPitch).map((r) => r.player.playerId)),
    [awayLineup],
  );
  const awayArmband = armbandAt(awayCaptaincy, awayOffPitch);

  /**
   * The handover line (spec §3.5).
   *
   * ⛔ Emitted by the VIEW, never pushed into `MatchEvent[]`. The engine must not learn
   * that a human is coaching — that is the determinism rule the whole interruptible-engine
   * arc rests on.
   */
  const handover = useMemo(() => {
    if (armband == null) return null;
    const order = captaincy.order ?? [];
    /**
     * Everyone ranked ahead of the current wearer — and every one of them is off the
     * pitch, because `armbandAt` returns the FIRST man in the order who is still on it.
     */
    const ahead = order.slice(0, order.indexOf(armband));
    if (ahead.length === 0) return null; // he has worn it since kick-off
    /**
     * ⚠️ The LATEST of their exits, not the captain's (TASK-1838). Once the armband can
     * pass a third time, "the minute the captain left" is the minute the VICE took it —
     * so a line naming the third man carried the second man's minute.
     */
    let minute: number | null = null;
    for (const e of shown) {
      if (e.side !== "home" || e.playerId == null || !ahead.includes(e.playerId)) continue;
      if (e.kind !== "substitution" && !(e.kind === "card" && e.card === "red")) continue;
      if (minute == null || e.minute > minute) minute = e.minute;
    }
    const name = model.home.players.find((p) => p.playerId === armband)?.name;
    if (minute == null || name == null) return null;
    return { minute, name };
  }, [captaincy.order, armband, shown, model.home.players]);

  // ---- the feed, newest first ----
  type Line = { minute: number; text: string; weight: "loud" | "mid" | "quiet"; id: string };
  const lines: Line[] = useMemo(() => {
    const out: Line[] = shown.map((e, i) => ({
      minute: e.minute,
      // ⛔ commentaryArgs, NEVER ref.values. The catalog interpolates {homeScoreFmt} and
      // {minuteFmt}, which that bridge derives; substituting the raw values leaves every
      // scoreline a bare dash — "…buries it. –".
      text: stripMinuteSuffix(
        tRoot(e.commentary.key, commentaryArgs(e.commentary as CommentaryRef)),
      ),
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
  /**
   * Per-slot state for the pitch — the same shape `MatchView` feeds it.
   *
   * ⚠️ From `lineupAt`, so a dismissal really removes a dot and a substitute really takes
   * the shape his predecessor held. The map and the team sheet can never disagree about
   * who is on the pitch.
   */
  const slotStatus = (lineup: ReturnType<typeof lineupAt>) =>
    lineup.slots.map((sl) =>
      sl == null
        ? null
        : { number: sl.number, booked: lineup.badges.get(sl.playerId)?.yellow === true },
    );

  const frame = frameFromSim(model.home.players, model.away.players, sim);

  const sheetOf = (
    lineup: ReturnType<typeof lineupAt>,
    side: "home" | "away",
    band: number | null,
  ): SheetRow[] =>
    lineup.roster.map((r) => ({
      player: r.player,
      captain: band != null && r.player.playerId === band,
      onPitch: r.onPitch,
      // ⚠️ The tallies come from `lineupAt`, which already counts goals, assists, cards
      // and the substitution NUMBER. Re-deriving them by filtering events on `playerId`
      // silently drops every assist — an assist rides on the GOAL event under
      // `assistPlayerId`, so the scorer's row would claim it and the provider's row would
      // show nothing at all.
      badges: r.badges,
      injured: shown.some(
        (e) => e.kind === "injury" && e.side === side && e.playerId === r.player.playerId,
      ),
    }));

  /**
   * The substitutes still sitting down (owner, 2026-08-20).
   *
   * ⛔ NOT `lineup.roster` — that appends a substitute the moment he comes ON, so the bench
   * was invisible until it had been spent. This is the squad's bench minus everyone the
   * roster already shows, which is exactly "who is still available".
   */
  const benchOf = (lineup: ReturnType<typeof lineupAt>, team: ViewSideTeam): SheetRow[] => {
    const shown = new Set(lineup.roster.map((r) => r.player.playerId));
    return team.bench
      .filter((p) => !shown.has(p.playerId))
      .map((player) => ({
        player,
        captain: false,
        // ⚠️ Deliberately `false`: an unused substitute is not on the pitch, and the row
        // styling that says so is the honest one.
        onPitch: false,
        badges: { goals: 0, assists: 0, yellow: false, red: false },
        injured: false,
      }));
  };

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

  const redsOf = (lineup: ReturnType<typeof lineupAt>) =>
    [...lineup.badges.values()].filter((b) => b.red).length;
  const homeReds = redsOf(homeLineup);
  const awayReds = redsOf(awayLineup);

  /**
   * Which official is taking charge — the NAME.
   *
   * ⚠️ Drawn from the match seed, never `Math.random()`, so a replayed match keeps the same
   * referee. Offset from the seed the engine uses so the two streams cannot correlate.
   */
  const refName =
    referees.length === 0
      ? null
      : (referees[Math.floor(mulberry32(model.seed + 1)() * referees.length)] ?? null);

  return (
    <div className="lg-root lg-live">
      {/* ---- scoreboard ---- */}
      <header className="lg-board">
        <div className="lg-board-main">
          <span className="lg-board-team lg-home">
            <ClubCrest teamId={crests?.home} size={30} className="lg-board-crest" />
            {model.home.name}
            {/* A dismissal belongs on the scoreboard — it is the single biggest thing that
                has happened to a side, and burying it in the feed hides it. */}
            {homeReds > 0 ? (
              <span className="lg-board-red" title={t("badgeRed")}>
                {homeReds > 1 ? `${homeReds}×` : ""}
              </span>
            ) : null}
          </span>
          <span className="lg-board-score">
            <span className="lg-home">{homeScore}</span>
            <span className="lg-board-dash">–</span>
            <span className="lg-away">{awayScore}</span>
          </span>
          <span className="lg-board-team lg-away">
            {awayReds > 0 ? (
              <span className="lg-board-red" title={t("badgeRed")}>
                {awayReds > 1 ? `${awayReds}×` : ""}
              </span>
            ) : null}
            {model.away.name}
            <ClubCrest teamId={crests?.away} size={30} className="lg-board-crest" />
          </span>
        </div>
        {/* ⚠️ The SAME `1fr auto 1fr` tracks as the scoreline above. Both outer columns
            take equal space, so the middle track is centred whatever it contains — which
            puts the clock exactly under the score's dash. Centring this row's contents as
            a group instead would centre LIVE + clock + referee together, leaving the clock
            off to one side. */}
        <div className="lg-board-meta">
          <span className="lg-livetag" aria-hidden={finished ? "true" : undefined}>
            {finished ? null : <span className="lg-livetag-dot" />}
            <span className="lg-livetag-word">{finished ? t("playFullTime") : t("live")}</span>
          </span>
          <span className="lg-clock" data-testid="live-clock">
            {minute}
            {"'"}
          </span>
          {/* ⚠️ The referee's NAME, not his style. `refereeStyle` still governs bookings —
              it is simply not what a scoreboard should say. The weather chip is gone; the
              pre-match programme still explains what both conditions DO. */}
          {refName != null ? <span className="lg-chip">{refName}</span> : null}
        </div>
      </header>

      {/* ---- the split: pitch left, comments right ---- */}
      {/* ⚠️ `align-items: stretch` does NOT equalise these — the feed's own content grows
          the row. The feed is taken OUT of flow inside a relative pane, so the pitch's
          aspect-ratio alone sets the height. */}
      <div className="lg-split">
        <div className="lg-split-pitch">
          <MatchPitch
            frame={frame}
            homeNumbers={model.home.players.map((p) => p.number)}
            awayNumbers={model.away.players.map((p) => p.number)}
            homeSlots={slotStatus(homeLineup)}
            awaySlots={slotStatus(awayLineup)}
            animate={!reduced}
            label={t("livePitchAria")}
          />
          {overlay ? <EventOverlay event={overlay} /> : null}
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
      {/* ⚠️ The whistle button lives INSIDE this screen, not in the container.
          It has to look exactly like Kick off — full width, the one --cta on the page —
          and outside `.lg-root` it would inherit none of the theme's tokens. */}
      {finished && onFullTime != null ? (
        <button type="button" onClick={onFullTime} className="lg-kick lg-kick-end">
          {t("playFullTime")}
        </button>
      ) : null}

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
          onClick={() => {
            // A change is live right now — open it. Otherwise ASK, and the dialog opens
            // itself at the next break in play.
            if (amber) {
              setBenchOpen(true);
              setCoach(spendRequest());
              return;
            }
            setCoach((c) => requestSubstitution(c, minute));
          }}
          data-testid="bench-button"
          disabled={awaiting || (!windowOpen && !amber && emergency == null)}
          className={`lg-benchbtn${amber ? " lg-benchbtn-on" : ""}${awaiting ? " lg-benchbtn-wait" : ""}`}
        >
          {emergency != null
            ? t("benchKeeperNeeded")
            : amber
              ? t("benchAvailable")
              : awaiting
                ? t("benchRequested")
                : windowOpen
                  ? t("benchOpen")
                  : t("benchClosed")}
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
        away={sheetOf(awayLineup, "away", awayArmband)}
        homeBench={benchOf(homeLineup, model.home)}
        awayBench={benchOf(awayLineup, model.away)}
        benchTitle={t("liveSubs")}
        homeCaption={captionOf("home", armband)}
        awayCaption={captionOf("away", awayArmband)}
        title={t("lineups")}
      />

      {benchOpen ? (
        <BenchDialog
          legalOff={offer?.legalOff ?? []}
          legalOn={offer?.legalOn ?? []}
          suggestedOff={offer?.suggestedOff}
          captainId={armband}
          emergency={
            emergency == null
              ? undefined
              : {
                  candidates: emergency.emergencyKeepers,
                  onChoose: (playerId) => {
                    setBenchOpen(false);
                    const move: DecisionAnswer = {
                      kind: "dismissal",
                      minute: emergency.minute,
                      side: emergency.side,
                      inGoal: playerId,
                    };
                    onAnswer(move);
                    onCoachMove?.(move);
                  },
                }
          }
          onClose={() => setBenchOpen(false)}
          onConfirm={(off, on) => {
            setBenchOpen(false);
            if (pending != null) {
              const move: DecisionAnswer = {
                kind: "sub-offer",
                minute: pending.minute,
                side: pending.side,
                off,
                on,
              };
              onAnswer(move);
              onCoachMove?.(move);
            }
          }}
        />
      ) : null}
    </div>
  );
}
