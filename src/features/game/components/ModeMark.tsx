import type { ModeId } from "@/features/game/domain/modes";

/**
 * The eleven mode marks (TASK-1833, owner's round-2 pick).
 *
 * ⭐ Drawn as 8×8 GRIDS rather than as vector paths, and that is the point: the gate is an
 * arcade cabinet, and a monoline vector mark fights it. The grid is the arcade's own
 * drawing language, so the marks belong to the surface instead of sitting on top of it.
 *
 * ⚠️ One data source, rendered as an OUTLINE (owner picked the neon set over solid and
 * badge). Filled cells become stroked squares, so the mark reads as a lit sign.
 *
 * ⚠️ `currentColor`, never a literal — the tile sets the mode's accent and the mark
 * inherits it. That is what makes eleven marks eleven identities with one component.
 *
 * ⚠️ `aria-hidden`: the tile's own text names the mode. A mark that announced itself would
 * make every tile read its name twice.
 */
const GRID: Record<ModeId, readonly string[]> = {
  h2h: ["#......#", "##....##", "###..###", "####..##", "###..###", "##....##", "#......#", "........"],
  chaos: ["...##...", "..##....", ".###....", ".#####..", "....##..", "...##...", "..##....", ".#......"],
  captains: ["..####..", ".######.", ".##..##.", ".##..##.", ".######.", "..####..", "........", "........"],
  budget: ["..####..", ".##..##.", "##.##.##", "##.##.##", "##.##.##", ".##..##.", "..####..", "........"],
  chemistry: [".##...##", ".##...##", "..##.##.", "...###..", "..##.##.", ".##...##", ".##...##", "........"],
  legacy: [".######.", ".######.", ".######.", ".######.", "..####..", "..####..", "...##...", "........"],
  classic: ["...##...", "...##...", ".######.", "##.##.##", ".######.", "...##...", "..#..#..", "........"],
  daily: [".#....#.", ".######.", ".######.", ".#....#.", ".#.##.#.", ".#.##.#.", ".######.", "........"],
  weekly: ["......##", "....####", "....####", "..######", "..######", "########", "########", "........"],
  whatIf: [".##..##.", ".##..##.", "..####..", "...##...", "...##...", "...##...", "...##...", "........"],
  mystery: ["..####..", ".##..##.", ".....##.", "....##..", "...##...", "........", "...##...", "........"],
};

export function ModeMark({ id, size = 44 }: { id: ModeId; size?: number }) {
  const grid = GRID[id];
  const cells: { x: number; y: number }[] = [];
  grid.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === "#") cells.push({ x, y });
    });
  });

  return (
    <svg
      viewBox="0 0 8 8"
      width={size}
      height={size}
      /* Square pixels, not blurred ones — the grid only reads as a grid if it stays crisp. */
      shapeRendering="crispEdges"
      className="mg-mark"
      aria-hidden="true"
    >
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          x={c.x}
          y={c.y}
          width={1}
          height={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.14}
        />
      ))}
    </svg>
  );
}
