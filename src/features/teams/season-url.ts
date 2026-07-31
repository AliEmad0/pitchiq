// Pure URL builders for the client-side season swap on `/teams/[id]`
// (TASK-M71c). Kept separate from the component so they're trivially
// unit-testable — the players/season-url.ts pattern.

export function teamSeasonViewUrl(id: number, season: number, locale?: string): string {
  const params = new URLSearchParams({ season: String(season) });
  if (locale) params.set("locale", locale);
  return `/api/teams/${id}/season-view?${params.toString()}`;
}

export function teamTriviaUrl(id: number, season: number): string {
  const params = new URLSearchParams({ scope: "team", id: String(id), season: String(season) });
  return `/api/trivia?${params.toString()}`;
}
