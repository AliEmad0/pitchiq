import { commentate } from "@/features/game/domain/commentary";
import type { CommentaryRef } from "@/features/game/domain/commentary";
import type { FormationSlot } from "@/features/game/domain/formation";
import type { MatchEventKind, MatchResult, Side, TeamPower } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { powerOf } from "@/features/game/domain/team-power";

export interface ViewSideTeam {
  name: string;
  abbr: string;
  slots: FormationSlot[];
}
export interface ViewEvent {
  minute: number;
  kind: MatchEventKind;
  side?: Side;
  card?: "yellow" | "red";
  scorerSlot?: number;
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

function abbrOf(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 3) || "TBD").toUpperCase();
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
  const events: ViewEvent[] = commented.map((e) => ({
    minute: e.minute,
    kind: e.kind,
    side: e.side,
    card: e.card,
    scorerSlot:
      e.kind === "goal" && e.side ? slotOf(e.side === "home" ? home : away, e.playerId) : undefined,
    commentary: e.commentary,
  }));
  return {
    home: { name: home.name, abbr: abbrOf(home.name), slots: home.formation.slots },
    away: { name: away.name, abbr: abbrOf(away.name), slots: away.formation.slots },
    homePower: powerOf(home),
    awayPower: powerOf(away),
    events,
    finalScore: result.score,
    seed: result.seed,
  };
}
