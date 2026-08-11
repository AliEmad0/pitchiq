import type { MinuteContext, MinuteWeights, Modifier, TeamPower } from "./match-types";
import { responseModifier } from "./response-modifiers";

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

/**
 * Playing with ten men.
 *
 * Without this a red card is pure theatre — the drama of the dismissal with none of the
 * consequence. A side down to ten creates markedly less and defends a little worse; a
 * second dismissal compounds it.
 */
export const sentOffModifier: Modifier = ({ state, side }) => {
  const off = state[side].sentOff;
  if (off <= 0) return {};
  return { attack: -14 * off, defense: -6 * off };
};

/**
 * A side that believes it has been wronged.
 *
 * Both halves are the point: injustice produces a fired-up response AND reckless
 * tackling, so `rage` lifts attack and raises the card risk at the same time. That is
 * the mechanism behind "the affected team faces pressure and decisive plays go against
 * them" — the aggrieved side pushes harder and takes more risk doing it.
 */
export const rageModifier: Modifier = ({ state, side }) => {
  const rage = state[side].rage;
  if (rage <= 0) return {};
  return { attack: 7 * rage, card: 18 * rage, foul: 12 * rage };
};

/**
 * A player carrying a knock.
 *
 * Small and short by design: the point of the three-tier injury system is that a knock
 * is NOT a substitution — the player stays on and the side is slightly worse for a few
 * minutes, which is the only tier that leaves a mark without changing the eleven.
 */
export const knockModifier: Modifier = ({ state, side }) => {
  const until = state[side].knockUntil;
  if (until == null || state.minute > until) return {};
  return { attack: -4, defense: -3 };
};

export const BASELINE_MODIFIERS: Modifier[] = [
  staminaModifier,
  momentumModifier,
  desperationModifier,
  sentOffModifier,
  rageModifier,
  knockModifier,
  // Contributes nothing unless the coach actively chose overload or stabilize, so an
  // un-coached match is unaffected — see the warning in response-modifiers.ts.
  responseModifier,
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
