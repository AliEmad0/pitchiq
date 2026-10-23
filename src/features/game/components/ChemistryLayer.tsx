"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { OFF_POSITION_PENALTY, offPosition, type Fittable } from "@/features/game/domain/chemistry";
import type { PlayerRole } from "@/features/game/domain/player";
import type { Formation } from "@/features/game/domain/formation";
import {
  isLit,
  nextFlash,
  ringTier,
  type ChemFlash,
  type ChemLink,
  type ChemView,
} from "@/features/game/view/chemistry-view";

/**
 * TASK-1824 — the chemistry surface for the draft screens that are not `PitchDraft`.
 *
 * Same testids, same classes and the same owner-picked glow (#15 Halo Rings + #18 Shockwave
 * Warning) as `PitchDraft`, so the CSS in `globals.css` and every assertion written against it
 * apply unchanged. ⚠️ Everything is keyed by FORMATION SLOT INDEX: `TacticalPitch` renders
 * attack-first, so DOM order is not slot order.
 */

/** The last placement, derived by diffing the picks — see `nextFlash`. */
export function useChemistryFlash(
  enabled: boolean,
  picks: readonly (string | null | undefined)[],
  xi: readonly (Fittable | null | undefined)[],
  formation: Formation,
  score: number,
): ChemFlash | null {
  const prevPicks = useRef(picks);
  const prevScore = useRef(score);
  const [flash, setFlash] = useState<ChemFlash | null>(null);
  useEffect(() => {
    const before = prevPicks.current;
    const was = prevScore.current;
    prevPicks.current = picks;
    prevScore.current = score;
    if (!enabled) return;
    setFlash((f) => nextFlash(f, before, picks, xi, formation, was, score));
    // A change of picks IS the placement; the score moves with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picks, enabled]);
  return enabled ? flash : null;
}

/** The meter — the score, its bar, the tiers in words and the out-of-position warning. */
export function ChemistryMeter({
  view,
  flash,
  className = "",
}: {
  view: ChemView;
  flash: ChemFlash | null;
  className?: string;
}) {
  const t = useTranslations("game");
  const { score, counts, offSlots } = view;
  return (
    <div
      data-testid="chem-meter"
      // #18 — re-mounted on a drop so the red flash and the shake replay every time.
      key={flash?.down ? `down-${flash.n}` : "meter"}
      data-down={flash?.down ? "" : undefined}
      className={`${flash?.down ? "chem-meter-down " : ""}border-border bg-muted/30 mx-auto w-full max-w-md rounded-lg border px-4 py-3 ${className}`}
    >
      <div className="flex items-baseline justify-center gap-2">
        <span className="chem-num font-mono text-3xl leading-none font-extrabold tracking-tight">
          {score}
        </span>
        <span className="text-[10px] font-bold tracking-[0.09em] uppercase opacity-70">
          {t("chemScore")}
        </span>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#12222c]">
        <div
          data-testid="chem-bar"
          className="h-full origin-left rounded-full bg-sky-400"
          style={{ transform: `scaleX(${score / 100})` }}
        />
      </div>
      <p className="mt-2 text-center font-mono text-[11px] opacity-75">
        {counts.teammates + counts.club + counts.nation === 0
          ? t("chemNoLinksYet")
          : [
              counts.teammates > 0 ? t("chemTeammates", { count: counts.teammates }) : null,
              counts.club > 0 ? t("chemClubLegends", { count: counts.club }) : null,
              counts.nation > 0 ? t("chemCountrymen", { count: counts.nation }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>
      {offSlots.length > 0 ? (
        <p
          data-testid="chem-off-warn"
          role="status"
          className="mt-2 rounded-md bg-red-500/15 px-2 py-1 text-center text-[11px] font-semibold text-red-300"
        >
          {t("chemOffWarn", {
            count: offSlots.length,
            points: OFF_POSITION_PENALTY * offSlots.length,
          })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The connectors, with the #15 halos under them. `at(i)` places slot `i` in the SVG's 0–100
 * box, which the parent stretches over its pitch with `preserveAspectRatio="none"`.
 *
 * ⛔ `pointer-events: none` — it spans the whole pitch, so a hit here would make every
 * position unselectable at once (the PitchDraft centre-circle trap, at full size).
 */
export function ChemistryLinks({
  links,
  flash,
  at,
}: {
  links: readonly ChemLink[];
  flash: ChemFlash | null;
  at: (slot: number) => { x: number; y: number };
}) {
  return (
    <svg
      className="chem-links"
      data-testid="chem-links"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ pointerEvents: "none" }}
    >
      {links.map((l) => {
        if (l.tier === "none") return null;
        const lit = isLit(flash, l);
        if (!lit && l.tier !== "teammates") return null;
        const a = at(l.i);
        const b = at(l.j);
        return (
          <line
            key={lit ? `h${l.i}-${l.j}-${flash!.n}` : `h${l.i}-${l.j}`}
            data-testid="chem-halo"
            data-tier={l.tier}
            data-lit={lit ? "" : undefined}
            className={`chem-halo${lit ? " chem-halo-lit" : ""}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
          />
        );
      })}
      {links.map((l) => {
        const a = at(l.i);
        const b = at(l.j);
        return (
          <line
            key={`${l.i}-${l.j}`}
            data-testid="chem-link"
            data-tier={l.tier}
            className="chem-link"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
          />
        );
      })}
    </svg>
  );
}

/**
 * What one placed man wears: the #15 ring when the last placement linked to him, the #18
 * shockwave when he IS the last placement and out of position, and the red mark with his own
 * role whenever he stands out of position. Rendered inside the chip, which must be
 * `position: relative`.
 */
export function ChemistryMarks({
  slot,
  card,
  role,
  flash,
  links,
}: {
  slot: number;
  card: Fittable | null | undefined;
  role: PlayerRole;
  flash: ChemFlash | null;
  links: readonly ChemLink[];
}) {
  const t = useTranslations("game");
  if (card == null) return null;
  const ring = ringTier(flash, links, slot);
  const off = offPosition(card, role);
  return (
    <>
      {ring != null ? (
        <span key={`r${flash!.n}`} data-testid="chem-ring" data-tier={ring} className="chem-ring" />
      ) : null}
      {flash != null && flash.off && flash.slot === slot ? (
        <span key={`w${flash.n}`} data-testid="chem-wave" className="chem-wave" />
      ) : null}
      {off ? (
        <span
          data-testid="chem-off"
          className="chem-off"
          title={t("chemOffBadge", { own: card.role ?? "", slot: role })}
        >
          {card.role}
        </span>
      ) : null}
    </>
  );
}
