import type { PlayerRole } from "@/data/schemas";
import { commentate } from "@/features/game/domain/commentary";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import type {
  MatchEventKind,
  MatchResult,
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
}
export interface MatchViewModel {
  home: ViewSideTeam;
  away: ViewSideTeam;
  homePower: TeamPower;
  awayPower: TeamPower;
  events: ViewEvent[];
  finalScore: { home: number; away: number };
  seed: number;
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
    return {
      minute: e.minute,
      kind: e.kind,
      side: e.side,
      card: e.card,
      scorerSlot,
      bookedSlot,
      zone,
      commentary: e.commentary,
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
  };
}
