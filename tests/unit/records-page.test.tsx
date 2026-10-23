import "fake-indexeddb/auto";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { RecordsPage } from "@/features/game/components/RecordsPage";
import { logCareer } from "@/features/game/storage/career-slot";
import { saveDaily } from "@/features/game/storage/daily-slot";
import { renderWithIntl } from "./_helpers/intl";

/** TASK-1812 — the Records page, the owner's pick #1 Career Programme. */
beforeEach(() => {
  indexedDB.deleteDatabase("pitchiq-game");
});

const match = (key: string, at: number, gf: number, ga: number, context: string) =>
  logCareer({
    kind: "match",
    key,
    at,
    day: "2026-10-23",
    mode: key.startsWith("k:") ? "market" : "draft",
    gf,
    ga,
    context,
  });

describe("Records page", () => {
  it("⭐ a new coach sees the empty state, with a way into a match", async () => {
    renderWithIntl(<RecordsPage />);
    const empty = await screen.findByTestId("records-empty");
    expect(empty).toHaveTextContent("No records yet");
    expect(within(empty).getByRole("link", { name: "Play a match" })).toHaveAttribute(
      "href",
      "/game",
    );
  });

  it("⭐ the programme: eight records, the fixture list newest first, a tap opens the line", async () => {
    await match("m:/game/draft:1", 1, 2, 0, "Your XI 2–0 Rivals");
    await match("m:/game/draft:2", 2, 1, 3, "Your XI 1–3 Rivals");
    await match("k:9:1", 3, 5, 1, "Your XI 5–1 Market side");
    await match("m:/game/draft:3", 4, 1, 1, "Your XI 1–1 Rivals");
    await saveDaily({
      day: "2026-10-22",
      cardIds: [] as never,
      answers: [],
      fingerprint: 1,
      eventCount: 1,
      done: true,
      score: { home: 2, away: 1 },
    });
    const user = userEvent.setup();
    renderWithIntl(<RecordsPage />);
    await waitFor(() =>
      expect(screen.getByTestId("records")).toHaveAttribute("data-state", "full"),
    );

    expect(screen.getAllByTestId("records-card")).toHaveLength(8);
    // Four logged matches plus one daily: 3W 1D 1L.
    const pct = screen.getAllByTestId("records-card").find((c) => c.dataset.record === "pct")!;
    expect(pct).toHaveTextContent("60%");
    expect(pct).toHaveTextContent("3W 1D 1L");
    const big = screen.getAllByTestId("records-card").find((c) => c.dataset.record === "big")!;
    expect(big).toHaveTextContent("5–1");
    await user.click(big);
    expect(within(big).getByTestId("records-line")).toHaveTextContent("Your XI 5–1 Market side");

    expect(screen.getAllByTestId("records-match").map((m) => m.textContent)).toEqual([
      expect.stringContaining("1–1"),
      expect.stringContaining("5–1"),
      expect.stringContaining("1–3"),
      expect.stringContaining("2–0"),
    ]);
  });

  it("the mode tabs filter the fixture list", async () => {
    await match("m:/game/draft:1", 1, 2, 0, "A");
    await match("k:9:1", 2, 5, 1, "B");
    await match("m:/game/draft:2", 3, 0, 0, "C");
    const user = userEvent.setup();
    renderWithIntl(<RecordsPage />);
    await screen.findByTestId("records");
    await user.click(screen.getByRole("tab", { name: "Market" }));
    expect(screen.getAllByTestId("records-match")).toHaveLength(1);
    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getAllByTestId("records-match")).toHaveLength(3);
  });
});
