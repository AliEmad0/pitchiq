import type { PlayerBadges as Badges } from "@/features/game/view/lineup-state";

/**
 * Match badges for a roster row.
 *
 * Drawn as SVG rather than emoji on purpose: a real card shape and a real ball read at
 * 12px, they inherit the page's colours, and they render identically on every platform —
 * emoji cards in particular are wildly inconsistent between systems and some render as
 * squares. Everything here is symbolic, so nothing needs translating; the meaning is
 * carried by the `aria-label` each glyph provides.
 */

interface Props {
  badges: Badges;
  labels: {
    goal: string;
    assist: string;
    yellow: string;
    red: string;
    subOn: string;
    subOff: string;
  };
}

function Card({ colour, label }: { colour: string; label: string }) {
  return (
    <svg viewBox="0 0 8 11" width="9" height="12" role="img" aria-label={label}>
      <rect x="0.5" y="0.5" width="7" height="10" rx="1.2" fill={colour} />
    </svg>
  );
}

function Ball({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" role="img" aria-label={label}>
      <circle cx="6" cy="6" r="5.2" fill="#ffffff" stroke="#111827" strokeWidth="1" />
      <path d="M6 2.6 L8.6 4.5 L7.6 7.6 L4.4 7.6 L3.4 4.5 Z" fill="#111827" />
    </svg>
  );
}

/** A boot, for the pass that made the goal. */
function Assist({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 14 12" width="14" height="12" role="img" aria-label={label}>
      <path
        d="M1 8.2c0-1.6.4-3.6.9-5 .2-.5.9-.6 1.2-.2l1.7 2.2c.3.4.8.6 1.3.6h4.2c1.6 0 2.7 1 2.7 2.4V9c0 .6-.5 1-1.1 1H2c-.6 0-1-.4-1-1z"
        fill="currentColor"
      />
      <rect x="1" y="10" width="12" height="1.4" rx="0.7" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/** Arrow in/out for a substitution — direction carries the meaning. */
function SubArrow({ on, label }: { on: boolean; label: string }) {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" role="img" aria-label={label}>
      <path
        d={on ? "M5 1 L9 6 H6.4 V9 H3.6 V6 H1 Z" : "M5 9 L1 4 H3.6 V1 H6.4 V4 H9 Z"}
        fill={on ? "#4ade80" : "#f87171"}
      />
    </svg>
  );
}

const Count = ({ n }: { n: number }) => (
  <span className="font-mono text-[10px] font-bold tabular-nums">{n}</span>
);

export function PlayerBadges({ badges, labels }: Props) {
  const { goals, assists, yellow, red, subOn, subOff } = badges;
  if (goals === 0 && assists === 0 && !yellow && !red && subOn == null && subOff == null) {
    return null;
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      {goals > 0 && (
        <span className="flex items-center gap-0.5">
          <Ball label={labels.goal} />
          {goals > 1 && <Count n={goals} />}
        </span>
      )}
      {assists > 0 && (
        <span className="text-muted-foreground flex items-center gap-0.5">
          <Assist label={labels.assist} />
          {assists > 1 && <Count n={assists} />}
        </span>
      )}
      {yellow && !red && <Card colour="#f5c518" label={labels.yellow} />}
      {red && <Card colour="#e5484d" label={labels.red} />}
      {subOn != null && (
        <span className="flex items-center gap-0.5">
          <SubArrow on label={labels.subOn} />
          <Count n={subOn} />
        </span>
      )}
      {subOff != null && (
        <span className="flex items-center gap-0.5">
          <SubArrow on={false} label={labels.subOff} />
          <Count n={subOff} />
        </span>
      )}
    </span>
  );
}
