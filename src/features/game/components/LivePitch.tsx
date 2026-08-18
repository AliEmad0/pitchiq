"use client";
import type { PitchPlayer } from "@/features/game/view/match-view-model";

export interface Pip {
  player: PitchPlayer;
  booked: boolean;
  captain: boolean;
}

interface Props {
  /** Yours — attacks right, occupies the left half. `null` where a man was sent off. */
  home: (Pip | null)[];
  /** Theirs — mirrored into the right half. */
  away: (Pip | null)[];
  label: string;
}

/**
 * TASK-1810 — the live mini-map: BOTH XIs on one pitch.
 *
 * Yours attacks right; theirs is mirrored (`x` → `100 - x`) so the two shapes face each
 * other instead of sitting on top of one another. Positions come from each side's own
 * formation slots, so a 3-5-2 and a 4-4-2 read as the different shapes they are.
 *
 * ⛔ DELIBERATELY STATIC. The player animation is NOT agreed (spec §3.1) — the owner
 * rejected two attempts, ambient random passing and an event-driven replay, and it needs
 * its own design pass. A static both-teams pitch is the agreed first cut.
 *
 * ⛔ When that motion is designed: move players and the ball by `transform: translate()`,
 * NEVER `left`/`top`. Animating layout properties re-lays-out the pitch every frame, and
 * the motion audit rejects it. And drive `domain/pitch-sim.ts`, which is seeded — the
 * prototype's `Math.random` would break the Phase-18 determinism rule outright.
 *
 * ⚠️ A null slot is drawn as NOTHING, not as an empty circle. That gap is the point: a
 * side reduced to ten men should look like ten men.
 */
export function LivePitch({ home, away, label }: Props) {
  const place = (pips: (Pip | null)[], mirror: boolean, side: "home" | "away") => {
    const rows = Math.max(1, ...pips.map((p) => p?.player.row ?? 1));
    return pips.map((pip, i) => {
      if (pip == null) return null;
      const { row, col } = pip.player;
      const inRow = pips.filter((p) => p?.player.row === row).length;
      // Each side gets half the pitch: home 0–50%, away 50–100% once mirrored.
      const x = (row / (rows + 1)) * 50;
      const y = (col / (inRow + 1)) * 100;
      return (
        <span
          key={`${side}-${i}`}
          className={`lg-pip lg-pip-${side}`}
          style={{ insetInlineStart: `${mirror ? 100 - x : x}%`, top: `${y}%` }}
        >
          <span className="lg-pip-n">{pip.player.number}</span>
          {pip.captain ? (
            <span className="lg-pip-c" aria-hidden="true">
              C
            </span>
          ) : null}
          {pip.booked ? <span className="lg-pip-y" aria-hidden="true" /> : null}
        </span>
      );
    });
  };

  return (
    <div className="lg-pitch" role="img" aria-label={label}>
      <span className="lg-halfway" />
      <span className="lg-circle" />
      <span className="lg-spot lg-spot-c" />
      <span className="lg-box lg-box-l" />
      <span className="lg-box lg-box-l lg-box-six" />
      <span className="lg-spot lg-spot-l" />
      <span className="lg-box lg-box-r" />
      <span className="lg-box lg-box-r lg-box-six" />
      <span className="lg-spot lg-spot-r" />
      {place(home, false, "home")}
      {place(away, true, "away")}
    </div>
  );
}
