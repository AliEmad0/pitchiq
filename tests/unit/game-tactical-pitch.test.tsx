import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeCardId, type PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { renderWithIntl } from "./_helpers/intl";

const { TacticalPitch } = await import("@/features/game/components/TacticalPitch");

const cb: PoolCard = {
  cardId: makeCardId(2, 2020),
  playerId: 2,
  season: 2020,
  name: "Tony Adams",
  role: "CB",
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
  club: "Arsenal",
};

const shape = formationByName("4-4-2 Flat");
// Annotated: inferred this is `null[]`, and assigning a cardId into a copy of it fails
// the project-wide tsc even though per-file vitest is perfectly happy with it.
const empty: (PlayerSeasonId | null)[] = shape.slots.map(() => null);

const base = {
  formation: shape,
  cards: [cb],
  selectedSlot: null,
  highlighted: [],
  holdingCard: false,
  errors: [],
  reduced: true,
};

describe("TacticalPitch", () => {
  it("renders one control per formation slot", () => {
    renderWithIntl(<TacticalPitch {...base} slots={empty} onSelectSlot={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(shape.slots.length);
  });

  it("shows the player's name once a slot is filled", () => {
    const slots = [...empty];
    slots[2] = cb.cardId;
    renderWithIntl(<TacticalPitch {...base} slots={slots} onSelectSlot={vi.fn()} />);
    expect(screen.getByText("Tony Adams")).toBeInTheDocument();
  });

  it("reports the FORMATION index, not the DOM position", async () => {
    // Rows render attackers-first, so DOM order is not slot order. The goalkeeper is
    // rendered last and is slot 0 — clicking him is the sharpest check that the index
    // travelling out is the formation's, not the button's.
    const onSelectSlot = vi.fn<(i: number) => void>();
    const user = userEvent.setup();
    renderWithIntl(<TacticalPitch {...base} slots={empty} onSelectSlot={onSelectSlot} />);
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[buttons.length - 1]);
    expect(onSelectSlot).toHaveBeenCalledWith(0);
  });

  it("marks a slot holding an ineligible player", () => {
    // The only way this state arises is a formation change under a placed XI, and the
    // coach has to be able to SEE which slot is the problem.
    const slots = [...empty];
    slots[4] = cb.cardId;
    renderWithIntl(
      <TacticalPitch
        {...base}
        slots={slots}
        errors={[{ slotIndex: 4, role: "RB", cardId: cb.cardId, playerName: "Tony Adams" }]}
        onSelectSlot={vi.fn()}
      />,
    );
    const flagged = screen.getAllByRole("button").filter((b) => b.dataset.invalid === "true");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toHaveAccessibleName(/Tony Adams/);
  });

  it("disables every slot the held card cannot legally fill", () => {
    // The other half of the hard ban. Ineligible CARDS are disabled when a slot is
    // held; ineligible SLOTS must be disabled when a card is held, or a centre-back
    // can be dropped into a striker slot and the coach only finds out when Play
    // refuses to light up.
    renderWithIntl(
      <TacticalPitch
        {...base}
        slots={empty}
        holdingCard
        highlighted={[2, 3]}
        onSelectSlot={vi.fn()}
      />,
    );
    const enabled = screen.getAllByRole("button").filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled).toHaveLength(2);
    for (const b of enabled) expect(b).toHaveAccessibleName(/CB/);
  });

  it("leaves every slot clickable when no card is held", () => {
    renderWithIntl(<TacticalPitch {...base} slots={empty} onSelectSlot={vi.fn()} />);
    const disabled = screen.getAllByRole("button").filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled).toHaveLength(0);
  });

  it("renders attackers above defenders", () => {
    // Formation rows run 1 = goalkeeper line upward, and a teamsheet reads top-down
    // with the attack at the top — so the DOM order must be reversed, not raw.
    renderWithIntl(<TacticalPitch {...base} slots={empty} onSelectSlot={vi.fn()} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels[0]).toContain("CF");
    expect(labels[labels.length - 1]).toContain("GK");
  });
});
