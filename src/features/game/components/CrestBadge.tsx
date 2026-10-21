import type { Crest } from "@/features/game/domain/coach";

/** TASK-1827 — a coach's crest: his emblem on his colour, as a round badge. */
export function CrestBadge({ crest, size = 40 }: { crest: Crest; size?: number }) {
  return (
    <span
      className="crest-badge"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: crest.color,
        fontSize: Math.round(size * 0.55),
      }}
    >
      {crest.emoji}
    </span>
  );
}
