import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GAME_MODES, type GameMode, isPlayable } from "@/features/game/domain/modes";
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
const locked: GameMode = GAME_MODES.find((m) => !isPlayable(m)) ?? {
  // ⭐ Every mode shipped on 2026-10-21 (TASK-1818). The RULE still needs guarding — the next mode
  // added to the registry starts locked — so the example becomes a synthetic one: a real mode's
  // identity with nothing live.
  ...GAME_MODES.find((m) => m.id === "mystery")!,
  href: null,
  formats: { single: "planned", season: "planned" },
};

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
    // ⛔ DERIVED, never hardcoded (CLAUDE.md): this used H2H while its season was planned, and
    // went red the day every mode got a season. Any playable mode with a planned format will do.
    const mixed = GAME_MODES.find(
      (m) => isPlayable(m) && Object.values(m.formats).includes("planned"),
    )!;
    expect(mixed).toBeDefined();
    renderWithIntl(<ModeTile mode={mixed} open onOpen={vi.fn()} />);

    const label = { single: /One Match/, season: /Full Season/ } as const;
    const text = { single: "One Match", season: "Full Season" } as const;
    for (const f of ["single", "season"] as const) {
      if (mixed.formats[f] === "live") {
        expect(screen.getByRole("link", { name: label[f] })).toBeInTheDocument();
      } else {
        expect(screen.queryByRole("link", { name: label[f] })).not.toBeInTheDocument();
        expect(screen.getByText(text[f])).toBeInTheDocument();
      }
    }
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
