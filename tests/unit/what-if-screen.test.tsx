import "fake-indexeddb/auto";
import { type ComponentProps } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadClassicData } from "@/features/game/adapter/classic-data";
import type { ClassicData } from "@/features/game/domain/classic-data";
import { defaultAnswer } from "@/features/game/domain/match-decisions";
import { SCENARIOS } from "@/features/game/domain/what-if";
import type { MatchLive } from "@/features/game/components/MatchLive";
import type { WhatIfCard } from "@/features/game/components/WhatIf";
import { loadAlbum, loadUnlocks } from "@/features/game/storage/trophy-slot";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1816 — the What-If screens: the Arcade list → the VHS team talk at the start whistle →
 * the live match → full time with the LED verdict board and the post-match report. The live
 * screen is stubbed (its timing is not under test); everything else is real, including the
 * engine, the season data and IndexedDB.
 */
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));
vi.mock("@/features/game/components/MatchLive", () => ({
  MatchLive: ({
    pending,
    onAnswer,
    onFullTime,
    coachSide,
    startMinute,
  }: ComponentProps<typeof MatchLive>) => (
    <>
      <p data-testid="live">{`${coachSide}@${startMinute}`}</p>
      {pending != null ? (
        <button
          onClick={() => {
            const a = defaultAnswer(pending);
            onAnswer(a.kind === "sub-offer" ? { ...a, reason: undefined } : a);
          }}
        >
          Answer
        </button>
      ) : (
        <button onClick={onFullTime}>Full time</button>
      )}
    </>
  ),
}));
const { WhatIf } = await import("@/features/game/components/WhatIf");

const NEW = SCENARIOS.find((s) => s.id === "2011-new-ars")!;
const cards: WhatIfCard[] = SCENARIOS.map((s) => ({
  id: s.id,
  home: s.id === NEW.id ? { id: 34, name: "Newcastle" } : { id: 1, name: `Home ${s.id}` },
  away: s.id === NEW.id ? { id: 42, name: "Arsenal" } : { id: 2, name: `Away ${s.id}` },
}));

let season2010: ClassicData;
beforeAll(async () => {
  season2010 = (await loadClassicData(2010))!;
}, 60_000);
const fetchMock = vi.fn();
beforeEach(async () => {
  await new Promise<void>((r) => {
    const q = indexedDB.deleteDatabase("pitchiq-game");
    q.onsuccess = q.onerror = q.onblocked = () => r();
  });
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify(season2010)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const rowOf = (id: string) => screen.getByTestId(`wi-row-${id}`);

describe("What-If — the scenario list", () => {
  it("lists every scenario with its real deficit, the real result and a not-played chip", () => {
    renderWithIntl(<WhatIf cards={cards} />);
    expect(screen.getAllByTestId(/^wi-row-/)).toHaveLength(SCENARIOS.length);
    const row = rowOf(NEW.id);
    expect(row).toHaveTextContent("Newcastle");
    expect(row).toHaveTextContent("0–4");
    expect(row).toHaveTextContent("26'");
    expect(row).toHaveTextContent("4–4");
    expect(within(row).getByTestId("wi-chip")).toHaveAttribute("data-verdict", "none");
  });
});

describe("What-If — a scenario, start to finish", () => {
  it("fetches only that season's prerendered data, holds the team talk, plays, and judges it", async () => {
    const user = userEvent.setup();
    renderWithIntl(<WhatIf cards={cards} />);
    await user.click(within(rowOf(NEW.id)).getByRole("button", { name: /play/i }));

    // The team talk: the VHS radio moment, the real XI, three responses.
    const talk = await screen.findByTestId("wi-talk", undefined, { timeout: 10_000 });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual(["/api/game/classic/2010"]);
    expect(talk).toHaveTextContent("0–4");
    expect(talk).toHaveTextContent("26'");
    expect(screen.getByTestId("wi-xi-source")).toHaveTextContent(/real line-up/i);
    expect(within(talk).getAllByTestId("wi-pitch-player")).toHaveLength(11);
    await user.click(screen.getByRole("button", { name: /aggressive overload/i }));

    // The team-talk changes: the bench dialog, closable without a change.
    const bench = await screen.findByRole("dialog", { name: /the bench/i });
    await user.click(within(bench).getAllByRole("button", { name: /close|not now/i })[0]!);

    // Live, from the scenario's minute, as the coach's side.
    expect(await screen.findByTestId("live")).toHaveTextContent("home@26");
    for (let i = 0; i < 400 && screen.queryByRole("button", { name: "Answer" }); i++)
      await user.click(screen.getByRole("button", { name: "Answer" }));
    await user.click(screen.getByRole("button", { name: "Full time" }));

    // Full time: the LED board, the verdict, the report from the coach's side.
    const board = await screen.findByTestId("wi-verdict");
    expect(["rewrote", "matched", "repeated"]).toContain(board.getAttribute("data-verdict"));
    expect(board).toHaveTextContent("4–4"); // history
    expect(screen.getByTestId("post-match-report")).toBeInTheDocument();

    // TASK-1813/1819 — a rescue earns History Rewritten, and collects no cards (history's XI).
    const rewrote = board.getAttribute("data-verdict") === "rewrote";
    await waitFor(async () =>
      expect((await loadUnlocks()).some((u) => u.id === "rewrite")).toBe(rewrote),
    );
    expect(await loadAlbum()).toEqual([]);

    // …and the list remembers it.
    await user.click(screen.getByRole("button", { name: /all scenarios/i }));
    await waitFor(() =>
      expect(within(rowOf(NEW.id)).getByTestId("wi-chip").getAttribute("data-verdict")).not.toBe(
        "none",
      ),
    );
  }, 60_000);
});
