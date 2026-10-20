import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/i18n/messages/ar.json";
import { renderWithIntl } from "./_helpers/intl";

/**
 * TASK-1813/1819 — `/game/trophies`: the owner's Album #1 "Panini Classic" and Hall #1
 * "Trophy Cabinet". Storage and the set lists are stubbed; the backfill is a no-op here.
 */
const store = vi.hoisted(() => ({ album: [] as unknown[], unlocks: [] as unknown[] }));
vi.mock("@/features/game/storage/trophy-slot", () => ({
  loadAlbum: async () => store.album,
  loadUnlocks: async () => store.unlocks,
}));
vi.mock("@/features/game/view/trophy-backfill", () => ({ backfillTrophies: async () => {} }));
vi.mock("@/utils/motion", () => ({ prefersReducedMotion: () => true }));

const { TrophyRoom } = await import("@/features/game/components/TrophyRoom");

const set2003 = {
  season: 2003,
  clubs: [
    {
      teamId: 42,
      name: "Arsenal",
      cards: Array.from({ length: 22 }, (_, i) => ({
        id: `${100 + i}@2003`,
        n: `First Last${i}`,
        r: "CM",
        o: 95 - i,
      })),
    },
  ],
};
const entry = (i: number) => ({
  cardId: `${100 + i}@2003`,
  teamId: 42,
  name: `First Last${i}`,
  role: "CM",
  season: 2003,
  ovr: 95 - i,
  firstDay: "2026-10-21",
  count: 1,
});

describe("TrophyRoom", () => {
  beforeEach(() => {
    store.album = [];
    store.unlocks = [];
    window.location.hash = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => set2003 })),
    );
  });

  it("an empty album says how to start it", async () => {
    renderWithIntl(<TrophyRoom />);
    expect(await screen.findByText(/Your album is empty/)).toBeInTheDocument();
  });

  it("Panini spread: collected stickers, numbered empty slots, names hidden until collected", async () => {
    store.album = [entry(0), entry(1), entry(5)];
    renderWithIntl(<TrophyRoom />);
    const spread = await screen.findByTestId("ta-spread");
    expect(within(spread).getAllByTestId("ta-sticker")).toHaveLength(3);
    const empty = within(spread).getAllByTestId("ta-empty");
    expect(empty).toHaveLength(19);
    expect(empty[0]).toHaveTextContent("3"); // the third card is the first gap
    expect(spread).not.toHaveTextContent("Last2");
    expect(spread).toHaveTextContent("Last0");
    expect(spread.className).not.toMatch(/is-gold/);
    expect(screen.getByText(/3 of 22 stickers/)).toBeInTheDocument();
  });

  it("a complete set is gold", async () => {
    store.album = Array.from({ length: 22 }, (_, i) => entry(i));
    renderWithIntl(<TrophyRoom />);
    expect((await screen.findByTestId("ta-spread")).className).toMatch(/is-gold/);
    expect(screen.getByText(/1 of 686 sets complete/)).toBeInTheDocument();
  });

  it("#hall opens the Trophy Cabinet: sixteen cups, the earned ones lit, each tells its story", async () => {
    store.unlocks = [{ id: "hat-trick", day: "2026-10-21", context: "Henry v Leeds" }];
    window.location.hash = "#hall";
    renderWithIntl(<TrophyRoom />);
    const cups = await screen.findAllByTestId("tc-cup");
    expect(cups).toHaveLength(16);
    const lit = cups.filter((c) => c.className.includes("is-lit"));
    expect(lit).toHaveLength(1);
    await userEvent.click(lit[0]!);
    expect(screen.getByTestId("tc-detail")).toHaveTextContent("Hat-trick Hero");
    expect(screen.getByTestId("tc-detail")).toHaveTextContent("Henry v Leeds");
    await userEvent.click(cups[0]!);
    expect(screen.getByTestId("tc-detail")).toHaveTextContent("Win any match");
  });

  it("the tabs switch between the album and the cabinet", async () => {
    renderWithIntl(<TrophyRoom />);
    await screen.findByText(/Your album is empty/);
    await userEvent.click(screen.getByRole("tab", { name: "Hall of Fame" }));
    expect(await screen.findAllByTestId("tc-cup")).toHaveLength(16);
  });

  it("speaks Arabic with Arabic digits", async () => {
    store.album = [entry(0)];
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <TrophyRoom />
      </NextIntlClientProvider>,
    );
    await screen.findByTestId("ta-spread");
    expect(screen.getByTestId("ta-progress").textContent).toMatch(/[٠-٩]/);
    expect(screen.getByTestId("ta-progress").textContent).not.toMatch(/[0-9]/);
  });
});
