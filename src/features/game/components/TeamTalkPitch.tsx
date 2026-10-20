import type { GameTeam } from "@/features/game/domain/team";

/** A real pitch in metres: 105 × 68, drawn with a 4 m margin for the goals. */
const L = 105;
const W = 68;
const M = 4;
const BOX_D = 16.5;
const BOX_W = 40.32;
const SIX_D = 5.5;
const SIX_W = 18.32;
const SPOT = 11;
const R = 9.15;
const GOAL_W = 7.32;
const GOAL_D = 2;
/** Where the lines of the formation stand, keeper → front line, in metres from the left goal. */
const X_KEEPER = 6;
const X_FRONT = 82;

/**
 * TASK-1816 (owner, 2026-10-20) — the team-talk pitch, drawn LEFT TO RIGHT to real dimensions:
 * the keeper at the left goal and the side attacking right, every marking in white.
 *
 * Each formation line (`slot.row`) is a column across the length; its players spread down the
 * width by `slot.col`, the lowest col at the TOP — facing right, a side's left flank is the
 * top of the picture. ⛔ `dir="ltr"`: a pitch is not text (the PitchDraft rule).
 */
export function TeamTalkPitch({
  team,
  label,
  dismissed,
}: {
  team: GameTeam;
  label: string;
  /** Players sent off before the start minute — they are not on the pitch. */
  dismissed?: ReadonlySet<number>;
}) {
  const slots = team.formation.slots;
  const rows = Math.max(...slots.map((s) => s.row));
  const arcHalf = Math.sqrt(R * R - (BOX_D - SPOT) ** 2);
  const arc = (side: "left" | "right") => {
    const x = side === "left" ? BOX_D : L - BOX_D;
    const sweep = side === "left" ? 1 : 0;
    return `M ${x} ${W / 2 - arcHalf} A ${R} ${R} 0 0 ${sweep} ${x} ${W / 2 + arcHalf}`;
  };
  return (
    <div className="wi-pitch" dir="ltr">
      <svg viewBox={`${-M} ${-M} ${L + 2 * M} ${W + 2 * M}`} role="img" aria-label={label}>
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            x={(i * L) / 10}
            y={0}
            width={L / 10}
            height={W}
            className={i % 2 ? "wi-grass-b" : "wi-grass-a"}
          />
        ))}
        <g className="wi-lines">
          <rect data-mark="outline" x={0} y={0} width={L} height={W} />
          <line data-mark="halfway" x1={L / 2} y1={0} x2={L / 2} y2={W} />
          <circle data-mark="centre-circle" cx={L / 2} cy={W / 2} r={R} />
          <circle data-mark="centre-spot" className="wi-spot" cx={L / 2} cy={W / 2} r={0.5} />
          <rect data-mark="box-left" x={0} y={(W - BOX_W) / 2} width={BOX_D} height={BOX_W} />
          <rect
            data-mark="box-right"
            x={L - BOX_D}
            y={(W - BOX_W) / 2}
            width={BOX_D}
            height={BOX_W}
          />
          <rect data-mark="six-left" x={0} y={(W - SIX_W) / 2} width={SIX_D} height={SIX_W} />
          <rect
            data-mark="six-right"
            x={L - SIX_D}
            y={(W - SIX_W) / 2}
            width={SIX_D}
            height={SIX_W}
          />
          <circle data-mark="spot-left" className="wi-spot" cx={SPOT} cy={W / 2} r={0.5} />
          <circle data-mark="spot-right" className="wi-spot" cx={L - SPOT} cy={W / 2} r={0.5} />
          <path data-mark="arc-left" d={arc("left")} />
          <path data-mark="arc-right" d={arc("right")} />
          <rect
            data-mark="goal-left"
            x={-GOAL_D}
            y={(W - GOAL_W) / 2}
            width={GOAL_D}
            height={GOAL_W}
          />
          <rect data-mark="goal-right" x={L} y={(W - GOAL_W) / 2} width={GOAL_D} height={GOAL_W} />
          <path data-mark="corner" d="M 1 0 A 1 1 0 0 1 0 1" />
          <path data-mark="corner" d={`M 0 ${W - 1} A 1 1 0 0 1 1 ${W}`} />
          <path data-mark="corner" d={`M ${L - 1} ${W} A 1 1 0 0 1 ${L} ${W - 1}`} />
          <path data-mark="corner" d={`M ${L} 1 A 1 1 0 0 1 ${L - 1} 0`} />
        </g>
        {team.players.map((p, i) => {
          if (dismissed?.has(p.playerId)) return null;
          const slot = slots[i]!;
          const line = slots.filter((s) => s.row === slot.row).sort((a, b) => a.col - b.col);
          const x = X_KEEPER + ((slot.row - 1) / Math.max(1, rows - 1)) * (X_FRONT - X_KEEPER);
          const y = ((line.indexOf(slot) + 0.5) / line.length) * W;
          const rx = Math.round(x * 10) / 10;
          const ry = Math.round(y * 10) / 10;
          return (
            <g
              key={p.playerId}
              data-testid="wi-pitch-player"
              data-role={slot.role}
              data-x={rx}
              data-y={ry}
              transform={`translate(${rx} ${ry})`}
              className="wi-player"
            >
              <circle r={2.2} />
              <text y={5.2} textAnchor="middle">
                {p.name.split(" ").slice(-1)[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
