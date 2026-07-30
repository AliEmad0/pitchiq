"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { CSSProperties, PointerEvent } from "react";

import { Link } from "@/i18n/navigation";
import { revealProps } from "@/utils/reveal";
import { formatSeasonLabel } from "@/utils/season";
import { seasonPath } from "@/utils/season-path";

import styles from "./SeasonCard.module.css";

/**
 * TASK-M71a — one season in the /seasons directory (gallery concept A8 + logo).
 * The year is the anchor and the club is supporting: that ordering is what
 * makes Blackburn 1994-95 read as considered as Arsenal 2003-04.
 *
 * Client component because the hover motion is cursor-driven. The reveal uses
 * revealProps()/<RevealController> — the existing mechanism. NEVER render
 * `data-revealed`; the controller sets it via the DOM.
 *
 * `crest` is the season-accurate crest URL (clubLogoFromMap, TASK-M54) —
 * Blackburn 1994-95 gets its 90s badge, not today's.
 */
export function SeasonCard({
  season,
  champion,
  crest,
  clubColor,
  index,
}: {
  season: number;
  champion: { id: number; name: string } | null;
  crest: string | null;
  clubColor: string | null;
  index: number;
}) {
  const t = useTranslations("seasons");
  const locale = useLocale();
  // formatSeasonLabel separates with a plain hyphen in both locales ("2003-04",
  // "٢٠٢٥ - ٢٠٢٦"); the card re-renders that separator as the magenta en dash.
  const [start, end] = formatSeasonLabel(season, locale).split("-");

  // Arabic joins its letters — spreading them is typographically wrong, so the
  // per-letter split is English-only. Every other hover effect still applies.
  const kicker = t("kicker");
  const isAr = locale === "ar";

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    // Club-colour bleed origin (#4).
    el.style.setProperty("--bleed-x", `${px * 100}%`);
    el.style.setProperty("--bleed-y", `${py * 100}%`);
    // Magnetic drift (#2) — max 16px x, 12px y.
    el.style.setProperty("--drift-x", `${(px - 0.5) * 16}px`);
    el.style.setProperty("--drift-y", `${(py - 0.5) * 12}px`);
  };

  const onLeave = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    el.style.removeProperty("--drift-x");
    el.style.removeProperty("--drift-y");
  };

  // The reveal attributes sit on the cell, not the link: the depth-arrival
  // rules in globals.css own the revealing element's transform, which would
  // fight the link's own cursor-driven drift (see the module CSS comment).
  const reveal = revealProps(index);

  return (
    <span className={styles.cell} data-reveal-depth="" {...reveal}>
      <Link
        href={seasonPath(season)}
        className={styles.card}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={clubColor ? ({ "--club": clubColor } as CSSProperties) : undefined}
      >
        <span className={styles.kicker}>
          {isAr
            ? kicker
            : [...kicker].map((ch, i) => (
                <span key={i} style={{ "--i": i } as CSSProperties}>
                  {ch}
                </span>
              ))}
        </span>
        <span className={styles.year}>
          {start}
          <span className={styles.dash}>–</span>
          {end}
        </span>
        <span className={styles.club}>
          {champion ? (
            <>
              <Image
                src={crest ?? `/logos/${champion.id}.png`}
                alt=""
                width={22}
                height={22}
                className={styles.crest}
                unoptimized
              />
              <span className={styles.name}>{champion.name}</span>
            </>
          ) : (
            <span className={styles.name}>{t("noChampion")}</span>
          )}
        </span>
      </Link>
    </span>
  );
}
