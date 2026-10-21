import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import { toRivalCard } from "@/features/game/domain/rival-pool";
import { ladderRivals, weekFormation, weekSeeds } from "@/features/game/domain/weekly";
import { allWeekly, saveWeekly } from "@/features/game/storage/weekly-slot";
import { ladderComplete, newLadderRun } from "@/features/game/view/weekly-run";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
const { WeeklyLadder } = await import("@/features/game/components/WeeklyLadder");

/** TASK-1828 — the ladder screen against a real IndexedDB and faked rival files. */
const ROLES: PlayerRole[] = [
  "GK",
  "RB",
  "CB",
  "LB",
  "CDM",
  "CM",
  "CAM",
  "RM",
  "LM",
  "RW",
  "LW",
  "SS",
  "CF",
];
const pool: PoolCard[] = ROLES.flatMap((role, r) =>
  Array.from({ length: 12 }, (_, i) => ({
    cardId: makeCardId(r * 100 + i + 1, 2020),
    playerId: r * 100 + i + 1,
    season: 2020,
    name: `${role}-${i}`,
    role,
    altRoles: [],
    foot: null,
    height: null,
    provenance: null,
    ratings: {
      attack: 50,
      creation: 50,
      defense: 50,
      physical: 50,
      discipline: 50,
      overall: 50 + i,
    },
    club: "Club",
  })),
);
const clubs = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Club ${i + 1}` }));
const WEEK = "2026-W43";

/** A legal XI for the week's shape, straight from the pool. */
function weekXi(week: string) {
  const used = new Set<string>();
  return weekFormation(week).slots.map((s) => {
    const c = pool.find((p) => !used.has(p.cardId) && canPlay(p, s.role))!;
    used.add(c.cardId);
    return c.cardId;
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z")); // Wednesday of W43
  indexedDB.deleteDatabase("pitchiq-game");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const id = Number(String(url).split("/").pop());
      return new Response(
        JSON.stringify({ teamId: id, name: `Club ${id}`, cards: pool.map((c) => toRivalCard(c)) }),
      );
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WeeklyLadder", () => {
  it("shows the week's rule and its seven rivals before the draft", async () => {
    renderWithIntl(<WeeklyLadder pool={pool} clubs={clubs} />);
    expect(await screen.findByTestId("weekly-intro")).toBeTruthy();
    expect(screen.getByTestId("weekly-rule").textContent).toMatch(
      /Week|Ref|VAR|Freeze|Comforts|Gale/,
    );
    const rivals = screen.getByTestId("weekly-rivals").querySelectorAll("li");
    expect(rivals).toHaveLength(7);
    expect(screen.getByTestId("weekly-draft")).toBeTruthy();
  });

  it("with a squad, the hub opens three matchdays on a Wednesday and plays the first", async () => {
    await saveWeekly({
      week: WEEK,
      cardIds: weekXi(WEEK) as never,
      rivalIds: ladderRivals(
        clubs.map((c) => c.id),
        WEEK,
      ),
      run: newLadderRun(weekSeeds(WEEK).league),
    });
    renderWithIntl(<WeeklyLadder pool={pool} clubs={clubs} />);
    expect(await screen.findByTestId("weekly-hub")).toBeTruthy();
    expect(screen.getByTestId("weekly-table").querySelectorAll("tbody tr")).toHaveLength(8);
    const play = await screen.findByTestId("weekly-play");
    await waitFor(() => expect((play as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getAllByTestId("sd-stance")).toHaveLength(3);
    expect(screen.getByText(/3 matchdays open/)).toBeTruthy();
    expect(screen.getByTestId("squad-valuation")).toBeTruthy();
    await userEvent.setup({ advanceTimers: () => {} }).click(play);
    // The shared season match screens take over, starting at the programme.
    expect(await screen.findByText(/restart/i)).toBeTruthy();
  });

  it("⛔ a past week left unfinished is closed on the next visit — every matchday recorded", async () => {
    const OLD = "2026-W42";
    await saveWeekly({
      week: OLD,
      cardIds: weekXi(OLD) as never,
      rivalIds: ladderRivals(
        clubs.map((c) => c.id),
        OLD,
      ),
      run: newLadderRun(weekSeeds(OLD).league),
    });
    renderWithIntl(<WeeklyLadder pool={pool} clubs={clubs} />);
    await screen.findByTestId("weekly-intro");
    await waitFor(async () => {
      const old = (await allWeekly()).find((r) => r.week === OLD)!;
      expect(ladderComplete(old.run)).toBe(true);
    });
  });
});
