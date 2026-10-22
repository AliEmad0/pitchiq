"use client";

import { useEffect, useState, type ReactNode } from "react";
import { type Crest, crestOf } from "@/features/game/domain/coach";
import { loadProfile } from "@/features/game/storage/profile-slot";
import { CrestBadge } from "./CrestBadge";

/**
 * The Weekly Ladder's "Broadcast Scoreboard" (owner's polish pick, Ladder #1): a TV graphics
 * strap across the top, the table as lower-third rows, the next fixture as a "Coming up" VS card.
 * Presentation only — every figure arrives from `WeeklyLadder`.
 */

/** The coach's own crest, read after mount like every other piece of local state. */
export function useCoachCrest(): Crest | null {
  const [crest, setCrest] = useState<Crest | null>(null);
  useEffect(() => {
    let live = true;
    loadProfile()
      .then((p) => {
        if (live) setCrest(crestOf(p?.crest));
      })
      .catch(() => {
        if (live) setCrest(crestOf(undefined));
      });
    return () => {
      live = false;
    };
  }, []);
  return crest;
}

/** The coach's badge, or a reserved blank of the same size until it has loaded. */
export function LadderCoachBadge({ crest, size }: { crest: Crest | null; size: number }) {
  if (crest == null)
    return <span className="lb-crest-blank" style={{ width: size, height: size }} />;
  return <CrestBadge crest={crest} size={size} />;
}

/** The red/yellow strap: brand, week, the week's rule, and the closing clock. */
export function LadderStrap({
  brand,
  week,
  rule,
  closes,
}: {
  brand: string;
  week: string;
  rule: string;
  closes: string | null;
}) {
  return (
    <div className="lb-strap" data-testid="ladder-strap">
      <h1 className="lb-strap-title">
        <span className="lb-brand">{brand}</span>
        <span className="lb-wk">{week}</span>
      </h1>
      <span className="lb-rl">{rule}</span>
      {closes != null ? (
        <span className="lb-cl" data-testid="ladder-clock">
          {closes}
        </span>
      ) : null}
    </div>
  );
}

/** The "Coming up" VS card: the coach on the left, the opponent on the right. */
export function LadderComingUp({
  label,
  venue,
  home,
  away,
  children,
}: {
  label: string;
  venue: string;
  home: ReactNode;
  away: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="lb-card" data-testid="ladder-coming-up">
      <div className="lb-cu">{label}</div>
      <div className="lb-vs" data-testid="weekly-next">
        <div className="lb-side">{home}</div>
        <div className="lb-v">{venue}</div>
        <div className="lb-side">{away}</div>
      </div>
      {children}
    </div>
  );
}
