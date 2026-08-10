import type { Frame, SimDot } from "@/features/game/domain/pitch-sim";

// Landscape broadcast pitch. The sim works in normalised [0,1] coords; we scale
// to this viewBox. Home defends the LEFT goal, away the RIGHT.
const W = 140;
const H = 90;
const STAGGER_MS = 150;

/** Deterministic [0,1) noise for a stable per-player transition delay. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Per formation slot, as it stands right now. `null` = nobody there any more. */
export interface SlotStatus {
  number: number;
  booked: boolean;
}

interface Props {
  frame: Frame;
  /**
   * Per-slot state, indexed like the formation. A `null` entry is a player who has been
   * SENT OFF and not replaced — the dot is removed entirely, which is the whole point:
   * the map used to keep him running around for the rest of the match.
   */
  homeSlots?: (SlotStatus | null)[];
  awaySlots?: (SlotStatus | null)[];
  homeNumbers: number[];
  awayNumbers: number[];
  animate: boolean;
  label: string;
}

export function MatchPitch({
  frame,
  homeSlots,
  awaySlots,
  homeNumbers,
  awayNumbers,
  animate,
  label,
}: Props) {
  const ease = "cubic-bezier(0.45, 0, 0.55, 1)";
  const rows: Array<{
    dot: SimDot;
    number: number;
    booked: boolean;
    gone: boolean;
    side: "home" | "away";
    index: number;
    seed: number;
  }> = [
    ...frame.home.map((dot, i) => ({
      dot,
      number: homeSlots?.[i]?.number ?? homeNumbers[i] ?? 0,
      booked: homeSlots?.[i]?.booked ?? false,
      gone: homeSlots != null && homeSlots[i] == null,
      side: "home" as const,
      index: i,
      seed: i + 1,
    })),
    ...frame.away.map((dot, i) => ({
      dot,
      number: awaySlots?.[i]?.number ?? awayNumbers[i] ?? 0,
      booked: awaySlots?.[i]?.booked ?? false,
      gone: awaySlots != null && awaySlots[i] == null,
      side: "away" as const,
      index: i,
      seed: i + 60,
    })),
  ].filter((r) => !r.gone);
  const ballChip = (
    <circle r="1.7" cx="0" cy="4.4" fill="#ffffff" stroke="#0b1f14" strokeWidth="0.5" />
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-full w-full">
      {Array.from({ length: 10 }, (_, i) => (
        <rect
          key={i}
          x={(i * W) / 10}
          y="0"
          width={W / 10}
          height={H}
          fill={i % 2 ? "#0c5a37" : "#0a5230"}
        />
      ))}
      <g stroke="rgba(255,255,255,.55)" strokeWidth="0.6" fill="none">
        <rect x="3" y="3" width={W - 6} height={H - 6} />
        <line x1={W / 2} y1="3" x2={W / 2} y2={H - 3} />
        <circle cx={W / 2} cy={H / 2} r="9" />
        <rect x="3" y={H / 2 - 18} width="16" height="36" />
        <rect x={W - 19} y={H / 2 - 18} width="16" height="36" />
        <rect x="3" y={H / 2 - 9} width="6" height="18" />
        <rect x={W - 9} y={H / 2 - 9} width="6" height="18" />
      </g>

      {rows.map(({ dot, number, booked, side, index, seed }, i) => {
        const isHome = side === "home";
        const delay = Math.floor(noise(seed * 7 + 2) * STAGGER_MS);
        const hasBall =
          frame.ballOnHolder && frame.holderSide === side && frame.holderIndex === index;
        return (
          <g
            key={i}
            style={{
              transform: `translate(${dot.x * W}px, ${dot.y * H}px) scale(${dot.scale})`,
              transformOrigin: "0px 0px",
              transition: animate ? `transform 1100ms ${ease} ${delay}ms` : "none",
            }}
          >
            {/* A booked player wears the caution: an amber ring around his dot, so the
                map shows discipline at a glance instead of only the roster list. */}
            {booked && (
              <circle r={4.1} fill="none" stroke="#f5c518" strokeWidth={0.9} opacity={0.95} />
            )}
            <circle
              r={3}
              className={isHome ? "fill-primary" : "fill-[#23272f]"}
              stroke={booked ? "#f5c518" : "rgba(255,255,255,.85)"}
              strokeWidth={0.5}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="3"
              fontWeight="700"
              fill="#ffffff"
            >
              {number}
            </text>
            {/* Ball rides the holder — it is never left in empty space during play. */}
            {hasBall && ballChip}
          </g>
        );
      })}

      {/* Ball in flight (shot) / in the net (goal) / on the centre spot (rest). */}
      {!frame.ballOnHolder && (
        <circle
          cx="0"
          cy="0"
          r="1.7"
          fill="#ffffff"
          stroke="#0b1f14"
          strokeWidth="0.5"
          style={{
            transform: `translate(${frame.ball.x * W}px, ${frame.ball.y * H}px)`,
            transformOrigin: "0px 0px",
            transition: animate ? `transform 380ms ${ease}` : "none",
          }}
        />
      )}
    </svg>
  );
}
