"use client";
import { useTranslations } from "next-intl";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";
import type { GameTeam } from "@/features/game/domain/team";
import { MiniPitch } from "./MiniPitch";

interface Props {
  home: GameTeam;
  away: GameTeam;
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

const REFEREE_IMPACT_KEY: Record<RefereeStyle, string> = {
  strict: "refereeStrictImpact",
  lenient: "refereeLenientImpact",
  "crowd-influenced": "refereeCrowdInfluencedImpact",
};

const WEATHER_KEY: Record<Weather, string> = {
  clear: "weatherClear",
  rain: "weatherRain",
  "heavy-rain": "weatherHeavyRain",
  wind: "weatherWind",
  snow: "weatherSnow",
};

const WEATHER_IMPACT_KEY: Record<Weather, string> = {
  clear: "weatherClearImpact",
  rain: "weatherRainImpact",
  "heavy-rain": "weatherHeavyRainImpact",
  wind: "weatherWindImpact",
  snow: "weatherSnowImpact",
};

/**
 * The VS screen — both XIs, who is refereeing, and what the weather is doing.
 *
 * ⚠️ This is a PHASE, not a route (TASK-1832 D9). The live session — the generator, the
 * seed, the drafted XI — lives in `GamePlay`'s memory; navigating to a `/game/pre-match`
 * URL would drop it, and surviving that means lifting session state into a provider above
 * every game route for nothing visible in return.
 *
 * Not trivia: a strict referee books far more and rain makes the game scrappier, so each
 * condition carries a line on what it DOES rather than only what it is.
 */
export function MatchupPreview({ home, away, referee, weather, onKickOff, onBack }: Props) {
  const t = useTranslations("game");

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("playPreviewTitle")}</h1>

      <div className="my-6 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <MiniPitch team={home} />
        <span className="text-center font-mono text-sm font-black text-cyan-300">{"–"}</span>
        <MiniPitch team={away} />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground font-mono text-[10px] font-bold tracking-widest uppercase">
            {t("playReferee")}
          </dt>
          <dd className="mt-1 text-sm font-semibold">
            {referee != null ? t(REFEREE_KEY[referee]) : "—"}
          </dd>
          {referee != null ? (
            <dd className="text-muted-foreground mt-1 text-xs">{t(REFEREE_IMPACT_KEY[referee])}</dd>
          ) : null}
        </div>
        <div className="border-border rounded-lg border p-3">
          <dt className="text-muted-foreground font-mono text-[10px] font-bold tracking-widest uppercase">
            {t("playWeather")}
          </dt>
          <dd className="mt-1 text-sm font-semibold">
            {weather != null ? t(WEATHER_KEY[weather]) : "—"}
          </dd>
          {weather != null ? (
            <dd className="text-muted-foreground mt-1 text-xs">{t(WEATHER_IMPACT_KEY[weather])}</dd>
          ) : null}
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
