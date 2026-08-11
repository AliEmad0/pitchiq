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

describe("DraftHub", () => {
  it("starts with an empty pitch and Play blocked", () => {
    // The route is force-static: a squad in the prerendered HTML is served identically
    // to everyone and then visibly swapped (the lesson from PR #97).
    renderWithIntl(<DraftHub pool={pool} />);
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
    expect(screen.getByText("Fill every slot to play.")).toBeInTheDocument();
  });

  it("auto-fill completes the XI and unblocks Play", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeEnabled();
  });

  it("auto-fill produces a squad that passes validation", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.queryByText(/cannot play/)).not.toBeInTheDocument();
  });

  it("⚠️ a formation change under a filled XI blocks Play and names the offenders", async () => {
    // The only route to an illegal squad through this UI, and the reason validation
    // exists at all alongside the by-construction ban.
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "3-5-2" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
    expect(screen.getAllByText(/cannot play/).length).toBeGreaterThan(0);
  });

  it("selecting a slot filters the pool to eligible cards only", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} />);
    // The goalkeeper slot renders last — rows run attack-first.
    const slots = screen.getAllByRole("button", { name: /slot/ });
    await user.click(slots[slots.length - 1]);
    expect(screen.getByRole("button", { name: /GK-0/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /CF-0/ })).toBeDisabled();
  });

  it("clear empties the pitch again", async () => {
    const user = userEvent.setup();
    renderWithIntl(<DraftHub pool={pool} />);
    await user.click(screen.getByRole("button", { name: "Auto-fill" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Play match" })).toBeDisabled();
  });
});
