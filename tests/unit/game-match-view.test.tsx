import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MatchViewModel } from "@/features/game/view/match-view-model";
import { renderWithIntl } from "./_helpers/intl";

// Reduced-motion → the view renders the settled full-time frame with no autoplay/timers.
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { MatchView } = await import("@/features/game/components/MatchView");

const player = {
  playerId: 1,
  row: 1,
  col: 1,
  role: "CF" as const,
  name: "Thierry Henry",
  number: 9,
  rating: 92,
};
const model: MatchViewModel = {
  home: { name: "Arsenal", abbr: "ARS", players: [player], bench: [] },
  away: { name: "United", abbr: "MUN", players: [{ ...player, playerId: 2 }], bench: [] },
  homePower: { attack: 60, defense: 55, aggression: 40 },
  awayPower: { attack: 50, defense: 50, aggression: 40 },
  events: [
    { minute: 0, kind: "kickoff", commentary: { key: "commentary.kickoff", values: {} } },
    {
      minute: 90,
      kind: "fulltime",
      commentary: { key: "commentary.fulltime", values: { homeScore: 1, awayScore: 0 } },
    },
  ],
  finalScore: { home: 1, away: 0 },
  seed: 1,
  lastMinute: 90,
};

/** A match with a goal at 60', so a hold at 30' has something to keep hidden. */
const liveModel: MatchViewModel = {
  ...model,
  events: [
    { minute: 0, kind: "kickoff", commentary: { key: "commentary.kickoff", values: {} } },
    {
      minute: 60,
      kind: "goal",
      side: "home",
      playerId: 1,
      scorerSlot: 0,
      commentary: { key: "commentary.goal", values: {} },
    },
  ],
  finalScore: { home: 1, away: 0 },
  lastMinute: 60,
};

describe("MatchView", () => {
  it("renders the scoreboard, pitch and commentary", () => {
    renderWithIntl(<MatchView model={model} />);
    expect(screen.getByRole("group", { name: /Live scoreboard/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Match pitch/i })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("⚠️ never renders past a pending decision", () => {
    // During a live match the model is PARTIAL and its snapshot can legitimately run
    // ahead of the clock — the engine pushes a VAR verdict a minute before it is due.
    // The CURSOR is what protects the drama, so a hold at 30' must keep a 60' goal off
    // the scoreboard entirely.
    renderWithIntl(<MatchView model={liveModel} holdAt={30} />);
    const board = screen.getByRole("group", { name: /Live scoreboard/i });
    // The scoreboard renders as ABBR + home + away + ABBR, unseparated.
    expect(board.textContent).toContain("ARS00MUN");
  });

  it("⚠️ reduced motion FOLLOWS a ceiling that moves — it does not freeze at the first hold", () => {
    /**
     * `minute` is seeded from the ceiling ONCE and the clock effect returns early when
     * `reduced`, so without an effect tracking the ceiling this view sticks at whatever
     * minute the first decision landed on: no later goal, card or substitution ever
     * appears and the roster stays on the starting eleven.
     *
     * Found on `MatchLive`, where the identical defect failed that suite on 5 of 10 runs.
     * `MatchView` is the shipped screen for /game/draft, /game/chaos and /game/daily.
     */
    const board = () => screen.getByRole("group", { name: /Live scoreboard/i });
    const { rerender } = renderWithIntl(<MatchView model={liveModel} holdAt={30} />);
    expect(board().textContent).toContain("ARS00MUN");

    // The next segment arrives and releases the hold — the goal at 60' must now show.
    rerender(<MatchView model={liveModel} />);
    expect(board().textContent).toContain("ARS10MUN");
  });

  it("renders the whole match when nothing is held", () => {
    // The same model without a hold reaches full time and counts the goal, so the test
    // above is about the hold and not about the fixture.
    renderWithIntl(<MatchView model={liveModel} />);
    expect(screen.getByRole("group", { name: /Live scoreboard/i }).textContent).toContain(
      "ARS10MUN",
    );
  });
});
