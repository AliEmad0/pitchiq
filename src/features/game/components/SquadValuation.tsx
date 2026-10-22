"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatValue, type ValueLine, valueSeries } from "@/features/game/domain/market-value";
import type { GamePlayer } from "@/features/game/domain/player";
import { localizeDigits } from "@/utils/format";

/** How many risers and fallers to name. */
const MOVERS = 3;

/**
 * TASK-1826 — the squad's in-game valuation across a run: the total, the change since the run
 * began, one bar per fixture, and who has moved most.
 *
 * The owner's polish pick is the **Stock Ticker** (V1): a trading terminal with a big price, a
 * change badge, a bar chart you tap to step back through the run, and gainers/losers as ▲▼ rows.
 * Static by design — the gallery round chose a layout, not a motion.
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

  const { totals, series } = useMemo(() => {
    const series = valueSeries(cards, lines);
    const totals = Array.from({ length: lines.length + 1 }, (_, i) =>
      cards.reduce((sum, c) => sum + series.get(c.cardId)![i]!, 0),
    );
    return { totals, series };
  }, [cards, lines]);

  // null follows the latest match, so a new result moves the price without a tap.
  const [picked, setPicked] = useState<number | null>(null);
  const last = totals.length - 1;
  const k = picked == null ? last : Math.min(picked, last);

  const now = totals[k]!;
  const change = now - totals[0]!;
  const pct = totals[0]! > 0 ? (change / totals[0]!) * 100 : 0;
  const min = Math.min(...totals);
  const span = Math.max(...totals) - min || 1;
  const rows = cards.map((c) => {
    const s = series.get(c.cardId)!;
    return { card: c, now: s[k]!, delta: s[k]! - s[0]! };
  });
  const ranked = [...rows].sort((a, b) => b.delta - a.delta || b.now - a.now);
  const risers = ranked.filter((r) => r.delta > 0).slice(0, MOVERS);
  const fallers = ranked
    .filter((r) => r.delta < 0)
    .reverse()
    .slice(0, MOVERS);
  const signed = (d: number) => (d > 0 ? "+" : d < 0 ? "−" : "") + money(Math.abs(d));
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const step = (to: number) => setPicked(to >= last ? null : Math.max(0, to));
  const at =
    k === 0
      ? t("runStart")
      : t("afterMatch", {
          n: localizeDigits(String(k), locale),
          result: t(`result.${lines[k - 1]!.result}`),
        });

  const moverRows = (list: typeof risers, up: boolean, testid: string) =>
    list.length > 0 ? (
      list.map((r) => (
        <li key={r.card.cardId} className="vt-row" data-testid={testid}>
          <span className="vt-name">{r.card.name}</span>
          <span className={up ? "vt-up" : "vt-down"}>
            {up ? "▲" : "▼"} {signed(r.delta)}
          </span>
          <span>{money(r.now)}</span>
        </li>
      ))
    ) : (
      <li className="vt-row vt-none">—</li>
    );

  return (
    <section className="sv-panel vt-root" data-testid="squad-valuation" aria-label={t("title")}>
      <div className="vt-hd">
        <span>
          {t("symbol")} · {t("title")}
        </span>
        <span data-testid="vt-at">{at}</span>
      </div>
      <div className="vt-px">
        <strong data-testid="sv-total">{money(now)}</strong>
        <span className={`vt-chg vt-chg-${dir}`} data-testid="sv-change">
          {change < 0 ? "▼" : "▲"} {signed(change)} (
          {localizeDigits(
            `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct).toFixed(1)}%`,
            locale,
          )}
          )
        </span>
        {totals.length > 1 ? (
          <span className="vt-step">
            <button
              type="button"
              onClick={() => step(k - 1)}
              disabled={k === 0}
              aria-label={t("prev")}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => step(k + 1)}
              disabled={k === last}
              aria-label={t("next")}
            >
              ›
            </button>
          </span>
        ) : null}
      </div>
      {totals.length > 1 ? (
        <>
          <div className="vt-chart" role="group" aria-label={t("trend")}>
            {totals.map((v, i) => (
              <button
                key={i}
                type="button"
                className={`vt-bar${i === k ? " vt-on" : ""}${i > 0 && v < totals[i - 1]! ? " vt-dn" : ""}`}
                aria-pressed={i === k}
                aria-label={`${i === 0 ? t("start") : t("matchShort", { n: localizeDigits(String(i), locale) })} ${money(v)}`}
                title={money(v)}
                onClick={() => step(i)}
                data-testid="vt-bar"
              >
                <i style={{ transform: `scaleY(${0.12 + (0.88 * (v - min)) / span})` }} />
              </button>
            ))}
          </div>
          <div className="vt-xl" aria-hidden="true">
            <span>{t("start")}</span>
            <span>{t("matchShort", { n: localizeDigits(String(last), locale) })}</span>
          </div>
        </>
      ) : (
        <p className="vt-disc">{t("empty")}</p>
      )}
      <div className="vt-tk">
        <div>
          <h5>{t("gainers")}</h5>
          <ul>{moverRows(risers, true, "sv-riser")}</ul>
        </div>
        <div>
          <h5>{t("losers")}</h5>
          <ul>{moverRows(fallers, false, "sv-faller")}</ul>
        </div>
      </div>
      <p className="vt-disc">{t("disclaimer")}</p>
    </section>
  );
}
