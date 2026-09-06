import { classicLineup } from "@/features/game/domain/classic-lineup";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlayerRole } from "@/data/schemas";
import { describe, expect, it, vi } from "vitest";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/storage/season-slot", () => ({
  saveRun: vi.fn(async () => {}),
  loadRun: vi.fn(async () => null),
  clearRun: vi.fn(async () => {}),
}));

const { SeasonHub } = await import("@/features/game/components/SeasonHub");

const ROLES: PlayerRole[] = [
  "GK",
  "GK",
  "RB",
  "CB",
  "CB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "CF",
  "CF",
  "CF",
];

const poolFor = (clubId: number): PoolCard[] =>
  ROLES.map((role, i) => ({
    cardId: `${clubId * 100 + i}@2020`,
    playerId: clubId * 100 + i,
    season: 2020,
    name: `C${clubId} Player${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    club: `Club ${clubId}`,
    teamId: clubId,
    ratings: {
      attack: 50 + ((clubId + i) % 9),
      creation: 50,
      defense: 50 + ((clubId + i) % 6),
      physical: 50,
      discipline: 50,
      overall: 60 + ((clubId * 3 + i) % 30),
    },
  }));

const IDS = Array.from({ length: 20 }, (_, i) => i + 1);
const props = () => ({
  coachId: 1,
  coachName: "Club 1",
  seed: 4242,
  pools: Object.fromEntries(IDS.map((id) => [id, poolFor(id)])),
  clubNames: Object.fromEntries(IDS.map((id) => [id, `Club ${id}`])),
  leagueIds: IDS,
  squad: classicLineup(poolFor(1), formationByName("4-4-2 Flat"))! as PoolCard[],
  formation: formationByName("4-4-2 Flat"),
});

const render = async () => {
  renderWithIntl(<SeasonHub {...props()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /sim week/i })).toBeEnabled());
};

describe("SeasonHub", async () => {
  it("renders the table, the next fixture, the form and the squad", async () => {
    await render();
    expect(screen.getAllByTestId("season-row")).toHaveLength(20);
    expect(screen.getByTestId("season-next")).toBeInTheDocument();
    expect(screen.getByTestId("season-squad")).toBeInTheDocument();
    expect(screen.getByTestId("season-week")).toHaveTextContent(/0.*38/);
  });

  it("⛔ the header carries BOTH crests — the owner's hybrid, 12 + 6", async () => {
    await render();
    expect(screen.getByTestId("season-watermark")).toBeInTheDocument();
    expect(screen.getByTestId("season-crest")).toBeInTheDocument();
  });

  it("puts a crest on every table row and on the next fixture", async () => {
    await render();
    expect(screen.getAllByTestId("season-row-crest")).toHaveLength(20);
    expect(screen.getByTestId("season-next-crest")).toBeInTheDocument();
  });

  it("⭐ simming a week advances the clock and fills the table", async () => {
    await render();
    expect(screen.getByTestId("season-week")).toHaveTextContent(/0.*38/);
    await userEvent.click(screen.getByRole("button", { name: /sim week/i }));
    expect(screen.getByTestId("season-week")).toHaveTextContent(/1.*38/);
    // Ten fixtures a week, so every club has played once.
    const played = screen.getAllByTestId("season-row").map((r) => Number(r.dataset.played));
    expect(played.every((p) => p === 1)).toBe(true);
  });

  it("⚠️ every row carries data-was — what makes the FLIP travel the REAL distance", async () => {
    await render();
    await userEvent.click(screen.getByRole("button", { name: /sim week/i }));
    for (const row of screen.getAllByTestId("season-row")) {
      expect(row.dataset.was).toMatch(/^\d+$/);
      expect(row.dataset.club).toMatch(/^\d+$/);
    }
  });

  it("⛔ the table stays a valid league — points and goals are conserved", async () => {
    await render();
    await userEvent.click(screen.getByRole("button", { name: /sim 5/i }));
    const rows = screen.getAllByTestId("season-row");
    const pts = rows.reduce((a, r) => a + Number(r.dataset.points), 0);
    const gf = rows.reduce((a, r) => a + Number(r.dataset.gf), 0);
    const ga = rows.reduce((a, r) => a + Number(r.dataset.ga), 0);
    const played = rows.reduce((sum, r) => sum + Number(r.dataset.played), 0) / 2;
    expect(played).toBeGreaterThan(0);
    expect(played).toBeLessThanOrEqual(50);
    // 3 per decisive match, 2 per draw — so the total sits between the two.
    expect(pts).toBeGreaterThanOrEqual(played * 2);
    expect(pts).toBeLessThanOrEqual(played * 3);
    expect(gf).toBe(ga);
  });

  it("runs to the end of the season and stops there", async () => {
    await render();
    for (
      let i = 0;
      i < 38 && !screen.getByTestId("season-next").textContent?.includes("complete");
      i++
    ) {
      const action =
        screen.queryByRole("button", { name: /Forfeit fixture/i }) ??
        screen.getByRole("button", { name: /to the end/i });
      await waitFor(() => expect(action).toBeEnabled());
      await userEvent.click(action);
    }
    expect(screen.getByTestId("season-week")).toHaveTextContent(/38.*38/);
    const rows = screen.getAllByTestId("season-row");
    for (const r of rows) expect(Number(r.dataset.played)).toBe(38);
    expect(screen.getByTestId("season-next")).toHaveTextContent(/complete/i);
  });
});
