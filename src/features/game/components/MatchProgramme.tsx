"use client";
import { useTranslations } from "next-intl";
import type { RefereeStyle, Weather } from "@/features/game/domain/match-types";
import { teamChemistry } from "@/features/game/domain/chemistry";
import { decadeSpan, squadAverage, starOf, taleOfTheTape } from "@/features/game/domain/matchup";
import type { EnrichedCard } from "@/features/game/domain/player-card";
import type { GameTeam } from "@/features/game/domain/team";
import { prefersReducedMotion } from "@/utils/motion";
import { ClubCrest } from "./ClubCrest";
import { PlayerCard } from "./PlayerCard";

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
  /** The two clubs' ids, for their crests. See `MatchLive`'s prop of the same name. */
  crests?: { home: number | null; away: number | null };
  /**
   * Score BOTH sides on chemistry and add it to the tale of the tape (Chemistry Draft,
   * owner request 2026-08-28). Absent = the tape is exactly the four bars it always was.
   */
  chemistry?: boolean;
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
 * TASK-1810 — `?phase=preview`, the matchday programme.
 *
 * The owner's pick was a HYBRID of three gallery concepts: 12 Star Spotlight, 21 Programme
 * Spread and 22 Chalk & Compare. Each arrived with its own palette (neutral cards, light
 * newsprint, wood-framed green) and the instruction was explicit — one theme across the
 * whole flow — so all three sit on the `.lg-root` pitch-and-chalk tokens the draft uses.
 *
 * ⚠️ A PHASE, not a route. The live session — the generator, the seed, the drafted XI —
 * lives in `GamePlay`'s memory; navigating to a `/game/pre-match` URL would drop it, and
 * surviving that would mean lifting session state into a provider above every game route
 * for nothing visible in return.
 *
 * ⚠️ Reached only by a pack that declares `screens: "legacy"`. Chaos and the shipped draft
 * still render `MatchupPreview`.
 */
export function MatchProgramme({
  home,
  away,
  referee,
  weather,
  crests,
  chemistry,
  onKickOff,
  onBack,
}: Props) {
  const t = useTranslations("game");
  const reduced = prefersReducedMotion();

  const tape = { home: taleOfTheTape(home), away: taleOfTheTape(away) };
  const span = decadeSpan(home);
  const star = { home: starOf(home), away: starOf(away) };

  const BARS = [
    { key: "progOverall", h: tape.home.overall, a: tape.away.overall },
    { key: "progAttack", h: tape.home.attack, a: tape.away.attack },
    { key: "progMidfield", h: tape.home.midfield, a: tape.away.midfield },
    { key: "progDefence", h: tape.home.defence, a: tape.away.defence },
    // ⭐ Chemistry belongs HERE rather than in a panel of its own: the tape is the surface
    // built for comparing the two sides, and the coach's whole reason to have drafted for
    // links is to see his number against theirs before kick-off. Both sides are scored by
    // the same `teamChemistry`, or the comparison would be dishonest.
    ...(chemistry === true
      ? [{ key: "progChemistry", h: teamChemistry(home), a: teamChemistry(away) }]
      : []),
  ];

  return (
    <div className="lg-root lg-prog">
      {/* ---- 1 · masthead ---- */}
      <header className="lg-prog-mast">
        <p className="lg-kicker">{t("progKicker")}</p>
        <h1 className="lg-prog-title">
          <span className="lg-home">
            <ClubCrest teamId={crests?.home} size={40} />
            {home.name}
          </span>
          <span className="lg-prog-v">{t("progVersus")}</span>
          <span className="lg-away">
            {away.name}
            <ClubCrest teamId={crests?.away} size={40} />
          </span>
        </h1>
        <p className="lg-prog-sub">
          {t("progSubline", {
            shape: home.formation.name,
            avg: squadAverage(home),
            first: span.first,
            last: span.last,
          })}
        </p>
      </header>

      {/* ---- 2 · star spotlight ---- */}
      <section className="lg-prog-stars" aria-label={t("progSpotlight")}>
        {(["home", "away"] as const).map((side) => {
          const p = star[side];
          const tag = side === "home" ? t("progYourStar") : t("progTheirStar");
          return (
            <article
              key={side}
              className={`lg-star lg-star-${side}`}
              aria-label={
                p == null
                  ? tag
                  : t("progStarAria", { tag, name: p.name, ovr: p.ratings?.overall ?? 0 })
              }
            >
              <span className="lg-star-tag">{tag}</span>
              {/* A club whose thinner seasons carry unrated cards can genuinely field an
                  XI with no rated player in it. An em dash, never a zero. */}
              <span className="lg-star-ovr">{p?.ratings?.overall ?? "—"}</span>
              <span className="lg-star-name">{p?.name ?? "—"}</span>
              <span className="lg-star-season">{p?.season ?? ""}</span>
            </article>
          );
        })}
      </section>

      {/* ---- 3 · tale of the tape ---- */}
      <section className="lg-prog-tape">
        <h2 className="lg-h2">{t("progTape")}</h2>
        {BARS.map((b) => {
          // Opposed bars: each side's share of the pair, so the gap is the story.
          const total = b.h + b.a || 1;
          return (
            <div
              key={b.key}
              data-testid="prog-bar"
              className="lg-tape-row"
              role="img"
              aria-label={t("progTapeAria", { label: t(b.key), home: b.h, away: b.a })}
            >
              <span className="lg-tape-n lg-home">{b.h}</span>
              <span className="lg-tape-track">
                <span className="lg-tape-fill-home" style={{ width: `${(b.h / total) * 100}%` }} />
                <span className="lg-tape-fill-away" style={{ width: `${(b.a / total) * 100}%` }} />
              </span>
              <span className="lg-tape-n lg-away">{b.a}</span>
              <span className="lg-tape-label">{t(b.key)}</span>
            </div>
          );
        })}
      </section>

      {/* ---- 4 · both XIs, as CARDS ---- */}
      {/* ⚠️ Owner change: this was a list. At this size the five attribute numbers are
          omitted deliberately — the card is furniture here, not a stat block. */}
      <section className="lg-prog-teams">
        <h2 className="lg-h2">{t("progTeams")}</h2>
        <div className="lg-prog-grid">
          {(["home", "away"] as const).map((side) => (
            <div key={side} className={`lg-xi lg-xi-${side}`}>
              <h3 className="lg-xi-title">
                {side === "home" ? t("progYourXi") : t("progTheirXi")}
              </h3>
              <div className="lg-xi-cards">
                {(side === "home" ? home : away).players.map((p, i) => (
                  <div
                    key={`${side}-${p.cardId}-${i}`}
                    data-testid="prog-card"
                    className="lg-xi-card"
                  >
                    {/* ⛔ interactive={false}. A card that is itself a <button> cannot host
                        another, and nothing on this screen is a pick target. */}
                    <PlayerCard card={p as EnrichedCard} reduced={reduced} interactive={false} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- 5 · conditions ---- */}
      {/* Not trivia: a strict referee books far more and rain makes the game scrappier, so
          each carries a line on what it DOES rather than only what it is. */}
      <section className="lg-prog-cond">
        <h2 className="lg-h2">{t("progConditions")}</h2>
        <dl className="lg-cond-grid">
          <div className="lg-cond">
            <dt>{t("playReferee")}</dt>
            <dd className="lg-cond-v">{referee != null ? t(REFEREE_KEY[referee]) : "—"}</dd>
            {referee != null ? (
              <dd className="lg-cond-i">{t(REFEREE_IMPACT_KEY[referee])}</dd>
            ) : null}
          </div>
          <div className="lg-cond">
            <dt>{t("playWeather")}</dt>
            <dd className="lg-cond-v">{weather != null ? t(WEATHER_KEY[weather]) : "—"}</dd>
            {weather != null ? (
              <dd className="lg-cond-i">{t(WEATHER_IMPACT_KEY[weather])}</dd>
            ) : null}
          </div>
        </dl>
      </section>

      {/* ---- 6 · kick off ---- */}
      {/* ⚠️ FULL WIDTH, and the only --cta on the page. */}
      <div className="lg-prog-go">
        <button type="button" onClick={onBack} className="lg-ghost">
          {t("progBack")}
        </button>
        <button type="button" onClick={onKickOff} className="lg-kick">
          {t("progKickOff")}
        </button>
      </div>
    </div>
  );
}
