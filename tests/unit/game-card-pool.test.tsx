import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

const { CardPool } = await import("@/features/game/components/CardPool");

const mk = (id: number, name: string, role: "CB" | "CF"): PoolCard => ({
  cardId: makeCardId(id, 2020),
  playerId: id,
  season: 2020,
  name,
  role,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Club",
});

const adams = mk(2, "Tony Adams", "CB");
const henry = mk(3, "Thierry Henry", "CF");
const pool = [adams, henry];

const base = { cards: pool, placed: [], selectedCard: null, reduced: true };

describe("CardPool", () => {
  it("renders every card when nothing is selected", () => {
    renderWithIntl(<CardPool {...base} eligible={null} onSelectCard={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Tony Adams/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thierry Henry/ })).toBeInTheDocument();
  });

  it("disables cards that cannot fill the selected slot", () => {
    // The hard ban enforced by construction: an ineligible card is not clickable, so
    // the coach is never offered a placement the rules would then have to reject.
    renderWithIntl(
      <CardPool {...base} eligible={[adams.cardId]} onSelectCard={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Thierry Henry/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Tony Adams/ })).toBeEnabled();
  });

  it("sorts eligible cards to the front so the cascade reads as a re-sort", () => {
    renderWithIntl(<CardPool {...base} eligible={[henry.cardId]} onSelectCard={vi.fn()} />);
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names[0]).toContain("Thierry Henry");
  });

  it("marks a card already on the pitch", () => {
    renderWithIntl(
      <CardPool {...base} placed={[adams.cardId]} eligible={null} onSelectCard={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Tony Adams/ })).toHaveAttribute(
      "data-placed",
      "true",
    );
  });

  it("reports the clicked card", async () => {
    const onSelectCard = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<CardPool {...base} eligible={null} onSelectCard={onSelectCard} />);
    await user.click(screen.getByRole("button", { name: /Thierry Henry/ }));
    expect(onSelectCard).toHaveBeenCalledWith(henry.cardId);
  });

  it("runs no animation when motion is reduced", () => {
    renderWithIntl(<CardPool {...base} eligible={null} onSelectCard={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Tony Adams/ }).style.animation).toBe("");
  });
});
