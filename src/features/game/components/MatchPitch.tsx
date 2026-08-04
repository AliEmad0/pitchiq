import type { FormationSlot } from "@/features/game/domain/formation";

const W = 100;
const H = 140;

interface Dot {
  x: number;
  y: number;
  idx: number;
}

/** Lay a side's slots into its half. Home = bottom (own goal y≈H), away = top, x mirrored. */
function layout(slots: FormationSlot[], side: "home" | "away"): Dot[] {
  const byRow = new Map<number, { idx: number }[]>();
  slots.forEach((slot, idx) => {
    const arr = byRow.get(slot.row) ?? [];
    arr.push({ idx });
    byRow.set(slot.row, arr);
  });
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const dots: Dot[] = [];
  rows.forEach((row, r) => {
    const group = byRow.get(row)!;
    const frac = rows.length > 1 ? r / (rows.length - 1) : 0; // 0 = own goal
    const y = side === "home" ? H - 8 - frac * (H / 2 - 12) : 8 + frac * (H / 2 - 12);
    group.forEach(({ idx }, i) => {
      const xFrac = (i + 1) / (group.length + 1);
      const x = side === "away" ? (1 - xFrac) * W : xFrac * W;
      dots.push({ x, y, idx });
    });
  });
  return dots;
}

interface Props {
  home: FormationSlot[];
  away: FormationSlot[];
  highlight?: { side: "home" | "away"; slot: number };
  label: string;
}

export function MatchPitch({ home, away, highlight, label }: Props) {
  const dots = [
    ...layout(home, "home").map((d) => ({ ...d, side: "home" as const })),
    ...layout(away, "away").map((d) => ({ ...d, side: "away" as const })),
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-full w-full">
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={(i * W) / 9} y="0" width={W / 9} height={H} fill={i % 2 ? "#0c5a37" : "#0a5230"} />
      ))}
      <g stroke="rgba(255,255,255,.6)" strokeWidth="0.7" fill="none">
        <rect x="3" y="3" width={W - 6} height={H - 6} />
        <line x1="3" y1={H / 2} x2={W - 3} y2={H / 2} />
        <circle cx={W / 2} cy={H / 2} r="9" />
        <rect x={W / 2 - 18} y="3" width="36" height="16" />
        <rect x={W / 2 - 18} y={H - 19} width="36" height="16" />
      </g>
      {dots.map((d, i) => {
        const on = highlight && highlight.side === d.side && highlight.slot === d.idx;
        return (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={on ? 3.4 : 2.6}
            className={d.side === "home" ? "fill-primary" : "fill-[#20242b]"}
            stroke={on ? "#ffe14d" : "rgba(255,255,255,.85)"}
            strokeWidth={on ? 1.4 : 0.8}
          />
        );
      })}
    </svg>
  );
}
