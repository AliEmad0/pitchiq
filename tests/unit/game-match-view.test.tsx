import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MatchViewModel } from "@/features/game/view/match-view-model";
import { renderWithIntl } from "./_helpers/intl";

// Reduced-motion → the view renders the settled full-time frame with no autoplay/timers.
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { MatchView } = await import("@/features/game/components/MatchView");

const model: MatchViewModel = {
  home: { name: "Arsenal", abbr: "ARS", slots: [{ row: 1, col: 1, role: "CF" }] },
  away: { name: "United", abbr: "MUN", slots: [{ row: 1, col: 1, role: "CF" }] },
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
};

describe("MatchView", () => {
  it("renders the scoreboard, pitch and commentary", () => {
    renderWithIntl(<MatchView model={model} locale="en" />);
    expect(screen.getByRole("group", { name: /Live scoreboard/i })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Match pitch/i })).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});
