import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { PlayerSeasonId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { formationByName } from "@/features/game/domain/formation";
import { seasonFixtures, type SeasonResult } from "@/features/game/domain/season";
import type { SavedRun } from "@/features/game/storage/season-slot";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: vi.fn(async () => {}),
  loadMatch: vi.fn(async () => null),
  clearMatch: vi.fn(async () => {}),
}));

/**
 * ⚠️ Hoisted so each test can decide what is in the slot. The other season suites stub this
 * module with fixed no-ops; resume is the one behaviour that needs to drive it.
 */
const slot = vi.hoisted(() => ({
  saveRun: vi.fn(),
  loadRun: vi.fn(),
  clearRun: vi.fn(),
}));
vi.mock("@/features/game/storage/season-slot", () => slot);

vi.mock("@/features/game/view/rival-choice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/game/view/rival-choice")>();
  return {
    ...actual,
    loadRival: vi.fn(async (teamId: number | string) => ({
      teamId: Number(teamId),
      name: `Club ${teamId}`,
      cards: poolFor(Number(teamId)),
    })),
  };
});

const { SeasonHub } = await import("@/features/game/components/SeasonHub");
const { GamePlay } = await import("@/features/game/components/GamePlay");

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

/** Hoisted for the module mock above, exactly as `season-entry.test.tsx` does it. */
function poolFor(clubId: number): PoolCard[] {
  return ROLES.map((role, i) => ({
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
}

const IDS = Array.from({ length: 20 }, (_, i) => i + 1);
const FORMATION = formationByName("4-4-2 Flat");
const SEED = 4242;

const hubProps = (onAbandon?: () => void) => ({
  coachId: 1,
  coachName: "Club 1",
  seed: SEED,
  pools: Object.fromEntries(IDS.map((id) => [id, poolFor(id)])),
  clubNames: Object.fromEntries(IDS.map((id) => [id, `Club ${id}`])),
  leagueIds: IDS,
  squad: poolFor(1).slice(0, 11),
  formation: FORMATION,
  onAbandon,
});

/** Whole matchweeks of plausible results, so a resumed run has a real table behind it. */
const weeksOf = (clubs: number, weeks: number): SeasonResult[] =>
  seasonFixtures(clubs)
    .slice(0, weeks)
    .flatMap((wk, w) =>
      wk.map(([home, away], i) => ({
        week: w,
        home,
        away,
        homeGoals: (home + i) % 3,
        awayGoals: (away + i) % 2,
        seed: w * 100 + i,
      })),
    );

const savedRun = (over: Partial<SavedRun> = {}): SavedRun => ({
  seed: SEED,
  clubs: 20,
  coach: 0,
  results: weeksOf(20, 3),
  cardIds: poolFor(1)
    .slice(0, 11)
    .map((c) => c.cardId),
  formationKey: "4-4-2 Flat/11",
  ...over,
});

beforeEach(() => {
  slot.saveRun.mockReset().mockResolvedValue(undefined);
  slot.clearRun.mockReset().mockResolvedValue(undefined);
  slot.loadRun.mockReset().mockResolvedValue(null);
});

describe("a season is persisted as it is played (TASK-1811)", () => {
  it("⭐ simming a week writes the run, the XI and the SHAPE to the slot", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SeasonHub {...hubProps()} />);
    await waitFor(() => expect(slot.loadRun).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /sim week/i }));

    await waitFor(() => expect(slot.saveRun).toHaveBeenCalled());
    const saved = slot.saveRun.mock.calls.at(-1)![0] as SavedRun;
    expect(saved.seed).toBe(SEED);
    expect(saved.clubs).toBe(20);
    expect(saved.coach).toBe(0);
    expect(saved.results).toHaveLength(10);
    expect(saved.cardIds).toHaveLength(11);
    // ⛔ The KEY, name AND slot count. `formationByName` takes the bare name, so a record
    // written with one is a record that cannot be resumed — the bug Task 5 caught, one layer up.
    expect(saved.formationKey).toBe("4-4-2 Flat/11");
  });

  it("⛔ a fresh mount writes NOTHING — an empty run must never overwrite a real one", async () => {
    renderWithIntl(<SeasonHub {...hubProps()} />);
    await waitFor(() => expect(slot.loadRun).toHaveBeenCalled());
    expect(slot.saveRun).not.toHaveBeenCalled();
  });

  it("resumes at the week the saved run reached", async () => {
    slot.loadRun.mockResolvedValue(savedRun());
    renderWithIntl(<SeasonHub {...hubProps()} />);

    await waitFor(() => expect(screen.getByTestId("season-week")).toHaveTextContent(/3.*38/));
    for (const row of screen.getAllByTestId("season-row")) {
      expect(Number(row.dataset.played)).toBe(3);
    }
  });

  it("⛔ a run from ANOTHER league is ignored, not adopted", async () => {
    // Same shape, different seed — so its club INDICES name clubs this league never drew.
    // Adopting it would render a table that looks perfectly normal against the wrong clubs.
    slot.loadRun.mockResolvedValue(savedRun({ seed: SEED + 1 }));
    renderWithIntl(<SeasonHub {...hubProps()} />);

    await waitFor(() => expect(slot.loadRun).toHaveBeenCalled());
    expect(screen.getByTestId("season-week")).toHaveTextContent(/0.*38/);
  });

  it("⚠️ a run whose league is a different SIZE is ignored too", async () => {
    // A flaky rivals fetch shortens the league, so the same coach can meet a run he cannot
    // replay — `seasonTable` would throw on a club index outside the smaller league.
    slot.loadRun.mockResolvedValue(savedRun({ clubs: 18, results: weeksOf(18, 3) }));
    renderWithIntl(<SeasonHub {...hubProps()} />);

    await waitFor(() => expect(slot.loadRun).toHaveBeenCalled());
    expect(screen.getByTestId("season-week")).toHaveTextContent(/0.*38/);
  });

  it("abandoning takes TWO clicks, then clears the slot and leaves the season", async () => {
    const user = userEvent.setup();
    const onAbandon = vi.fn();
    slot.loadRun.mockResolvedValue(savedRun());
    renderWithIntl(<SeasonHub {...hubProps(onAbandon)} />);
    await waitFor(() => expect(screen.getByTestId("season-week")).toHaveTextContent(/3.*38/));

    // ⚠️ One click must not destroy 3 weeks of season — the button sits beside "Sim week".
    await user.click(screen.getByTestId("season-abandon"));
    expect(slot.clearRun).not.toHaveBeenCalled();
    expect(onAbandon).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("season-abandon"));
    expect(slot.clearRun).toHaveBeenCalled();
    expect(onAbandon).toHaveBeenCalled();
  });
});

const RESTORE_CLUBS = [
  { id: 40, name: "Liverpool" },
  { id: 42, name: "Arsenal" },
  { id: 33, name: "Man United" },
  { id: 50, name: "Man City" },
];

// ⚠️ SIX per role, for the same reason `season-entry.test.tsx` needs it: with `onePerPlayer`
// a thinner pool stalls the draft, and a fixture that cannot draft cannot prove a restore
// skipped the draft.
const coachPool: PoolCard[] = ROLES.flatMap((role, i) =>
  [0, 1, 2, 3, 4, 5].map((k) => ({
    cardId: `${i * 10 + k}@2020`,
    playerId: i * 10 + k,
    season: 2020,
    name: `Player ${i}${k}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    club: "Club 40",
    teamId: 40,
    ratings: {
      attack: 60,
      creation: 60,
      defense: 60,
      physical: 60,
      discipline: 60,
      overall: 60 + ((i + k) % 20),
    },
  })),
);

const at = (search: string, ui: ReactElement) =>
  renderWithIntl(<NuqsTestingAdapter searchParams={search}>{ui}</NuqsTestingAdapter>);

const seasonPage = () =>
  at(
    "?format=season",
    <GamePlay
      pool={coachPool}
      initialPhase="setup"
      clubId={40}
      clubs={RESTORE_CLUBS}
      season={{ clubs: 20, league: "clubs" }}
      draft={{ handSize: 5, roam: "free", timer: null, lockPicks: true, onePerPlayer: true }}
    />,
  );

describe("⭐ a saved season survives the reload — the point of the whole task", () => {
  it("restores the XI and goes straight to the hub, with no second draft", async () => {
    // ⛔ Four clubs, so the league is [40, …3 opponents] — `SeasonStart` trims to an EVEN
    // count, and the run below has to name the same size or it is refused as foreign.
    slot.loadRun.mockResolvedValue({
      seed: SEED,
      clubs: 4,
      coach: 0,
      results: weeksOf(4, 1),
      cardIds: coachPool.slice(0, 11).map((c) => c.cardId),
      formationKey: "4-4-2 Flat/11",
    } satisfies SavedRun);

    seasonPage();

    const hub = await screen.findByTestId("season-hub", undefined, { timeout: 10_000 });
    expect(hub).toBeInTheDocument();
    // The draft never appeared: a season is drafted once, and this one already was.
    expect(screen.queryByRole("button", { name: /^Lock in / })).toBeNull();
    expect(screen.getByTestId("season-week")).toHaveTextContent(/1.*6/);
  }, 30_000);

  it("⛔ THE CONTROL — an empty slot still shows the draft, not a hub", async () => {
    seasonPage();
    await waitFor(() => expect(slot.loadRun).toHaveBeenCalled());
    expect(screen.queryByTestId("season-hub")).toBeNull();
    expect(screen.getByRole("button", { name: /^Lock in / })).toBeInTheDocument();
  });

  it("⚠️ a run whose cards are not in THIS pool is left alone, never deleted", async () => {
    // The slot is global and a season is per-club, so "cannot rebuild here" almost always
    // means "this run belongs to another club" — clearing it would destroy a live season
    // just for visiting a different club's page.
    slot.loadRun.mockResolvedValue(
      savedRun({
        clubs: 4,
        results: weeksOf(4, 1),
        cardIds: Array.from({ length: 11 }, (_, i): PlayerSeasonId => `${900 + i}@1998`),
      }),
    );

    seasonPage();

    // ⛔ A WAIT, not a `queryBy` the moment the slot is read. The restore, the rivals fetch
    // and the hub are three async hops away — asserting absence immediately passes whatever
    // the code does, which is exactly what it did before a substituted squad was tried
    // against it.
    await expect(screen.findByTestId("season-hub", undefined, { timeout: 1500 })).rejects.toThrow();
    expect(screen.getByRole("button", { name: /^Lock in / })).toBeInTheDocument();
    expect(slot.clearRun).not.toHaveBeenCalled();
  });
});
