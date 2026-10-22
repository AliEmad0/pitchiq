import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrisisPanel } from "@/features/game/components/CrisisPanel";
import { fallbackFor } from "@/features/game/components/DecisionPrompt";
import type { CrisisDecision } from "@/features/game/domain/match-decisions";
import { declineOf } from "@/features/game/view/bench-state";
import { renderWithIntl } from "./_helpers/intl";

/** TASK-1814 follow-up — the crisis panel says who, what each call costs, and answers the decision. */
const decision = (legalOn: CrisisDecision["legalOn"]): CrisisDecision => ({
  kind: "crisis",
  minute: 74,
  side: "home",
  player: 9,
  name: "Jamie Vardy",
  legalOn,
  events: [],
});
const sub = { playerId: 12, name: "Sub" } as never;

describe("CrisisPanel", () => {
  it("names the tiring man and answers push or rest for THIS decision", async () => {
    const onAnswer = vi.fn();
    renderWithIntl(<CrisisPanel decision={decision([sub])} onAnswer={onAnswer} />);
    expect(screen.getByTestId("crisis-panel")).toHaveTextContent(
      "Jamie Vardy is running on empty at 74'",
    );
    await userEvent.click(screen.getByTestId("crisis-push"));
    await userEvent.click(screen.getByTestId("crisis-rest"));
    expect(onAnswer.mock.calls.map((c) => c[0])).toEqual([
      { kind: "crisis", minute: 74, side: "home", choice: "push" },
      { kind: "crisis", minute: 74, side: "home", choice: "rest" },
    ]);
  });

  it("⛔ cannot offer a rest that is impossible, and says why", () => {
    renderWithIntl(<CrisisPanel decision={decision([])} onAnswer={vi.fn()} />);
    expect(screen.getByTestId("crisis-rest")).toBeDisabled();
    expect(screen.getByTestId("crisis-rest")).toHaveTextContent("No change possible");
  });

  it("a lapsed or manual-mode crisis keeps him on — nothing changes the coach did not choose", () => {
    expect(fallbackFor(decision([sub]))).toMatchObject({ kind: "crisis", choice: "push" });
    expect(declineOf(decision([sub]))).toMatchObject({ kind: "crisis", choice: "push" });
  });
});
