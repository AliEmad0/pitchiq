import type { MatchEvent, MatchResult } from "./match-types";
import type { GameTeam } from "./team";

export interface CommentaryValues {
  player?: string;
  minute?: number;
  homeScore?: number;
  awayScore?: number;
  added?: number;
  /** The player who followed in a parried penalty. */
  rebound?: string;
  /** The player coming ON in a substitution. */
  playerOn?: string;
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

/**
 * Resolve a player's name from the squad — STARTERS AND BENCH.
 *
 * The bench half is not optional: since Phase 4 a substitute can score, be booked, be
 * injured or be substituted again, and looking only at the starting XI rendered those
 * lines with a raw `{player}` placeholder in the feed.
 */
function nameOf(event: MatchEvent, home: GameTeam, away: GameTeam): string | null {
  if (event.playerId == null || event.side == null) return null;
  const team = event.side === "home" ? home : away;
  const roster = [...team.players, ...(team.bench ?? [])];
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
        // A set-piece goal has ALREADY been described by its own event on the line
        // above ("PENALTY — sends the keeper the wrong way"). Repeating the full goal
        // prose reads as two separate goals, so those get a terse scoreline instead.
        if (event.source === "penalty" || event.source === "freekick") {
          commentary = {
            key: "commentary.goalScoreline",
            values: { minute: event.minute, homeScore: h, awayScore: a },
          };
          break;
        }
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
        // A red card's REASON is the story — "second yellow" and "last man" read
        // completely differently from a straight red, and lumping them together throws
        // away the disciplinary narrative Phase 3 exists to create.
        const byReason: Partial<Record<string, string>> = {
          "second-yellow": "commentary.cardSecondYellow",
          dogso: "commentary.cardDogso",
          "violent-conduct": "commentary.cardViolent",
        };
        const reasonKey = event.reason != null ? byReason[event.reason] : undefined;
        if (reasonKey != null && player != null) {
          commentary = { key: reasonKey, values: { player, minute: event.minute } };
          break;
        }
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
      case "penalty": {
        // The goal event that follows a converted penalty carries the scoreline; this
        // line carries the drama, so it deliberately does NOT repeat the score.
        const player = nameOf(event, home, away);
        const outcome = event.penaltyOutcome ?? "saved-held";
        const rebound =
          event.reboundPlayerId != null
            ? nameOf({ ...event, playerId: event.reboundPlayerId }, home, away)
            : null;
        commentary = {
          key: `commentary.penalty.${outcome}`,
          values: {
            player: player ?? undefined,
            rebound: rebound ?? undefined,
            minute: event.minute,
          },
        };
        break;
      }
      case "freekick": {
        const player = nameOf(event, home, away);
        commentary = {
          key: `commentary.freekick.${event.freeKickOutcome ?? "wall"}`,
          values: { player: player ?? undefined, minute: event.minute },
        };
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
      case "var": {
        const player = nameOf(event, home, away);
        commentary = {
          key: `commentary.var.${event.varOutcome ?? "goal-disallowed-offside"}`,
          values: { player: player ?? undefined, minute: event.minute },
        };
        break;
      }
      case "altercation":
        commentary = {
          key: `commentary.altercation.${event.altercationOutcome ?? "words"}`,
          values: { minute: event.minute },
        };
        break;
      case "referee":
        commentary = {
          key: `commentary.referee.${event.refStyle ?? "strict"}`,
          values: {},
        };
        break;
      case "bias":
        commentary = {
          key: "commentary.bias",
          values: { minute: event.minute },
        };
        break;
      case "substitution": {
        const off = nameOf(event, home, away);
        const on =
          event.subOnPlayerId != null
            ? nameOf({ ...event, playerId: event.subOnPlayerId }, home, away)
            : null;
        commentary = {
          key: `commentary.substitution.${event.subReason ?? "tactical"}`,
          values: {
            player: off ?? undefined,
            playerOn: on ?? undefined,
            minute: event.minute,
          },
        };
        break;
      }
      case "injury": {
        const player = nameOf(event, home, away);
        commentary = {
          key: `commentary.injury.${event.injurySeverity ?? "knock"}`,
          values: { player: player ?? undefined, minute: event.minute },
        };
        break;
      }
      case "keeper": {
        const player = nameOf(event, home, away);
        commentary = {
          key: `commentary.keeper.${event.keeperOutcome ?? "clearance"}`,
          values: { player: player ?? undefined, minute: event.minute },
        };
        break;
      }
      case "shorthanded": {
        const player = nameOf(event, home, away);
        commentary = {
          key: "commentary.shorthanded",
          values: { player: player ?? undefined, minute: event.minute },
        };
        break;
      }
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
