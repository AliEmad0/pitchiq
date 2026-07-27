import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/i18n/messages/en.json";

// `PlayerMarketValue` is an async Server Component calling `getTranslations`,
// which has no request context under vitest — the TASK-1603 helper stands in
// and returns the real English catalog strings.
vi.mock("next-intl/server", () => import("./_helpers/intl-server"));

vi.mock("@/data/loaders", () => ({
  loadMarketValueHistory: vi.fn(),
}));

import { loadMarketValueHistory } from "@/data/loaders";
import { PlayerMarketValue } from "@/features/players/components/PlayerMarketValue";

const mocked = vi.mocked(loadMarketValueHistory);

async function renderBlock(props: { playerId: number; plSeasons: number[] }) {
  const ui = await PlayerMarketValue(props);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PlayerMarketValue", () => {
  beforeEach(() => vi.resetAllMocks());

  it("renders the REAL current value in the server markup, never €0", async () => {
    mocked.mockResolvedValue({
      "7": [
        { season: 2016, valueEur: 25_000_000, determined: "2016-10-01" },
        { season: 2017, valueEur: 150_000_000, determined: "2018-05-28" },
      ],
    });
    await renderBlock({ playerId: 7, plSeasons: [2017] });
    // Twice by design: the headline, and the value printed under its own cell.
    expect(screen.getAllByText("€150m")).toHaveLength(2);
    expect(screen.queryByText("€0")).not.toBeInTheDocument();
  });

  it("omits itself entirely when the player has no market value", async () => {
    mocked.mockResolvedValue({ "7": [] });
    const { container } = await renderBlock({ playerId: 999, plSeasons: [2017] });
    expect(container).toBeEmptyDOMElement();
  });

  it("omits itself when the history file is absent", async () => {
    mocked.mockResolvedValue(null);
    const { container } = await renderBlock({ playerId: 7, plSeasons: [2017] });
    expect(container).toBeEmptyDOMElement();
  });

  it("prints a value under EVERY season, so no pointer is required", async () => {
    mocked.mockResolvedValue({
      "7": [
        { season: 2016, valueEur: 25_000_000, determined: "2016-10-01" },
        { season: 2017, valueEur: 150_000_000, determined: "2018-05-28" },
      ],
    });
    const { container } = await renderBlock({ playerId: 7, plSeasons: [2017] });
    // One printed value per season cell — this is what makes the strip legible
    // without a pointer, which is what covers mobile, print and crawlers.
    const cellValues = [...container.querySelectorAll('[class*="cellValue"]')].map(
      (el) => el.textContent,
    );
    expect(cellValues).toEqual(["€25m", "€150m"]);
  });

  it("underlines only the seasons the app holds a player row for", async () => {
    mocked.mockResolvedValue({
      "7": [
        { season: 2016, valueEur: 25_000_000, determined: "2016-10-01" },
        { season: 2017, valueEur: 150_000_000, determined: "2018-05-28" },
      ],
    });
    // 2016 is a non-PL career season (Salah at Roma) — it renders, but without
    // the Premier League underline.
    const { container } = await renderBlock({ playerId: 7, plSeasons: [2017] });
    expect(container.querySelectorAll('[class*="_pl_"]')).toHaveLength(1);
    expect(container.querySelectorAll('[class*="spacer"]')).toHaveLength(1);
  });

  it("labels the block and shows the Premier League legend", async () => {
    mocked.mockResolvedValue({
      "7": [{ season: 2017, valueEur: 150_000_000, determined: "2018-05-28" }],
    });
    await renderBlock({ playerId: 7, plSeasons: [2017] });
    expect(screen.getByText(messages.players.marketValue)).toBeInTheDocument();
    expect(screen.getByText(messages.players.mvPlLegend)).toBeInTheDocument();
  });
});
