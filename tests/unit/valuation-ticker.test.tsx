import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SquadValuation } from "@/features/game/components/SquadValuation";
import { type ValueLine, valueSeries } from "@/features/game/domain/market-value";
import { renderWithIntl } from "./_helpers/intl";

/** TASK-1826 polish — the owner's V1 Stock Ticker: price, badge, steppable chart, ▲▼ movers. */
const card = (cardId: string, name: string, overall: number) => ({
  cardId: cardId as `${number}@${number}`,
  name,
  role: "ST" as never,
  ratings: { attack: 50, creation: 50, defense: 50, physical: 50, discipline: 50, overall },
});
const cards = [card("1@2010", "Striker", 80), card("2@2010", "Bencher", 80)];
const line = (week: number, result: ValueLine["result"], goals: string[]): ValueLine => ({
  week,
  on: ["1@2010"],
  goals,
  assists: [],
  conceded: 1,
  result,
});
const lines = [line(1, "w", ["1@2010", "1@2010"]), line(2, "l", [])];

describe("SquadValuation — Stock Ticker", () => {
  it("shows the latest price, one bar per point, and ▲▼ gainers and losers", () => {
    renderWithIntl(<SquadValuation cards={cards} lines={lines} />);
    const series = valueSeries(cards, lines);
    const latest = series.get("1@2010")![2]! + series.get("2@2010")![2]!;
    expect(screen.getByTestId("sv-total")).toHaveTextContent(`£${(latest / 10).toFixed(1)}m`);
    expect(screen.getAllByTestId("vt-bar")).toHaveLength(3);
    expect(screen.getByTestId("vt-at")).toHaveTextContent("After match 2 · Defeat");
    expect(screen.getByTestId("sv-riser")).toHaveTextContent("Striker▲ +£");
    expect(screen.getByTestId("sv-faller")).toHaveTextContent("Bencher▼ −£");
    expect(screen.getByTestId("squad-valuation")).toHaveTextContent(/not a real transfer fee/);
  });

  it("tapping a bar steps the price back through the run, and the start shows no movers", async () => {
    renderWithIntl(<SquadValuation cards={cards} lines={lines} />);
    const bars = screen.getAllByTestId("vt-bar");
    await userEvent.click(bars[0]!);
    expect(bars[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("vt-at")).toHaveTextContent("Run start");
    const series = valueSeries(cards, lines);
    const start = series.get("1@2010")![0]! + series.get("2@2010")![0]!;
    expect(screen.getByTestId("sv-total")).toHaveTextContent(`£${(start / 10).toFixed(1)}m`);
    expect(screen.queryByTestId("sv-riser")).toBeNull();
    await userEvent.click(bars[1]!);
    expect(screen.getByTestId("vt-at")).toHaveTextContent("After match 1 · Win");
    await userEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByTestId("vt-at")).toHaveTextContent("After match 2");
  });

  it("follows a new result without a tap", () => {
    const { rerender } = renderWithIntl(<SquadValuation cards={cards} lines={lines.slice(0, 1)} />);
    expect(screen.getByTestId("vt-at")).toHaveTextContent("After match 1");
    rerender(<SquadValuation cards={cards} lines={lines} />);
    expect(screen.getByTestId("vt-at")).toHaveTextContent("After match 2");
  });

  it("with no matches yet it says how values move, and draws no chart", () => {
    renderWithIntl(<SquadValuation cards={cards} lines={[]} />);
    expect(screen.queryAllByTestId("vt-bar")).toHaveLength(0);
    expect(screen.getByTestId("squad-valuation")).toHaveTextContent(/Values move with every match/);
  });
});
