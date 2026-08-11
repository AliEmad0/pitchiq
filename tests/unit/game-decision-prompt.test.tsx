import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeCardId } from "@/features/game/domain/card-id";
import type { DecisionAnswer, MatchDecision } from "@/features/game/domain/match-decisions";
import { renderWithIntl } from "./_helpers/intl";

const { DecisionPrompt } = await import("@/features/game/components/DecisionPrompt");

const responseDecision: MatchDecision = {
  kind: "response",
  minute: 31,
  side: "home",
  events: [],
  concededBy: "home",
};

const player = (playerId: number, name: string) => ({
  cardId: makeCardId(playerId, 2020),
  playerId,
  season: 2020,
  name,
  role: "CM" as const,
  altRoles: [],
  foot: null,
  height: null,
  provenance: null,
  ratings: null,
});

const subDecision: MatchDecision = {
  kind: "sub-offer",
  minute: 60,
  side: "home",
  events: [],
  stoppage: true,
  engineSuggests: false,
  legalOff: [player(1, "Patrick Vieira")],
  legalOn: [player(2, "Gilberto Silva")],
};

describe("DecisionPrompt", () => {
  it("offers the three responses to conceding", () => {
    renderWithIntl(<DecisionPrompt decision={responseDecision} limit={null} onAnswer={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Aggressive overload")).toBeInTheDocument();
    expect(screen.getByText("Defensive stabilization")).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
  });

  it("answers with the chosen response, stamped with the decision's minute and side", () => {
    const onAnswer = vi.fn<(a: DecisionAnswer) => void>();
    renderWithIntl(<DecisionPrompt decision={responseDecision} limit={null} onAnswer={onAnswer} />);
    screen.getByText("Aggressive overload").click();
    expect(onAnswer).toHaveBeenCalledWith({
      kind: "response",
      minute: 31,
      side: "home",
      choice: "overload",
    });
  });

  it("hides the countdown entirely when the limit is disabled", () => {
    // WCAG 2.2.1 — the limit must be disableable, and disabling it must not leave a
    // dead timer on screen.
    renderWithIntl(<DecisionPrompt decision={responseDecision} limit={null} onAnswer={vi.fn()} />);
    expect(screen.queryByText(/\ds$/)).not.toBeInTheDocument();
  });

  it("will not confirm a substitution until someone is chosen to come off", () => {
    const onAnswer = vi.fn();
    renderWithIntl(<DecisionPrompt decision={subDecision} limit={null} onAnswer={onAnswer} />);
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("cancelling answers with no change rather than doing nothing", () => {
    // The opportunity is spent either way, so cancelling must still produce an answer —
    // a silent close would leave the engine waiting forever.
    const onAnswer = vi.fn<(a: DecisionAnswer) => void>();
    renderWithIntl(<DecisionPrompt decision={subDecision} limit={null} onAnswer={onAnswer} />);
    screen.getByRole("button", { name: "Cancel" }).click();
    expect(onAnswer).toHaveBeenCalledWith({ kind: "sub-offer", minute: 60, side: "home" });
  });

  it("confirms a substitution with both players once they are picked", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn<(a: DecisionAnswer) => void>();
    renderWithIntl(<DecisionPrompt decision={subDecision} limit={null} onAnswer={onAnswer} />);
    await user.click(screen.getByRole("button", { name: "Patrick Vieira" }));
    await user.click(screen.getByRole("button", { name: "Gilberto Silva" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onAnswer).toHaveBeenCalledWith({
      kind: "sub-offer",
      minute: 60,
      side: "home",
      off: 1,
      on: 2,
    });
  });
});
