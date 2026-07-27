"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { MarketValueSeason } from "@/features/players/market-value";
import { formatMarketValue } from "@/features/players/market-value";
import { formatBirthDate } from "@/utils/age";
import { localizeDigits } from "@/utils/format";
import { formatSeasonLabel } from "@/utils/season";

import styles from "./MarketValueStrip.module.css";

/**
 * TASK-M68 — the interactive half of the market-value block: the readout with
 * its ▲▼ change chip, the meta line, and the career heat strip.
 *
 * A client island, but it is server-rendered into the ISR'd HTML with the REAL
 * value: the count-up (#11) animates *from* zero after hydration by mutating
 * the already-correct node. Rendering €0 server-side would have crawlers index
 * every player as worthless (spec §7).
 */
export function MarketValueStrip({ seasons }: { seasons: MarketValueSeason[] }) {
  const t = useTranslations("players");
  const locale = useLocale();
  const [hover, setHover] = useState<number | null>(null);

  const units = { k: t("mvUnitK"), m: t("mvUnitM") };
  const fmt = (value: number) => localizeDigits(formatMarketValue(value, units), locale);

  const latest = seasons.length - 1;
  const active = hover ?? latest;
  const current = seasons[active];

  const valueRef = useRef<HTMLSpanElement>(null);
  const countedRef = useRef(false);

  // #11 count-up: 0 → the latest value over 900ms on a cubic ease-out, landing
  // just after the last cell of the cascade. Runs once, on mount, and writes
  // through the DOM — React re-renders (hover) restore the true text for free.
  useEffect(() => {
    if (countedRef.current) return;
    countedRef.current = true;
    const node = valueRef.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const target = seasons[seasons.length - 1].valueEur;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Mount-only by design — `fmt`/`seasons` are stable for the life of the block.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeKey =
    current.changePct === null
      ? null
      : current.changePct > 0
        ? "mvChangeUp"
        : current.changePct < 0
          ? "mvChangeDown"
          : "mvChangeFlat";
  const changeClass =
    current.changePct === null || current.changePct === 0
      ? styles.flat
      : current.changePct > 0
        ? styles.up
        : styles.down;

  const seasonLabel = formatSeasonLabel(current.season, locale);
  const previousLabel = active > 0 ? formatSeasonLabel(seasons[active - 1].season, locale) : "";
  const asOf = formatBirthDate(current.determined, locale);

  return (
    <div className={styles.block}>
      <div className={styles.readout}>
        <span className={styles.value} ref={valueRef}>
          {fmt(current.valueEur)}
        </span>
        {changeKey && (
          <span className={`${styles.chip} ${changeClass}`}>
            <span aria-hidden>
              {current.changePct! > 0 ? "▲" : current.changePct! < 0 ? "▼" : "="}
            </span>
            {t(changeKey, {
              pct: localizeDigits(Math.abs(current.changePct!), locale),
              season: previousLabel,
            })}
          </span>
        )}
      </div>

      <p className={styles.meta}>
        {[
          localizeDigits(seasonLabel, locale),
          asOf ? t("mvAsOf", { date: asOf }) : null,
          t("mvRevaluations", { count: current.points }),
          current.minEur === current.maxEur
            ? null
            : t("mvSpread", { min: fmt(current.minEur), max: fmt(current.maxEur) }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/* A career runs oldest → newest left → right in both locales, so the
          strip is pinned LTR (the M70 mini-pitch makes the same call). */}
      <div className={styles.cells} dir="ltr" onPointerLeave={() => setHover(null)}>
        {seasons.map((season, i) => (
          <div
            key={season.season}
            className={styles.col}
            style={{ "--i": i } as CSSProperties}
            data-ahead={i > active}
            data-focus={i === active}
            onPointerEnter={() => setHover(i)}
          >
            <div className={styles.cell} data-band={season.band}>
              {i === latest && <span className={styles.dot} aria-hidden />}
            </div>
            <span className={styles.cellValue}>{fmt(season.valueEur)}</span>
            <span className="sr-only">
              {t("mvSeasonValue", {
                season: localizeDigits(formatSeasonLabel(season.season, locale), locale),
                value: fmt(season.valueEur),
              })}
            </span>
            {season.isPl ? (
              <span className={styles.pl} aria-hidden />
            ) : (
              <span className={styles.spacer} aria-hidden />
            )}
          </div>
        ))}
      </div>

      <div className={styles.axis} dir="ltr">
        <span>{localizeDigits(formatSeasonLabel(seasons[0].season, locale), locale)}</span>
        <span>{localizeDigits(formatSeasonLabel(seasons[latest].season, locale), locale)}</span>
      </div>
    </div>
  );
}
