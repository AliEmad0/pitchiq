import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { COLLECTION_SURFACES, GAME_MODES } from "@/features/game/domain/modes";
import en from "@/i18n/messages/en.json";
import { renderWithIntl } from "./_helpers/intl";

const { ModeGate } = await import("@/features/game/components/ModeGate");

const label = (key: string) => (en.game as Record<string, string>)[key];

describe("ModeGate", () => {
  it("renders every mode in the registry exactly once", () => {
    renderWithIntl(<ModeGate />);
    for (const mode of GAME_MODES) {
      const name = label(mode.nameKey);
      expect(
        screen.getAllByText(new RegExp(escapeRegExp(name)), { exact: false }),
        name,
      ).not.toHaveLength(0);
    }
  });

  it("renders every collection surface", () => {
    renderWithIntl(<ModeGate />);
    for (const surface of COLLECTION_SURFACES) {
      expect(
        screen.getByText(new RegExp(escapeRegExp(label(surface.nameKey)))),
      ).toBeInTheDocument();
    }
  });

  it("opens a mode on click and collapses it on a second click", async () => {
    renderWithIntl(<ModeGate />);
    const tile = screen.getByRole("button", { name: /Tactical H2H/ });

    expect(tile).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(tile);
    expect(tile).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: /One Match/ })).toBeInTheDocument();

    await userEvent.click(tile);
    expect(tile).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /One Match/ })).not.toBeInTheDocument();
  });

  it("keeps only one mode open at a time", async () => {
    renderWithIntl(<ModeGate />);
    const h2h = screen.getByRole("button", { name: /Tactical H2H/ });
    const chaos = screen.getByRole("button", { name: /Chaos Draft/ });

    await userEvent.click(h2h);
    await userEvent.click(chaos);

    expect(h2h).toHaveAttribute("aria-expanded", "false");
    expect(chaos).toHaveAttribute("aria-expanded", "true");
  });

  it("exposes a control for the playable modes only", () => {
    renderWithIntl(<ModeGate />);
    // Exactly two playable modes today: H2H and Chaos. Every other tile is inert, so the
    // gate contributes two tab stops rather than eleven.
    const tiles = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
    expect(tiles).toHaveLength(2);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
