"use client";
import { useTranslations } from "next-intl";
import { headlineFor, scorersOf } from "@/features/game/domain/match-headline";
import type { MatchResult, Side } from "@/features/game/domain/match-types";
import { formatXg, shotsOf, xgTotals } from "@/features/game/domain/match-xg";
import type { GameTeam } from "@/features/game/domain/team";
import { localizeDigits } from "@/utils/format";

/** The wheel's geometry, in viewBox units. */
const SIZE = 220;
const C = SIZE / 2;
const RING = C - 34;
const INNER = RING - 28;
const STEM = 6;
/** Spoke length per hundredth of xG — a penalty (76) reaches ~29 units. */
const PER_XG = 0.3;

const point = (minute: number, r: number, span: number): [number, number] => {
  const a = -Math.PI / 2 + (minute / span) * 2 * Math.PI;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

/**
 * TASK-1815 — the front page at the final whistle, as the owner's "Vinyl Sleeve"
 * (concept #23): the match wrapped around a record, each shot a spoke at its minute —
 * the home side's outward, the away side's inward — its length the shot's xG.
 *
 * Everything is DERIVED from the match's events on render. Nothing is stored, the engine
 * is untouched, and a replay of the same match prints the same page.
 *
 * ⛔ The wheel is `dir="ltr"` — a clock face is not text (the pitch rule). Every number
 * goes through `localizeDigits`, because Intl returns Western digits for "ar" in the
 * browser.
 */
export function PostMatchReport({
  result,
  home,
  away,
  coachSide,
  locale,
}: {
  result: MatchResult;
  home: GameTeam;
  away: GameTeam;
  coachSide: Side;
  locale: string;
}) {
  const t = useTranslations("gameReport");
  // Headline keys are built at runtime; next-intl types `t` against literal keys.
  const tAny = useTranslations() as unknown as (k: string, v: Record<string, string>) => string;
  const ld = (v: string | number) => localizeDigits(v, locale);

  const head = headlineFor(result, home, away, coachSide);
  const shots = shotsOf(result.events);
  const totals = xgTotals(shots);
  const end = result.events.at(-1)?.minute ?? 90;
  const span = Math.max(end, 90);

  const v = head.values;
  const headline = tAny(head.key, {
    coach: v.coach,
    opponent: v.opponent,
    player: v.player,
    coachGoals: ld(v.coachGoals),
    oppGoals: ld(v.oppGoals),
    minute: ld(v.minute),
  });

  const scorers = scorersOf(result, home, away);
  const line = (side: Side) =>
    scorers
      .filter((s) => s.side === side)
      .map((s) => {
        const n = s.goals > 1 ? t("scorerCount", { name: s.name, goals: ld(s.goals) }) : s.name;
        return s.ownGoal ? t("ownGoal", { name: n }) : n;
      })
      .join(", ");
  const homeXg = ld(formatXg(totals.home));
  const awayXg = ld(formatXg(totals.away));
  const xgLine = t("xgLine", { homeXg, awayXg });
  const scorerText = [line("home"), line("away")].filter(Boolean).join(" · ");
  const homeGoals = result.events.filter(
    (e) => e.kind === "goal" && e.side === "home" && e.disallowedAt == null,
  ).length;
  const awayGoals = result.events.filter(
    (e) => e.kind === "goal" && e.side === "away" && e.disallowedAt == null,
  ).length;

  return (
    <section
      data-testid="post-match-report"
      data-arc={head.arc}
      aria-label={t("aria")}
      className="pmr-root"
    >
      {/* `dir` lives on a wrapper: React's SVG props do not accept it. */}
      <div data-testid="report-xg-chart" dir="ltr" className="pmr-wheel-wrap">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={t("xgAria", { home: home.name, away: away.name, homeXg, awayXg })}
          className="pmr-wheel"
        >
          <circle cx={C} cy={C} r={RING} className="pmr-ring" />
          <circle cx={C} cy={C} r={INNER} className="pmr-label" />
          <line x1={C} y1={C - RING - 4} x2={C} y2={C - RING + 4} className="pmr-tick" />
          {shots.map((s, i) => {
            const len = STEM + s.xg * PER_XG;
            const [x1, y1] = point(s.minute, RING, span);
            const [x2, y2] = point(s.minute, s.side === "home" ? RING + len : RING - len, span);
            const scored = s.goal && !s.disallowed;
            return (
              <line
                key={i}
                data-testid="report-shot"
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={`pmr-spoke pmr-${s.side}${scored ? " pmr-goal" : ""}`}
              />
            );
          })}
          <text x={C} y={C - 2} textAnchor="middle" className="pmr-score">
            {ld(`${homeGoals}–${awayGoals}`)}
          </text>
          <text x={C} y={C + 16} textAnchor="middle" className="pmr-xg">
            {xgLine}
          </text>
        </svg>
      </div>
      <div className="pmr-copy">
        <p className="pmr-mast">{t("masthead")}</p>
        <h2 data-testid="report-headline" className="pmr-headline">
          {headline}
        </h2>
        <p data-testid="report-standfirst" className="pmr-standfirst">
          {scorerText}
          {scorerText ? " — " : ""}
          {xgLine}
        </p>
        <p className="pmr-key" aria-hidden="true">
          <span className="pmr-key-home">{home.name}</span>
          <span className="pmr-key-away">{away.name}</span>
        </p>
      </div>
    </section>
  );
}
