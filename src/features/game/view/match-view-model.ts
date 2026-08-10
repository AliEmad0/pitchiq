import type { PlayerRole } from "@/data/schemas";
import { commentate } from "@/features/game/domain/commentary";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import type {
  GoalStyle,
  InjurySeverity,
  MatchEventKind,
  MatchResult,
  PenaltyOutcome,
  Side,
  TeamPower,
} from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { powerOf } from "@/features/game/domain/team-power";
import { type AttackZone, assignNumbers, laneOfSlot } from "./pitch-model";

/** A player placed on the pitch: formation slot enriched for display. */
export interface PitchPlayer {
  playerId: number;
  row: number;
  col: number;
  role: PlayerRole;
  name: string;
  number: number;
  rating: number | null;
}
export interface ViewSideTeam {
  name: string;
  abbr: string;
  players: PitchPlayer[];
}
/**
 * Event kinds that stop the clock for a full-pitch banner.
 *
 * Phases 2-5 added penalties, VAR overturns, injuries and substitutions; a playback
 * that pauses only for goals under-sells every one of them.
 */
export const OVERLAY_KINDS = [
  "goal",
  "penalty",
  "var",
  "injury",
  "substitution",
] as const satisfies readonly MatchEventKind[];

export interface ViewEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side;
  card?: "yellow" | "red";
  scorerSlot?: number;
  bookedSlot?: number;
  /** Where this event concentrates the attack — drives the tactical drift. */
  zone?: AttackZone;
  commentary: CommentaryRef;
  /** Set-piece and colour detail the overlay renders. */
  penaltyOutcome?: PenaltyOutcome;
  injurySeverity?: InjurySeverity;
  goalStyle?: GoalStyle;
  /** Substitution: the slot vacated, and who came on. */
  offSlot?: number;
  subOnName?: string;
}
export interface MatchViewModel {
  home: ViewSideTeam;
  away: ViewSideTeam;
  homePower: TeamPower;
  awayPower: TeamPower;
  events: ViewEvent[];
  finalScore: { home: number; away: number };
  seed: number;
  /**
   * The minute the match ACTUALLY ends, including stoppage time.
   *
   * ⚠️ The view must never assume 90. Phase 1 added 2-6 minutes of added time, and
   * `MatchView` kept a hard-coded `FULL_TIME = 90`, so every stoppage-time event was
   * simulated and commentated and then never displayed — including the stoppage-time
   * winners that phase was specifically built to produce.
   */
  lastMinute: number;
}

/** Real short codes for clubs whose first-three-letters would mislead. */
const CLUB_ABBR: Record<string, string> = {
  "Manchester United": "MUN",
  "Manchester City": "MCI",
  "Tottenham Hotspur": "TOT",
  "Nottingham Forest": "NFO",
  "Sheffield United": "SHU",
  "Sheffield Wednesday": "SHW",
  "West Ham United": "WHU",
  "West Bromwich Albion": "WBA",
  "Wolverhampton Wanderers": "WOL",
  "Newcastle United": "NEW",
  "Leeds United": "LEE",
  "Leicester City": "LEI",
  "Norwich City": "NOR",
  "Swansea City": "SWA",
  "Cardiff City": "CAR",
  "Stoke City": "STK",
  "Hull City": "HUL",
  "Brighton & Hove Albion": "BHA",
  "Crystal Palace": "CRY",
  "Aston Villa": "AVL",
  "Queens Park Rangers": "QPR",
  "Blackburn Rovers": "BLB",
  "Bolton Wanderers": "BOL",
  "Charlton Athletic": "CHA",
};

function abbrOf(name: string): string {
  if (CLUB_ABBR[name]) return CLUB_ABBR[name];
  const letters = name.replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || "TBD").toUpperCase();
}

function sideTeam(team: GameTeam): ViewSideTeam {
  const numbers = assignNumbers(
    team.formation.slots.map((slot, i) => ({
      role: slot.role,
      seed: team.players[i]?.playerId ?? i,
    })),
  );
  const players: PitchPlayer[] = team.formation.slots.map((slot, i) => {
    const p = team.players[i];
    return {
      playerId: p?.playerId ?? -1,
      ...slot,
      name: p?.name ?? "",
      number: numbers[i],
      rating: p?.ratings?.overall ?? null,
    };
  });
  return { name: team.name, abbr: abbrOf(team.name), players };
}

export function buildMatchViewModel(
  home: GameTeam,
  away: GameTeam,
  result: MatchResult,
): MatchViewModel {
  const commented = commentate(result, home, away);
  const slotOf = (team: GameTeam, playerId?: number) => {
    if (playerId == null) return undefined;
    const i = team.players.findIndex((p) => p.playerId === playerId);
    return i >= 0 ? i : undefined;
  };
  const events: ViewEvent[] = commented.map((e) => {
    const eventTeam = e.side === "home" ? home : away;
    const scorerSlot = e.kind === "goal" && e.side ? slotOf(eventTeam, e.playerId) : undefined;
    const bookedSlot = e.kind === "card" && e.side ? slotOf(eventTeam, e.playerId) : undefined;
    const zone: AttackZone | undefined =
      e.kind === "goal" && e.side && scorerSlot != null
        ? { side: e.side, lane: laneOfSlot(scorerSlot, eventTeam.formation.slots) }
        : undefined;
    const offSlot = e.kind === "substitution" && e.side ? slotOf(eventTeam, e.playerId) : undefined;
    const subOnName =
      e.kind === "substitution" && e.subOnPlayerId != null
        ? ([...eventTeam.players, ...(eventTeam.bench ?? [])].find(
            (p) => p.playerId === e.subOnPlayerId,
          )?.name ?? undefined)
        : undefined;
    return {
      minute: e.minute,
      kind: e.kind,
      side: e.side,
      card: e.card,
      scorerSlot,
      bookedSlot,
      zone,
      commentary: e.commentary,
      penaltyOutcome: e.penaltyOutcome,
      injurySeverity: e.injurySeverity,
      goalStyle: e.goalStyle,
      offSlot,
      subOnName,
    };
  });
  return {
    home: sideTeam(home),
    away: sideTeam(away),
    homePower: powerOf(home),
    awayPower: powerOf(away),
    events,
    finalScore: result.score,
    seed: result.seed,
    // Taken from the events themselves rather than a constant, so the clock always
    // agrees with whatever the engine actually played.
    lastMinute: result.events.reduce((max, e) => Math.max(max, e.minute), 90),
  };
}
