import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PostMatchReport } from "@/features/game/components/PostMatchReport";
import type { MatchEvent, MatchResult } from "@/features/game/domain/match-types";
import type { GamePlayer } from "@/features/game/domain/player";
import { makeGameTeam } from "@/features/game/domain/team";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1815 — the "Vinyl Sleeve" report (owner's pick, concept #23): the match wrapped
 * around a record, one spoke per shot. `renderWithIntl(ui, locale)` always supplies the
 * English catalog — the Arabic DIGITS come from the component's own `locale` prop through
 * `localizeDigits`, which is what the Arabic test pins.
 */
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
const HOME = makeGameTeam(1, "Rovers", 2020, shape, [p(1, "Smith")]);
const AWAY = makeGameTeam(2, "United", 2020, shape, [p(11, "Brown")]);
const result = (events: Partial<MatchEvent>[], score = { home: 1, away: 0 }): MatchResult => ({
  seed: 7,
  score,
  events: [
    { minute: 0, kind: "kickoff" },
    ...events,
    { minute: 92, kind: "fulltime" },
  ] as MatchEvent[],
});

describe("PostMatchReport", () => {
  it("renders the headline, standfirst, score and an LTR wheel with one spoke per shot", () => {
    renderWithIntl(
      <PostMatchReport
        result={result([
          {
            minute: 30,
            kind: "goal",
            side: "home",
            playerId: 1,
            source: "open",
            goalStyle: "header",
          },
          { minute: 60, kind: "chance", side: "away", outcome: "saved" },
        ])}
        home={HOME}
        away={AWAY}
        coachSide="home"
        locale="en"
      />,
    );
    expect(screen.getByTestId("report-headline").textContent).not.toBe("");
    expect(screen.getByTestId("report-standfirst")).toHaveTextContent("Smith");
    expect(screen.getByTestId("report-standfirst")).toHaveTextContent("xG 0.2–0.1");
    expect(screen.getByTestId("report-xg-chart")).toHaveAttribute("dir", "ltr");
    expect(screen.getByTestId("report-xg-chart")).toHaveTextContent("1–0");
    expect(screen.getAllByTestId("report-shot")).toHaveLength(2);
  });

  it("names the coach's side: an AWAY coach's win reads as his win", () => {
    renderWithIntl(
      <PostMatchReport
        result={result([{ minute: 30, kind: "goal", side: "away", playerId: 11, source: "open" }], {
          home: 0,
          away: 1,
        })}
        home={HOME}
        away={AWAY}
        coachSide="away"
        locale="en"
      />,
    );
    expect(screen.getByTestId("post-match-report")).toHaveAttribute("data-arc", "win");
  });

  it("⛔ Arabic: Eastern-Arabic digits in the standfirst and the wheel, chart still LTR", () => {
    renderWithIntl(
      <PostMatchReport
        result={result([{ minute: 30, kind: "chance", side: "home", outcome: "post" }], {
          home: 0,
          away: 0,
        })}
        home={HOME}
        away={AWAY}
        coachSide="home"
        locale="ar"
      />,
      "ar",
    );
    expect(screen.getByTestId("report-standfirst").textContent).toMatch(/[٠-٩]/);
    expect(screen.getByTestId("report-standfirst").textContent).not.toMatch(/[0-9]/);
    expect(screen.getByTestId("report-xg-chart").textContent).not.toMatch(/[0-9]/);
    expect(screen.getByTestId("report-xg-chart")).toHaveAttribute("dir", "ltr");
  });

  it("a shotless 0–0 draws the wheel with no spokes and no NaN", () => {
    const { container } = renderWithIntl(
      <PostMatchReport
        result={result([], { home: 0, away: 0 })}
        home={HOME}
        away={AWAY}
        coachSide="home"
        locale="en"
      />,
    );
    expect(container.innerHTML).not.toContain("NaN");
    expect(screen.queryAllByTestId("report-shot")).toHaveLength(0);
  });
});
