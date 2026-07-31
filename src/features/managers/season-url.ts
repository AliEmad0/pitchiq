// Pure URL builder for the client-side season swap on `/managers/[id]`
// (TASK-M71c) — the players/season-url.ts pattern.

export function managerProfileUrl(id: string, season: number, locale?: string): string {
  const params = new URLSearchParams({ season: String(season) });
  if (locale) params.set("locale", locale);
  return `/api/managers/${encodeURIComponent(id)}/profile?${params.toString()}`;
}
