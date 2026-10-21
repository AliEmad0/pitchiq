/**
 * TASK-1827 — the coach's identity: a name and a crest, kept in this browser only (no account —
 * that is TASK-1902), and the fixed tutorial match a first-time player meets.
 */

export interface Crest {
  id: string;
  emoji: string;
  /** Background colour, a hex literal like a mode's accent. */
  color: string;
}

/** ⛔ Ids are stored in the profile — rename one and a saved coach loses his crest. */
export const CRESTS: readonly Crest[] = [
  { id: "lion", emoji: "🦁", color: "#c2410c" },
  { id: "eagle", emoji: "🦅", color: "#1d4ed8" },
  { id: "wolf", emoji: "🐺", color: "#475569" },
  { id: "dragon", emoji: "🐉", color: "#15803d" },
  { id: "anchor", emoji: "⚓", color: "#0e7490" },
  { id: "castle", emoji: "🏰", color: "#7c3aed" },
  { id: "star", emoji: "⭐", color: "#ca8a04" },
  { id: "bolt", emoji: "⚡", color: "#be123c" },
];

export const crestOf = (id: string | undefined): Crest =>
  CRESTS.find((c) => c.id === id) ?? CRESTS[0]!;

export const NAME_MAX = 20;

/** Trim and collapse whitespace; an empty name falls back to the caller's default. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

/**
 * The tutorial: Southampton 0–3 Liverpool at 64', 26 August 2000 — it really finished 3–3.
 *
 * ⛔ A FIXED SEED so every first-time player meets the same match. It was chosen by measurement
 * (`onboarding.test.ts` pins it): with the What-If boost, an Overload team talk wins it and a
 * Hold loses it — so the very first decision a new coach makes visibly rewrites the result,
 * which is the hook the owner asked the tutorial to land.
 */
export const TUTORIAL = { scenarioId: "2000-sou-liv", seed: 2400 } as const;
