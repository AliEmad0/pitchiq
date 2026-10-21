"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Mentality } from "@/features/game/domain/mentality";
import { styleEdge, type TacticalStyle } from "@/features/game/domain/opponent";
import { STYLES, TENDENCY_P } from "@/features/game/domain/style-scouting";
import { localizeDigits } from "@/utils/format";
import { StancePicker } from "./StancePicker";

/** Catalog keys for the six styles (next-intl keys avoid dashes). */
const KEY: Record<TacticalStyle, string> = {
  balanced: "balanced",
  "tiki-taka": "tikiTaka",
  "high-press": "highPress",
  "low-block": "lowBlock",
  counter: "counter",
  direct: "direct",
};

export interface ScoutingDossierProps {
  opponentName: string;
  /** The opponent's usual style, read from its XI (`styleTendency`). */
  tendency: TacticalStyle;
  picked: TacticalStyle;
  onPick: (s: TacticalStyle) => void;
  /** The coach's stance (mentality). Both present = the stance picker shows beneath the styles. */
  stance?: Mentality;
  onStance?: (m: Mentality) => void;
  /** Both styles once Kick off is pressed; null before. */
  revealed: { home: TacticalStyle; away: TacticalStyle } | null;
  onKickOff: () => void;
  onWalkOut: () => void;
}

/**
 * TASK-1825 — the owner's Style #2, "Scout's Dossier", on the pre-match screen.
 *
 * The scout names the opponent's usual style and prices all six (their usual at
 * `TENDENCY_P`, each other at an equal share of the rest); the coach picks; Kick off reveals
 * what they actually played and who has the edge; Walk out starts the match.
 *
 * ⚠️ The odds shown are the SAME constants the draw uses — never copy the numbers, or the
 * dossier promises odds the engine does not play.
 */
export function ScoutingDossier({
  opponentName,
  tendency,
  picked,
  onPick,
  stance,
  onStance,
  revealed,
  onKickOff,
  onWalkOut,
}: ScoutingDossierProps) {
  const t = useTranslations("gameStyle");
  const locale = useLocale();
  const name = (s: TacticalStyle) => t(`style.${KEY[s]}`);
  const other = Math.round(((1 - TENDENCY_P) / (STYLES.length - 1)) * 100);
  const odds = STYLES.map(
    (s) => [s, s === tendency ? Math.round(TENDENCY_P * 100) : other] as const,
  );
  const edge = revealed == null ? 0 : styleEdge(revealed.home, revealed.away);

  return (
    <section className="sd-dossier is-stamped" aria-label={t("title")}>
      <div className="sd-head">
        <h3 className="sd-title">{t("title")}</h3>
        <span className="sd-stamp">{t("stamp")}</span>
      </div>
      <p className="sd-scout" data-testid="sd-scout">
        {t("usually", {
          style: name(tendency),
          n: localizeDigits(Math.round(TENDENCY_P * 10), locale),
        })}
      </p>
      <p className="sd-label">{t("oddsLabel", { team: opponentName })}</p>
      <div className="sd-odds">
        {odds.map(([s, pct], i) => (
          <div key={s} className="sd-row" data-testid="sd-odds">
            <span>{name(s)}</span>
            <span className="sd-track">
              <i
                className="sd-bar"
                style={{ width: `${pct}%`, ["--i" as string]: i } as React.CSSProperties}
              />
            </span>
            <span className="sd-pct">{localizeDigits(`${pct}%`, locale)}</span>
          </div>
        ))}
      </div>
      <p className="sd-label">{t("yourStyle")}</p>
      <div className="sd-picks">
        {STYLES.map((s) => (
          <button
            key={s}
            type="button"
            className="sd-pick"
            aria-pressed={picked === s}
            disabled={revealed != null}
            onClick={() => onPick(s)}
          >
            {name(s)}
            <small>{t(`blurb.${KEY[s]}`)}</small>
          </button>
        ))}
      </div>
      {stance != null && onStance != null ? (
        <StancePicker value={stance} onChange={onStance} disabled={revealed != null} />
      ) : null}
      {revealed == null ? (
        <button type="button" className="lg-kick sd-go" onClick={onKickOff}>
          {t("kickOff")}
        </button>
      ) : (
        <>
          <div
            className={`sd-verdict ${edge > 0 ? "is-win" : edge < 0 ? "is-lose" : "is-none"}`}
            role="status"
          >
            <p>{t("played", { style: name(revealed.away) })}</p>
            <p>
              {edge > 0
                ? t("edgeWin", { mine: name(revealed.home), theirs: name(revealed.away) })
                : edge < 0
                  ? t("edgeLose", { mine: name(revealed.home), theirs: name(revealed.away) })
                  : t("edgeNone")}
            </p>
          </div>
          <button type="button" className="lg-kick sd-go" onClick={onWalkOut}>
            {t("walkOut")}
          </button>
        </>
      )}
    </section>
  );
}
