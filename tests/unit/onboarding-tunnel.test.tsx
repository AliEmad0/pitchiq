import "fake-indexeddb/auto";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TUTORIAL } from "@/features/game/domain/coach";
import { renderWithIntl } from "./_helpers/intl";

// The tutorial match is the real What-If screen; here it only needs to finish.
vi.mock("@/features/game/components/WhatIf", () => ({
  WhatIf: ({ tutorial }: { tutorial: { onFinish: (r: unknown) => void } }) => (
    <button
      type="button"
      data-testid="fake-finish"
      onClick={() => tutorial.onFinish({ score: { home: 3, away: 2 }, verdict: "rewrote" })}
    >
      finish
    </button>
  ),
}));
const { Onboarding } = await import("@/features/game/components/Onboarding");

/** Polish O1 — the first run dressed as the Kick-off Tunnel. */
const card = {
  id: TUTORIAL.scenarioId,
  home: { id: 20, name: "Southampton" },
  away: { id: 10, name: "Liverpool" },
};

beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

describe("the Kick-off Tunnel", () => {
  it("is one hero with ONE centred card holding the name and every crest", async () => {
    renderWithIntl(<Onboarding card={card} />);
    const hero = await screen.findByTestId("ob-identity");
    expect(hero).toHaveClass("kt-hero");
    const form = within(hero).getByTestId("kt-form");
    expect(within(form).getByLabelText("Coach name")).toBeInTheDocument();
    expect(within(form).getAllByRole("radio").length).toBeGreaterThan(1);
    // The CTA sits OUTSIDE the card, full width beneath it.
    expect(form).not.toContainElement(screen.getByTestId("ob-start"));
  });

  it("the hook leads with the scoreline on a result board, then three next steps", async () => {
    renderWithIntl(<Onboarding card={card} />);
    await userEvent.click(await screen.findByTestId("ob-start"));
    await userEvent.click(await screen.findByTestId("fake-finish"));
    const hook = await screen.findByTestId("ob-hook");
    expect(hook).toHaveClass("kt-hero");
    const board = within(hook).getByTestId("kt-score");
    expect(board).toHaveTextContent("3–2");
    // A score is not text: it never mirrors.
    expect(board).toHaveAttribute("dir", "ltr");
    expect(within(hook).getAllByRole("listitem")).toHaveLength(3);
    expect(within(hook).getByTestId("ob-next-whatif")).toBeInTheDocument();
  });
});
