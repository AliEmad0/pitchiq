import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import {
  chemistryView,
  changedSlot,
  nextFlash,
  ringTier,
} from "@/features/game/view/chemistry-view";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DraftHub } = await import("@/features/game/components/DraftHub");

/**
 * TASK-1824 remainder — chemistry on the H2H hub (`/game/draft`).
 *
 * The pool has NO right-back: a centre-back who can cover RB is the only way to fill that slot,
 * so auto-fill places exactly one man out of position, by construction. One club, one season,
 * one nation, so every adjacent pair is a teammate pair.
 */
const ROLES: PlayerRole[] = ["GK", "LB", "CB", "LM", "CM", "RM", "CDM", "CAM", "LW", "RW", "CF"];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 6 }, (_, i) => ({
    cardId: makeCardId(1000 + r * 10 + i, 2020),
    playerId: 1000 + r * 10 + i,
    season: 2020,
    name: `${role}-${i}`,
    role,
    altRoles: (role === "CB" ? ["RB"] : []) as PlayerRole[],
    foot: null,
    height: null,
    provenance: null,
    ratings: null,
    club: "Club",
    teamId: 4,
    nationalityCode: "fr",
  })),
);

describe("chemistry on the H2H hub", () => {
  it("⭐ auto-fill shows the meter, the links and the one man out of position", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} chemistry />);
    // An empty pitch already shows the meter at zero, so the coach sees what he is building.
    expect(screen.getByTestId("chem-meter")).toHaveTextContent("0");
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getAllByTestId("chem-link").length).toBeGreaterThan(10);
    const marks = screen.getAllByTestId("chem-off");
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("CB");
    expect(screen.getByTestId("chem-off-warn")).toHaveTextContent(/1 player is out of position/);
    // All teammates on links (100) less the one misplaced man.
    expect(screen.getByTestId("chem-meter")).toHaveTextContent("92");
  });

  it("⛔ the connector layer never takes a click", async () => {
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} chemistry />);
    expect(screen.getByTestId("chem-links")).toHaveStyle({ pointerEvents: "none" });
  });

  it("⛔ THE CONTROL — without the prop the hub renders no chemistry at all", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    for (const id of ["chem-meter", "chem-links", "chem-link", "chem-off", "chem-off-warn"]) {
      expect(screen.queryAllByTestId(id)).toHaveLength(0);
    }
  });
});

describe("chemistry-view", () => {
  const shape = formationByName("4-4-2 Flat")!;
  const xi = shape.slots.map(
    (s, i) => pool.find((c) => c.role === s.role) ?? pool[2 * 6 + (i % 6)]!,
  );

  it("scores with role fit, the figure the engine plays", () => {
    const v = chemistryView(xi, shape);
    expect(v.offSlots.length).toBe(1);
    expect(v.links.every((l) => l.tier === "teammates")).toBe(true);
    expect(v.score).toBe(92);
  });

  it("a placement flashes ITS slot, counts up, and rings only the neighbours it links to", () => {
    const ids = xi.map((c) => c.cardId);
    const before = ids.map((id, k) => (k === 5 ? null : id));
    expect(changedSlot(before, ids, 11)).toBe(5);
    const f = nextFlash(null, before, ids, xi, shape, 80, 92)!;
    expect(f).toMatchObject({ slot: 5, n: 1, down: false });
    const v = chemistryView(xi, shape);
    const ringed = shape.slots.map((_, i) => ringTier(f, v.links, i)).filter((t) => t != null);
    expect(ringed.length).toBe(v.links.filter((l) => l.i === 5 || l.j === 5).length);
    // Nothing new landed → the flash is left exactly as it was.
    expect(nextFlash(f, ids, ids, xi, shape, 92, 92)).toBe(f);
  });
});
