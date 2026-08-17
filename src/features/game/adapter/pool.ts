import "server-only";
import { loadPlayers, loadStandings } from "@/data/loaders";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { PoolSpec } from "@/features/game/domain/rule-packs";
import { eraForSeason } from "@/utils/era";
import { EARLIEST_SEASON, currentDataSeason } from "@/utils/season";
import { cardBio, loadCareerIndex } from "./card-enrich";
import { resolvePhotos } from "./photo-kind";
import { loadRatedSquad } from "./ratings";

/**
 * TASK-1810 — the ONE place a rule pack's pool recipe becomes cards.
 *
 * Runs at BUILD TIME only: every `/game/*` route is `force-static`, so the whole pool is
 * baked into the prerendered payload. That is why a recipe's breadth is a payload
 * decision, not merely a data decision.
 */

type CareerIndex = Awaited<ReturnType<typeof loadCareerIndex>>;
type Gathered = { card: EnrichedCard; rating: number };

async function cardsFor(
  teamId: number,
  teamName: string,
  season: number,
  career: CareerIndex,
): Promise<Gathered[]> {
  const [squad, players] = await Promise.all([loadRatedSquad(teamId, season), loadPlayers(season)]);
  if (squad == null) return [];
  const byId = new Map((players ?? []).map((p) => [p.id, p]));
  return squad
    .filter((p) => p.ratings != null)
    .map((p) => ({
      rating: p.ratings?.overall ?? 0,
      card: {
        ...p,
        club: teamName,
        teamId,
        ...cardBio(byId.get(p.playerId), p.playerId, season, career),
      } as EnrichedCard,
    }));
}

/** The Chaos shape: each season's top teams, their best cards. */
async function topTeams(
  spec: Extract<PoolSpec, { kind: "topTeams" }>,
  career: CareerIndex,
): Promise<EnrichedCard[]> {
  const out: EnrichedCard[] = [];
  for (const season of spec.seasons) {
    const standings = await loadStandings(season);
    if (!standings || standings.length === 0) continue;
    const top = [...standings].sort((a, b) => a.rank - b.rank).slice(0, spec.topTeamsPerSeason);
    for (const row of top) {
      const gathered = await cardsFor(row.teamId, row.teamName, season, career);
      out.push(
        ...gathered
          .sort((a, b) => b.rating - a.rating)
          .slice(0, spec.cardsPerTeamSeason)
          .map((g) => g.card),
      );
    }
  }
  return out;
}

/**
 * The Legacy shape: one club's whole history, sampled PER ERA.
 *
 * ⚠️ Per era, not simply top-rated overall. Ratings rise with data coverage, so taking the
 * best N of a club's history would skew modern — and the mode's entire appeal is a 1990s
 * full-back beside a modern forward.
 */
async function clubHistory(
  spec: Extract<PoolSpec, { kind: "clubHistory" }>,
  career: CareerIndex,
): Promise<EnrichedCard[]> {
  // The full committed span. `loadStandings` returns null for any season a club was not in
  // the top flight, so the loop below skips those without needing a per-club season list.
  const seasons: number[] = [];
  for (let s = EARLIEST_SEASON; s <= currentDataSeason(); s++) seasons.push(s);

  const out: EnrichedCard[] = [];
  for (const teamId of spec.teams) {
    const byEra = new Map<string, Gathered[]>();
    for (const season of seasons) {
      const standings = await loadStandings(season);
      const row = standings?.find((r) => r.teamId === teamId);
      if (row == null) continue; // the club was not in the top flight that season
      const era = eraForSeason(season);
      const bucket = byEra.get(era) ?? [];
      bucket.push(...(await cardsFor(teamId, row.teamName, season, career)));
      byEra.set(era, bucket);
    }
    for (const bucket of byEra.values()) {
      // ⚠️ One card per player per club-era: the same player across ten seasons would
      // otherwise fill the bucket alone and the era would read as one man's career.
      const best = new Map<number, Gathered>();
      for (const g of bucket) {
        const prior = best.get(g.card.playerId);
        if (prior == null || g.rating > prior.rating) best.set(g.card.playerId, g);
      }
      out.push(
        ...[...best.values()]
          .sort((a, b) => b.rating - a.rating)
          .slice(0, spec.cardsPerEraPerTeam)
          .map((g) => g.card),
      );
    }
  }
  return out;
}

export async function buildPool(spec: PoolSpec): Promise<EnrichedCard[]> {
  const career = await loadCareerIndex();
  const pool =
    spec.kind === "topTeams" ? await topTeams(spec, career) : await clubHistory(spec, career);

  // Pixel-inspect each photo to tell a transparent cutout from a background shot — the URL
  // alone lies for older players. Best-effort, build time only.
  const resolved = await resolvePhotos(pool.map((c) => c.photo));
  resolved.forEach((r, i) => {
    pool[i]!.photoKind = r.kind;
    pool[i]!.photoUrl = r.url;
  });
  return pool;
}
