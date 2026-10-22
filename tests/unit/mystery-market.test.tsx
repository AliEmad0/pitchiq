import "fake-indexeddb/auto";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerRole } from "@/data/schemas";
import { makeCardId } from "@/features/game/domain/card-id";
import type { PoolCard } from "@/features/game/domain/chaos-draft";
import { packFor, recordMatch, startRun } from "@/features/game/domain/market";
import { loadMarketRun, saveMarketRun } from "@/features/game/storage/market-slot";
import { renderWithIntl } from "./_helpers/intl";

vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
const { MysteryMarket } = await import("@/features/game/components/MysteryMarket");

/** TASK-1818 — the Mystery Market screen against a real IndexedDB. */
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
  Array.from({ length: 14 }, (_, i) => ({
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
      overall: 60 + i * 2,
    },
    club: "Club",
  })),
);

beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

describe("MysteryMarket", () => {
  it("starts a run: three lives, the weakest XI, and a Play button", async () => {
    renderWithIntl(<MysteryMarket pool={pool} />);
    await userEvent.click(await screen.findByTestId("market-start"));
    expect(await screen.findByTestId("market-hub")).toBeInTheDocument();
    expect(screen.getByTestId("market-lives")).toHaveAccessibleName("3 lives left");
    expect(screen.getByTestId("market-play")).toBeEnabled();
    await waitFor(async () => expect((await loadMarketRun())!.lives).toBe(3));
  });

  it("⭐ after a win: three face-down rewards, opened together, each with a boon AND a catch", async () => {
    const won = recordMatch(startRun(pool, 5), 2, 1);
    await saveMarketRun(won);
    renderWithIntl(<MysteryMarket pool={pool} />);
    expect(await screen.findByTestId("market-pack")).toBeInTheDocument();
    expect(screen.queryAllByTestId("market-reward")).toHaveLength(0); // face down
    await userEvent.click(screen.getByTestId("market-open"));
    const rewards = screen.getAllByTestId("market-reward");
    expect(rewards.map((r) => r.dataset.reward)).toEqual(packFor(won));
    for (const r of rewards) {
      expect(r.querySelector(".mm-boon")?.textContent).toMatch(/^＋ /);
      expect(r.querySelector(".mm-catch")?.textContent).toMatch(/^− /);
    }
    await userEvent.click(rewards[0]!);
    expect(await screen.findByTestId("market-hub")).toBeInTheDocument();
    await waitFor(async () => expect((await loadMarketRun())!.pendingPack).toBe(false));
  });

  it('⛔ the match screens say "Back to the run", never "Return to season" (found live)', async () => {
    await saveMarketRun(startRun(pool, 11));
    renderWithIntl(<MysteryMarket pool={pool} />);
    await userEvent.click(await screen.findByTestId("market-play"));
    expect(await screen.findByRole("button", { name: "Back to the run" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to season" })).toBeNull();
  });

  it("a finished run shows its result and offers a new one", async () => {
    let run = startRun(pool, 9);
    for (let i = 0; i < 3; i++) run = recordMatch(run, 0, 2);
    await saveMarketRun(run);
    renderWithIntl(<MysteryMarket pool={pool} />);
    expect(await screen.findByTestId("market-over")).toHaveTextContent("0 wins in 3 matches");
    expect(screen.getByTestId("market-start")).toHaveTextContent("Start a new run");
  });
});
