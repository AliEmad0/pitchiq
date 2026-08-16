import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PlayerCareerRecord } from "@/features/players/components/PlayerCareerRecord";
import { rankHonours, sumKind } from "@/features/players/career-record.api";
import type {
  CareerHonourGroup,
  PlayerCareerRecord as Record_,
} from "@/features/players/career-record.api";

import { renderWithIntl } from "./_helpers/intl";

afterEach(() => {
  cleanup();
});

const group = (
  title: string,
  kind: CareerHonourGroup["kind"],
  count = 1,
  club = "Real Madrid",
): CareerHonourGroup => ({
  title,
  kind,
  count,
  entries: [{ season: "2016", club, clubId: "418" }],
});

const record = (over: Partial<Record_> = {}): Record_ => ({
  trophies: 3,
  awards: 1,
  honourGroups: [group("Champions League", "trophy", 3)],
  moves: [{ season: "18/19", date: null, fee: "€117.00m", from: "Real Madrid", to: "Juventus" }],
  feeSum: "€247.00m",
  caps: 233,
  internationalGoals: 146,
  nationalSpells: [{ matches: 233, goals: 146, debutDate: "2003-08-20" }],
  ...over,
});

describe("career-record ordering + counting", () => {
  it("counts SILVERWARE only — participation and runner-up are not trophies", () => {
    // 25,886 of 29,761 committed groups are participation; counting them would rank a
    // squad member above a league winner.
    const gs = [
      group("Premier League", "trophy", 2),
      group("Squad member", "participation", 9),
      group("Runner-up", "runner-up", 4),
      group("Player of the Year", "award", 3),
    ];

    expect(sumKind(gs, "trophy")).toBe(2);
    expect(sumKind(gs, "award")).toBe(3);
    expect(sumKind(gs, "participation")).toBe(9);
  });

  it("ranks silverware first and participation last, whatever the counts", () => {
    const ranked = rankHonours([
      group("Squad member", "participation", 30),
      group("Runner-up", "runner-up", 10),
      group("League title", "trophy", 1),
      group("Award", "award", 1),
    ]);

    expect(ranked.map((g) => g.kind)).toEqual(["trophy", "award", "runner-up", "participation"]);
  });
});

describe("<PlayerCareerRecord>", () => {
  it("renders honours, transfers and international in that order", () => {
    renderWithIntl(<PlayerCareerRecord record={record()} />);

    const heads = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(heads).toEqual(["Honours", "Transfers", "International"]);
  });

  it("renders NOTHING when the player has no record", () => {
    // Absence means "not enriched", never "has none" — 13 rows legitimately have none.
    const { container } = renderWithIntl(<PlayerCareerRecord record={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("prints fee strings verbatim — a loan is never shown as a free transfer", () => {
    // 1,321 distinct fee strings; the five commonest are non-numeric. Coercing them is
    // the bug this assertion exists to prevent.
    renderWithIntl(
      <PlayerCareerRecord
        record={record({
          moves: [
            { season: "21/22", date: null, fee: "loan transfer", from: "A", to: "B" },
            { season: "20/21", date: null, fee: "End of loan", from: "B", to: "A" },
            { season: "19/20", date: null, fee: "free transfer", from: "C", to: "A" },
            { season: "18/19", date: null, fee: "?", from: "D", to: "C" },
            { season: "17/18", date: null, fee: "-", from: "E", to: "D" },
          ],
        })}
      />,
    );

    for (const fee of ["loan transfer", "End of loan", "free transfer", "?", "-"]) {
      expect(screen.getByText(fee)).toBeInTheDocument();
    }
  });

  it("folds beyond five rows but keeps the rest in the DOM (crawlable, Ctrl-F-able)", async () => {
    const many = Array.from({ length: 12 }, (_, i) => group(`Trophy ${i}`, "trophy"));
    renderWithIntl(<PlayerCareerRecord record={record({ honourGroups: many })} />);

    // The 12th is present before any click — a tabbed or lazy variant would fail this.
    expect(screen.getByText("Trophy 11")).toBeInTheDocument();
    const disclosure = screen.getByText(/Show all 12 honours/);
    expect(disclosure).toBeInTheDocument();

    await userEvent.click(disclosure);
    expect(screen.getByText("Trophy 11")).toBeVisible();
  });

  it("does not fold when there are exactly five or fewer", () => {
    const five = Array.from({ length: 5 }, (_, i) => group(`T${i}`, "trophy"));
    renderWithIntl(<PlayerCareerRecord record={record({ honourGroups: five, moves: [] })} />);

    expect(screen.queryByText(/Show all/)).toBeNull();
  });

  it("omits a section entirely rather than showing an empty one", () => {
    renderWithIntl(
      <PlayerCareerRecord record={record({ moves: [], honourGroups: [], caps: 233 })} />,
    );

    const heads = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(heads).toEqual(["International"]);
  });

  it("shows an em dash, not 0, when international goals are unknown", () => {
    renderWithIntl(<PlayerCareerRecord record={record({ caps: 12, internationalGoals: null })} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
