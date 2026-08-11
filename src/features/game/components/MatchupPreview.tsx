"use client";
import { useTranslations } from "next-intl";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";

interface Props {
  homeName: string;
  awayName: string;
  /**
   * ⚠️ READ from the first segment's events, never recomputed.
   *
   * `pickReferee(rng())` and `pickWeather(rng())` are the first two draws inside
   * `runMatch`. Drawing them again out here would consume from a different stream and
   * show the coach an official who is not the one about to take charge.
   */
  referee: RefereeStyle | null;
  weather: Weather | null;
  onKickOff: () => void;
  onBack: () => void;
}

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

/**
 * The VS screen — who you are facing, who is refereeing, and what the weather is doing.
 *
 * Not trivia: a strict referee books far more, and rain makes the game scrappier. Both
 * are already decided by the time this renders, so the coach sees the conditions he is
 * committing to rather than discovering them at 20 minutes.
 */
export function MatchupPreview({
  homeName,
  awayName,
  referee,
  weather,
  onKickOff,
  onBack,
}: Props) {
  const t = useTranslations("game");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("playPreviewTitle")}</h1>

      <div className="my-6 flex items-center justify-center gap-6 rounded-2xl bg-[radial-gradient(120%_80%_at_50%_-10%,#12202c,#060a0f)] p-8 ring-1 ring-cyan-400/20">
        <span className="flex-1 text-end text-lg font-bold text-white">{homeName}</span>
        <span className="font-mono text-sm font-black text-cyan-300">{"–"}</span>
        <span className="flex-1 text-start text-lg font-bold text-white">{awayName}</span>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground font-mono text-[10px] font-bold tracking-widest uppercase">
            {t("playReferee")}
          </dt>
          <dd className="mt-1 text-sm font-semibold">
            {referee != null ? t(REFEREE_KEY[referee]) : "—"}
          </dd>
        </div>
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground font-mono text-[10px] font-bold tracking-widest uppercase">
            {t("playWeather")}
          </dt>
          <dd className="mt-1 text-sm font-semibold">
            {weather != null ? t(WEATHER_KEY[weather]) : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border-border rounded-md border px-4 py-2 text-sm font-semibold"
        >
          {t("playBackToSquad")}
        </button>
        <button
          type="button"
          onClick={onKickOff}
          className="bg-primary text-primary-foreground ms-auto rounded-md px-5 py-2 text-sm font-bold"
        >
          {t("playKickOff")}
        </button>
      </div>
    </div>
  );
}
