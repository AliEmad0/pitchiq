"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import {
  fixtureSeed,
  isComplete,
  recordResult,
  seasonFixtures,
  seasonTable,
  type SeasonRun,
} from "@/features/game/domain/season";
import { simulate } from "@/features/game/domain/simulate";
import { type Formation, formationKey } from "@/features/game/domain/formation";
import { makeGameTeam } from "@/features/game/domain/team";
import { clearRun, loadRun, saveRun } from "@/features/game/storage/season-slot";
import { buildSeasonTeams } from "@/features/game/view/season-league";
import { clubLogo } from "@/utils/club-logo";
import { prefersReducedMotion } from "@/utils/motion";

export interface SeasonHubProps {
  coachId: number;
  coachName: string;
  seed: number;
  /** One rival pool per club in the league, already fetched. */
  pools: Readonly<Record<number, PoolCard[]>>;
  clubNames: Readonly<Record<number, string>>;
  /** Every club in the league INCLUDING the coach's, in table-index order. */
  leagueIds: readonly number[];
  /** The XI he drafted once and lives with. */
  squad: readonly PoolCard[];
  /** The shape he locked. Passed whole, not as a key — see the note in the component. */
  formation: Formation;
  season?: number;
  /**
   * Leave the season for good. The hub clears the slot itself; this is the caller's half —
   * for `GamePlay` that means dropping back to the draft, since a resumed run is what would
   * otherwise take him straight back here on the next mount.
   */
  onAbandon?: () => void;
}

const GOALS_PER_MATCH = 2.7;

/**
 * TASK-1811 PR 2 — the season hub.
 *
 * ⭐ The surface is the owner's, chosen across three gallery rounds: frame 29 "Cockpit"
 * (header and controls across the top, table and side beneath), the header carrying BOTH a
 * watermark crest and an inline one, crests in the table and on the next fixture, and the
 * matchweek animation composed from 13 + 5 + 9 + 18 + 26.
 *
 * ⛔ The five animations compose only because each touches a DIFFERENT PROPERTY on a DIFFERENT
 * element. The one element carrying two is the coach's own row — transform (the FLIP) and
 * box-shadow (the glow) — so neither overwrites the other. Changing any of them to animate
 * `transform` on `tr.me` would silently break the FLIP.
 */
export function SeasonHub({
  coachId,
  coachName,
  seed,
  pools,
  clubNames,
  leagueIds,
  squad,
  formation,
  season = 2025,
  onAbandon,
}: SeasonHubProps) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();

  /**
   * ⚠️ The league is built ONCE. `buildLeagueTeams` is deterministic, but rebuilding it on
   * every render would re-run 20 drafts per simmed week for no gain.
   */
  const teams = useMemo(
    () =>
      buildSeasonTeams({
        leagueIds,
        pools,
        seed,
        coachId,
        // ⛔ HIS eleven, in the shape he locked — see `buildSeasonTeams` for why this is not
        // left to the league builder.
        coachTeam: makeGameTeam(coachId, coachName, season, formation, [...squad]),
        nameOf: (id) => clubNames[id] ?? String(id),
      }),
    [leagueIds, pools, seed, clubNames, coachId, coachName, season, formation, squad],
  );
  const coachIndex = Math.max(0, leagueIds.indexOf(coachId));
  const clubs = teams.length;
  const schedule = useMemo(
    () => (clubs >= 2 && clubs % 2 === 0 ? seasonFixtures(clubs) : []),
    [clubs],
  );

  const [run, setRun] = useState<SeasonRun>(() => ({
    seed,
    clubs,
    coach: coachIndex,
    results: [],
  }));
  /**
   * Has the slot been read yet? Until it has, nothing may be written.
   *
   * ⛔ Without this an empty run would race the load and overwrite a real season with week 0
   * — and the coach would only find out on the reload after the one that worked.
   */
  const [loaded, setLoaded] = useState(false);
  /** "Abandon" is armed by the first click and fires on the second. */
  const [arming, setArming] = useState(false);
  /** The table order before the last advance, so the FLIP knows how far each row travelled. */
  const wasRef = useRef<Record<number, number>>({});
  const [animate, setAnimate] = useState(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  /**
   * Adopt the stored run, if it is THIS run (TASK-1811).
   *
   * ⛔ The identity check is not defensive tidiness. A `SeasonResult` names clubs by INDEX
   * into this league, and the league is drawn from the seed — so a run saved under another
   * seed, or one whose league came back a different size after a flaky rivals fetch, points
   * its results at clubs this table never drew. It would render as a perfectly ordinary
   * league table and be entirely fictional.
   *
   * ⚠️ Reading happens after mount, never during render: the page is `force-static` and the
   * prerender has no IndexedDB.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const saved = await loadRun();
      if (!live) return;
      if (
        saved != null &&
        saved.seed === seed &&
        saved.clubs === clubs &&
        saved.coach === coachIndex
      ) {
        setRun({
          seed: saved.seed,
          clubs: saved.clubs,
          coach: saved.coach,
          results: saved.results,
        });
      }
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
    // Mount only. The league's identity is fixed for the life of the hub, and re-reading the
    // slot mid-season could only ever undo weeks the coach has just played.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Persist after every advance — around 38 writes across a whole season.
   *
   * ⚠️ Gated on there being results: an empty run is the state a fresh hub is BORN in, so
   * saving it would turn every visit to the setup screen into a wipe.
   */
  useEffect(() => {
    if (!loaded || run.results.length === 0) return;
    void saveRun({
      ...run,
      cardIds: squad.map((p) => p.cardId),
      // ⛔ `formationKey`, not `formation.name`. The record is resolved back through
      // `formationKey(f) === record.formationKey`, so a bare name never matches and the
      // season silently refuses to resume.
      formationKey: formationKey(formation),
    });
  }, [loaded, run, squad, formation]);

  const abandon = useCallback(() => {
    if (!arming) {
      setArming(true);
      return;
    }
    void clearRun();
    setArming(false);
    onAbandon?.();
  }, [arming, onAbandon]);

  /**
   * Animation 9 — first / last / invert / play, on `transform` only.
   *
   * Each row is put back at the position it held before the week was simmed and then released,
   * so a club that climbed three places visibly travels three rows. ⚠️ Driven by the Web
   * Animations API rather than a CSS transition: it starts deterministically after a React
   * re-render, and `getAnimations()` can prove it is alive. A FLIP done with `top` would
   * re-lay-out every frame and fail the motion audit.
   */
  useLayoutEffect(() => {
    if (!animate || reduced) return;
    const rows = bodyRef.current?.querySelectorAll<HTMLTableRowElement>("tr");
    if (rows == null || rows.length === 0) return;
    const h = rows[0]!.getBoundingClientRect().height || 24;
    rows.forEach((row, i) => {
      const was = Number(row.dataset.was);
      const delta = (Number.isFinite(was) ? was - i : 0) * h;
      if (!delta) return;
      row.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0px)" }], {
        duration: 480,
        easing: "cubic-bezier(.22,1,.36,1)",
      });
    });
  }, [animate, run.results.length, reduced]);

  const table = useMemo(() => seasonTable(clubs, run.results), [clubs, run.results]);
  const week = useMemo(
    () => (run.results.length === 0 ? 0 : Math.max(...run.results.map((r) => r.week)) + 1),
    [run.results],
  );

  /** Play `count` whole matchweeks through the REAL engine. */
  const advance = useCallback(
    (count: number) => {
      wasRef.current = Object.fromEntries(
        seasonTable(clubs, run.results).map((row, i) => [row.club, i]),
      );
      let next = run;
      for (let n = 0; n < count; n++) {
        const w = next.results.length === 0 ? 0 : Math.max(...next.results.map((r) => r.week)) + 1;
        const fixtures = schedule[w];
        if (fixtures == null || isComplete(next)) break;
        fixtures.forEach(([h, a], i) => {
          const s = fixtureSeed(next.seed, w, i);
          const res = simulate({
            home: teams[h]!,
            away: teams[a]!,
            seed: s,
            targetGoalsPerMatch: GOALS_PER_MATCH,
          });
          next = recordResult(next, {
            week: w,
            home: h,
            away: a,
            homeGoals: res.score.home,
            awayGoals: res.score.away,
            seed: s,
          });
        });
      }
      setRun(next);
      setAnimate(!reduced);
    },
    [clubs, run, schedule, teams, reduced],
  );

  const myFixtures = useMemo(
    () =>
      schedule.flatMap((wk, w) =>
        wk
          .filter(([h, a]) => h === coachIndex || a === coachIndex)
          .map(([h, a]) => ({ week: w, atHome: h === coachIndex, opp: h === coachIndex ? a : h })),
      ),
    [schedule, coachIndex],
  );
  const next = myFixtures.find((f) => f.week >= week) ?? null;
  const form = run.results
    .filter((r) => r.home === coachIndex || r.away === coachIndex)
    .slice(-5)
    .map((r) => {
      const mine = r.home === coachIndex ? r.homeGoals : r.awayGoals;
      const theirs = r.home === coachIndex ? r.awayGoals : r.homeGoals;
      return mine > theirs ? "W" : mine === theirs ? "D" : "L";
    });

  const idOf = (index: number) => leagueIds[index] ?? 0;
  const nameOf = (index: number) => clubNames[idOf(index)] ?? String(idOf(index));
  const myPos = table.findIndex((r) => r.club === coachIndex) + 1;
  const done = isComplete(run);

  return (
    <section className={`sh${animate ? " sh-play" : ""}`} data-testid="season-hub">
      {/* ── header: BOTH crests (the owner's 12 + 6 hybrid) ───────────────────────── */}
      <div className="sh-hd sh-blk">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="sh-watermark"
          data-testid="season-watermark"
          src={clubLogo(coachId, season)}
          alt=""
          aria-hidden="true"
        />
        <div className="sh-hrow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="sh-crest"
            data-testid="season-crest"
            src={clubLogo(coachId, season)}
            alt=""
          />
          <div className="sh-hdtext">
            <div className="sh-club">{coachName}</div>
            <div className="sh-wk" data-testid="season-week">
              {t("seasonWeek", { week, total: schedule.length, pos: myPos })}
            </div>
          </div>
        </div>
        {/* ⚠️ scaleX, never width — an animated width re-lays-out every frame and fails the
            motion audit. */}
        <div className="sh-prog">
          <i style={{ transform: `scaleX(${schedule.length ? week / schedule.length : 0})` }} />
        </div>
      </div>

      {/* ── controls ──────────────────────────────────────────────────────────────── */}
      <div className="sh-ctl sh-blk">
        <div className="sh-ttl">{t("seasonMatchweek")}</div>
        <div className="sh-btns">
          <button type="button" className="sh-go" onClick={() => advance(1)} disabled={done}>
            {t("seasonSimWeek")}
          </button>
          <button type="button" onClick={() => advance(5)} disabled={done}>
            {t("seasonSimFive")}
          </button>
          <button type="button" onClick={() => advance(schedule.length)} disabled={done}>
            {t("seasonSimEnd")}
          </button>
        </div>
        <div className="sh-wk sh-hint">{t("seasonAutoHint")}</div>
        {/* ⚠️ Two clicks. It sits beside "Sim week", and one stray click must not destroy a
            season that took thirty-eight of them to build. */}
        <button
          type="button"
          className={`sh-ab${arming ? " sh-arm" : ""}`}
          data-testid="season-abandon"
          onClick={abandon}
        >
          {arming ? t("seasonAbandonSure") : t("seasonAbandon")}
        </button>
      </div>

      {/* ── the league ────────────────────────────────────────────────────────────── */}
      <div className="sh-tbl sh-blk">
        <div className="sh-ttl">{t("seasonLeague")}</div>
        <table>
          <thead>
            <tr>
              <th />
              <th>{t("seasonClub")}</th>
              <th>{t("seasonPlayed")}</th>
              <th>{t("seasonGd")}</th>
              <th>{t("seasonPts")}</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {table.map((row, i) => (
              <tr
                key={row.club}
                data-testid="season-row"
                data-club={row.club}
                data-was={wasRef.current[row.club] ?? i}
                data-played={row.played}
                data-points={row.points}
                data-gf={row.goalsFor}
                data-ga={row.goalsAgainst}
                className={row.club === coachIndex ? "sh-me" : undefined}
              >
                <td>{i + 1}</td>
                <td>
                  <span className="sh-cn">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="sh-tb"
                      data-testid="season-row-crest"
                      src={clubLogo(idOf(row.club), season)}
                      alt=""
                    />
                    {nameOf(row.club)}
                  </span>
                </td>
                <td>{row.played}</td>
                <td>
                  {row.goalDifference > 0 ? "+" : ""}
                  {row.goalDifference}
                </td>
                <td>
                  <b>{row.points}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── your side of it ───────────────────────────────────────────────────────── */}
      <div className="sh-side sh-blk">
        <div className="sh-ttl">{t("seasonNext")}</div>
        <div className="sh-bigfx" data-testid="season-next">
          {next ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="sh-fcrest"
                data-testid="season-next-crest"
                src={clubLogo(idOf(next.opp), season)}
                alt=""
              />
              <div>
                <div className="sh-op">{nameOf(next.opp)}</div>
                <div className="sh-ha">
                  {next.atHome ? t("seasonHome") : t("seasonAway")} ·{" "}
                  {t("seasonWeekN", { n: next.week + 1 })}
                </div>
              </div>
            </>
          ) : (
            <div className="sh-op">{t("seasonComplete")}</div>
          )}
        </div>

        <div className="sh-ttl sh-gap">{t("seasonForm")}</div>
        <div className="sh-form">
          {form.length === 0 ? (
            <i>–</i>
          ) : (
            form.map((f, i) => (
              <i key={i} className={`sh-${f}`}>
                {f}
              </i>
            ))
          )}
        </div>

        {/* ⚠️ The shape is shown because a season is "draft once and live with it" — it is
            fixed for all 38 weeks, so it is a standing fact about the run rather than a
            setting. It is also the field a resumed run is rebuilt from. */}
        <div className="sh-ttl sh-gap">
          {t("seasonSquad")} · {formation.name}
        </div>
        <div className="sh-sq" data-testid="season-squad">
          {squad.map((p) => (
            <span key={p.cardId}>
              {p.role} {p.name.split(" ").pop()} {p.ratings?.overall ?? 0}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
