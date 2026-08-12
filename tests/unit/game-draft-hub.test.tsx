import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { DraftHub } = await import("@/features/game/components/DraftHub");

const ROLES: PlayerRole[] = [
  "GK",
  "LB",
  "CB",
  "RB",
  "LM",
  "CM",
  "RM",
  "CDM",
  "CAM",
  "LW",
  "RW",
  "CF",
];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  [0, 1, 2, 3].map((i) => ({
    cardId: makeCardId(1000 + r * 10 + i, 2020),
    playerId: 1000 + r * 10 + i,
    season: 2020,
    name: `${role}-${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: null,
    club: "Club",
  })),
);

describe("DraftHub formation picker", () => {
  it("offers all twenty formations, grouped by family", () => {
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    const select = screen.getByRole("combobox", { name: "Formation" });
    expect(select.querySelectorAll("option")).toHaveLength(20);
    expect(select.querySelectorAll("optgroup")).toHaveLength(3);
  });

  it("changing formation still renders eleven slots", async () => {
    // Asserted on slot COUNT rather than role labels: TacticalPitch builds each slot
    // button's accessible name itself, and pinning that copy here would couple this test
    // to that component. Eleven is true of every shape and is what actually matters.
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    const pitch = screen.getByRole("group", { name: "Formation slots" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Formation" }), "2-3-5 Pyramid");
    expect(pitch.querySelectorAll("button")).toHaveLength(11);
  });
});

describe("DraftHub", () => {
  it("starts with an empty pitch and Play blocked", () => {
    // The route is force-static: a squad in the prerendered HTML is served identically
    // to everyone and then visibly swapped (the lesson from PR #97).
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
    expect(screen.getByText("Fill every slot to play.")).toBeInTheDocument();
  });

  it("auto-fill completes the XI and unblocks Play", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeEnabled();
  });

  it("auto-fill produces a squad that passes validation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.queryByText(/cannot play/)).not.toBeInTheDocument();
  });

  it("⚠️ a formation change under a filled XI blocks Play and names the offenders", async () => {
    // The only route to an illegal squad through this UI, and the reason validation
    // exists at all alongside the by-construction ban.
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeEnabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Formation" }), "3-5-2");
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
    expect(screen.getAllByText(/cannot play/).length).toBeGreaterThan(0);
  });

  it("selecting a slot filters the pool to eligible cards only", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    // The goalkeeper slot renders last — rows run attack-first.
    const slots = screen.getAllByRole("button", { name: /slot/ });
    await user.click(slots[slots.length - 1]);
    expect(screen.getByRole("button", { name: /GK-0/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /CF-0/ })).toBeDisabled();
  });

  it("hands the finished XI up rather than starting the match itself", async () => {
    // The hub used to mount the match directly. TASK-1807 B moved that to the container,
    // so the hub's job now ends at "here is a legal eleven".
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    await user.click(screen.getByRole("button", { name: "Play match" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [players, formation] = onConfirm.mock.calls[0];
    expect(players).toHaveLength(11);
    expect(formation.slots).toHaveLength(11);
    // Resolved cards, not slot ids — the container should not have to look them up.
    expect(players[0]).toHaveProperty("name");
  });

  it("does not hand up an illegal squad", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={onConfirm} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Formation" }), "3-5-2");
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clear empties the pitch again", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} onConfirm={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
  });
});
