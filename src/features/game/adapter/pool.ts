import "server-only";
import { loadPlayers, loadStandings } from "@/data/loaders";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { PoolSpec } from "@/features/game/domain/rule-packs";
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

/** Every season the app has data for. */
function everySeason(): number[] {
  const out: number[] = [];
  for (let s = EARLIEST_SEASON; s <= currentDataSeason(); s++) out.push(s);
  return out;
}

/**
 * Every club that ever played in the Premier League, with the seasons it spent there.
 *
 * ⚠️ Deliberately reads the STANDINGS only, never a squad. This backs the club chooser,
 * which must stay cheap: it ships 51 names, not 18,126 cards. Counting each club's cards
 * for the menu would mean building the entire card universe to render a list.
 */
export async function clubChoices(): Promise<
  Array<{ id: number; name: string; seasons: number; first: number; last: number }>
> {
  const seen = new Map<number, { name: string; seasons: number; first: number; last: number }>();
  for (const season of everySeason()) {
    for (const row of (await loadStandings(season)) ?? []) {
      const prior = seen.get(row.teamId);
      // The LATEST name wins — clubs get renamed, and the current name is the one a
      // visitor will recognise.
      seen.set(row.teamId, {
        name: row.teamName,
        seasons: (prior?.seasons ?? 0) + 1,
        first: Math.min(prior?.first ?? season, season),
        last: Math.max(prior?.last ?? season, season),
      });
    }
  }
  return [...seen.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.seasons - a.seasons || a.name.localeCompare(b.name));
}

/**
 * The Legacy shape: a club's COMPLETE history — every rated player-season, one card each.
 *
 * ⚠️ No sampling and no dedupe (owner decision, 2026-08-17). Ten seasons at a club means
 * ten cards, and the deal may put two of them in one round: picking between Salah 2018 and
 * Salah 2019 is a choice the mode wants to offer, not a bug to filter out.
 *
 * ⚠️ `only` is what makes this affordable. Each prerendered page builds ONE club — 34
 * standings reads (cached per process) and at most 34 squads — instead of all 51.
 */
async function clubHistory(
  spec: Extract<PoolSpec, { kind: "clubHistory" }>,
  career: CareerIndex,
  only?: number,
): Promise<EnrichedCard[]> {
  const teams =
    only != null ? [only] : spec.teams === "all" ? (await clubChoices()).map((c) => c.id) : spec.teams;

  const out: EnrichedCard[] = [];
  for (const teamId of teams) {
    for (const season of everySeason()) {
      const standings = await loadStandings(season);
      const row = standings?.find((r) => r.teamId === teamId);
      if (row == null) continue; // the club was not in the top flight that season
      out.push(...(await cardsFor(teamId, row.teamName, season, career)).map((g) => g.card));
    }
  }
  return out;
}

/**
 * Build a pack's pool.
 *
 * `only` narrows a club-history pool to a single club — the parameterised
 * `/game/[mode]/[club]` route passes it so each page carries just that club's cards.
 */
export async function buildPool(spec: PoolSpec, only?: number): Promise<EnrichedCard[]> {
  const career = await loadCareerIndex();
  const pool =
    spec.kind === "topTeams" ? await topTeams(spec, career) : await clubHistory(spec, career, only);

  // Pixel-inspect each photo to tell a transparent cutout from a background shot — the URL
  // alone lies for older players. Best-effort, build time only.
  const resolved = await resolvePhotos(pool.map((c) => c.photo));
  resolved.forEach((r, i) => {
    pool[i]!.photoKind = r.kind;
    pool[i]!.photoUrl = r.url;
  });
  return pool;
}
