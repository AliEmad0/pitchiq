import type { MatchEvent, MatchState, Modifier, Side } from "./match-types";
import type { GamePlayer } from "./player";
import type { GameTeam } from "./team";

/**
 * TASK-1814 — personality traits and the late-goal momentum swing.
 *
 * ⭐ DATA-DERIVED, never assigned: a trait is read off the card's own rating dimensions, so the
 * same card always carries the same traits, everywhere, and no table of hand-picked players can
 * drift from the data. Thresholds were set against the real chaos pool so each trait is rare
 * enough to mean something (`traits.test.ts` measures the share).
 *
 * ⭐ Everything here is a pure weight MODIFIER — the PRNG stays the only entropy and the engine
 * itself is untouched. It plays only where a caller adds `personalityModifier` (see
 * `RivalSetup.personality`), so every match made before it existed replays byte-for-byte.
 */
export type TraitId = "talisman" | "hot-head" | "engine" | "rock";

/** In display order. */
export const TRAITS: readonly TraitId[] = ["talisman", "rock", "engine", "hot-head"];

type Rated = Pick<GamePlayer, "role" | "ratings">;

const DEFENDERS = new Set(["GK", "CB", "LB", "RB", "LWB", "RWB"]);

/** A card's traits, from its ratings alone. A card without ratings has none. */
export function traitsOf(p: Rated): TraitId[] {
  const r = p.ratings;
  if (r == null) return [];
  const out: TraitId[] = [];
  if (p.role !== "GK" && r.overall >= 91) out.push("talisman");
  if (DEFENDERS.has(p.role ?? "") && r.defense >= 85) out.push("rock");
  if (p.role !== "GK" && r.physical >= 80) out.push("engine");
  if (p.role !== "GK" && r.discipline <= 15) out.push("hot-head");
  return out;
}

/**
 * What each trait does, in engine weight units. ⚠️ Small on purpose: a trait colours a match, it
 * does not decide it — the engine's rating gap (`POWER_EXPONENT`) stays the main lever.
 */
export const TRAIT_EFFECT = {
  /** A Talisman on the pitch lifts his side's attack when it trails after 70'. Once per side. */
  talisman: { from: 70, attack: 7 },
  /** Each Rock (max 2) stiffens the defence when his side leads after 75'. */
  rock: { from: 75, defense: 4, max: 2 },
  /** Each Engine (max 2) keeps the legs going after 60'. */
  engine: { from: 60, attack: 2.5, max: 2 },
  /** Each Hot-Head (max 2) raises his side's foul and card risk all match. */
  hotHead: { foul: 8, card: 10, max: 2 },
} as const;

/**
 * The late-goal swing: a goal at or after `from` lifts the side that scored and throws the side
 * that conceded into a short panic — reckless, leggy, open at the back — for `minutes`.
 * ⚠️ A VAR-disallowed goal stops counting at its verdict minute (the `disallowedAt` clock rule).
 */
export const LATE_SWING = {
  from: 75,
  minutes: 5,
  surge: { attack: 6 },
  panic: { foul: 10, card: 6, defense: -4 },
} as const;

const other = (s: Side): Side => (s === "home" ? "away" : "home");

/** The players actually on the pitch for one side, right now. */
function onPitch(team: GameTeam, state: MatchState, side: Side): GamePlayer[] {
  const s = state[side];
  const roster = [...team.players, ...(team.bench ?? [])];
  return roster.filter(
    (p) =>
      (team.players.includes(p) || s.broughtOn.has(p.playerId)) && !s.unavailable.has(p.playerId),
  );
}

/** The most recent late goal still inside its swing window, if any. */
function liveLateGoal(events: readonly MatchEvent[], minute: number): MatchEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.kind !== "goal" || e.side == null) continue;
    if (e.minute < LATE_SWING.from) return null;
    if (minute - e.minute >= LATE_SWING.minutes) return null;
    if (e.disallowedAt != null && minute >= e.disallowedAt) continue;
    return e;
  }
  return null;
}

/** Traits and the late swing for one match, as a single modifier. */
export function personalityModifier(home: GameTeam, away: GameTeam): Modifier {
  const teams = { home, away };
  return ({ state, side }) => {
    const minute = state.minute;
    const me = state[side];
    const them = state[other(side)];
    const players = onPitch(teams[side], state, side);
    const count = (t: TraitId) => players.filter((p) => traitsOf(p).includes(t)).length;
    let attack = 0;
    let defense = 0;
    let foul = 0;
    let card = 0;

    if (minute >= TRAIT_EFFECT.talisman.from && me.score < them.score && count("talisman") > 0) {
      attack += TRAIT_EFFECT.talisman.attack;
    }
    if (minute >= TRAIT_EFFECT.rock.from && me.score > them.score) {
      defense += TRAIT_EFFECT.rock.defense * Math.min(TRAIT_EFFECT.rock.max, count("rock"));
    }
    if (minute >= TRAIT_EFFECT.engine.from) {
      attack += TRAIT_EFFECT.engine.attack * Math.min(TRAIT_EFFECT.engine.max, count("engine"));
    }
    const heads = Math.min(TRAIT_EFFECT.hotHead.max, count("hot-head"));
    foul += TRAIT_EFFECT.hotHead.foul * heads;
    card += TRAIT_EFFECT.hotHead.card * heads;

    const late = liveLateGoal(state.events, minute);
    if (late != null) {
      if (late.side === side) attack += LATE_SWING.surge.attack;
      else {
        foul += LATE_SWING.panic.foul;
        card += LATE_SWING.panic.card;
        defense += LATE_SWING.panic.defense;
      }
    }

    const out: { attack?: number; defense?: number; foul?: number; card?: number } = {};
    if (attack !== 0) out.attack = attack;
    if (defense !== 0) out.defense = defense;
    if (foul !== 0) out.foul = foul;
    if (card !== 0) out.card = card;
    return out;
  };
}
