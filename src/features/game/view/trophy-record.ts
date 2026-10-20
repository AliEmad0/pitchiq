import {
  type AchievementId,
  type CareerFacts,
  earned,
  matchFacts,
} from "@/features/game/domain/achievements";
import type { AlbumSeason } from "@/features/game/domain/album";
import type { MatchResult, Side } from "@/features/game/domain/match-types";
import { seasonTable } from "@/features/game/domain/season";
import type { GamePlayer } from "@/features/game/domain/player";
import type { PlayerRatings } from "@/features/game/domain/ratings";
import {
  type AlbumCard,
  type AlbumEntry,
  addCards,
  claimLog,
  loadAlbum,
  unlock,
} from "@/features/game/storage/trophy-slot";

/** What one full-time screen hands the Trophy Room (TASK-1813 / 1819). */
export interface FullTimeEntry {
  /**
   * Identifies the match or run, so it is recorded ONCE: `m:<mode>:<seed>`, `d:<day>`,
   * `s:<runSeed>:<week>`, `c:<archiveKey>:<fixtureId>`, `r:<run>`, `w:<scenario>:<seed>`.
   */
  key: string;
  /** The local day, `YYYY-MM-DD`, computed by the component (never in `domain/`). */
  day: string;
  /** The coach's cards that turned out. Empty for What-If (history's XI, not drafted). */
  cards: readonly AlbumCard[];
  /** ⛔ `match` only for a match he PLAYED — never a simmed one. */
  facts: CareerFacts;
  /** A short line kept with each unlock: "Arsenal 5–0 Spurs". */
  context: string;
}

const seasonLabel = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

/** The coach's players as album cards; a card without its own club takes the squad's. */
export function albumCards(
  players: readonly {
    cardId: string;
    name: string;
    role: string | null;
    season: number;
    ratings: Pick<PlayerRatings, "overall"> | null;
    teamId?: number;
  }[],
  squadTeamId = 0,
): AlbumCard[] {
  return players.map((p) => ({
    cardId: p.cardId,
    teamId: p.teamId ?? squadTeamId,
    name: p.name,
    role: p.role ?? "",
    season: p.season,
    ovr: p.ratings?.overall ?? 0,
  }));
}

export async function fetchSeason(season: number): Promise<AlbumSeason | null> {
  try {
    const res = await fetch(`/api/game/album/${season}`);
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<AlbumSeason>;
    // A file of the wrong shape (or a test stub) is "no set data", never a crash.
    return Array.isArray(json.clubs) ? (json as AlbumSeason) : null;
  } catch {
    return null;
  }
}

/** The club-season sets these cards touch that are now complete, as unlock context. */
async function completedSets(
  touched: readonly AlbumCard[],
  album: readonly AlbumEntry[],
): Promise<string[]> {
  const have = new Set(album.map((e) => `${e.cardId}#${e.teamId}`));
  const out: string[] = [];
  for (const season of new Set(touched.map((c) => c.season))) {
    const set = await fetchSeason(season);
    if (set == null) continue;
    const clubs = new Set(touched.filter((c) => c.season === season).map((c) => c.teamId));
    for (const club of set.clubs) {
      if (!clubs.has(club.teamId)) continue;
      if (club.cards.length > 0 && club.cards.every((c) => have.has(`${c.id}#${club.teamId}`)))
        out.push(`${club.name} ${seasonLabel(season)}`);
    }
  }
  return out;
}

/**
 * Record one finished match or run: its cards into the album, then whatever it earned.
 * Returns the achievements it unlocked for the first time (for the full-time banner).
 *
 * ⛔ Exactly once per `key` (an atomic claim), so a development double effect or a remount
 * cannot double a count or re-unlock. ⚠️ Best-effort throughout: it never throws into a
 * full-time screen.
 */
export async function recordFullTime(entry: FullTimeEntry): Promise<AchievementId[]> {
  try {
    if (!(await claimLog(entry.key))) return [];
    if (entry.cards.length > 0) await addCards(entry.cards, entry.day);
    const album = await loadAlbum();
    const sets = entry.cards.length > 0 ? await completedSets(entry.cards, album) : [];
    const ids = earned({ ...entry.facts, albumTotal: album.length, setsComplete: sets.length });
    const fresh: AchievementId[] = [];
    for (const id of ids) {
      const context =
        id === "set-complete"
          ? sets[0]!
          : id === "collector-100"
            ? `${album.length}`
            : entry.context;
      if (await unlock({ id, day: entry.day, context })) fresh.push(id);
    }
    return fresh;
  } catch {
    return [];
  }
}

/** Today's local date as the album records it. Components only — `domain/` never reads clocks. */
export function localDay(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/**
 * The entry for a match the coach PLAYED: his cards, and the match facts from his side.
 * `players` is whoever turned out for him (XI, plus a bench he drafted); `squadTeamId` is the
 * club a squad belongs to when its cards carry no club of their own (Classic, Survival).
 */
export function matchEntry(a: {
  key: string;
  day: string;
  players: readonly GamePlayer[];
  squadTeamId?: number;
  result: MatchResult;
  coachSide: Side;
  context: string;
}): FullTimeEntry {
  return {
    key: a.key,
    day: a.day,
    cards: albumCards(a.players, a.squadTeamId),
    facts: { match: matchFacts(a.result, a.coachSide, a.players) },
    context: a.context,
  };
}

/** "Arsenal 5–0 Spurs" — the line an unlock keeps. */
export const scoreLine = (home: string, away: string, score: { home: number; away: number }) =>
  `${home} ${score.home}–${score.away} ${away}`;

/**
 * How a COMPLETE league season ended for the coach — champions and invincibles read this. One
 * helper for the season hub, Classic and the backfill, so the three can never disagree.
 */
export function leagueEnd(
  clubs: number,
  coach: number,
  results: readonly { home: number; away: number; homeGoals: number; awayGoals: number }[],
): { season: NonNullable<CareerFacts["season"]>; position: number } {
  const rows = seasonTable(
    clubs,
    results.map((r) => ({ ...r, week: 0, seed: 0 })),
  );
  const lost = results.some((r) =>
    r.home === coach
      ? r.homeGoals < r.awayGoals
      : r.away === coach
        ? r.awayGoals < r.homeGoals
        : false,
  );
  const position = rows.findIndex((row) => row.club === coach) + 1;
  return {
    season: { kind: "league", won: position === 1, unbeaten: !lost, complete: true },
    position,
  };
}

/** The line a finished run's unlock keeps — one wording, earned live or backfilled. */
export const runContext = (name: string | null, position: number, clubs: number) =>
  name == null || name === "" ? `${position}/${clubs}` : `${name} · ${position}/${clubs}`;
