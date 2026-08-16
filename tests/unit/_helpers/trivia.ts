import type { TriviaData } from "../../../src/features/trivia/types";

/**
 * Null-returning defaults for every `TriviaData` accessor.
 *
 * TASK-M82 widened the facade from 8 accessors to 14, which broke seven test files that
 * each wrote a complete object literal. Spreading these instead means the NEXT accessor
 * costs one line here rather than an edit in every trivia test — and a rule that reads a
 * source the test did not stub sees `null` and returns no fact, which is the same
 * degradation production gets for an unsynced file.
 */
export const TRIVIA_DEFAULTS: TriviaData = {
  season: 2024,
  standings: async () => null,
  players: async () => null,
  fixtures: async () => null,
  leaderboards: async () => null,
  seasons: async () => [2024],
  goalAttribution: async () => null,
  managers: async () => null,
  fixtureExtras: async () => null,
  events: async () => null,
  lineups: async () => null,
  managerEnrichment: async () => null,
  managerHonours: async () => null,
  captains: async () => null,
  pfaAwards: async () => null,
};

/** A `TriviaData` with only the sources a test actually cares about. */
export function triviaStub(overrides: Partial<TriviaData> = {}): TriviaData {
  return { ...TRIVIA_DEFAULTS, ...overrides };
}
