import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamTalkPitch } from "@/features/game/components/TeamTalkPitch";
import { formationByName } from "@/features/game/domain/formation";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";

/**
 * TASK-1816 (owner, 2026-10-20) — the team-talk pitch is a REAL pitch drawn LEFT TO RIGHT:
 * keeper at the left goal, the side attacking right, with true white markings. The first
 * version stood a vertical formation on a landscape pitch, which read as nonsense.
 */
const formation = { ...formationByName("4-4-2 Flat"), season: 2010 };
const players = formation.slots.map(
  (slot, i) =>
    ({
      cardId: `${i}@2010`,
      playerId: i + 1,
      season: 2010,
      name: `Player ${slot.role}${i}`,
      role: slot.role,
      altRoles: [],
      foot: null,
      height: null,
      provenance: null,
      ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
    }) as unknown as GamePlayer,
);
const team = makeGameTeam(34, "Newcastle", 2010, formation, players);
const xOf = (el: Element) => Number(el.getAttribute("data-x"));
const yOf = (el: Element) => Number(el.getAttribute("data-y"));

describe("TeamTalkPitch", () => {
  it("draws every white marking of a real pitch", () => {
    const { container } = render(<TeamTalkPitch team={team} label="Newcastle line-up" />);
    for (const mark of [
      "outline",
      "halfway",
      "centre-circle",
      "centre-spot",
      "box-left",
      "box-right",
      "six-left",
      "six-right",
      "spot-left",
      "spot-right",
      "arc-left",
      "arc-right",
      "goal-left",
      "goal-right",
    ])
      expect(container.querySelector(`[data-mark="${mark}"]`), mark).not.toBeNull();
    expect(container.querySelectorAll('[data-mark="corner"]')).toHaveLength(4);
  });

  it("⛔ plays LEFT → RIGHT: the keeper by the left goal, the strikers furthest right", () => {
    render(<TeamTalkPitch team={team} label="Newcastle line-up" />);
    const dots = screen.getAllByTestId("wi-pitch-player");
    expect(dots).toHaveLength(11);
    const keeper = dots.find((d) => d.getAttribute("data-role") === "GK")!;
    const strikers = dots.filter((d) => d.getAttribute("data-role") === "CF");
    expect(xOf(keeper)).toBeLessThan(12);
    for (const s of strikers) expect(xOf(s)).toBeGreaterThan(xOf(keeper) + 40);
    // Each line is a column: the back four share one x, spread across the width.
    const defenders = dots.filter((d) => ["LB", "CB", "RB"].includes(d.getAttribute("data-role")!));
    expect(new Set(defenders.map(xOf)).size).toBe(1);
    expect(new Set(defenders.map(yOf)).size).toBe(4);
    for (const d of dots) {
      expect(yOf(d)).toBeGreaterThan(0);
      expect(yOf(d)).toBeLessThan(68);
    }
  });

  it("is a picture, pinned LTR, labelled, with surnames", () => {
    render(<TeamTalkPitch team={team} label="Newcastle line-up" />);
    const pitch = screen.getByRole("img", { name: "Newcastle line-up" });
    expect(pitch.closest("[dir]")).toHaveAttribute("dir", "ltr");
    expect(screen.getAllByTestId("wi-pitch-player")[0]).toHaveTextContent(/GK0$/);
  });
});
