/**
 * TASK-1819 — one season of album sets, as the static route serves it.
 *
 * A set is every RATED card of one club-season — exactly the Classic pool — so every set can be
 * completed by playing that club's Classic season. Cards run best-first; that order is the
 * sticker number.
 */
export interface AlbumSeason {
  season: number;
  clubs: {
    teamId: number;
    name: string;
    cards: { id: string; n: string; r: string; o: number }[];
  }[];
}
