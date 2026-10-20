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
function fieldSide(
  club: ClassicClub,
  season: number,
  realNames: readonly string[],
  subs: readonly { player: string | null; off: string | null }[],
) {
  // Seat a list of names in the default shape, else any supported shape; null if they do not
  // all map onto this club-season's pool or no shape seats them legally.
  const byName = new Map(club.pool.map((p) => [norm(p.name), p]));
  const seat = (names: readonly string[]) => {
    const mapped = names.map((n) => byName.get(norm(n)));
    if (!mapped.every((p) => p != null)) return null;
    const first = defaultShape(club);
    for (const name of [first, ...club.formations.filter((f) => f !== first)]) {
      const formation = { ...formationByName(name), season };
      const seated = classicLineup(mapped as GamePlayer[], formation);
      if (legal(seated, formation.slots)) return { xi: seated!, shape: name };
    }
    return null;
  };

  // The XI really on the pitch at the start minute: the kick-off XI with each real
  // substitution applied in order — but ONLY where the changed XI still seats legally. A
  // change we cannot represent (Solskjær, a striker, for Butt, the holding midfielder:
  // three strikers no supported shape seats) is skipped, and below, not charged.
  let names = [...realNames];
  let seated = seat(names);
  const subbedOff: string[] = [];
  if (seated != null) {
    for (const sub of subs) {
      const i = names.findIndex((n) => sub.off != null && norm(n) === norm(sub.off));
      if (i < 0 || sub.player == null) continue;
      const next = names.map((n, j) => (j === i ? sub.player! : n));
      const nextSeated = seat(next);
      if (nextSeated == null) continue;
      subbedOff.push(names[i]!);
      names = next;
      seated = nextSeated;
    }
  }
  const source: XiSource = seated != null ? "real" : "best";
  const shape = seated?.shape ?? defaultShape(club);
  let xi: GamePlayer[] | null = seated?.xi ?? null;
  const formation = { ...formationByName(shape), season };
  if (xi == null) {
    const best = classicLineup(club.pool, formation);
    if (!legal(best, formation.slots)) return null;
    xi = best!;
  }
  const used = new Set(xi.map((p) => p.playerId));
  // A man really taken off cannot come back on — only when the real XI (and so the real
  // changes) is what is on the pitch.
  const gone = new Set(source === "real" ? subbedOff.map(norm) : []);
  const bench = club.pool
    .filter((p) => !used.has(p.playerId) && !gone.has(norm(p.name)))
    .slice()
    .sort(
      (a, b) =>
        Number(b.role === "GK") - Number(a.role === "GK") ||
        (b.ratings?.overall ?? 0) - (a.ratings?.overall ?? 0) ||
        a.playerId - b.playerId,
    )
    .slice(0, 7);
  return {
    team: makeGameTeam(club.teamId, club.name, season, formation, xi, bench),
    source,
    // ⛔ Charge only the changes that are really on the pitch. A fallback XI applies none.
    subsApplied: source === "real" ? subbedOff.length : 0,
  };
}

/**
 * TASK-1816 — turn a scenario into a match setup.
 *
 * The real prior goals and red cards become `startState.priorEvents`, with each named player
 * resolved onto the side that owns him (an own goal's scorer belongs to the side that
 * CONCEDED). A name that resolves to nobody still counts as a goal — the scoreline is real
 * even when the scorer is not in our data — and a red card always costs the side a man.
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
  const subsOf = (side: Side) => s.before.filter((e) => e.kind === "sub" && e.side === side);
  const home = fieldSide(homeClub, data.season, s.realXi.home, subsOf("home"));
  const away = fieldSide(awayClub, data.season, s.realXi.away, subsOf("away"));
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
    } else if (e.kind === "red") {
      // ⛔ The NUMBERS are history: a side that really went down to ten starts with ten.
      // When the man cannot be placed on our pitch (unmatched name, a fallback XI, a
      // substitute), the side's lowest-rated outfielder makes way rather than the card being
      // dropped and a real 11 v 10 played as 11 v 11 (review finding).
      const sentOff = new Set(
        priorEvents.filter((x) => x.kind === "card" && x.side === e.side).map((x) => x.playerId),
      );
      const onPitch = teams[e.side].players.filter((p) => !sentOff.has(p.playerId));
      const named = idOn(e.side, e.player);
      const id = onPitch.some((p) => p.playerId === named)
        ? named
        : onPitch
            .filter((p) => p.role !== "GK")
            .sort(
              (a, b) =>
                (a.ratings?.overall ?? 0) - (b.ratings?.overall ?? 0) || a.playerId - b.playerId,
            )[0]?.playerId;
      if (id != null)
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
        subsUsed: { home: home.subsApplied, away: away.subsApplied },
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
