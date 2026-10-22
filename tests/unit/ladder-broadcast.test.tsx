import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { canPlay } from "@/features/game/domain/eligibility";
import { toRivalCard } from "@/features/game/domain/rival-pool";
import { ladderRivals, weekFormation, weekSeeds } from "@/features/game/domain/weekly";
import { saveWeekly } from "@/features/game/storage/weekly-slot";
import { newLadderRun } from "@/features/game/view/weekly-run";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
const { WeeklyLadder } = await import("@/features/game/components/WeeklyLadder");

/** Owner polish pick Ladder #1 — the Broadcast Scoreboard over the real ladder state. */
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

describe("WeeklyLadder · Broadcast Scoreboard", () => {
  it("the intro wears the strap and the ticker before any squad exists", async () => {
    renderWithIntl(<WeeklyLadder pool={pool} clubs={clubs} />);
    await screen.findByTestId("weekly-intro");
    const strap = screen.getByTestId("ladder-strap");
    expect(strap.querySelector("h1")?.textContent).toMatch(/^Weekly LadderWeek \d+$/);
    expect(strap.textContent).toMatch(/Week|Ref|VAR|Freeze|Comforts|Gale/);
    expect(screen.getByTestId("ladder-clock").textContent).toMatch(/^Closes \d+d \d\d:\d\d:\d\d$/);
    expect(screen.getByTestId("weekly-rule").closest(".lb-tick")).not.toBeNull();
    expect(screen.getByTestId("weekly-stats").closest(".lb-tick")).not.toBeNull();
  });

  it("the hub is lower-third rows and a Coming up VS card", async () => {
    const rivalIds = ladderRivals(
      clubs.map((c) => c.id),
      WEEK,
    );
    await saveWeekly({
      week: WEEK,
      cardIds: weekXi(WEEK) as never,
      rivalIds,
      run: newLadderRun(weekSeeds(WEEK).league),
    });
    renderWithIntl(<WeeklyLadder pool={pool} clubs={clubs} />);
    await screen.findByTestId("weekly-hub");
    const rows = screen.getByTestId("weekly-table").querySelectorAll("tbody tr.lb-row");
    expect(rows).toHaveLength(8);
    // Exactly one row is the coach's, and every rival row carries its club's crest.
    expect(screen.getByTestId("weekly-table").querySelectorAll("tr.me")).toHaveLength(1);
    expect(screen.getByTestId("weekly-table").querySelectorAll("img").length).toBeLessThanOrEqual(
      7,
    );
    const card = screen.getByTestId("ladder-coming-up");
    expect(card.textContent).toMatch(/^Coming up · Matchday 1 of 7/);
    const vs = screen.getByTestId("weekly-next");
    expect(vs.textContent).toMatch(/Your XI(Home|Away)Club \d+/);
    // The stance and the Play button sit inside the card, not beside it.
    expect(card.querySelectorAll("[data-testid=sd-stance]")).toHaveLength(3);
    expect(card.querySelector("[data-testid=weekly-play]")).not.toBeNull();
    await waitFor(() =>
      expect((screen.getByTestId("weekly-play") as HTMLButtonElement).disabled).toBe(false),
    );
  });
});
