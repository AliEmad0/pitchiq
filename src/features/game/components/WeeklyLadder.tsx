"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { roomDeals } from "@/features/game/domain/draft-room";
import type { MatchResult } from "@/features/game/domain/match-types";
import type { Mentality } from "@/features/game/domain/mentality";
import { nextWeek, seasonTable, type SeasonRun } from "@/features/game/domain/season";
import { reservePlayers } from "@/features/game/domain/season-availability";
import { type GameTeam, makeGameTeam } from "@/features/game/domain/team";
import {
  isoWeekday,
  isoWeekKey,
  LADDER_DAYS,
  ladderFixtures,
  ladderRivals,
  ladderStanding,
  ladderStats,
  msToNextWeek,
  unlockedDays,
  weekFormation,
  weekNumber,
  weekRule,
  weekSeeds,
} from "@/features/game/domain/weekly";
import {
  allWeekly,
  loadWeekly,
  saveWeekly,
  type WeeklyRecord,
} from "@/features/game/storage/weekly-slot";
import { loadRival } from "@/features/game/view/rival-choice";
import { buildLeagueTeams } from "@/features/game/view/season-league";
import type { SeasonFixture } from "@/features/game/view/season-match";
import {
  localDay,
  matchEntry,
  recordFullTime,
  scoreLine,
} from "@/features/game/view/trophy-record";
import {
  closeLadderWeek,
  finishLadderDay,
  ladderComplete,
  ladderFixture,
  newLadderRun,
} from "@/features/game/view/weekly-run";
import { localizeDigits } from "@/utils/format";
import { ClubCrest } from "./ClubCrest";
import { DraftRoom } from "./DraftRoom";
import { LadderCoachBadge, LadderComingUp, LadderStrap, useCoachCrest } from "./LadderBroadcast";
import { SeasonFixturePlay } from "./SeasonFixturePlay";
import { SquadValuation } from "./SquadValuation";
import { useCraftedTraits } from "@/features/game/view/use-crafted-traits";
import { StancePicker } from "./StancePicker";

export interface LadderClub {
  id: number;
  name: string;
}

/** The coach's index in every ladder league. */
const COACH = 0;
/** The week's deal rules — the DraftRoom and the bench must read the same ones. */
const DEAL = { standout: true, onePerPlayer: true } as const;

/** Fetched rival pools, by club id — shared across weeks so a club is fetched once. */
type Pools = Record<number, PoolCard[]>;

/**
 * TASK-1828 — the Weekly Ladder: one league tournament per ISO week, the same for everyone.
 *
 * Draft once, then a matchday opens every day (Monday opens matchday 1). Missed days can be
 * caught up within the week, in order; when the week ends, any matchday left is a 0–3 no-show.
 *
 * ⚠️ The week resolves AFTER MOUNT, never during render — `/game/weekly` is `force-static`, so a
 * week read during render would bake one visitor's week into the CDN copy.
 *
 * ⚠️ A run belongs to the week it was DRAFTED in, forever. Nothing below re-reads the clock to
 * decide which week a stored run is.
 */
export function WeeklyLadder({ pool, clubs }: { pool: PoolCard[]; clubs: readonly LadderClub[] }) {
  const t = useTranslations("gameWeekly");
  const tg = useTranslations("game");
  const locale = useLocale();
  const n = (v: number | string) => localizeDigits(v, locale);

  const [now, setNow] = useState<{ week: string; weekday: number } | null>(null);
  const [record, setRecord] = useState<WeeklyRecord | null>(null);
  const [history, setHistory] = useState<WeeklyRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pools, setPools] = useState<Pools>({});
  const [poolError, setPoolError] = useState(false);
  const [poolAttempt, setPoolAttempt] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [stance, setStance] = useState<Mentality>("balanced");
  const [playing, setPlaying] = useState<SeasonFixture | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [msLeft, setMsLeft] = useState<number | null>(null);
  // TASK-1829 — the coach's crafted badges play in every ladder fixture he plays.
  const crafted = useCraftedTraits();
  const coachCrest = useCoachCrest();
  /** ⛔ Claimed synchronously so a repeated Return cannot commit a matchday twice. */
  const committing = useRef(false);

  const nameOf = useCallback(
    (id: number) => clubs.find((c) => c.id === id)?.name ?? String(id),
    [clubs],
  );
  const clubIds = useMemo(() => clubs.map((c) => c.id), [clubs]);

  /** Fetch every club these ids name that is not already in hand. */
  const fetchPools = useCallback(
    async (ids: readonly number[], have: Pools): Promise<Pools | null> => {
      const missing = ids.filter((id) => have[id] == null);
      const got = await Promise.all(missing.map((id) => loadRival(id)));
      if (got.some((r) => r == null)) return null;
      const next = { ...have };
      missing.forEach((id, i) => (next[id] = got[i]!.cards));
      return next;
    },
    [],
  );

  /** The league for one record: the coach's XI at index 0, the week's rivals behind him. */
  const teamsFor = useCallback(
    (rec: WeeklyRecord, have: Pools): GameTeam[] | null => {
      const formation = weekFormation(rec.week);
      const byId = new Map(pool.map((c) => [c.cardId, c]));
      const xi = rec.cardIds.map((id) => byId.get(id));
      if (xi.some((c) => c == null) || xi.length !== formation.slots.length) return null;
      const players = xi as PoolCard[];
      // ⭐ His bench is the best of the cards he was DEALT and passed on — never the best of the
      // whole pool, which would seat stars he never saw behind an XI he had to work for.
      const passed = roomDeals(pool, formation, weekSeeds(rec.week).deal, DEAL)
        .flat()
        .filter((c) => !rec.cardIds.includes(c.cardId));
      const coach = makeGameTeam(
        -1,
        tg("yourXi"),
        0,
        formation,
        players,
        reservePlayers(passed, players),
      );
      const rivals = buildLeagueTeams(rec.rivalIds, have, rec.run.seed, nameOf);
      if (rivals.length !== LADDER_DAYS) return null;
      return [coach, ...rivals];
    },
    [pool, nameOf, tg],
  );

  // Resolve the week, read the slot, and close any earlier week that ran out unfinished.
  useEffect(() => {
    let live = true;
    void (async () => {
      const d = new Date();
      const week = isoWeekKey(d);
      setNow({ week, weekday: isoWeekday(d) });
      let all = await allWeekly();
      let have: Pools = {};
      for (const old of all.filter((r) => r.week < week && !ladderComplete(r.run))) {
        const fetched = await fetchPools(old.rivalIds, have);
        if (fetched == null) continue; // Stats read it as unfinished until a later visit.
        have = fetched;
        const teams = teamsFor(old, have);
        if (teams == null) continue;
        const closed = {
          ...old,
          run: closeLadderWeek(old.run, teams, weekRule(old.week).conditions),
        };
        try {
          await saveWeekly(closed);
        } catch {
          continue;
        }
        all = all.map((r) => (r.week === old.week ? closed : r));
      }
      let mine: WeeklyRecord | null = null;
      try {
        mine = await loadWeekly(week);
      } catch {
        mine = null;
      }
      if (!live) return;
      setPools(have);
      setHistory(all);
      setRecord(mine);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
    // Mount only: the week a session opens on is the week it plays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The countdown to the week's close, ticking in state after mount.
  useEffect(() => {
    const tick = () => setMsLeft(msToNextWeek(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const week = now?.week ?? null;
  const rivalIds = useMemo(
    () => (record != null ? record.rivalIds : week == null ? [] : ladderRivals(clubIds, week)),
    [record, week, clubIds],
  );

  // The week's rival squads, once the week is known.
  useEffect(() => {
    if (!loaded || rivalIds.length === 0) return;
    let live = true;
    setPoolError(false);
    void fetchPools(rivalIds, pools).then((got) => {
      if (!live) return;
      if (got == null) setPoolError(true);
      else setPools(got);
    });
    return () => {
      live = false;
    };
    // `pools` is read, not tracked: fetching writes it, and tracking it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rivalIds, poolAttempt, fetchPools]);

  const teams = useMemo(
    () => (record == null ? null : teamsFor(record, pools)),
    [record, pools, teamsFor],
  );

  const commit = async (next: WeeklyRecord) => {
    try {
      await saveWeekly(next);
      setSaveError(false);
      setRecord(next);
      setHistory((h) => [...h.filter((r) => r.week !== next.week), next]);
      return true;
    } catch {
      setSaveError(true);
      return false;
    }
  };

  if (!loaded || now == null || week == null) {
    return <div data-testid="weekly-loading" className="min-h-40" aria-busy="true" />;
  }

  const seeds = weekSeeds(week);
  const formation = weekFormation(week);
  const rule = weekRule(record?.week ?? week);
  const stats = ladderStats(
    history.map((r) => ({
      week: r.week,
      done: ladderComplete(r.run),
      ...ladderStanding(COACH, r.run.results),
    })),
    week,
  );
  // ── the broadcast strap and the ticker beneath it (owner's pick, Ladder #1) ──
  const header = (
    <header className="wl-head">
      <LadderStrap
        brand={t("strapBrand")}
        week={t("strapWeek", { n: n(weekNumber(week)) })}
        rule={t(`rule.${rule.id}.name`)}
        closes={msLeft == null ? null : t("strapCloses", { time: clock(msLeft, n) })}
      />
    </header>
  );
  const ticker = (
    <div className="lb-tick">
      <p data-testid="weekly-rule">
        <strong>{t(`rule.${rule.id}.name`)}</strong> — {t(`rule.${rule.id}.desc`)}
      </p>
      <p data-testid="weekly-stats">
        {t("stats", {
          titles: n(stats.titles),
          streak: n(stats.titleStreak),
          best: stats.bestFinish == null ? "—" : n(stats.bestFinish),
          points: n(stats.bestPoints),
        })}
      </p>
    </div>
  );

  // ── a fixture in progress: the shared season match screens ──
  if (playing != null && record != null && teams != null) {
    const [h, a] = [playing.setup.home, playing.setup.away];
    return (
      <SeasonFixturePlay
        fixture={playing}
        crests={{
          home: h === teams[COACH] ? -1 : record.rivalIds[teams.indexOf(h) - 1]!,
          away: a === teams[COACH] ? -1 : record.rivalIds[teams.indexOf(a) - 1]!,
        }}
        captaincies={{}}
        referees={[]}
        crafted={crafted}
        returnLabel={t("back")}
        onReturn={(result: MatchResult | null) => {
          if (result == null) {
            setPlaying(null);
            return;
          }
          if (committing.current) return;
          committing.current = true;
          const day = nextWeek(record.run);
          let run: SeasonRun;
          try {
            run = finishLadderDay(record.run, teams, rule.conditions, result, stance, crafted);
          } catch {
            committing.current = false;
            setPlaying(null);
            return;
          }
          const fixture = playing;
          void commit({ ...record, run }).then((ok) => {
            committing.current = false;
            if (!ok) return;
            setPlaying(null);
            // TASK-1813/1819 — a PLAYED ladder fixture into the album and the Hall of Fame.
            void recordFullTime(
              matchEntry({
                key: `l:${record.week}:${day}`,
                day: localDay(),
                players: fixture.setup[fixture.coachSide].players,
                result,
                coachSide: fixture.coachSide,
                context: scoreLine(h.name, a.name, result.score),
              }),
            );
          });
        }}
      />
    );
  }

  // ── no squad yet this week: the deal ──
  if (record == null) {
    if (drafting) {
      return (
        <div className="wl lb mx-auto w-full max-w-5xl">
          {header}
          {ticker}
          <DraftRoom
            pool={pool}
            formation={formation}
            seed={seeds.deal}
            limit={null}
            standout={DEAL.standout}
            onePerPlayer={DEAL.onePerPlayer}
            lockPicks
            onComplete={(cardIds: PlayerSeasonId[]) => {
              void commit({
                week,
                cardIds,
                rivalIds: ladderRivals(clubIds, week),
                run: newLadderRun(seeds.league),
              }).then(() => setDrafting(false));
            }}
          />
        </div>
      );
    }
    return (
      <div className="wl lb mx-auto w-full max-w-5xl" data-testid="weekly-intro">
        {header}
        {ticker}
        <p className="lb-intro">{t("intro", { shape: formation.name, days: n(LADDER_DAYS) })}</p>
        <h2 className="lb-cu">{t("rivals")}</h2>
        <ul className="lb-rivals" data-testid="weekly-rivals">
          {rivalIds.map((id) => (
            <li key={id}>
              <ClubCrest teamId={id} size={22} className="wl-crest" />
              {nameOf(id)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-testid="weekly-draft"
          className="lb-go"
          onClick={() => setDrafting(true)}
        >
          {t("draft")}
        </button>
        {saveError ? <p role="alert">{t("saveError")}</p> : null}
      </div>
    );
  }

  // ── the hub ──
  const run = record.run;
  const done = ladderComplete(run);
  const day = nextWeek(run);
  const open = unlockedDays(record.week, week, now.weekday);
  const table = seasonTable(run.clubs, run.results);
  const teamName = (i: number) => (i === COACH ? tg("yourXi") : nameOf(record.rivalIds[i - 1]!));
  const nextFx = done ? null : ladderFixtures()[day]!.find(([h, a]) => h === COACH || a === COACH)!;
  const opp = nextFx == null ? null : nextFx[0] === COACH ? nextFx[1] : nextFx[0];
  const canPlay = !done && day < open && teams != null && !saveError;
  const standing = ladderStanding(COACH, run.results);

  return (
    <div className="wl lb mx-auto w-full max-w-5xl" data-testid="weekly-hub">
      {header}
      {poolError ? (
        <p role="alert">
          {t("rivalsError")}{" "}
          <button type="button" className="underline" onClick={() => setPoolAttempt((x) => x + 1)}>
            {t("retry")}
          </button>
        </p>
      ) : null}
      {saveError ? <p role="alert">{t("saveError")}</p> : null}

      <div className="lb-grid">
        <div className="lb-lt">
          <h2 className="sr-only">{t("table")}</h2>
          <table data-testid="weekly-table" className="lb-table">
            <thead>
              <tr className="lb-hd">
                <th className="lb-ps">#</th>
                <th aria-hidden="true" />
                <th className="lb-nm">{t("club")}</th>
                <th>{t("played")}</th>
                <th>{t("gd")}</th>
                <th className="lb-pt">{t("pts")}</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr key={row.club} className={row.club === COACH ? "lb-row me" : "lb-row"}>
                  <td className="lb-ps">{n(i + 1)}</td>
                  <td className="lb-cr">
                    {row.club === COACH ? (
                      <LadderCoachBadge crest={coachCrest} size={20} />
                    ) : (
                      <ClubCrest teamId={record.rivalIds[row.club - 1]!} size={20} />
                    )}
                  </td>
                  <td className="lb-nm">{teamName(row.club)}</td>
                  <td>{n(row.played)}</td>
                  <td>{n((row.goalDifference > 0 ? "+" : "") + row.goalDifference)}</td>
                  <td className="lb-pt">{n(row.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lb-side-col">
          {done ? (
            <div className="lb-card" data-testid="weekly-final">
              <div className="lb-cu">{t("final")}</div>
              <p className="lb-final">
                {standing.position === 1
                  ? t("champions", { points: n(standing.points) })
                  : t("finished", { position: n(standing.position), points: n(standing.points) })}
              </p>
            </div>
          ) : (
            <LadderComingUp
              label={t("comingUp", {
                matchday: t("matchday", { n: n(day + 1), of: n(LADDER_DAYS) }),
              })}
              venue={nextFx != null && nextFx[0] === COACH ? t("home") : t("away")}
              home={
                <>
                  <LadderCoachBadge crest={coachCrest} size={40} />
                  <span>{tg("yourXi")}</span>
                </>
              }
              away={
                opp == null ? null : (
                  <>
                    <ClubCrest teamId={record.rivalIds[opp - 1]!} size={40} />
                    <span>{teamName(opp)}</span>
                  </>
                )
              }
            >
              {day < open ? (
                <>
                  <div className="lb-stance">
                    <StancePicker value={stance} onChange={setStance} />
                  </div>
                  <button
                    type="button"
                    data-testid="weekly-play"
                    className="lb-go"
                    disabled={!canPlay}
                    onClick={() => {
                      if (teams == null) return;
                      const fx = ladderFixture(run, teams, rule.conditions, stance, crafted);
                      if (fx != null) setPlaying(fx);
                    }}
                  >
                    {t("play", { n: n(day + 1) })}
                  </button>
                  {open - day > 1 ? (
                    <p className="lb-note">{t("catchUp", { count: n(open - day) })}</p>
                  ) : null}
                </>
              ) : (
                <p className="lb-note" data-testid="weekly-locked">
                  {t("locked", { n: n(day + 1) })}
                </p>
              )}
            </LadderComingUp>
          )}
          <div className="lb-card">
            <SquadValuation cards={teams?.[COACH]?.players ?? []} lines={run.market ?? []} />
          </div>
        </div>
      </div>
      {ticker}
    </div>
  );
}

/** d hh:mm:ss in the reader's digits. */
function clock(ms: number, n: (v: string) => string): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
  return n(d > 0 ? `${d}d ${hms}` : hms);
}
