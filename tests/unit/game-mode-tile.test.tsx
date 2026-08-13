import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GAME_MODES } from "@/features/game/domain/modes";
import { renderWithIntl } from "./_helpers/intl";

const { ModeTile } = await import("@/features/game/components/ModeTile");

const h2h = GAME_MODES.find((m) => m.id === "h2h")!;
const captains = GAME_MODES.find((m) => m.id === "captains")!;

describe("ModeTile", () => {
  it("renders a live mode as a button", () => {
    renderWithIntl(<ModeTile mode={h2h} open={false} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Tactical H2H/ })).toBeInTheDocument();
  });

  it("calls onOpen when a live tile is clicked", async () => {
    const onOpen = vi.fn();
    renderWithIntl(<ModeTile mode={h2h} open={false} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /Tactical H2H/ }));
    expect(onOpen).toHaveBeenCalledWith("h2h");
  });

  it("shows the formats only when open", () => {
    const { rerender } = renderWithIntl(<ModeTile mode={h2h} open={false} onOpen={vi.fn()} />);
    expect(screen.queryByRole("link", { name: /One Match/ })).not.toBeInTheDocument();

    rerender(<ModeTile mode={h2h} open onOpen={vi.fn()} />);
    expect(screen.getByRole("link", { name: /One Match/ })).toBeInTheDocument();
  });

  it("renders a planned mode as NOT focusable", () => {
    renderWithIntl(<ModeTile mode={captains} open={false} onOpen={vi.fn()} />);

    // Visible…
    expect(screen.getByText(/Captain's Draft/)).toBeInTheDocument();
    // …but never a control. Eleven locked tiles would be eleven dead tab stops.
    expect(screen.queryByRole("button", { name: /Captain's Draft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Captain's Draft/ })).not.toBeInTheDocument();
  });

  it("renders a planned FORMAT as text, not a link", () => {
    renderWithIntl(<ModeTile mode={h2h} open onOpen={vi.fn()} />);

    expect(screen.getByRole("link", { name: /One Match/ })).toBeInTheDocument();
    // Season is `planned` on every mode until TASK-1810/1811 ship.
    expect(screen.queryByRole("link", { name: /Full Season/ })).not.toBeInTheDocument();
    expect(screen.getByText("Full Season")).toBeInTheDocument();
  });
});
