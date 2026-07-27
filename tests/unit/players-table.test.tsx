import { afterEach, describe, it, expect } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

import {
  PlayersTable,
  filterPlayerRows,
  sortPlayerRows,
  paginate,
} from "../../src/features/players/components/PlayersTable";
import type { PlayerIndexRow } from "../../src/features/players/players-index.api";

import { renderWithIntl } from "./_helpers/intl";

const row = (o: Partial<PlayerIndexRow> & { id: number; name: string }): PlayerIndexRow => ({
  photo: String(o.id),
  position: "Forward",
  nationality: "Egypt",
  nationalityCode: "eg",
  teamId: 40,
  teamName: "Liverpool",
  teamLogo: "/logos/40.png",
  teamColor: "#C8102E",
  appearances: 38,
  goals: 0,
  assists: 0,
  contributions: 0,
  marketValueEur: null,
  ...o,
});

const ROWS = [
  row({ id: 1, name: "Mo Salah", goals: 20, assists: 10, contributions: 30 }),
  row({
    id: 2,
    name: "Bruno",
    teamId: 33,
    teamName: "Man Utd",
    position: "Midfielder",
    nationality: "Portugal",
    nationalityCode: "pt",
    goals: 8,
    assists: 8,
    contributions: 16,
  }),
];

describe("filterPlayerRows", () => {
  it("filters by name, position, club, nationality (combinable)", () => {
    expect(filterPlayerRows(ROWS, { q: "salah" }).map((r) => r.id)).toEqual([1]);
    expect(filterPlayerRows(ROWS, { pos: "Midfielder" }).map((r) => r.id)).toEqual([2]);
    expect(filterPlayerRows(ROWS, { club: "33" }).map((r) => r.id)).toEqual([2]);
    expect(filterPlayerRows(ROWS, { nat: "eg" }).map((r) => r.id)).toEqual([1]);
    expect(filterPlayerRows(ROWS, {})).toHaveLength(2);
  });
});

describe("sortPlayerRows", () => {
  it("sorts by goals / name / contributions", () => {
    expect(sortPlayerRows(ROWS, "goals").map((r) => r.id)).toEqual([1, 2]);
    expect(sortPlayerRows(ROWS, "name").map((r) => r.id)).toEqual([2, 1]); // Bruno < Mo Salah
    expect(sortPlayerRows(ROWS, "contributions").map((r) => r.id)).toEqual([1, 2]);
  });

  it("sorts by market value and sinks unvalued players (TASK-M68)", () => {
    const rows = [
      row({ id: 1, name: "Unvalued", marketValueEur: null }),
      row({ id: 2, name: "Cheap", marketValueEur: 1_000_000 }),
      row({ id: 3, name: "Pricey", marketValueEur: 90_000_000 }),
    ];
    // An unvalued player is UNKNOWN, not worthless — no Transfermarkt match must
    // never be allowed to outrank a real valuation.
    expect(sortPlayerRows(rows, "marketValue").map((r) => r.name)).toEqual([
      "Pricey",
      "Cheap",
      "Unvalued",
    ]);
  });

  it("keeps unvalued players last even when they lead the input (TASK-M68)", () => {
    const rows = [
      row({ id: 1, name: "AAA Unvalued", marketValueEur: null }),
      row({ id: 2, name: "ZZZ Valued", marketValueEur: 500_000 }),
    ];
    expect(sortPlayerRows(rows, "marketValue").map((r) => r.id)).toEqual([2, 1]);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 130 }, (_, i) => i + 1);
  it("slices a page and reports current/totalPages", () => {
    const p1 = paginate(items, 1, 50);
    expect(p1.rows).toHaveLength(50);
    expect(p1.rows[0]).toBe(1);
    expect(p1.totalPages).toBe(3);
    expect(p1.current).toBe(1);

    const p3 = paginate(items, 3, 50);
    expect(p3.rows).toHaveLength(30);
    expect(p3.rows[0]).toBe(101);
    expect(p3.current).toBe(3);
  });

  it("clamps an out-of-range page into the valid window", () => {
    expect(paginate(items, 99, 50).current).toBe(3);
    expect(paginate(items, 0, 50).current).toBe(1);
    expect(paginate([], 1, 50)).toEqual({ rows: [], current: 1, totalPages: 1 });
  });
});

describe("<PlayersTable>", () => {
  afterEach(cleanup);

  it("resets to page 1 when the season prop changes (TASK-M16)", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      row({ id: i + 1, name: `Player ${String(i + 1).padStart(2, "0")}` }),
    );
    const { rerender } = renderWithIntl(
      <NuqsTestingAdapter searchParams="?page=2">
        <PlayersTable rows={many} season={2024} />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByText(/Page 2 of/)).toBeInTheDocument();

    rerender(
      <NuqsTestingAdapter searchParams="?page=2">
        <PlayersTable rows={many} season={2023} />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
  });

  it("abbreviates positions as GK/DEF/MID/FW (M21)", () => {
    renderWithIntl(
      <NuqsTestingAdapter>
        <PlayersTable
          rows={[row({ id: 9, name: "Keeper", position: "Goalkeeper" })]}
          season={2024}
        />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByText("GK")).toBeInTheDocument();
    expect(screen.queryByText("Goa")).not.toBeInTheDocument();
  });

  it("renders a market-value column, with an em dash when unvalued (TASK-M68)", () => {
    renderWithIntl(
      <NuqsTestingAdapter>
        <PlayersTable
          rows={[
            row({ id: 1, name: "Rich", marketValueEur: 150_000_000 }),
            row({ id: 2, name: "Unvalued", marketValueEur: null }),
          ]}
          season={2024}
        />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByText("€150m")).toBeInTheDocument();
    // Table surfaces render a dash rather than omitting — only the profile
    // block omits itself entirely (spec §5).
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders a row per player with a season-carrying profile + club link", () => {
    renderWithIntl(
      <NuqsTestingAdapter>
        <PlayersTable rows={ROWS} season={2024} />
      </NuqsTestingAdapter>,
    );
    expect(screen.getByRole("link", { name: /Mo Salah/ })).toHaveAttribute(
      "href",
      "/players/1?season=2024",
    );
    expect(screen.getAllByRole("link", { name: /Liverpool/ })[0]).toHaveAttribute(
      "href",
      "/teams/40?season=2024",
    );
  });
});
