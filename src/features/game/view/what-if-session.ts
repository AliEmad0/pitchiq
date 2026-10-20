import type { ClassicData, ClassicClub } from "../domain/classic-data";
import { classicLineup } from "../domain/classic-lineup";
import { canPlay } from "../domain/eligibility";
import { type Formation, formationByName } from "../domain/formation";
import type { MatchEvent, MatchSetup, Modifier, Side } from "../domain/match-types";
import type { GamePlayer } from "../domain/player";
import { premierLeagueSubstitutions } from "../domain/substitution-rules";
import { type GameTeam, makeGameTeam } from "../domain/team";
import type { Scenario } from "../domain/what-if";
import { WHAT_IF_TEMPO, whatIfBoost } from "../domain/what-if-boost";

export type XiSource = "real" | "best";
export interface WhatIfSession {
  setup: MatchSetup;
  /** Whether each side fields its real starting XI or the best legal XI from its squad. */
  xiSource: Record<Side, XiSource>;
}

/** Compare names the way the archive and the squad data disagree: accents, case, spacing. */
const norm = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** The default shape Classic gives a side it is not coaching (`classicTeams`). */
const defaultShape = (club: ClassicClub) =>
  club.formations.includes("4-4-2 Flat") ? "4-4-2 Flat" : club.formations[0]!;

function legal(players: (GamePlayer | undefined)[] | null, slots: Formation["slots"]) {
  return (
    players != null &&
    players.length === 11 &&
    players.every((p, i) => p != null && canPlay(p, slots[i]!.role)) &&
    new Set(players.map((p) => p!.playerId)).size === 11
  );
}

/**
 * Field one side: the REAL starting XI if all eleven names map onto this club-season's pool
 * and some supported shape seats them legally; otherwise Classic's best legal XI. The bench
 * is Classic's rule — keeper first, then by rating, seven men.
 */
function fieldSide(club: ClassicClub, season: number, realNames: readonly string[]) {
  const byName = new Map(club.pool.map((p) => [norm(p.name), p]));
  const mapped = realNames.map((n) => byName.get(norm(n)));
  let source: XiSource = "best";
  let shape = defaultShape(club);
  let xi: GamePlayer[] | null = null;
  if (mapped.every((p) => p != null)) {
    const shapes = [shape, ...club.formations.filter((f) => f !== shape)];
    for (const name of shapes) {
      const formation = { ...formationByName(name), season };
      const seated = classicLineup(mapped as GamePlayer[], formation);
      if (legal(seated, formation.slots)) {
        xi = seated;
        shape = name;
        source = "real";
        break;
      }
    }
  }
  const formation = { ...formationByName(shape), season };
  if (xi == null) {
    const best = classicLineup(club.pool, formation);
    if (!legal(best, formation.slots)) return null;
    xi = best!;
  }
  const used = new Set(xi.map((p) => p.playerId));
  const bench = club.pool
    .filter((p) => !used.has(p.playerId))
    .slice()
    .sort(
      (a, b) =>
        Number(b.role === "GK") - Number(a.role === "GK") ||
        (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0) ||
        a.playerId - b.playerId,
    )
    .slice(0, 7);
  return { team: makeGameTeam(club.teamId, club.name, season, formation, xi, bench), source };
}

/**
 * TASK-1816 — turn a scenario into a match setup.
 *
 * The real prior goals and red cards become `startState.priorEvents`, with each named player
 * resolved onto the side that owns him (an own goal's scorer belongs to the side that
 * CONCEDED). A name that resolves to nobody still counts as a goal — the scoreline is real
 * even when the scorer is not in our data — but a red card for a man who is not on the pitch
 * changes nothing and is dropped.
 */
export function buildWhatIfSession(
  s: Scenario,
  data: ClassicData,
  seed: number,
  modifiers: Modifier[] = [],
): WhatIfSession | null {
  const fixture = data.schedule.fixtures.find((f) => f.id === s.fixtureId);
  if (fixture == null) return null;
  const clubOf = (index: number) => data.squads.find((c) => c.teamId === data.clubIds[index]);
  const homeClub = clubOf(fixture.home);
  const awayClub = clubOf(fixture.away);
  if (homeClub == null || awayClub == null) return null;
  const home = fieldSide(homeClub, data.season, s.realXi.home);
  const away = fieldSide(awayClub, data.season, s.realXi.away);
  if (home == null || away == null) return null;

  const teams: Record<Side, GameTeam> = { home: home.team, away: away.team };
  const other = (side: Side): Side => (side === "home" ? "away" : "home");
  const idOn = (side: Side, name: string | null) => {
    if (name == null) return undefined;
    const roster = [...teams[side].players, ...(teams[side].bench ?? [])];
    return roster.find((p) => norm(p.name) === norm(name))?.playerId;
  };
  const priorEvents: MatchEvent[] = [];
  for (const e of s.before) {
    if (e.kind === "goal") {
      priorEvents.push(
        e.ownGoal
          ? {
              minute: e.minute,
              kind: "goal",
              side: e.side,
              source: "own-goal",
              ownGoalBy: idOn(other(e.side), e.player),
            }
          : {
              minute: e.minute,
              kind: "goal",
              side: e.side,
              source: "open",
              playerId: idOn(e.side, e.player),
            },
      );
    } else {
      const id = idOn(e.side, e.player);
      if (id != null && teams[e.side].players.some((p) => p.playerId === id))
        priorEvents.push({
          minute: e.minute,
          kind: "card",
          card: "red",
          side: e.side,
          playerId: id,
        });
    }
  }

  const fixtures = data.schedule.fixtures;
  return {
    xiSource: { home: home.source, away: away.source },
    setup: {
      home: teams.home,
      away: teams.away,
      seed,
      substitutions: premierLeagueSubstitutions(data.season, fixture.date),
      targetGoalsPerMatch:
        fixtures.reduce((n, f) => n + f.homeGoals + f.awayGoals, 0) / fixtures.length,
      modifiers,
      startState: {
        minute: s.startMinute,
        priorEvents,
        subsUsed: s.subsBefore,
        teamTalk: s.side,
      },
    },
  };
}

/**
 * The session the player actually gets: the scenario plus the What-If boost (doubled tempo
 * and the trailing-side lift). `buildWhatIfSession` stays unboosted so the difficulty test
 * can measure both.
 */
export function buildBoostedSession(
  s: Scenario,
  data: ClassicData,
  seed: number,
): WhatIfSession | null {
  const session = buildWhatIfSession(s, data, seed, [whatIfBoost(s.side, s.startMinute)]);
  if (session == null) return null;
  session.setup.targetGoalsPerMatch *= WHAT_IF_TEMPO;
  return session;
}
