import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/storage/match-slot", () => ({
  saveMatch: vi.fn(async () => {}),
  loadMatch: vi.fn(async () => null),
  clearMatch: vi.fn(async () => {}),
}));
vi.mock("@/features/game/storage/season-slot", () => ({
  saveRun: vi.fn(async () => {}),
  loadRun: vi.fn(async () => null),
  clearRun: vi.fn(async () => {}),
}));
// The league's squads come from prerendered CDN files. Stub the fetch, keeping everything else
// in the module real — `GamePlay` uses `useRival` from here for the single-match rival picker.
vi.mock("@/features/game/view/rival-choice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/game/view/rival-choice")>();
  return {
    ...actual,
    loadRival: vi.fn(async (teamId: number | string) => ({
      teamId: Number(teamId),
      name: `Club ${teamId}`,
      cards: rivalPool(Number(teamId)),
    })),
  };
});

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

/** A rival club's squad, hoisted so the module mock above can reach it. */
function rivalPool(clubId: number): PoolCard[] {
  return ROLES.map((role, i) => ({
    cardId: `${clubId * 1000 + i}@2020`,
    playerId: clubId * 1000 + i,
    season: 2020,
    name: `C${clubId} P${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    club: `Club ${clubId}`,
    teamId: clubId,
    ratings: {
      attack: 60,
      creation: 60,
      defense: 60,
      physical: 60,
      discipline: 60,
      overall: 60 + ((clubId + i) % 20),
    },
  }));
}

// ⚠️ SIX per role. With `onePerPlayer` a thin pool runs out of eligible cards part-way and the
// draft stalls with slots still empty — a fixture that cannot complete a draft cannot prove
// anything about what happens after one.
const pool: PoolCard[] = ROLES.flatMap((role, i) =>
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

const CLUBS = [
  { id: 40, name: "Liverpool" },
  { id: 42, name: "Arsenal" },
];

/** Render at a URL, so `?format=` is read exactly as it is in the app. */
const at = (search: string, ui: ReactElement) =>
  renderWithIntl(<NuqsTestingAdapter searchParams={search}>{ui}</NuqsTestingAdapter>);

describe("the season entry seam (TASK-1811)", () => {
  it("⛔ THE INERTNESS CONTROL — no season prop means nothing changes, whatever the URL says", () => {
    at("?format=season", <GamePlay pool={pool} initialPhase="setup" clubId={40} clubs={CLUBS} />);
    // Every other pack renders its own setup, exactly as before.
    expect(screen.queryByTestId("season-hub")).toBeNull();
    expect(screen.queryByTestId("season-loading")).toBeNull();
  });

  it("⛔ a season pack WITHOUT the param still plays a single match", () => {
    at(
      "",
      <GamePlay
        pool={pool}
        initialPhase="setup"
        clubId={40}
        clubs={CLUBS}
        season={{ clubs: 20, league: "clubs" }}
      />,
    );
    expect(screen.queryByTestId("season-hub")).toBeNull();
    expect(screen.queryByTestId("season-loading")).toBeNull();
  });

  it("⚠️ the param alone cannot conjure a league out of a pack with no season", () => {
    // `?format=season` is user-controlled. A mode that has no idea what a league is must
    // ignore it rather than half-start one.
    at("?format=season", <GamePlay pool={pool} initialPhase="setup" clubId={40} clubs={CLUBS} />);
    expect(screen.queryByTestId("season-loading")).toBeNull();
  });

  it("⚠️ asking for a season shows the SETUP first — the squad is drafted before any league", () => {
    at(
      "?format=season",
      <GamePlay
        pool={pool}
        initialPhase="setup"
        clubId={40}
        clubs={CLUBS}
        season={{ clubs: 20, league: "clubs" }}
      />,
    );
    // The hub cannot exist until an XI does: a season is "draft once and live with it".
    expect(screen.queryByTestId("season-hub")).toBeNull();
  });
});

describe("⭐ the POSITIVE control — the seam actually fires", () => {
  it("drafting an XI with ?format=season reaches the league, not a match", async () => {
    // ⛔ Without this the four assertions above are VACUOUS: they all check that something is
    // absent, and would pass identically if the hub could never render at all.
    const user = userEvent.setup();
    at(
      "?format=season",
      <GamePlay
        pool={pool}
        initialPhase="setup"
        clubId={40}
        clubs={CLUBS}
        season={{ clubs: 20, league: "clubs" }}
        draft={{ handSize: 5, roam: "free", timer: null, lockPicks: true, onePerPlayer: true }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Lock in / }));
    // ⚠️ A round may already be OPEN — clicking a slot while it is would just churn. Take a
    // candidate whenever one is on screen, and only open a slot when none is.
    for (let i = 0; i < 30; i++) {
      const pick = screen.queryAllByRole("button", { name: /^Choose / }).at(0);
      if (pick != null) {
        await user.click(pick);
        continue;
      }
      const slot = screen.queryAllByRole("button", { name: /empty\. Choose a player/ }).at(0);
      if (slot == null) break;
      await user.click(slot);
    }

    // ⚠️ Legacy has NO "Confirm squad" step — it confirms the moment the XI is full, which is
    // why the browser pass went straight from the last pick to "Kick off". Only click a confirm
    // if the pack actually renders one.
    const confirm = screen.queryByRole("button", { name: /Confirm squad/i });
    if (confirm != null) await user.click(confirm);

    // ⭐ The hub is reached — the season path ran end to end, and the match path did not.
    expect(
      await screen.findByTestId("season-hub", undefined, { timeout: 10_000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kick off/i })).toBeNull();
    // And it is HIS squad in the league, not a re-draft.
    expect(screen.getByTestId("season-squad")).toBeInTheDocument();
  }, 60_000);
});
