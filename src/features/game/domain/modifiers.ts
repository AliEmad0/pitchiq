import type { MinuteContext, MinuteWeights, Modifier, TeamPower } from "./match-types";

export function baseWeights(power: TeamPower): MinuteWeights {
  return { attack: power.attack, defense: power.defense, foul: power.aggression, card: power.aggression };
}

/** Fatigue dulls the attack as stamina falls (1 → neutral). */
export const staminaModifier: Modifier = ({ state, side }) => {
  const s = state[side];
  return { attack: -s.power.attack * (1 - s.stamina) };
};

/** Recent-goal swing: momentum lifts attack, saps defensive focus. */
export const momentumModifier: Modifier = ({ state, side }) => {
  const m = state[side].momentum;
  return { attack: 12 * m, defense: -6 * m };
};

export const BASELINE_MODIFIERS: Modifier[] = [staminaModifier, momentumModifier];

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
