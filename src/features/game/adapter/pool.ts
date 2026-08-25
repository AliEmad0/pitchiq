import "server-only";
import { loadCaptains, loadFixtures, loadPlayers, loadStandings } from "@/data/loaders";
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
    only != null
      ? [only]
      : spec.teams === "all"
        ? (await clubChoices()).map((c) => c.id)
        : spec.teams;

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
/**
 * How many real captaincies each player in the pool has, across every season and club.
 *
 * TASK-1810 — the armband goes to the most-capped captain in the drafted XI, and the next
 * most is vice. Counting happens here because `captains.json` is a server-only read and
 * the ranking runs in a client component.
 *
 * ⚠️ NARROWED to the pool. The full map is season → team → player across 34 seasons;
 * shipping all of it would put a second payload on a page already carrying ~900 cards.
 *
 * ⚠️ Counted per PLAYER across every club, never per club. The rule is "most real
 * captaincies", full stop — Gerrard's four happen to be Liverpool's, but a player who
 * captained two clubs carries both.
 *
 * ⚠️ Coverage is genuinely thin: 20 seasons, 164 distinct captains, and the all-time
 * maximum is 9. Most Legacy XIs will contain nobody with a record at all, which is why
 * `rankCaptains` treats its rating fallback as the common path rather than an edge case.
 */
export async function captaincyCounts(
  playerIds: Iterable<number>,
): Promise<Record<number, number>> {
  const captains = await loadCaptains();
  if (captains == null) return {};
  const wanted = new Set(playerIds);
  const out: Record<number, number> = {};
  for (const byTeam of Object.values(captains)) {
    for (const playerId of Object.values(byTeam)) {
      if (!wanted.has(playerId)) continue;
      out[playerId] = (out[playerId] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * Every referee who has actually taken a Premier League match, by name.
 *
 * ⭐ REAL names, from the committed fixtures — "M Oliver", "A Taylor" — rather than an
 * invented list. `fixtures-<season>.json` carries a `referee` on every row, so the game can
 * name the official instead of only describing his style.
 *
 * ⚠️ Build time only, and the loaders cache per process, so this is one read of each
 * season no matter how many club pages are prerendered.
 */
export async function refereeNames(): Promise<string[]> {
  const seen = new Set<string>();
  for (const season of everySeason()) {
    for (const f of (await loadFixtures(season)) ?? []) {
      const name = f.referee?.trim();
      if (name != null && name !== "") seen.add(name);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/**
 * The curated legends who never captained a side for three full seasons (owner, 2026-08-25).
 *
 * ⚠️ A hardcoded list of PLAYER IDS is safe in a way a hardcoded club list is not — the
 * comment on `LEGACY_CLUBS` rejects one because a new season silently adds clubs, but a
 * legend's id never changes and the list is a stated editorial choice rather than a
 * snapshot of data that moves. `tests/unit/game-captains-pack.test.ts` fails loudly if any
 * id stops resolving to a real player, so it cannot rot quietly.
 */
const LEGEND_ICONS: readonly number[] = [
  1003061, // Thierry Henry
  1000308, // Cristiano Ronaldo
  1001119, // Mohamed Salah
  1001412, // Sergio Agüero
  1003673, // Dennis Bergkamp
  1002187, // Didier Drogba
  1003744, // Eric Cantona
];

/** How many real seasons a man must have captained to make the roster on merit. */
const ICON_MIN_CAPTAINCIES = 3;

export interface IconChoice {
  id: number;
  name: string;
  /** Drives the nationality half of the synergy pool. */
  nationality: string | null;
  /** ISO code, for the flag on the chooser. */
  nationalityCode: string | null;
  /** Every season he actually played — the era half. */
  seasons: number[];
  /** Seasons he wore the armband. 0 for a curated legend. */
  captaincies: number;
}

/**
 * Everyone the Captain's Draft offers as an icon.
 *
 * ⭐ Derived from REAL captaincy records rather than a hand-picked list, which is what
 * makes the mode's name literal: measured across the 20 covered seasons, 164 men captained
 * a Premier League side and 39 did it for three seasons or more. The curated legends are
 * merged on top and deduplicated.
 *
 * ⚠️ Reads `players-*.json` only — never a squad. Same rule as `clubChoices`: this backs a
 * menu, and building the card universe to render a list is exactly what that would cost.
 */
export async function iconChoices(): Promise<IconChoice[]> {
  const captains = await loadCaptains();
  const counts = new Map<number, number>();
  for (const byTeam of Object.values(captains ?? {}))
    for (const playerId of Object.values(byTeam))
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);

  const wanted = new Set<number>(LEGEND_ICONS);
  for (const [playerId, n] of counts) if (n >= ICON_MIN_CAPTAINCIES) wanted.add(playerId);

  const meta = new Map<
    number,
    { name: string; nationality: string | null; nationalityCode: string | null; seasons: number[] }
  >();
  for (const season of everySeason()) {
    for (const p of (await loadPlayers(season)) ?? []) {
      if (!wanted.has(p.id)) continue;
      const found = meta.get(p.id);
      if (found == null) {
        meta.set(p.id, {
          name: p.name,
          nationality: p.nationality ?? null,
          nationalityCode: p.nationalityCode ?? null,
          seasons: [season],
        });
      } else {
        found.seasons.push(season);
        found.nationality ??= p.nationality ?? null;
        found.nationalityCode ??= p.nationalityCode ?? null;
      }
    }
  }

  return [...meta.entries()]
    .map(([id, m]) => ({ id, ...m, captaincies: counts.get(id) ?? 0 }))
    // Most-capped first, then by name so the order is total and cannot wander.
    .sort((a, b) => b.captaincies - a.captaincies || a.name.localeCompare(b.name))
    .filter((i) => i.seasons.length > 0);
}

/**
 * The Captain's Draft pool: his countrymen, UNION everyone who played in one of his seasons.
 *
 * ⛔ Bounded, and the measurement is why: unbounded, the average icon's union is 2,619
 * distinct players (John Terry's is 3,889 — 76% of the dataset), which is ~1.28 MB baked
 * into a `force-static` page and a "synergy" that includes nearly everybody.
 *
 * The bound is applied in three steps, in this order:
 *  1. **One card per distinct player** — his best-rated season. A man is one option, not ten.
 *  2. **Reserve** `nationalityReserve` places for the nationality half, best-rated first.
 *  3. **Fill** the rest of `cap` from everything left, best-rated first.
 *
 * ⚠️ Step 2 exists because step 3 alone would erase half the mechanic for a big nation:
 * England has 1,767 players against an era of ~3,000, so a purely rating-ranked cap comes
 * out almost entirely era-peers and the coach never sees a countryman.
 */
/**
 * Every rated card in the dataset, with its player's nationality — built ONCE.
 *
 * ⛔ Memoised, and it is a build-time necessity rather than a nicety. Each icon's pool
 * needs the same universe, and `loadRatedSquad` recomputes ratings on every call: 34
 * seasons × ~20 clubs is ~680 squad computations, and 46 icon pages would repeat that for
 * ~31,000 — roughly eighteen times Legacy's entire build. The data FILES are already
 * cached by `loaders.ts`; the ratings were not.
 *
 * ⚠️ Deliberately not exported. It is a scan of everything, and the one recipe that needs
 * a whole-dataset view should stay the only caller.
 */
let _universe: Promise<{ g: Gathered; nationality: string | null }[]> | null = null;
function universe(career: CareerIndex) {
  _universe ??= (async () => {
    const out: { g: Gathered; nationality: string | null }[] = [];
    for (const season of everySeason()) {
      const standings = await loadStandings(season);
      if (standings == null) continue;
      const players = new Map(((await loadPlayers(season)) ?? []).map((p) => [p.id, p]));
      for (const row of standings) {
        for (const g of await cardsFor(row.teamId, row.teamName, season, career)) {
          out.push({ g, nationality: players.get(g.card.playerId)?.nationality ?? null });
        }
      }
    }
    return out;
  })();
  return _universe;
}

/**
 * The Captain's Draft pool: his countrymen, UNION everyone who played in one of his seasons.
 *
 * ⛔ Bounded, and the measurement is why: unbounded, the average icon's union is 2,619
 * distinct players (John Terry's is 3,889 — 76% of the dataset), which is ~1.28 MB baked
 * into a `force-static` page and a "synergy" that includes nearly everybody.
 *
 * The bound is applied in three steps, in this order:
 *  1. **One card per distinct player** — his best-rated season. A man is one option, not ten.
 *  2. **Reserve** `nationalityReserve` places for the nationality half, best-rated first.
 *  3. **Fill** the rest of `cap` from everything left, best-rated first.
 *
 * ⚠️ Step 2 exists because step 3 alone would erase half the mechanic for a big nation:
 * England has 1,767 players against an era of ~3,000, so a purely rating-ranked cap comes
 * out almost entirely era-peers and the coach never sees a countryman.
 */
async function captainSynergy(
  spec: Extract<PoolSpec, { kind: "captainSynergy" }>,
  career: CareerIndex,
  captainId: number,
): Promise<EnrichedCard[]> {
  const icon = (await iconChoices()).find((i) => i.id === captainId);
  if (icon == null) return [];
  const era = new Set(icon.seasons);

  /** playerId -> his best-rated card anywhere, plus whether he is a countryman. */
  const best = new Map<number, { g: Gathered; nat: boolean }>();
  for (const { g, nationality } of await universe(career)) {
    const nat = icon.nationality != null && nationality === icon.nationality;
    // ⚠️ The union, evaluated per CARD: a countryman qualifies in any season, an era-peer
    // only in one of the icon's own.
    if (!nat && !era.has(g.card.season)) continue;
    const found = best.get(g.card.playerId);
    if (found == null || g.rating > found.g.rating) best.set(g.card.playerId, { g, nat });
    else if (nat && !found.nat) found.nat = true;
  }

  /**
   * ⭐ The icon's OWN card is pulled out and returned first, always, outside the cap.
   *
   * ⛔ He must be IN the pool even though he is never dealt: `replayWith` resolves a saved
   * XI against the pool and returns null on the first card it cannot find, so an icon
   * missing from here would make his own match unresumable and his share link dead —
   * presenting as "the link is broken" rather than as a missing card. The DRAFT excludes
   * him via `roomDeals`'s `excludePlayers`, which is a different question entirely.
   */
  const iconCard = best.get(captainId)?.g.card;
  best.delete(captainId);

  const byRating = (a: { g: Gathered }, b: { g: Gathered }) => b.g.rating - a.g.rating;
  const countrymen = [...best.values()].filter((v) => v.nat).sort(byRating);
  const taken = new Set(countrymen.slice(0, spec.nationalityReserve).map((v) => v.g.card.playerId));
  const rest = [...best.values()]
    .filter((v) => !taken.has(v.g.card.playerId))
    .sort(byRating)
    .slice(0, Math.max(0, spec.cap - taken.size));

  const drafted = [...countrymen.slice(0, spec.nationalityReserve), ...rest].map((v) => v.g.card);
  return iconCard == null ? drafted : [iconCard, ...drafted];
}

export async function buildPool(spec: PoolSpec, only?: number): Promise<EnrichedCard[]> {
  const career = await loadCareerIndex();
  const pool =
    spec.kind === "topTeams"
      ? await topTeams(spec, career)
      : spec.kind === "captainSynergy"
        ? // `only` is the ICON's playerId here, the same way it is a club id for Legacy.
          await captainSynergy(spec, career, only ?? -1)
        : await clubHistory(spec, career, only);

  // Pixel-inspect each photo to tell a transparent cutout from a background shot — the URL
  // alone lies for older players. Best-effort, build time only.
  const resolved = await resolvePhotos(pool.map((c) => c.photo));
  resolved.forEach((r, i) => {
    pool[i]!.photoKind = r.kind;
    pool[i]!.photoUrl = r.url;
  });
  return pool;
}
