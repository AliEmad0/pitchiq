import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import { buildMatchViewModel } from "@/features/game/view/match-view-model";
import { overlayFor } from "@/features/game/view/overlay-event";
import { renderWithIntl } from "./_helpers/intl";
import { makeTeam } from "./_helpers/match-setup";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => false }));

const { MatchLive } = await import("@/features/game/components/MatchLive");

/**
 * Owner, 2026-08-20: the Legacy live screen showed the feed and the pitch but never
 * announced a goal or a red card the way `/game/draft` does.
 *
 * ⚠️ The derivation moved to `view/overlay-event.ts` rather than being copied into the
 * second screen. A duplicate would have drifted the first time either screen gained a
 * kind, and the two would then silently disagree about what counts as a big moment.
 */

const home = makeTeam({ name: "H" });
const away = makeTeam({ name: "A" });

const modelFor = (events: MatchEvent[]) => {
  const result: MatchResult = { seed: 3, score: { home: 1, away: 0 }, events };
  return buildMatchViewModel(home, away, result);
};

const KICKOFF: MatchEvent = { minute: 0, kind: "kickoff" };
const GOAL: MatchEvent = {
  minute: 24,
  kind: "goal",
  side: "home",
  playerId: home.players[9]!.playerId,
  source: "open",
};
const RED: MatchEvent = {
  minute: 24,
  kind: "card",
  side: "home",
  playerId: home.players[5]!.playerId,
  card: "red",
};
const YELLOW: MatchEvent = { ...RED, card: "yellow" };

/** Early copies, so the clock reaches them without a long fake-timer run. */
const EARLY_GOAL: MatchEvent = { ...GOAL, minute: 3 };
const EARLY_RED: MatchEvent = { ...RED, minute: 3 };
/** Something later, purely so the model's `lastMinute` lets the clock run past the goal. */
const LATE_TICK: MatchEvent = { minute: 20, kind: "chance", side: "away" };

describe("overlayFor", () => {
  const teams = () => {
    const m = modelFor([KICKOFF, GOAL]);
    return { home: m.home, away: m.away };
  };
  const evt = (source: MatchEvent[], i: number) => modelFor(source).events[i]!;

  it("announces a goal, naming the scorer and his shirt", () => {
    const out = overlayFor(evt([KICKOFF, GOAL], 1), 24, teams());
    expect(out?.kind).toBe("goal");
    expect(out?.name).toBe(home.players[9]!.name);
    expect(out?.number).toBeGreaterThan(0);
  });

  it("announces a RED card", () => {
    const out = overlayFor(evt([KICKOFF, RED], 1), 24, teams());
    expect(out).toMatchObject({ kind: "card", card: "red", name: home.players[5]!.name });
  });

  it("⛔ stays silent for a YELLOW — the pitch would stop a dozen times a match", () => {
    expect(overlayFor(evt([KICKOFF, YELLOW], 1), 24, teams())).toBeUndefined();
  });

  it("⛔ is a MOMENT, not a state — it clears once the clock moves past the event", () => {
    // The caller hands in the last event it has SHOWN, which goes stale as the clock runs.
    // Without the minute check the match's last goal would sit over the pitch for the rest
    // of it.
    const goal = evt([KICKOFF, GOAL], 1);
    expect(overlayFor(goal, 24, teams())).toBeDefined();
    expect(overlayFor(goal, 25, teams())).toBeUndefined();
  });

  it("⛔ never announces minute 0 — kick-off, weather and the referee all land there", () => {
    const zero = { ...GOAL, minute: 0 };
    expect(overlayFor(modelFor([zero]).events[0]!, 0, teams())).toBeUndefined();
  });

  it("falls back to the TEAM name for a kind that carries no player", () => {
    // A VAR overturn legitimately names nobody; a banner with a blank line reads broken.
    const varEvent: MatchEvent = {
      minute: 30,
      kind: "var",
      side: "away",
      varOutcome: "goal-disallowed-offside",
    };
    const out = overlayFor(modelFor([KICKOFF, varEvent]).events[1]!, 30, teams());
    expect(out?.kind).toBe("var");
    expect(out?.name).toBe(away.name);
  });
});

describe("MatchLive — the big-moment banner", () => {
  const live = (events: MatchEvent[]) =>
    renderWithIntl(
      <MatchLive
        model={modelFor(events)}
        teams={{ home, away }}
        pending={null}
        captaincies={{}}
        referees={[]}
        onAnswer={vi.fn()}
      />,
    );

  /**
   * Run the screen's own clock forward and STOP on the target minute.
   *
   * ⛔ Not a single generous advance. The banner is a moment: it is on screen only while
   * the clock reads the event's own minute, so overshooting asserts against a pitch the
   * banner has already left — which is exactly how the first version of these three tests
   * failed against a working implementation.
   *
   * ⚠️ Advanced inside `act`. React 19 will not flush state produced by a fake timer
   * outside it, so an unwrapped advance asserts against the un-updated DOM and would pass
   * over anything at all. A slice is a little over one tick (280ms); an important minute
   * dwells 1500ms, so several slices can pass without the clock moving.
   */
  const runTo = async (minute: number) => {
    for (let i = 0; i < 400; i++) {
      const now = Number.parseInt(screen.getByTestId("live-clock").textContent ?? "0", 10);
      if (now >= minute) return;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
    }
    throw new Error(`clock never reached ${minute}'`);
  };

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("nothing is announced at kick-off — the clock has reached no event yet", () => {
    live([KICKOFF, EARLY_GOAL]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("⭐ announces the GOAL when the clock reaches it, naming the scorer", async () => {
    live([KICKOFF, EARLY_GOAL]);
    await runTo(3);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("GOAL");
    expect(banner).toHaveTextContent(home.players[9]!.name);
  });

  it("⭐ announces a RED CARD the same way", async () => {
    live([KICKOFF, EARLY_RED]);
    await runTo(3);
    expect(screen.getByRole("status")).toHaveTextContent("RED CARD");
  });

  it("⛔ clears once the clock moves past it — a banner is a moment, not a state", async () => {
    live([KICKOFF, EARLY_GOAL, LATE_TICK]);
    await runTo(3);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await runTo(6);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("⛔ anchors the banner to the PITCH — the pane is a positioning context", () => {
    /**
     * `EventOverlay` is `absolute inset-0`. Without `position: relative` on the pitch pane
     * it escapes to the nearest positioned ancestor and covers the whole page — and a
     * component test cannot see that, because happy-dom does not do layout. So the class is
     * asserted here and the rule that gives it meaning lives in `globals.css`.
     */
    const { container } = live([KICKOFF, EARLY_GOAL]);
    expect(container.querySelector(".lg-split-pitch")).not.toBeNull();
  });
});
