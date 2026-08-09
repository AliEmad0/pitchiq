import type { MinuteContext, MinuteWeights, Modifier, TeamPower } from "./match-types";

export function baseWeights(power: TeamPower): MinuteWeights {
  return {
    attack: power.attack,
    defense: power.defense,
    foul: power.aggression,
    card: power.aggression,
  };
}

/** Fatigue dulls the attack as stamina falls (1 → neutral). */
export const staminaModifier: Modifier = ({ state, side }) => {
  const s = state[side];
  return { attack: -s.power.attack * (1 - s.stamina) };
};

/**
 * Attacking urgency lifts the attack and costs some defensive shape.
 *
 * ⚠️ `momentum` means URGENCY, not "who is winning". Before TASK-1822 this modifier
 * read a momentum value that was RAISED by scoring and LOWERED by conceding, so the
 * team that went ahead attacked better and the team chasing attacked worse — a
 * rich-get-richer loop, and backwards from how football behaves. `simulate` now raises
 * it for the side that CONCEDED (the response window). Do not invert it again.
 */
export const momentumModifier: Modifier = ({ state, side }) => {
  const m = state[side].momentum;
  return { attack: 10 * m, defense: -4 * m };
};

/** Minute from which a losing side abandons shape and throws everyone forward. */
export const DESPERATION_MINUTE = 75;

/**
 * All-out attack when trailing late — and the punishment that comes with it.
 *
 * The defence penalty is the point: chasing a game late genuinely creates BOTH the
 * equaliser and the counter-attack that kills it, so a comeback push must be able to
 * backfire or it is just a free bonus.
 */
export const desperationModifier: Modifier = ({ state, side }) => {
  const opp = side === "home" ? "away" : "home";
  const deficit = state[opp].score - state[side].score;
  if (state.minute < DESPERATION_MINUTE || deficit <= 0) return {};
  const urgency = Math.min(3, deficit);
  return { attack: 6 + 3 * urgency, defense: -5 - 2 * urgency };
};

export const BASELINE_MODIFIERS: Modifier[] = [
  staminaModifier,
  momentumModifier,
  desperationModifier,
];

export function applyModifiers(
  base: MinuteWeights,
  ctx: MinuteContext,
  modifiers: Modifier[],
): MinuteWeights {
  const out = { ...base };
  for (const mod of modifiers) {
    const d = mod(ctx);
    out.attack += d.attack ?? 0;
    out.defense += d.defense ?? 0;
    out.foul += d.foul ?? 0;
    out.card += d.card ?? 0;
  }
  out.attack = Math.max(0, out.attack);
  out.defense = Math.max(0, out.defense);
  out.foul = Math.max(0, out.foul);
  out.card = Math.max(0, out.card);
  return out;
}
