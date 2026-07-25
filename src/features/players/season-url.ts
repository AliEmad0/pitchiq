// Pure URL builders for the client-side season swap on `/players/[id]`.
// Kept separate from the component so they're trivially unit-testable.

export function playerProfileUrl(id: number, season: number, locale?: string): string {
  const params = new URLSearchParams({ season: String(season) });
  if (locale) params.set("locale", locale);
  return `/api/players/${id}/profile?${params.toString()}`;
}

export function playerTriviaUrl(id: number, season: number): string {
  const params = new URLSearchParams({ scope: "player", id: String(id), season: String(season) });
  return `/api/trivia?${params.toString()}`;
}
