import type { MatchEvent, Side } from "./match-types";
import type { GamePlayer } from "./player";
import type { GameTeam } from "./team";
import { classicLineup } from "./classic-lineup";
import { canPlay } from "./eligibility";

/** Coach-roster availability. Counts future coach fixtures, never calendar rows. */
export interface SeasonInjury {
  cardId: string;
  remaining: number;
}
export function validateInjuries(injuries: readonly SeasonInjury[], pool: readonly GamePlayer[]) {
  if (
    new Set(injuries.map((i) => i.cardId)).size !== injuries.length ||
    injuries.some(
      (i) =>
        !Number.isInteger(i.remaining) ||
        i.remaining < 1 ||
        i.remaining > 3 ||
        !pool.some((p) => p.cardId === i.cardId),
    )
  )
    throw new Error("Invalid season injuries");
}
/** Game recovery rules, not a reconstruction of real historical injuries. */
export function carryInjuries(
  previous: readonly SeasonInjury[],
  events: readonly MatchEvent[],
  side: Side,
  team: GameTeam,
): SeasonInjury[] {
  const remaining = new Map(
    previous.filter((i) => i.remaining > 1).map((i) => [i.cardId, i.remaining - 1]),
  );
  const players = [...team.players, ...(team.bench ?? [])];
  for (const event of events) {
    if (event.kind !== "injury" || event.side !== side) continue;
    const count =
      event.injurySeverity === "severe" ? 3 : event.injurySeverity === "moderate" ? 1 : 0;
    if (!count) continue;
    const player = players.find((p) => p.playerId === event.playerId);
    if (!player) throw new Error("Injury player outside fixture squad");
    remaining.set(player.cardId, Math.max(count, remaining.get(player.cardId) ?? 0));
  }
  return [...remaining]
    .map(([cardId, count]) => ({ cardId, remaining: count }))
    .sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
}
export function reservePlayers(
  pool: readonly GamePlayer[],
  xi: readonly GamePlayer[],
): GamePlayer[] {
  const used = new Set(xi.map((p) => p.playerId));
  const candidates = pool
    .slice()
    .sort(
      (a, b) =>
        (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0) ||
        a.playerId - b.playerId ||
        (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0),
    )
    .filter((p) => {
      if (used.has(p.playerId)) return false;
      used.add(p.playerId);
      return true;
    });
  const chosen: GamePlayer[] = [];
  const keeper = candidates.find((p) => p.role === "GK");
  if (keeper) chosen.push(keeper);
  // All-time pools have many keepers: reserve one place, never all seven.
  for (const role of new Set(xi.flatMap((p) => (p.role && p.role !== "GK" ? [p.role] : [])))) {
    if (chosen.length >= 7) break;
    if (chosen.some((p) => canPlay(p, role))) continue;
    const cover = candidates.find(
      (p) => p.role !== "GK" && !chosen.includes(p) && canPlay(p, role),
    );
    if (cover) chosen.push(cover);
  }
  for (const p of candidates) {
    if (chosen.length >= 7) break;
    if (p.role !== "GK" && !chosen.includes(p)) chosen.push(p);
  }
  return chosen;
}
/** Keep the chosen XI where possible; use legal available cover when someone is absent. */
export function availableSeasonTeam(
  team: GameTeam,
  injuries: readonly SeasonInjury[] = [],
  pool?: readonly GamePlayer[],
): GameTeam | null {
  if (injuries.length === 0 && pool == null) return team;
  const absent = new Set(injuries.map((i) => i.cardId));
  const eligible = (pool ?? [...team.players, ...(team.bench ?? [])]).filter(
    (p) => !absent.has(p.cardId),
  );
  const players = team.players.every((p) => !absent.has(p.cardId))
    ? team.players
    : classicLineup(
        eligible,
        team.formation,
        team.players.map((p) => p.cardId),
      );
  return players ? { ...team, players, bench: reservePlayers(eligible, players) } : null;
}
export function rotateSeasonTeam(
  team: GameTeam,
  pool: readonly GamePlayer[],
  ids: readonly string[],
  injuries: readonly SeasonInjury[] = [],
): GameTeam {
  const players = ids.map((id) => pool.find((p) => p.cardId === id));
  if (
    players.length !== 11 ||
    new Set(players.map((p) => p?.playerId)).size !== 11 ||
    players.some(
      (p, i) =>
        !p ||
        injuries.some((n) => n.cardId === p.cardId) ||
        !canPlay(p, team.formation.slots[i].role),
    )
  )
    throw new Error("Invalid season XI");
  const xi = players.map((p) => p!);
  return {
    ...team,
    players: xi,
    bench: reservePlayers(
      pool.filter((p) => !injuries.some((n) => n.cardId === p.cardId)),
      xi,
    ),
  };
}
