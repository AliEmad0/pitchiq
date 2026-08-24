"use client";
import { useLocale, useTranslations } from "next-intl";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { localizeDigits } from "@/utils/format";
import { prefersReducedMotion } from "@/utils/motion";
import { PlayerCard } from "./PlayerCard";

// ⚠️ The same maps `MatchupPreview` uses — the engine's own style names, not invented ones.
const REFEREE_KEY: Record<RefereeStyle, string> = {
  strict: "refereeStrict",
  lenient: "refereeLenient",
  "crowd-influenced": "refereeCrowdInfluenced",
};
const WEATHER_KEY: Record<Weather, string> = {
  clear: "weatherClear",
  rain: "weatherRain",
  "heavy-rain": "weatherHeavyRain",
  wind: "weatherWind",
  snow: "weatherSnow",
};

interface Props {
  home: GameTeam;
  /**
   * The rival the coach will actually face.
   *
   * ⛔ Taken from the LIVE SESSION (`driver.match.away`), never drafted here. The opponent
   * is part of the match's identity — `buildSession` derives it from the day's match seed —
   * so a second draw on this screen would show the coach an eleven he never plays.
   */
  away: GameTeam;
  referee: RefereeStyle | null;
  weather: Weather | null;
  onKickOff: () => void;
}

const avgOf = (team: GameTeam): number => {
  const rs = team.players.map((p) => p.ratings?.overall).filter((r): r is number => r != null);
  return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : 0;
};

/**
 * The daily pre-match screen (TASK-1836) — the second half of the owner's Arcade Cabinet
 * design: the eleven he just picked, against the eleven he is about to face.
 *
 * ⚠️ There is no "back to the squad". The daily's picks are final by design, so a control
 * offering a return to a draft that cannot be re-run would be a dead promise.
 */
export function DailyPreview({ home, away, referee, weather, onKickOff }: Props) {
  const t = useTranslations("game");
  const locale = useLocale();
  const reduced = prefersReducedMotion();
  const n = (v: number) => localizeDigits(v, locale);

  const side = (team: GameTeam, label: string, tone: "home" | "away") => (
    <div className={`dh-side dh-side-${tone}`}>
      <p className="dh-side-label">{label}</p>
      <div className="dh-side-cards">
        {team.players.map((p) => (
          <span key={p.playerId} className="dh-side-card">
            <PlayerCard card={p as EnrichedCard} reduced={reduced} interactive={false} />
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="dh-vs" data-testid="daily-vs">
        <div>
          <span className="dh-vs-label">{t("yourXi")}</span>
          <span className="dh-vs-num">{n(avgOf(home))}</span>
          <span className="dh-vs-tag">{home.formation.name}</span>
        </div>
        <span className="dh-vs-mid" aria-hidden>
          {t("mnVersus")}
        </span>
        <div>
          <span className="dh-vs-label">{away.name}</span>
          <span className="dh-vs-num dh-vs-away">{n(avgOf(away))}</span>
          <span className="dh-vs-tag dh-vs-tag-away">{away.formation.name}</span>
        </div>
      </div>

      {/* The conditions the coach used to get as tiles — kept as one quiet line so the
          redesign does not silently drop information he already had. */}
      <p className="dh-conditions">
        {referee != null ? t(REFEREE_KEY[referee]) : "—"} ·{" "}
        {weather != null ? t(WEATHER_KEY[weather]) : "—"}
      </p>

      <div className="dh-sides">
        {side(home, t("yourXi"), "home")}
        {side(away, away.name, "away")}
      </div>

      <div className="dh-slotbar dh-slotbar-kick">
        <p className="dh-insert">{t("dailyKickInsert")}</p>
        <button type="button" onClick={onKickOff} className="dh-start">
          {t("playKickOff")}
        </button>
      </div>
    </div>
  );
}
