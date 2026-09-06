"use client";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { HistoricalSeasonViewProps } from "./ClassicOrbit";
import { HistoricalSquad } from "./HistoricalSquad";
import { survivalProgress } from "../domain/survival";
import { scenarioFor, survivalCandidates } from "../view/survival-session";
import { clubLogo } from "@/utils/club-logo";
import styles from "./SurvivalLifeline.module.css";
export function SurvivalLifeline(props: HistoricalSeasonViewProps) {
  const {
    data,
    teams,
    run,
    seasons,
    started,
    unavailable,
    clubId,
    shape,
    busy,
    abandon,
    onSeason,
    onClub,
    onShape,
    onStart,
    onSim,
    onPlay,
    onAbandon,
  } = props;
  const t = useTranslations("gameSurvival"),
    c = useTranslations("gameClassic"),
    locale = useLocale();
  const n = (v: number) => v.toLocaleString(locale);
  const scenario = scenarioFor(data, clubId),
    p = survivalProgress(data.schedule, scenario, run.results);
  const club = data.squads.find((c) => c.teamId === clubId)!,
    candidates = survivalCandidates(data);
  const crest = (index: number, size = 28) => (
    <Image src={clubLogo(teams[index].teamId, data.season)} alt="" width={size} height={size} />
  );
  const next = p.remaining[0],
    opponent = next && (next.home === run.coach ? next.away : next.home);
  const last = run.results.findLast((r) => {
      const f = data.schedule.fixtures.find((f) => f.id === r.fixtureId);
      return f && (f.home === run.coach || f.away === run.coach);
    }),
    lastFixture = last && data.schedule.fixtures.find((f) => f.id === last.fixtureId);
  const maximum = Math.max(scenario.targetPoints + 10, p.own.points + 5);
  return (
    <section className={styles.root} aria-label={t("title")}>
      <header>
        <p>
          {data.season} / {t("survival")}
        </p>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </header>
      {!started && (
        <fieldset disabled={busy} className={styles.chooser}>
          <legend>{c("choose")}</legend>
          <label>
            {c("season")}
            <select value={data.season} onChange={(e) => onSeason(Number(e.target.value))}>
              {seasons.map((y) => (
                <option key={y} value={y}>
                  {y}–{String(y + 1).slice(-2)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {c("club")}
            <select value={clubId} onChange={(e) => onClub(Number(e.target.value))}>
              {data.squads
                .filter((c) => candidates.includes(c.teamId))
                .map((c) => (
                  <option key={c.teamId} value={c.teamId}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            {c("formation")}
            <select value={shape} onChange={(e) => onShape(e.target.value)}>
              {club.formations.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      <div className={styles.columns}>
        <section className={styles.gaugePanel} aria-label={t("benchmark")}>
          <p>{t("benchmark")}</p>
          <strong>{n(p.own.points)}</strong>
          <span>{c("points")}</span>
          <div
            className={styles.gauge}
            role="meter"
            aria-label={c("points")}
            aria-valuenow={p.own.points}
            aria-valuemin={0}
            aria-valuemax={maximum}
          >
            <div style={{ height: `${(100 * p.own.points) / maximum}%` }} />
            <span style={{ bottom: `${(100 * scenario.targetPoints) / maximum}%` }}>
              {n(scenario.targetPoints)}
            </span>
          </div>
          <p>{t("needed", { points: p.pointsNeeded })}</p>
          <small>{t("benchmarkHint")}</small>
        </section>
        <section className={styles.fixtures} aria-label={c("fixtureTrail")}>
          <h2 className={styles.team}>
            {crest(run.coach, 52)}
            {club.name}
          </h2>
          {next && opponent != null ? (
            <div className={styles.next}>
              <p>
                {next.date.slice(0, 10)} · {c(next.home === run.coach ? "home" : "away")}
              </p>
              <h3 className={styles.team}>
                {crest(opponent, 44)}
                {teams[opponent].name}
              </h3>
              <p>{t("opportunity")}</p>
            </div>
          ) : (
            <div className={styles.next} role="status">
              <h3>{t(p.status)}</h3>
            </div>
          )}
          <p>{t("remaining", { count: p.remaining.length })}</p>
          <ol className={styles.list}>
            {p.remaining.slice(0, 6).map((f, i) => {
              const other = f.home === run.coach ? f.away : f.home;
              return (
                <li key={f.id}>
                  <b>{n(i + 1).padStart(2, "0")}</b>
                  <span className={styles.team}>
                    {crest(other)}
                    {teams[other].name}
                  </span>
                  <small>
                    {f.date.slice(5, 10)} · {c(f.home === run.coach ? "home" : "away")}
                  </small>
                </li>
              );
            })}
          </ol>
          <div className={styles.actions}>
            {!started ? (
              <button disabled={busy} onClick={onStart}>
                {t("start")}
              </button>
            ) : (
              <>
                <button disabled={busy || p.complete} onClick={onSim}>
                  {c(unavailable ? "forfeit" : "sim")}
                </button>
                <button disabled={busy || p.complete || unavailable} onClick={onPlay}>
                  {c("play")}
                </button>
              </>
            )}
          </div>
          {unavailable && <p role="status">{c("injuryRules")}</p>}
          {last && lastFixture && (
            <p role="status">
              {teams[lastFixture.home].name} {n(last.homeGoals)} – {n(last.awayGoals)}{" "}
              {teams[lastFixture.away].name}
            </p>
          )}
        </section>
        <section className={styles.tablePanel}>
          <p>{c("position")}</p>
          <strong>{n(p.position)}</strong>
          <h2>{c("league")}</h2>
          <div className={styles.scroll}>
            <table>
              <caption className="sr-only">{c("league")}</caption>
              <thead>
                <tr>
                  {["position", "club", "played", "difference", "points"].map((k) => (
                    <th key={k} scope="col">
                      {c(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.table.map((r, i) =>
                  i < p.table.length - 7 && r.club !== run.coach ? null : (
                    <tr
                      key={r.club}
                      className={`${r.club === run.coach ? styles.own : ""} ${i === p.safePlaces ? styles.boundary : ""}`}
                    >
                      <td>{n(i + 1)}</td>
                      <th scope="row">
                        <span className={styles.team}>
                          {crest(r.club, 22)}
                          {teams[r.club].name}
                        </span>
                      </th>
                      <td>{n(r.played)}</td>
                      <td>{n(r.goalDifference)}</td>
                      <td>{n(r.points)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
          <p>{t("relegation", { count: scenario.relegated })}</p>
        </section>
      </div>
      <HistoricalSquad {...props} complete={p.complete} />
      {started && (
        <button className={styles.abandon} disabled={busy} onClick={onAbandon}>
          {c(abandon ? "confirmAbandon" : "abandon")}
        </button>
      )}
    </section>
  );
}
