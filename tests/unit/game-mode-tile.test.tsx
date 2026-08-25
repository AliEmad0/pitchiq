import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GAME_MODES, isPlayable } from "@/features/game/domain/modes";
import en from "@/i18n/messages/en.json";
import { renderWithIntl } from "./_helpers/intl";

const { ModeTile } = await import("@/features/game/components/ModeTile");

const h2h = GAME_MODES.find((m) => m.id === "h2h")!;
/**
 * ⛔ DERIVED, never a named mode. This was `id === "captains"` — and when Captain's Draft
 * shipped, the test asserting "a planned mode is not focusable" was pointed at a mode that
 * had become a control, so it failed for a reason that had nothing to do with the rule.
 * A locked example must come from the registry, or every mode that ships breaks it.
 */
const locked = GAME_MODES.find((m) => !isPlayable(m))!;

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
    renderWithIntl(<ModeTile mode={locked} open={false} onOpen={vi.fn()} />);

    // Visible…
    const name = en.game[locked.nameKey as keyof typeof en.game] as string;
    // An exact string, not a regex — a mode name can contain regex metacharacters.
    expect(screen.getByText(name)).toBeInTheDocument();
    // …but never a control. Eleven locked tiles would be eleven dead tab stops.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a planned FORMAT as text, not a link", () => {
    renderWithIntl(<ModeTile mode={h2h} open onOpen={vi.fn()} />);

    expect(screen.getByRole("link", { name: /One Match/ })).toBeInTheDocument();
    // Season is `planned` on every mode until TASK-1810/1811 ship.
    expect(screen.queryByRole("link", { name: /Full Season/ })).not.toBeInTheDocument();
    expect(screen.getByText("Full Season")).toBeInTheDocument();
  });

  it("⛔ a mode with no second format goes STRAIGHT IN — no expander, no Full Season box", () => {
    // Owner, 2026-08-24: "there is no Full Season for it, just when click on it go to the
    // challenge." A season-long daily is a contradiction, so `season` is `n/a` rather than
    // `planned` and the tile is a link instead of an expander.
    const daily = GAME_MODES.find((m) => m.id === "daily")!;
    renderWithIntl(<ModeTile mode={daily} open={false} onOpen={vi.fn()} />);

    const link = screen.getByRole("link", { name: /Daily Challenge/ });
    expect(link.getAttribute("href")).toMatch(/\/game\/daily$/);
    // No expander, and nothing anywhere promising a season that is never coming.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("Full Season")).not.toBeInTheDocument();
    expect(screen.queryByText("One Match")).not.toBeInTheDocument();
  });
});
