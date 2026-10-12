import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MatchSummary } from "@/features/game/components/MatchSummary";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";
import { renderWithIntl } from "./_helpers/intl";

/** TASK-1815 — every full-time screen built on `MatchSummary` carries the report. */
const p = (id: number, name: string) =>
  ({
    cardId: `${id}@2020`,
    playerId: id,
    season: 2020,
    name,
    role: "CF",
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall: 50 },
  }) as unknown as GamePlayer;
const shape = { name: "", season: 2020, slots: [] };
const home = makeGameTeam(1, "Your XI", 2020, shape, [p(1, "Smith")]);
const away = makeGameTeam(2, "Rivals", 2020, shape, [p(11, "Brown")]);
const result: MatchResult = {
  seed: 42,
  score: { home: 1, away: 0 },
  events: [
    { minute: 0, kind: "kickoff" },
    { minute: 30, kind: "goal", side: "home", playerId: 1, source: "open", goalStyle: "header" },
    { minute: 92, kind: "fulltime" },
  ] as MatchEvent[],
};
const base = {
  homeName: "Your XI",
  awayName: "Rivals",
  score: { home: 1, away: 0 },
  decisions: [],
  seed: 42,
  shareCode: null,
  cardData: null,
  locale: "en",
  onNewMatch: vi.fn(),
};

describe("MatchSummary — post-match report", () => {
  it("renders the report when the match is handed over", () => {
    renderWithIntl(<MatchSummary {...base} report={{ result, home, away, coachSide: "home" }} />);
    expect(screen.getByTestId("post-match-report")).toBeInTheDocument();
    expect(screen.getByTestId("report-standfirst")).toHaveTextContent("Smith");
  });

  it("renders nothing extra without one", () => {
    renderWithIntl(<MatchSummary {...base} />);
    expect(screen.queryByTestId("post-match-report")).toBeNull();
  });
});
