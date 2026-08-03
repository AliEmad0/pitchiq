/** A player-season card key, e.g. "1000457@2003" — Henry '03 ≠ Henry '06. */
export type PlayerSeasonId = `${number}@${number}`;

export function makeCardId(playerId: number, season: number): PlayerSeasonId {
  return `${playerId}@${season}`;
}

export function parseCardId(id: string): { playerId: number; season: number } {
  const match = /^(\d+)@(\d+)$/.exec(id);
  if (!match) throw new Error(`invalid card id: ${id}`);
  return { playerId: Number(match[1]), season: Number(match[2]) };
}
