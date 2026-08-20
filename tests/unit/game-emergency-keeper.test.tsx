import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DecisionAnswer, DismissalDecision } from "@/features/game/domain/match-decisions";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { renderWithIntl } from "./_helpers/intl";
import { makeTeam } from "./_helpers/match-setup";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { BenchDialog } = await import("@/features/game/components/BenchDialog");
const { MatchLive } = await import("@/features/game/components/MatchLive");

/**
 * ⛔ THE EMERGENCY KEEPER — the one screen TASK-1810 shipped with no component test.
 *
 * Flagged as a known gap across two owner review rounds, and it is the decision the coach
 * is least able to recover from: declining it leaves the goal unguarded for the rest of the
 * match. Everything below it in the stack is covered (`emergencyKeeperOf`, the engine's
 * `emergencyKeepers`, the `inGoal` token) — the UI between them was not.
 *
 * ⚠️ **Reaching it through a real match is impractical, and that is measured, not assumed.**
 * Across 400 seeds the engine dismisses a keeper 39× and offers an emergency keeper **0×**,
 * because a substitution is always still available; only a driver that spends the entire
 * bench first produces the situation. So the decision here is a FIXTURE — but a faithful
 * one: `emergencyKeepers` non-empty with `legalOn` EMPTY is precisely the shape
 * `simulate.ts` emits, and it is the only shape `emergencyKeeperOf` accepts.
 */

const home = makeTeam({ name: "H" });
const away = makeTeam({ name: "A" });

/** Two outfielders who could take the gloves — the engine offers players, not slots. */
const candidates: GamePlayer[] = home.players.slice(1, 3);

const events: MatchEvent[] = [
  { minute: 0, kind: "kickoff" },
  // The keeper walks. `legalOn` is empty below, so nobody can replace him.
  { minute: 61, kind: "card", side: "home", playerId: home.players[0]!.playerId, card: "red" },
];

const result: MatchResult = { seed: 7, score: { home: 0, away: 0 }, events };
const model = buildMatchViewModel(home, away, result);

const dismissal = (over: Partial<DismissalDecision> = {}): DismissalDecision => ({
  kind: "dismissal",
  minute: 61,
  side: "home",
  events,
  keeperGone: true,
  legalOff: [],
  // ⛔ EMPTY. The engine populates `emergencyKeepers` exactly when no substitution remains;
  // with a bench keeper available the coach is offered him instead, and a fixture that had
  // both would be testing a state the engine cannot produce.
  legalOn: [],
  emergencyKeepers: candidates,
  ...over,
});

const live = (onAnswer: (a: DecisionAnswer) => void, onCoachMove?: (a: DecisionAnswer) => void) =>
  renderWithIntl(
    <MatchLive
      model={model}
      teams={{ home, away }}
      holdAt={61}
      pending={dismissal()}
      captaincies={{}}
      referees={[]}
      onAnswer={onAnswer}
      onCoachMove={onCoachMove}
    />,
  );

describe("BenchDialog — the emergency keeper", () => {
  const open = (onChoose = vi.fn(), onConfirm = vi.fn(), onClose = vi.fn()) => {
    renderWithIntl(
      <BenchDialog
        legalOff={[]}
        legalOn={[]}
        captainId={null}
        onConfirm={onConfirm}
        onClose={onClose}
        emergency={{ candidates, onChoose }}
      />,
    );
    return { onChoose, onConfirm, onClose };
  };

  it("says what happened and asks the one question that is left", () => {
    open();
    expect(screen.getByText(/goalkeeper has been sent off/i)).toBeInTheDocument();
    expect(screen.getByText(/Pick an outfielder to take the gloves/i)).toBeInTheDocument();
  });

  it("⛔ REPLACES the substitution flow — there is no change to make", () => {
    // Showing "Coming off"/"Going on" here would offer a swap the engine has already
    // established is impossible, and a coach who tried it would get nothing.
    open();
    expect(screen.queryByText("Coming off")).not.toBeInTheDocument();
    expect(screen.queryByText("Going on")).not.toBeInTheDocument();
  });

  it("keeps the confirm dead until somebody is chosen", async () => {
    open();
    const confirm = screen.getByRole("button", { name: "Send him in goal" });
    expect(confirm).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(candidates[0]!.name) }));
    expect(confirm).toBeEnabled();
  });

  it("hands back the chosen player, and never the substitution callback", async () => {
    const { onChoose, onConfirm } = open();
    await userEvent.click(screen.getByRole("button", { name: new RegExp(candidates[1]!.name) }));
    await userEvent.click(screen.getByRole("button", { name: "Send him in goal" }));
    expect(onChoose).toHaveBeenCalledWith(candidates[1]!.playerId);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("MatchLive — the emergency keeper decision", () => {
  it("names the question on the Bench button instead of the usual label", () => {
    live(vi.fn());
    expect(screen.getByRole("button", { name: "Who goes in goal?" })).toBeInTheDocument();
  });

  it("⛔ does NOT answer it away — this is the one decision he cannot miss silently", () => {
    /**
     * An ordinary sub-offer with nothing available is answered AT ONCE, because one is
     * raised every minute of the window and a 20-second wait on each would stall the match
     * for minutes of real time. A dismissal that needs a keeper must take the OTHER branch:
     * amber, and the coach gets the full window.
     */
    const onAnswer = vi.fn();
    live(onAnswer);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("opens the dialog on the FIRST press — an emergency is never a request", async () => {
    // An ordinary Bench press only ASKS, and waits for a stoppage. There is nothing to wait
    // for here: play has already stopped for the red card.
    live(vi.fn());
    await userEvent.click(screen.getByRole("button", { name: "Who goes in goal?" }));
    expect(screen.getByRole("dialog", { name: "The bench" })).toBeInTheDocument();
  });

  it("⛔ answers with `inGoal` ALONE — never alongside a substitution", async () => {
    /**
     * The share-code grammar gives `inGoal` its own token head precisely so that a stream
     * cannot both substitute and reassign; `encodeTokens` THROWS on an answer carrying
     * both, and `buildShareCode` runs during render on the full-time screen — so a stray
     * `off`/`on` here would not be a wrong answer, it would take the whole page down.
     */
    const onAnswer = vi.fn();
    const onCoachMove = vi.fn();
    live(onAnswer, onCoachMove);
    await userEvent.click(screen.getByRole("button", { name: "Who goes in goal?" }));
    const dialog = screen.getByRole("dialog", { name: "The bench" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: new RegExp(candidates[0]!.name) }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Send him in goal" }));

    expect(onAnswer).toHaveBeenCalledTimes(1);
    const answer = onAnswer.mock.calls[0]![0] as DecisionAnswer;
    expect(answer).toEqual({
      kind: "dismissal",
      minute: 61,
      side: "home",
      inGoal: candidates[0]!.playerId,
    });
    expect(answer).not.toHaveProperty("off");
    expect(answer).not.toHaveProperty("on");
  });

  it("records it as the COACH's move, not the engine's", async () => {
    // The full-time screen lists only what he chose himself, and putting an outfielder in
    // goal is the most deliberate decision in the match.
    const onCoachMove = vi.fn();
    live(vi.fn(), onCoachMove);
    await userEvent.click(screen.getByRole("button", { name: "Who goes in goal?" }));
    const dialog = screen.getByRole("dialog", { name: "The bench" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: new RegExp(candidates[0]!.name) }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Send him in goal" }));
    expect(onCoachMove).toHaveBeenCalledTimes(1);
  });

  it("⚠️ THE CONTROL — a dismissal with substitutions left is NOT an emergency", () => {
    /**
     * Without this the suite would pass over a `emergencyKeeperOf` that returned every
     * dismissal: the button would read "Who goes in goal?" for a routine red card and the
     * coach would be offered the gloves while a fit substitute sat on the bench.
     */
    const onAnswer = vi.fn();
    renderWithIntl(
      <MatchLive
        model={model}
        teams={{ home, away }}
        holdAt={61}
        pending={dismissal({ emergencyKeepers: [], legalOn: away.players.slice(0, 2) })}
        captaincies={{}}
        referees={[]}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.queryByRole("button", { name: "Who goes in goal?" })).not.toBeInTheDocument();
  });
});
