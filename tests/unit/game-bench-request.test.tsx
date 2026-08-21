import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MatchDecision, SubOfferDecision } from "@/features/game/domain/match-decisions";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { renderWithIntl } from "./_helpers/intl";
import { makeTeam } from "./_helpers/match-setup";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { MatchLive } = await import("@/features/game/components/MatchLive");

/**
 * TASK-1810 — `view/coach-policy.ts`, wired into the bench at last.
 *
 * ⚠️ Driven through `MatchLive` DIRECTLY, with the pending decision controlled.
 *
 * The obvious version of this test — drive a real draft through `GamePlay` and click Bench
 * — is VACUOUS: measured, the button already reads "Change available" at that point, so
 * the branch under test is never reached. A test that skips itself proves nothing.
 */
const home = makeTeam({ name: "Liverpool" });
const away = makeTeam({ name: "Rivals" });
const model = buildMatchViewModel(home, away, {
  score: { home: 0, away: 0 },
  events: [],
  seed: 7,
});

const offer = (minute: number, stoppage: boolean): SubOfferDecision => ({
  kind: "sub-offer",
  minute,
  side: "home",
  events: [],
  stoppage,
  // ⛔ FALSE — the engine is NOT suggesting anything, so the button is not amber and the
  // request path is the one exercised.
  engineSuggests: false,
  legalOff: [...home.players].slice(1),
  legalOn: [...away.players].slice(1),
});

const render = (pending: MatchDecision | null) =>
  renderWithIntl(
    <MatchLive
      model={model}
      teams={{ home, away }}
      holdAt={pending?.minute ?? 0}
      pending={pending}
      captaincies={{}}
      referees={["M Oliver"]}
      onAnswer={vi.fn()}
    />,
  );

describe("the bench request", () => {
  it("⭐ asking does NOT open a dialog — it waits for a break in play", () => {
    const { container } = render(offer(60, false));
    const bench = screen.getByRole("button", { name: /^Bench$/ });
    expect(bench).toBeEnabled();
    void container;
  });

  it("⭐ once asked, the button says so and goes inert", async () => {
    const user = userEvent.setup();
    render(offer(60, false));

    await user.click(screen.getByRole("button", { name: /^Bench$/ }));

    // Play has not stopped, so nothing opens.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const waiting = screen.getByRole("button", { name: /Waiting for a break in play/ });
    expect(waiting).toBeDisabled();
  });

  it("⭐ the dialog opens itself at the next STOPPAGE", async () => {
    const user = userEvent.setup();
    const { rerender } = render(offer(60, false));
    await user.click(screen.getByRole("button", { name: /^Bench$/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The next minute brings a stoppage — the request is honoured.
    rerender(
      <MatchLive
        model={model}
        teams={{ home, away }}
        holdAt={62}
        pending={offer(62, true)}
        captaincies={{}}
        referees={["M Oliver"]}
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: /bench/i })).toBeInTheDocument();
  });

  it("⛔ nothing opens when he never asked", () => {
    // The whole rule of the redesign: no panel appears uninvited.
    render(offer(62, true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * The dialog's own rules, opened DETERMINISTICALLY through the request path.
 *
 * ⚠️ These used to live in `game-match-live`, driving a real draft. `GamePlay` draws a
 * random seed, so whether a change was already on offer — and therefore whether one click
 * opened the dialog at all — varied run to run. Wiring the request path turned that into a
 * genuine flake, so the assertions moved here where the pending decision is controlled.
 */
describe("the bench dialog, once open", () => {
  const openIt = async (user: ReturnType<typeof userEvent.setup>) => {
    const { rerender } = render(offer(60, false));
    await user.click(screen.getByRole("button", { name: /^Bench$/ }));
    rerender(
      <MatchLive
        model={model}
        teams={{ home, away }}
        holdAt={62}
        pending={offer(62, true)}
        captaincies={{}}
        referees={["M Oliver"]}
        onAnswer={vi.fn()}
      />,
    );
    return screen.getByRole("dialog", { name: /bench/i });
  };

  it("keeps Confirm dead until BOTH ends are chosen", async () => {
    const user = userEvent.setup();
    const dialog = await openIt(user);
    expect(within(dialog).getByRole("button", { name: /Make the change/ })).toBeDisabled();
  });

  it("closes on Close, on Not now, and on Escape", async () => {
    const user = userEvent.setup();
    const dialog = await openIt(user);

    await user.click(within(dialog).getByRole("button", { name: /^Close$/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/**
 * ⛔ OWNER-REPORTED, 2026-08-20 — the worst bug of the round.
 *
 * He pressed Bench, the button read "Waiting for a break in play", and it never opened:
 * through two goals, and then past the final whistle, still reading "waiting". The Bench
 * button is `disabled` while a request stands, so he was locked out of his own bench for
 * the rest of the match.
 *
 * The cause is structural. The engine raises a `sub-offer` ONLY between 55' and 85', and
 * `shouldOpenPrompt` is only ever consulted against one — so a request made after 85', or
 * any request still standing at full time, could never be answered by anything.
 */
const liveAt = (pending: MatchDecision | null, holdAt: number | undefined) => (
  <MatchLive
    model={model}
    teams={{ home, away }}
    holdAt={holdAt}
    pending={pending}
    captaincies={{}}
    referees={["M Oliver"]}
    onAnswer={vi.fn()}
  />
);

describe("a bench request nothing can honour", () => {
  it("⛔ recovers when the offers stop coming", async () => {
    const user = userEvent.setup();
    const { rerender } = render(offer(60, false));
    await user.click(screen.getByRole("button", { name: /^Bench$/ }));
    expect(screen.getByRole("button", { name: /Waiting for a break/ })).toBeDisabled();

    // No offer any more, and the clock has run past the grace. Before the fix the button
    // stayed disabled here for the rest of the match.
    rerender(liveAt(null, 66));
    expect(screen.queryByRole("button", { name: /Waiting for a break/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Bench$/ })).toBeEnabled();
  });

  it("⛔ never says 'waiting' after the whistle", async () => {
    const user = userEvent.setup();
    const { rerender } = render(offer(84, false));
    await user.click(screen.getByRole("button", { name: /^Bench$/ }));

    // `holdAt` undefined + the clock at the end = the match is actually over.
    rerender(liveAt(null, undefined));
    expect(screen.queryByRole("button", { name: /Waiting for a break/ })).not.toBeInTheDocument();
  });

  it("⚠️ says the window is SHUT rather than pretending a break is coming", () => {
    /**
     * "Waiting for a break in play" was not merely stale outside 55'–85', it was untrue:
     * nothing was coming, because the engine raises no offer at all out there. Naming the
     * real state is what stops the coach waiting for something that cannot happen.
     */
    render(null);
    const b = screen.getByRole("button", { name: /Substitutions closed/ });
    expect(b).toBeDisabled();
  });

  it("⚠️ and is pressable again once the window opens", () => {
    render(offer(60, false));
    expect(screen.getByRole("button", { name: /^Bench$/ })).toBeEnabled();
  });
});
