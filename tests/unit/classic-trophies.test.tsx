import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import { classicTeams } from "@/features/game/view/classic-session";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1813/1819 — a Classic season hands the Trophy Room each coach fixture (simmed: cards only,
 * never a match badge) and, once, the finished run as a league season.
 */
const storage = vi.hoisted(() => ({
  saved: null as unknown,
  loadClassicSave: vi.fn(),
  saveClassic: vi.fn(),
  clearClassic: vi.fn(),
}));
vi.mock("@/features/game/storage/classic-slot", () => storage);
const recorded = vi.hoisted(
  () => [] as { key: string; cards: unknown[]; facts: Record<string, unknown> }[],
);
vi.mock("@/features/game/view/trophy-record", async (orig) => ({
  ...(await orig<typeof import("@/features/game/view/trophy-record")>()),
  recordFullTime: async (e: (typeof recorded)[number]) => {
    recorded.push(e);
    return [];
  },
}));
import { ClassicSeason } from "@/features/game/components/ClassicSeason";

let data: ClassicData;
beforeAll(async () => {
  data = (await loadClassicData(2003))!;
});
afterEach(() => vi.unstubAllGlobals());

it("records every simmed coach fixture and the finished season, once", async () => {
  const own = classicTeams(data, 42, "4-4-2 Flat")[data.clubIds.indexOf(42)];
  storage.loadClassicSave.mockResolvedValue({
    version: 1,
    season: 2003,
    clubId: 42,
    formation: "4-4-2 Flat",
    archiveKey: data.archiveKey,
    seed: 777,
    cardIds: own.players.map((p) => p.cardId),
    results: [],
  });
  storage.saveClassic.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => data }));
  const user = userEvent.setup();
  renderWithIntl(<ClassicSeason seasons={[2003]} />);
  const sim = await screen.findByRole("button", { name: "Sim fixture" });
  for (let i = 0; i < 40 && !sim.hasAttribute("disabled"); i++) {
    await user.click(sim);
    await waitFor(() => expect(storage.saveClassic).toHaveBeenCalledTimes(i + 1));
  }
  await waitFor(() => expect(recorded.some((e) => e.key === "r:777")).toBe(true));
  const fixtures = recorded.filter((e) => e.key.startsWith("c:777:"));
  expect(new Set(fixtures.map((e) => e.key)).size).toBe(38);
  for (const f of fixtures) {
    expect(f.facts.match).toBeUndefined();
    expect(f.cards).toHaveLength(11);
  }
  const end = recorded.filter((e) => e.key === "r:777");
  expect(end).toHaveLength(1);
  expect(end[0]!.facts.season).toMatchObject({ kind: "league", complete: true });
}, 180_000);
