import type { MatchEvent, MatchResult } from "./match-types";
import type { GameTeam } from "./team";

export interface CommentaryValues {
  player?: string;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  added?: number;
}
export interface CommentaryRef {
  key: string;
  values: CommentaryValues;
}
export interface CommentedEvent extends MatchEvent {
  commentary: CommentaryRef;
}

const GOAL_POOL = 4;
const CARD_YELLOW_POOL = 3;
const CARD_RED_POOL = 2;
const CHANCE_POOL = 2;
const PUSH_POOL = 2;

/** FNV-1a → non-negative int. Deterministic; drives phrasing variety. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function variantOf(event: MatchEvent, pool: number): number {
  return hashStr(`${event.kind}:${event.minute}:${event.playerId ?? 0}`) % pool;
}

function nameOf(event: MatchEvent, home: GameTeam, away: GameTeam): string | null {
  if (event.playerId == null || event.side == null) return null;
  const roster = event.side === "home" ? home.players : away.players;
  return roster.find((p) => p.playerId === event.playerId)?.name ?? null;
}

export function commentate(result: MatchResult, home: GameTeam, away: GameTeam): CommentedEvent[] {
  let h = 0;
  let a = 0;
  const out: CommentedEvent[] = [];

  for (const event of result.events) {
    let commentary: CommentaryRef;
    switch (event.kind) {
      case "kickoff":
        commentary = { key: "commentary.kickoff", values: {} };
        break;
      case "goal": {
        if (event.side === "home") h += 1;
        else if (event.side === "away") a += 1;
        const player = nameOf(event, home, away);
        commentary = player
          ? {
              key: `commentary.goal.${variantOf(event, GOAL_POOL)}`,
              values: { player, minute: event.minute, homeScore: h, awayScore: a },
            }
          : {
              key: "commentary.goalAnon",
              values: { minute: event.minute, homeScore: h, awayScore: a },
            };
        break;
      }
      case "card": {
        const player = nameOf(event, home, away);
        const isRed = event.card === "red";
        const family = isRed ? "cardRed" : "cardYellow";
        const pool = isRed ? CARD_RED_POOL : CARD_YELLOW_POOL;
        commentary = player
          ? {
              key: `commentary.${family}.${variantOf(event, pool)}`,
              values: { player, minute: event.minute },
            }
          : { key: "commentary.cardAnon", values: { minute: event.minute } };
        break;
      }
      case "chance": {
        // The connective tissue of a match. Every near-miss keeps the scoreline feeling
        // contested, which is the whole reason TASK-1822 exists.
        const player = nameOf(event, home, away);
        const outcome = event.outcome ?? "saved";
        commentary = player
          ? {
              key: `commentary.chance.${outcome}.${variantOf(event, CHANCE_POOL)}`,
              values: { player, minute: event.minute },
            }
          : { key: `commentary.chanceAnon.${outcome}`, values: { minute: event.minute } };
        break;
      }
      case "stoppage":
        commentary = {
          key: "commentary.stoppage",
          values: { minute: event.minute, added: event.addedMinutes ?? 0 },
        };
        break;
      case "push":
        commentary = {
          key: `commentary.push.${variantOf(event, PUSH_POOL)}`,
          values: { minute: event.minute },
        };
        break;
      case "halftime":
        commentary = { key: "commentary.halftime", values: { homeScore: h, awayScore: a } };
        break;
      case "fulltime":
        commentary = { key: "commentary.fulltime", values: { homeScore: h, awayScore: a } };
        break;
      default: {
        const _never: never = event.kind;
        commentary = { key: "commentary.kickoff", values: {} };
        void _never;
      }
    }
    out.push({ ...event, commentary });
  }
  return out;
}
