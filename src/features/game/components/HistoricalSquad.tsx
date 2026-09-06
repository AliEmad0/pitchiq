"use client";
import { useLocale, useTranslations } from "next-intl";
import { canPlay } from "../domain/eligibility";
import type { HistoricalSeasonViewProps } from "./ClassicOrbit";
import styles from "./ClassicOrbit.module.css";
export function HistoricalSquad({
  data,
  teams,
  run,
  clubId,
  started,
  busy,
  unavailable,
  onCards,
  complete,
}: Pick<
  HistoricalSeasonViewProps,
  "data" | "teams" | "run" | "clubId" | "started" | "busy" | "unavailable" | "onCards"
> & { complete: boolean }) {
  const t = useTranslations("gameClassic"),
    locale = useLocale();
  const n = (value: number) => value.toLocaleString(locale);
  const coach = teams[run.coach],
    club = data.squads.find((c) => c.teamId === clubId)!;
  return (
    <details className={styles.squad} open={!started}>
      <summary>{t("squad")}</summary>
      {!complete && <p>{t(started ? "rotationHint" : "squadHint")}</p>}
      {started && <p>{t("injuryRules")}</p>}
      {(run.injuries ?? []).map((injury) => (
        <p key={injury.cardId}>
          {t("injured", {
            name: club.pool.find((p) => p.cardId === injury.cardId)!.name,
            count: injury.remaining,
          })}
        </p>
      ))}
      <div className={styles.players}>
        {coach.players.map((player, i) => (
          <label key={i}>
            <span>{coach.formation.slots[i].role}</span>
            {started && complete ? (
              <b>{player.name}</b>
            ) : (
              <select
                aria-label={`${t("slot")} ${i + 1} ${coach.formation.slots[i].role}`}
                disabled={busy || unavailable}
                value={player.cardId}
                onChange={(e) => {
                  const values = coach.players.map((p) => p.cardId as string);
                  values[i] = e.target.value;
                  onCards(values);
                }}
              >
                {club.pool
                  .filter(
                    (p) =>
                      canPlay(p, coach.formation.slots[i].role) &&
                      (p.playerId === player.playerId ||
                        !coach.players.some((chosen) => chosen.playerId === p.playerId)),
                  )
                  .map((p) => (
                    <option
                      key={p.cardId}
                      value={p.cardId}
                      disabled={run.injuries?.some((injury) => injury.cardId === p.cardId)}
                    >
                      {p.name} · {n(p.ratings?.overall ?? 0)}
                    </option>
                  ))}
              </select>
            )}
            <span>{n(player.ratings?.overall ?? 0)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
