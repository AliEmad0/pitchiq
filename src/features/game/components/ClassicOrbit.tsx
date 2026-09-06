"use client";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import type { ClassicData } from "../domain/classic-data";
import type { GameTeam } from "../domain/team";
import type { ClassicRun } from "../view/classic-run";
import { compareHistoricalRun } from "../domain/classic-season";
import { seasonTable } from "../domain/season";
import { HistoricalSquad } from "./HistoricalSquad";
import { clubLogo } from "@/utils/club-logo";
import styles from "./ClassicOrbit.module.css";

export interface HistoricalSeasonViewProps {
  data: ClassicData;
  teams: GameTeam[];
  run: ClassicRun;
  seasons: number[];
  started: boolean;
  unavailable?: boolean;
  clubId: number;
  shape: string;
  busy: boolean;
  abandon: boolean;
  onSeason: (v: number) => void;
  onClub: (v: number) => void;
  onShape: (v: string) => void;
  onCards: (v: string[]) => void;
  onStart: () => void;
  onSim: () => void;
  onPlay: () => void;
  onAbandon: () => void;
}

export function ClassicOrbit({
  data,
  teams,
  run,
  seasons,
  started,
  unavailable = false,
  clubId,
  shape,
  busy,
  abandon,
  onSeason,
  onClub,
  onShape,
  onCards,
  onStart,
  onSim,
  onPlay,
  onAbandon,
}: HistoricalSeasonViewProps) {
  const t = useTranslations("gameClassic");
  const locale = useLocale();
  const n = (v: number) => v.toLocaleString(locale);
  const coach = teams[run.coach];
  const club = data.squads.find((c) => c.teamId === clubId)!;
  const fixtures = data.schedule.fixtures.filter(
    (f) => f.home === run.coach || f.away === run.coach,
  );
  const ids = new Set(fixtures.map((f) => f.id));
  const ghost = compareHistoricalRun(
    data.schedule,
    run.coach,
    run.results.filter((r) => ids.has(r.fixtureId)),
  );
  const next = fixtures[ghost.played];
  const target = data.table.find((r) => r.club === run.coach)!;
  const table = seasonTable(
    teams.length,
    run.results.map((r, i) => ({ ...data.schedule.fixtures[i], ...r, week: i })),
  );
  const last = ghost.comparisons.at(-1);
  return (
    <section className={styles.root} aria-label={t("title")}>
      <header className={styles.header}>
        <span>
          {t("eyebrow", { season: `${data.season}–${String(data.season + 1).slice(-2)}` })}
        </span>
        <h1>{t("title")}</h1>
        <p>
          {coach.name} · {t("progress", { played: ghost.played, total: ghost.total })}
        </p>
      </header>
      {!started && (
        <fieldset className={styles.chooser} disabled={busy}>
          <legend>{t("choose")}</legend>
          <label>
            {t("season")}
            <select value={data.season} onChange={(e) => onSeason(Number(e.target.value))}>
              {seasons.map((y) => (
                <option key={y} value={y}>
                  {y}–{String(y + 1).slice(-2)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("club")}
            <select value={clubId} onChange={(e) => onClub(Number(e.target.value))}>
              {data.squads.map((c) => (
                <option key={c.teamId} value={c.teamId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("formation")}
            <select value={shape} onChange={(e) => onShape(e.target.value)}>
              {club.formations.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </fieldset>
      )}
      <div className={styles.main}>
        <div className={styles.orbitWrap}>
          <ol className={styles.orbit} aria-label={t("fixtureTrail")}>
            {fixtures.map((f, i) => {
              const side = f.home === run.coach ? "home" : "away";
              const opponent = teams[side === "home" ? f.away : f.home].name;
              const title = `${n(i + 1)} · ${opponent} · ${t(side)} · ${f.date.slice(0, 10)} · ${t("historyScore", { home: f.homeGoals, away: f.awayGoals })}`;
              return (
                <li
                  key={f.id}
                  className={`${styles.node} ${i < ghost.played ? styles.done : ""} ${i === ghost.played ? styles.current : ""}`}
                  aria-label={title}
                  title={title}
                  aria-current={i === ghost.played ? "step" : undefined}
                  style={{ "--angle": `${(i / fixtures.length) * 360}deg` } as CSSProperties}
                >
                  <span>{n(i + 1)}</span>
                </li>
              );
            })}
          </ol>
          <div className={styles.core}>
            <Image src={clubLogo(clubId, data.season)} alt="" width={76} height={76} />
            <strong>{n(ghost.points)}</strong>
            <span>{t("yourPoints")}</span>
            <p>{t("historyPoints", { points: ghost.historicalPoints })}</p>
          </div>
        </div>
        <div className={styles.console}>
          <span className={styles.kicker}>{next ? t("next") : t("complete")}</span>
          <h2>{next ? `${teams[next.home].name} × ${teams[next.away].name}` : coach.name}</h2>
          {next && (
            <p>
              {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
                new Date(next.date),
              )}{" "}
              · {t(next.home === run.coach ? "home" : "away")}
            </p>
          )}
          {next && <p>{t("historyScore", { home: next.homeGoals, away: next.awayGoals })}</p>}
          {unavailable && <p role="alert">{t("unavailable")}</p>}
          <div className={styles.actions}>
            {!started ? (
              <button type="button" disabled={busy} onClick={onStart}>
                {t("start")}
              </button>
            ) : (
              <>
                <button type="button" disabled={busy || ghost.complete} onClick={onSim}>
                  {t(unavailable ? "forfeit" : "sim")}
                </button>
                <button
                  type="button"
                  disabled={busy || ghost.complete || unavailable}
                  onClick={onPlay}
                >
                  {t("play")}
                </button>
              </>
            )}
          </div>
          <div className={styles.chase}>
            <h3>{t("chase")}</h3>
            <div className={styles.duel}>
              <div>
                <b>{n(ghost.points)}</b>
                <span>{t("you")}</span>
              </div>
              <span>↔</span>
              <div>
                <b>{n(ghost.historicalPoints)}</b>
                <span>{t("history")}</span>
              </div>
            </div>
            <p>{t("delta", { points: ghost.pointsDelta, played: ghost.played })}</p>
          </div>
          {last && (
            <p role="status">
              {t("last", {
                gf: last.goalsFor,
                ga: last.goalsAgainst,
                realGf: last.historicalGoalsFor,
                realGa: last.historicalGoalsAgainst,
              })}
            </p>
          )}
        </div>
      </div>
      <div className={styles.lower}>
        <section className={styles.target}>
          <h2>{t("target")}</h2>
          <strong>{n(target.points)}</strong>
          <p>{t("targetPlace", { rank: target.rank })}</p>
          {started && (
            <button type="button" disabled={busy} onClick={onAbandon}>
              {t(abandon ? "confirmAbandon" : "abandon")}
            </button>
          )}
        </section>
        <section className={styles.tablePanel}>
          <h2>{t("league")}</h2>
          <div className={styles.scroll}>
            <table>
              <caption className="sr-only">{t("league")}</caption>
              <thead>
                <tr>
                  {["position", "club", "played", "difference", "points"].map((key) => (
                    <th scope="col" key={key}>
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map((row, i) => (
                  <tr key={row.club} className={row.club === run.coach ? styles.own : undefined}>
                    <td>{n(i + 1)}</td>
                    <th scope="row">
                      <Image
                        src={clubLogo(teams[row.club].teamId, data.season)}
                        alt=""
                        width={22}
                        height={22}
                      />
                      {teams[row.club].name}
                    </th>
                    <td>{n(row.played)}</td>
                    <td>{n(row.goalDifference)}</td>
                    <td>{n(row.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <HistoricalSquad
        {...{ data, teams, run, clubId, started, busy, unavailable, onCards }}
        complete={ghost.complete}
      />
    </section>
  );
}
