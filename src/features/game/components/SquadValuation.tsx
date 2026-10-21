"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { formatValue, type ValueLine, valueSeries } from "@/features/game/domain/market-value";
import type { GamePlayer } from "@/features/game/domain/player";
import { localizeDigits } from "@/utils/format";

/** How many risers and fallers to name. */
const MOVERS = 3;

/**
 * TASK-1826 — the squad's in-game valuation across a run: the total, the change since the run
 * began, one bar per fixture, and who has moved most.
 *
 * ⛔ Every figure is DERIVED from the stored output lines (`valueSeries`), and the panel says in
 * words that it is an in-game valuation — never a real transfer fee.
 */
export function SquadValuation({
  cards,
  lines,
}: {
  cards: readonly Pick<GamePlayer, "cardId" | "name" | "role" | "ratings">[];
  lines: readonly ValueLine[];
}) {
  const t = useTranslations("gameValue");
  const locale = useLocale();
  const money = (tenths: number) => localizeDigits(`£${formatValue(tenths)}m`, locale);

  const { totals, rows } = useMemo(() => {
    const series = valueSeries(cards, lines);
    const totals = Array.from({ length: lines.length + 1 }, (_, i) =>
      cards.reduce((sum, c) => sum + series.get(c.cardId)![i]!, 0),
    );
    const rows = cards.map((c) => {
      const s = series.get(c.cardId)!;
      return { card: c, now: s[s.length - 1]!, delta: s[s.length - 1]! - s[0]! };
    });
    return { totals, rows };
  }, [cards, lines]);

  const now = totals[totals.length - 1]!;
  const change = now - totals[0]!;
  const peak = Math.max(...totals);
  const ranked = [...rows].sort((a, b) => b.delta - a.delta || b.now - a.now);
  const risers = ranked.filter((r) => r.delta > 0).slice(0, MOVERS);
  const fallers = ranked
    .filter((r) => r.delta < 0)
    .reverse()
    .slice(0, MOVERS);
  const signed = (d: number) => (d > 0 ? "+" : d < 0 ? "−" : "") + money(Math.abs(d));

  return (
    <section className="sv-panel" data-testid="squad-valuation" aria-label={t("title")}>
      <div className="sh-ttl sh-gap">{t("title")}</div>
      <p className="sv-total">
        <strong data-testid="sv-total">{money(now)}</strong>{" "}
        <span
          className={change > 0 ? "sv-up" : change < 0 ? "sv-down" : undefined}
          data-testid="sv-change"
        >
          {signed(change)}
        </span>
      </p>
      <p className="sv-note">{t("disclaimer")}</p>
      {totals.length > 1 ? (
        <div className="sv-bars" role="img" aria-label={t("trend")}>
          {totals.map((v, i) => (
            <i
              key={i}
              className="sv-bar"
              style={{ transform: `scaleY(${Math.max(0.04, v / peak)})` }}
              title={money(v)}
            />
          ))}
        </div>
      ) : (
        <p className="sv-note">{t("empty")}</p>
      )}
      {risers.length > 0 || fallers.length > 0 ? (
        <ul className="sv-movers">
          {risers.map((r) => (
            <li key={r.card.cardId} data-testid="sv-riser">
              <span>{r.card.name}</span> <span className="sv-up">{signed(r.delta)}</span>{" "}
              <span>{money(r.now)}</span>
            </li>
          ))}
          {fallers.map((r) => (
            <li key={r.card.cardId} data-testid="sv-faller">
              <span>{r.card.name}</span> <span className="sv-down">{signed(r.delta)}</span>{" "}
              <span>{money(r.now)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
